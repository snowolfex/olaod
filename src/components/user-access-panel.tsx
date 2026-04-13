"use client";

import { useEffect, useRef, useState } from "react";

import type { PublicUser, SessionUser, UserSessionStatus } from "@/lib/user-types";

type WorkspaceBackupSnapshot = {
  version: number;
  exportedAt: string;
  users: Array<{ id: string }>;
  conversations: Array<{ id: string }>;
  activityEvents: Array<{ id: string }>;
  jobHistory: Array<{ id: string }>;
};

type UserAccessPanelProps = {
  onSessionChange: (status: UserSessionStatus) => void;
  session: UserSessionStatus;
};

function describeRestoreOutcome(previousUser: SessionUser | null, nextSession: UserSessionStatus) {
  if (!previousUser) {
    return {
      summary: "Workspace backup restored.",
      tone: "success" as const,
    };
  }

  if (!nextSession.user) {
    if (nextSession.userCount === 0) {
      return {
        summary:
          "Workspace backup restored. Your previous session was cleared because the restored workspace no longer includes any local users.",
        tone: "warning" as const,
      };
    }

    return {
      summary:
        "Workspace backup restored. Your previous session was cleared because that user is no longer present in the restored workspace.",
      tone: "warning" as const,
    };
  }

  if (nextSession.user.id === previousUser.id && nextSession.user.role !== previousUser.role) {
    return {
      summary: `Workspace backup restored. Your access changed from ${previousUser.role} to ${nextSession.user.role}.`,
      tone: "warning" as const,
    };
  }

  return {
    summary: "Workspace backup restored.",
    tone: "success" as const,
  };
}

async function readErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? `Request failed with ${response.status}.`;
  } catch {
    return `Request failed with ${response.status}.`;
  }
}

export function UserAccessPanel({ onSessionChange, session }: UserAccessPanelProps) {
  const currentUserId = session.user?.id ?? null;
  const [mode, setMode] = useState<"login" | "register">("login");
  const [managedUsers, setManagedUsers] = useState<PublicUser[]>([]);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [backupSummary, setBackupSummary] = useState<string | null>(null);
  const [backupSummaryTone, setBackupSummaryTone] = useState<"success" | "warning">("success");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [pendingDeleteUserId, setPendingDeleteUserId] = useState<string | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  const [pendingBackupFileName, setPendingBackupFileName] = useState<string | null>(null);
  const [pendingBackupSnapshot, setPendingBackupSnapshot] = useState<WorkspaceBackupSnapshot | null>(null);
  const [backupRestoreConfirmed, setBackupRestoreConfirmed] = useState(false);
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (session.user?.role === "admin") {
      void refreshUsers();
      return;
    }

    setManagedUsers([]);
  }, [session.user?.id, session.user?.role]);

  async function refreshUsers() {
    setIsLoadingUsers(true);

    try {
      const response = await fetch("/api/users", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { users: PublicUser[] };
      setManagedUsers(payload.users);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to load users.",
      );
    } finally {
      setIsLoadingUsers(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!username.trim() || !password.trim()) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(
        mode === "login" ? "/api/users/login" : "/api/users/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username,
            displayName,
            password,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { user: PublicUser };
      onSessionChange({
        authAvailable: true,
        user: {
          id: payload.user.id,
          username: payload.user.username,
          displayName: payload.user.displayName,
          role: payload.user.role,
        },
        userCount: Math.max(1, session.userCount + (mode === "register" ? 1 : 0)),
      });
      if (mode === "register") {
        setManagedUsers((current) => [...current, payload.user]);
      }
      setUsername("");
      setDisplayName("");
      setPassword("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to complete user authentication.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function logout() {
    setError(null);

    try {
      const response = await fetch("/api/users/logout", { method: "POST" });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      onSessionChange({
        ...session,
        user: null,
      });
      setManagedUsers([]);
    } catch (logoutError) {
      setError(
        logoutError instanceof Error
          ? logoutError.message
          : "Unable to sign out.",
      );
    }
  }

  async function changeRole(userId: string, role: PublicUser["role"]) {
    setBusyUserId(userId);
    setPendingDeleteUserId((current) => (current === userId ? null : current));
    setError(null);

    try {
      const response = await fetch(`/api/users/${userId}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as { user: PublicUser };
      setManagedUsers((current) =>
        current.map((user) => (user.id === userId ? payload.user : user)),
      );
    } catch (roleError) {
      setError(
        roleError instanceof Error
          ? roleError.message
          : "Unable to update the user role.",
      );
    } finally {
      setBusyUserId(null);
    }
  }

  async function removeUser(user: PublicUser) {
    setBusyUserId(user.id);
    setError(null);

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as {
        user: PublicUser;
        deletedConversationCount: number;
      };

      setManagedUsers((current) => current.filter((managedUser) => managedUser.id !== user.id));
      setPendingDeleteUserId(null);
      setBackupSummary(
        `${payload.user.displayName} was deleted. Removed ${payload.deletedConversationCount} saved conversation${payload.deletedConversationCount === 1 ? "" : "s"}.`,
      );
      setBackupSummaryTone("warning");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete the user.",
      );
    } finally {
      setBusyUserId(null);
    }
  }

  async function exportWorkspaceBackup() {
    setIsExportingBackup(true);
    setError(null);
    setBackupSummary(null);
    setBackupSummaryTone("success");
    setBackupRestoreConfirmed(false);

    try {
      const response = await fetch("/api/admin/system/backup", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const exportedAt = response.headers.get("content-disposition")?.match(/oload-backup-([^\"]+)\.json/)?.[1];
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = exportedAt ? `oload-backup-${exportedAt}.json` : `oload-backup-${new Date().toISOString().replaceAll(":", "-")}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(downloadUrl);
      setBackupSummary("Workspace backup exported.");
      setBackupSummaryTone("success");
    } catch (backupError) {
      setError(
        backupError instanceof Error
          ? backupError.message
          : "Unable to export the workspace backup.",
      );
    } finally {
      setIsExportingBackup(false);
    }
  }

  async function handleBackupFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError(null);
    setBackupSummary(null);
    setBackupSummaryTone("success");

    try {
      const parsed = JSON.parse(await file.text()) as WorkspaceBackupSnapshot;

      if (
        typeof parsed.version !== "number"
        || !Array.isArray(parsed.users)
        || !Array.isArray(parsed.conversations)
        || !Array.isArray(parsed.activityEvents)
        || !Array.isArray(parsed.jobHistory)
      ) {
        throw new Error("That backup file is not in the expected workspace snapshot format.");
      }

      setPendingBackupSnapshot(parsed);
      setPendingBackupFileName(file.name);
      setBackupSummary(
        `Loaded backup ${file.name} with ${parsed.users.length} users, ${parsed.conversations.length} conversations, ${parsed.activityEvents.length} activity events, and ${parsed.jobHistory.length} jobs.`,
      );
      setBackupSummaryTone("success");
    } catch (backupError) {
      setPendingBackupSnapshot(null);
      setPendingBackupFileName(null);
      setBackupRestoreConfirmed(false);
      setError(
        backupError instanceof Error
          ? backupError.message
          : "Unable to read the selected backup file.",
      );
    } finally {
      event.target.value = "";
    }
  }

  async function importWorkspaceBackup() {
    if (!pendingBackupSnapshot) {
      return;
    }

    setIsImportingBackup(true);
    setError(null);

    try {
      const previousUser = session.user;
      const response = await fetch("/api/admin/system/backup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pendingBackupSnapshot),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const sessionResponse = await fetch("/api/users/session", { cache: "no-store" });

      if (!sessionResponse.ok) {
        throw new Error(await readErrorMessage(sessionResponse));
      }

      const nextSession = (await sessionResponse.json()) as UserSessionStatus;
      const restoreOutcome = describeRestoreOutcome(previousUser, nextSession);
      onSessionChange(nextSession);
      setPendingBackupSnapshot(null);
      setPendingBackupFileName(null);
      setBackupRestoreConfirmed(false);
      setManagedUsers([]);
      setUsername("");
      setDisplayName("");
      setPassword("");
      setMode(nextSession.userCount === 0 ? "register" : "login");

      if (nextSession.user?.role === "admin") {
        await refreshUsers();
      }

      setBackupSummary(restoreOutcome.summary);
      setBackupSummaryTone(restoreOutcome.tone);
    } catch (backupError) {
      setError(
        backupError instanceof Error
          ? backupError.message
          : "Unable to restore the workspace backup.",
      );
    } finally {
      setIsImportingBackup(false);
    }
  }

  return (
    <section className="glass-panel rounded-[36px] p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-label text-xs font-semibold">Workspace access</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
            Local users
          </h2>
        </div>
        <div className="rounded-full bg-white/70 px-4 py-2 text-sm font-semibold text-foreground">
          {session.userCount} user{session.userCount === 1 ? "" : "s"}
        </div>
      </div>

      {session.user ? (
        <div className="mt-6 rounded-[28px] bg-white/55 p-5">
          <p className="text-lg font-semibold text-foreground">{session.user.displayName}</p>
          <p className="mt-1 text-sm text-muted">@{session.user.username}</p>
          <p className="mt-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
            {session.user.role}
          </p>
          <p className="mt-4 text-sm leading-6 text-muted">
            Conversations are scoped to the signed-in user. Admin role unlocks
            privileged model controls without the fallback env password flow.
          </p>
          <button
            className="mt-5 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-foreground"
            type="button"
            onClick={logout}
          >
            Sign out user
          </button>
        </div>
      ) : (
        <form className="mt-6 space-y-3" onSubmit={submit}>
          <div className="flex gap-2">
            <button
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                mode === "login"
                  ? "bg-[var(--accent)] text-white"
                  : "border border-line bg-white text-foreground"
              }`}
              type="button"
              onClick={() => setMode("login")}
            >
              Sign in
            </button>
            <button
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                mode === "register"
                  ? "bg-[var(--accent)] text-white"
                  : "border border-line bg-white text-foreground"
              }`}
              type="button"
              onClick={() => setMode("register")}
            >
              Create user
            </button>
          </div>
          <input
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
            placeholder="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          {mode === "register" ? (
            <input
              className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
              placeholder="Display name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          ) : null}
          <input
            className="w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-foreground outline-none"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error ? (
            <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {error}
            </div>
          ) : null}
          <p className="text-sm leading-6 text-muted">
            {session.userCount === 0
              ? "The first registered user becomes admin. Later users are created as operators."
              : "Sign in to access your own saved conversations and role-based controls."}
          </p>
          <button
            className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!username.trim() || !password.trim() || isSubmitting}
            type="submit"
          >
            {isSubmitting
              ? mode === "login"
                ? "Signing in..."
                : "Creating user..."
              : mode === "login"
                ? "Sign in"
                : "Create user"}
          </button>
        </form>
      )}

      {backupSummary ? (
        <div
          className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
            backupSummaryTone === "warning"
              ? "bg-amber-50 text-amber-900"
              : "bg-emerald-50 text-emerald-900"
          }`}
        >
          {backupSummary}
        </div>
      ) : null}

      {session.user?.role === "admin" ? (
        <div className="mt-6 space-y-6">
          <div className="rounded-[28px] border border-line/80 bg-white/55 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow text-muted">Role management</p>
                <p className="mt-2 text-sm text-muted">
                  Promote or restrict other local users.
                </p>
              </div>
              <button
                className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isLoadingUsers}
                type="button"
                onClick={refreshUsers}
              >
                {isLoadingUsers ? "Refreshing..." : "Refresh users"}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {managedUsers.length > 0 ? (
                managedUsers.map((user) => (
                  <div
                    key={user.id}
                    className="rounded-[24px] bg-white px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {user.displayName}
                        </p>
                        <p className="mt-1 text-xs text-muted">@{user.username}</p>
                      </div>
                      <span className="rounded-full bg-white/0 px-3 py-1 text-xs font-semibold text-muted border border-line">
                        {user.role}
                      </span>
                    </div>
                    {user.id === currentUserId ? (
                      <p className="mt-3 text-xs text-muted">
                        Your own role is locked in this panel.
                      </p>
                    ) : (
                      <>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(["viewer", "operator", "admin"] as const).map((role) => (
                            <button
                              key={role}
                              className={`rounded-full px-3 py-2 text-xs font-semibold ${
                                user.role === role
                                  ? "bg-[var(--accent)] text-white"
                                  : "border border-line bg-white text-foreground"
                              } disabled:cursor-not-allowed disabled:opacity-50`}
                              disabled={busyUserId === user.id || user.role === role}
                              type="button"
                              onClick={() => changeRole(user.id, role)}
                            >
                              {busyUserId === user.id && user.role !== role
                                ? "Updating..."
                                : role}
                            </button>
                          ))}
                        </div>

                        {pendingDeleteUserId === user.id ? (
                          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
                            <p className="font-semibold">Delete {user.displayName}?</p>
                            <p className="mt-2 leading-6">
                              This removes the local account and permanently deletes that user&apos;s saved conversations on this machine.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                className="rounded-full bg-[var(--accent)] px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={busyUserId === user.id}
                                type="button"
                                onClick={() => removeUser(user)}
                              >
                                {busyUserId === user.id ? "Deleting..." : "Confirm delete"}
                              </button>
                              <button
                                className="rounded-full border border-line bg-white px-3 py-2 font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={busyUserId === user.id}
                                type="button"
                                onClick={() => setPendingDeleteUserId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3">
                            <button
                              className="rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={busyUserId === user.id}
                              type="button"
                              onClick={() => setPendingDeleteUserId(user.id)}
                            >
                              Delete user
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))
              ) : (
                <div className="rounded-[24px] border border-dashed border-line bg-white/45 px-4 py-4 text-sm text-muted">
                  No users to manage yet.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[28px] border border-line/80 bg-white/55 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow text-muted">Workspace backup</p>
                <p className="mt-2 text-sm text-muted">
                  Export or restore the local users, conversations, activity log, and job history for this machine.
                </p>
              </div>
              <button
                className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isExportingBackup}
                type="button"
                onClick={exportWorkspaceBackup}
              >
                {isExportingBackup ? "Exporting..." : "Export backup"}
              </button>
            </div>

            <div className="mt-4 rounded-[24px] bg-amber-50 px-4 py-4 text-sm text-amber-950">
              Backup files are sensitive. They include local account metadata and the credential hashes required to restore sign-in access on this machine.
            </div>

            <p className="mt-3 text-sm text-muted">
              Keep exported backups in a trusted location and only restore files from sources you control.
            </p>

            {pendingBackupSnapshot ? (
              <div className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50/70 px-4 py-4 text-sm text-amber-950">
                <p className="font-semibold">Restore replaces the current local workspace state.</p>
                <p className="mt-2 leading-6">
                  Users, conversations, activity events, and job history on this machine will be overwritten by the selected backup.
                </p>
                <label className="mt-4 flex items-start gap-3 text-sm text-foreground">
                  <input
                    checked={backupRestoreConfirmed}
                    className="mt-1 h-4 w-4 rounded border-line"
                    type="checkbox"
                    onChange={(event) => setBackupRestoreConfirmed(event.target.checked)}
                  />
                  <span>
                    I understand this restore overwrites the current local workspace data and may sign out or change the access level of the current user.
                  </span>
                </label>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-3">
              <input
                ref={backupImportInputRef}
                accept="application/json"
                className="hidden"
                type="file"
                onChange={handleBackupFileSelected}
              />
              <button
                className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-foreground"
                type="button"
                onClick={() => backupImportInputRef.current?.click()}
              >
                Choose backup file
              </button>
              <button
                aria-label={pendingBackupSnapshot ? "Confirm restore workspace backup" : "Restore workspace backup"}
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!pendingBackupSnapshot || !backupRestoreConfirmed || isImportingBackup}
                type="button"
                onClick={importWorkspaceBackup}
              >
                {isImportingBackup
                  ? "Restoring..."
                  : pendingBackupSnapshot
                    ? "Confirm restore backup"
                    : "Restore backup"}
              </button>
            </div>

            {pendingBackupFileName ? (
              <p className="mt-3 text-xs text-muted">
                Selected backup: {pendingBackupFileName}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}