import { recordActivity } from "@/lib/activity";
import { requestOllamaPullStream, type OllamaPullStreamChunk } from "@/lib/ollama";
import { syncQueuedPullJobs, updateJobRecord } from "@/lib/job-history";
import {
  cancelQueuedPull,
  enqueuePullJob,
  finishPullJob,
  PullQueueCancelledError,
  registerActivePull,
} from "@/lib/pull-job-control";

function createAbortError(message = "The operation was aborted.") {
  return new DOMException(message, "AbortError");
}

function isPlaywrightPullScenario(modelName: string) {
  return process.env.PLAYWRIGHT_TEST === "1" && modelName.startsWith("playwright:");
}

function waitForPlaywrightDelay(durationMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, durationMs);

    function handleAbort() {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", handleAbort);
      reject(createAbortError());
    }

    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

async function runPlaywrightPullScenario(input: {
  jobId: string;
  modelName: string;
  signal?: AbortSignal;
  emitMessage: (message: string) => Promise<void>;
}) {
  if (input.modelName.startsWith("playwright:fail")) {
    await waitForPlaywrightDelay(40, input.signal);
    throw new Error("Playwright forced pull failure.");
  }

  const chunkCount = input.modelName.startsWith("playwright:hold") ? 80 : 3;
  const chunkDelayMs = input.modelName.startsWith("playwright:hold") ? 250 : 40;
  const total = 100;

  for (let index = 0; index < chunkCount; index += 1) {
    const completed = Math.min(total, Math.round(((index + 1) / chunkCount) * total));
    const progressMessage = formatProgress({
      status: "running",
      completed,
      total,
    });

    await updateJobRecord(input.jobId, {
      progressMessage,
      progressEntry: {
        statusLabel: "running",
        completed,
        total,
        percent: completed,
      },
    });
    await input.emitMessage(progressMessage);
    await waitForPlaywrightDelay(chunkDelayMs, input.signal);
  }
}

function formatProgress(chunk: OllamaPullStreamChunk) {
  if (typeof chunk.completed === "number" && typeof chunk.total === "number") {
    const percent = chunk.total > 0 ? Math.floor((chunk.completed / chunk.total) * 100) : 0;
    return `${chunk.status ?? "Pulling"} ${percent}%`;
  }

  return chunk.status ?? "Working";
}

export async function executePullJob(input: {
  jobId: string;
  modelName: string;
  onMessage?: (message: string) => void | Promise<void>;
  signal?: AbortSignal;
}) {
  const queueEntry = enqueuePullJob(input.jobId);
  await syncQueuedPullJobs({ pendingJobIds: queueEntry.snapshot.pendingJobIds });

  const emitMessage = async (message: string) => {
    await input.onMessage?.(message);
  };

  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  const decoder = new TextDecoder();
  let buffer = "";
  let upstreamController: AbortController | null = null;

  const abortQueuedPull = () => {
    if (cancelQueuedPull(input.jobId)) {
      void updateJobRecord(input.jobId, {
        progressMessage: "Pull cancelled before execution.",
        status: "cancelled",
        progressEntry: {
          statusLabel: "cancelled",
        },
      });
    }
  };

  input.signal?.addEventListener("abort", abortQueuedPull, { once: true });

  try {
    if (queueEntry.position > 0) {
      const queueMessage = `Queued. Waiting for ${queueEntry.position} earlier pull${queueEntry.position === 1 ? "" : "s"}.`;
      await updateJobRecord(input.jobId, {
        progressMessage: queueMessage,
        progressEntry: {
          statusLabel: "queued",
        },
      });
      await emitMessage(queueMessage);
    }

    await queueEntry.waitForTurn;

    input.signal?.removeEventListener("abort", abortQueuedPull);

    if (input.signal?.aborted) {
      throw new DOMException("Pull cancelled before execution.", "AbortError");
    }

    await updateJobRecord(input.jobId, {
      progressMessage: "Pull started.",
      status: "running",
      progressEntry: {
        statusLabel: "running",
      },
    });
    await emitMessage("Pull started.");

    upstreamController = new AbortController();
    registerActivePull(input.jobId, upstreamController);
    const abortRunningPull = () => {
      upstreamController?.abort();
    };

    input.signal?.addEventListener("abort", abortRunningPull, { once: true });

    if (isPlaywrightPullScenario(input.modelName)) {
      await runPlaywrightPullScenario({
        jobId: input.jobId,
        modelName: input.modelName,
        signal: upstreamController.signal,
        emitMessage,
      });
    } else {
      const upstream = await requestOllamaPullStream(input.modelName, upstreamController.signal);

      if (!upstream.ok) {
        const detail = await upstream.text();
        const errorMessage = detail.trim() || `Pull request failed with ${upstream.status}.`;

        await updateJobRecord(input.jobId, {
          progressMessage: errorMessage,
          status: "failed",
          progressEntry: {
            statusLabel: "failed",
          },
        });
        await recordActivity({
          level: "warning",
          summary: `Model pull failed: ${input.modelName}`,
          details: errorMessage,
          type: "model.pull_failed",
        });
        throw new Error(errorMessage);
      }

      reader = upstream.body?.getReader() ?? null;

      if (!reader) {
        throw new Error("Ollama pull did not return a readable stream.");
      }

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();

          if (!trimmed) {
            continue;
          }

          const chunk = JSON.parse(trimmed) as OllamaPullStreamChunk;

          if (chunk.error) {
            throw new Error(chunk.error);
          }

          const progressMessage = formatProgress(chunk);

          await updateJobRecord(input.jobId, {
            progressMessage,
            progressEntry: {
              statusLabel: chunk.status,
              completed: chunk.completed,
              total: chunk.total,
              percent:
                typeof chunk.completed === "number" && typeof chunk.total === "number" && chunk.total > 0
                  ? Math.floor((chunk.completed / chunk.total) * 100)
                  : undefined,
            },
          });
          await emitMessage(progressMessage);
        }
      }

      const tail = buffer.trim();

      if (tail) {
        const chunk = JSON.parse(tail) as OllamaPullStreamChunk;

        if (chunk.error) {
          throw new Error(chunk.error);
        }

        const progressMessage = formatProgress(chunk);
        await updateJobRecord(input.jobId, {
          progressMessage,
          progressEntry: {
            statusLabel: chunk.status,
            completed: chunk.completed,
            total: chunk.total,
            percent:
              typeof chunk.completed === "number" && typeof chunk.total === "number" && chunk.total > 0
                ? Math.floor((chunk.completed / chunk.total) * 100)
                : undefined,
          },
        });
        await emitMessage(progressMessage);
      }
    }

    await updateJobRecord(input.jobId, {
      progressMessage: "Pull completed.",
      status: "succeeded",
      progressEntry: {
        statusLabel: "completed",
        percent: 100,
      },
    });
    await emitMessage("Pull completed.");
  } catch (error) {
    if (error instanceof PullQueueCancelledError) {
      await emitMessage("Pull cancelled before execution.");
      return;
    }

    const isAbort = error instanceof DOMException && error.name === "AbortError";
    await updateJobRecord(input.jobId, {
      progressMessage:
        error instanceof Error ? error.message : "Pull failed unexpectedly.",
      status: isAbort ? "cancelled" : "failed",
      progressEntry: {
        statusLabel: isAbort ? "cancelled" : "failed",
      },
    });

    if (!isAbort) {
      await recordActivity({
        level: "warning",
        summary: `Model pull failed: ${input.modelName}`,
        details:
          error instanceof Error ? error.message : "Unexpected model pull error.",
        type: "model.pull_failed",
      });
    }

    throw error;
  } finally {
    input.signal?.removeEventListener("abort", abortQueuedPull);
    const snapshot = finishPullJob(input.jobId);
    await syncQueuedPullJobs({ pendingJobIds: snapshot.pendingJobIds });
    reader?.releaseLock();
  }
}