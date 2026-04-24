export const QUICK_HELP_ENABLED_STORAGE_KEY = "oload:quick-help:enabled";
export const QUICK_HELP_PREFERENCE_CHANGED_EVENT = "oload:quick-help:changed";
export const QUICK_HELP_AUTO_DISMISS_MS = 2000;
export const QUICK_HELP_MUTED_HINT_IDS_STORAGE_KEY = "oload:quick-help:muted-hints";
export const QUICK_HELP_SEEN_HINT_IDS_STORAGE_KEY = "oload:quick-help:seen-hints";
export const QUICK_HELP_SESSION_DISMISSED_STORAGE_KEY = "oload:quick-help:session-dismissed";
export const FIRST_RUN_WALKTHROUGH_SEEN_STORAGE_KEY = "oload:walkthrough:seen";

export function readQuickHelpEnabled() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(QUICK_HELP_ENABLED_STORAGE_KEY) !== "false";
}

export function writeQuickHelpEnabled(enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(QUICK_HELP_ENABLED_STORAGE_KEY, String(enabled));
  window.dispatchEvent(
    new CustomEvent<boolean>(QUICK_HELP_PREFERENCE_CHANGED_EVENT, {
      detail: enabled,
    }),
  );
}

export function readQuickHelpMutedHintIds() {
  if (typeof window === "undefined") {
    return [];
  }

  const rawValue = window.localStorage.getItem(QUICK_HELP_MUTED_HINT_IDS_STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (!Array.isArray(parsed)) {
      window.localStorage.removeItem(QUICK_HELP_MUTED_HINT_IDS_STORAGE_KEY);
      return [];
    }

    return Array.from(new Set(parsed.filter((value): value is string => typeof value === "string" && value.length > 0)));
  } catch {
    window.localStorage.removeItem(QUICK_HELP_MUTED_HINT_IDS_STORAGE_KEY);
    return [];
  }
}

export function writeQuickHelpMutedHintIds(ids: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  const uniqueIds = Array.from(new Set(ids.filter((value) => value.length > 0)));
  window.localStorage.setItem(QUICK_HELP_MUTED_HINT_IDS_STORAGE_KEY, JSON.stringify(uniqueIds));
}

export function muteQuickHelpHint(id: string) {
  if (typeof window === "undefined" || !id) {
    return;
  }

  const nextIds = new Set(readQuickHelpMutedHintIds());
  nextIds.add(id);
  writeQuickHelpMutedHintIds(Array.from(nextIds));
}

export function clearQuickHelpMutedHintIds() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(QUICK_HELP_MUTED_HINT_IDS_STORAGE_KEY);
}

export function clearLegacyQuickHelpSessionState() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(QUICK_HELP_SEEN_HINT_IDS_STORAGE_KEY);
  window.sessionStorage.removeItem(QUICK_HELP_SESSION_DISMISSED_STORAGE_KEY);
  window.sessionStorage.removeItem("oload:quick-help:first-popup-dismissed");
}

export function readFirstRunWalkthroughSeen() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(FIRST_RUN_WALKTHROUGH_SEEN_STORAGE_KEY) === "true";
}

export function writeFirstRunWalkthroughSeen(seen: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(FIRST_RUN_WALKTHROUGH_SEEN_STORAGE_KEY, String(seen));
}