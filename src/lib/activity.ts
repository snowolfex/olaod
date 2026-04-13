import { getDataStorePath, readJsonStore, updateJsonStore } from "@/lib/data-store";
import type { ActivityEvent } from "@/lib/activity-types";

const STORE_PATH = getDataStorePath("activity-log.json");
const MAX_EVENTS = 250;

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readStore() {
  return readJsonStore<ActivityEvent[]>(STORE_PATH, []);
}

export async function listActivityEvents() {
  const events = await readStore();
  return events.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function recordActivity(
  input: Omit<ActivityEvent, "id" | "createdAt">,
) {
  const event: ActivityEvent = {
    id: createId(),
    createdAt: new Date().toISOString(),
    ...input,
  };

  await updateJsonStore<ActivityEvent[]>(STORE_PATH, [], (events) => [event, ...events].slice(0, MAX_EVENTS));
  return event;
}