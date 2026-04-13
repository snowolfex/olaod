type PendingPull = {
  jobId: string;
  resolve: () => void;
  reject: (error: Error) => void;
};

export type PullQueueSnapshot = {
  activeJobId: string | null;
  pendingJobIds: string[];
};

export class PullQueueCancelledError extends Error {
  constructor(message = "Queued pull cancelled.") {
    super(message);
    this.name = "PullQueueCancelledError";
  }
}

const activePullControllers = new Map<string, AbortController>();
const pendingPulls: PendingPull[] = [];
let activePullJobId: string | null = null;

export function getPullQueueSnapshot(): PullQueueSnapshot {
  return {
    activeJobId: activePullJobId,
    pendingJobIds: pendingPulls.map((entry) => entry.jobId),
  };
}

function promoteNextPull() {
  if (activePullJobId || pendingPulls.length === 0) {
    return;
  }

  const nextPull = pendingPulls.shift();

  if (!nextPull) {
    return;
  }

  activePullJobId = nextPull.jobId;
  nextPull.resolve();
}

export function enqueuePullJob(jobId: string) {
  if (!activePullJobId && pendingPulls.length === 0) {
    activePullJobId = jobId;

    return {
      position: 0,
      waitForTurn: Promise.resolve(),
      snapshot: getPullQueueSnapshot(),
    };
  }

  let resolveTurn!: () => void;
  let rejectTurn!: (error: Error) => void;

  const waitForTurn = new Promise<void>((resolve, reject) => {
    resolveTurn = resolve;
    rejectTurn = reject;
  });

  pendingPulls.push({
    jobId,
    resolve: resolveTurn,
    reject: rejectTurn,
  });

  return {
    position: pendingPulls.length,
    waitForTurn,
    snapshot: getPullQueueSnapshot(),
  };
}

export function registerActivePull(jobId: string, controller: AbortController) {
  activePullControllers.set(jobId, controller);
}

export function clearActivePull(jobId: string) {
  activePullControllers.delete(jobId);
}

export function finishPullJob(jobId: string) {
  activePullControllers.delete(jobId);

  if (activePullJobId === jobId) {
    activePullJobId = null;
    promoteNextPull();
    return getPullQueueSnapshot();
  }

  const index = pendingPulls.findIndex((entry) => entry.jobId === jobId);

  if (index >= 0) {
    pendingPulls.splice(index, 1);
  }

  return getPullQueueSnapshot();
}

export function cancelQueuedPull(jobId: string) {
  const index = pendingPulls.findIndex((entry) => entry.jobId === jobId);

  if (index === -1) {
    return false;
  }

  const [entry] = pendingPulls.splice(index, 1);
  entry.reject(new PullQueueCancelledError());
  return true;
}

export function moveQueuedPull(jobId: string, direction: "up" | "down") {
  const index = pendingPulls.findIndex((entry) => entry.jobId === jobId);

  if (index === -1) {
    return null;
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1;

  if (targetIndex < 0 || targetIndex >= pendingPulls.length) {
    return null;
  }

  const current = pendingPulls[index];
  pendingPulls[index] = pendingPulls[targetIndex];
  pendingPulls[targetIndex] = current;

  return getPullQueueSnapshot();
}

export function cancelActivePull(jobId: string) {
  const controller = activePullControllers.get(jobId);

  if (!controller) {
    return false;
  }

  controller.abort();
  activePullControllers.delete(jobId);
  return true;
}