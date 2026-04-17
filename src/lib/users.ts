import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getDataStorePath } from "@/lib/data-store";
import type { AuthProvider, PublicUser, SessionUser, StoredUser } from "@/lib/user-types";

const STORE_PATH = getDataStorePath("users.json");

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureStore() {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });

  try {
    await readFile(STORE_PATH, "utf8");
  } catch {
    await writeFile(STORE_PATH, "[]\n", "utf8");
  }
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function normalizeDisplayName(displayName: string, fallback: string) {
  const trimmed = displayName.trim();
  return trimmed || fallback;
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isAuthProvider(value: unknown): value is AuthProvider {
  return value === "local" || value === "google";
}

function normalizeStoredUser(user: StoredUser): StoredUser {
  const username = normalizeUsername(user.username);

  return {
    id: user.id,
    username,
    displayName: normalizeDisplayName(user.displayName, username),
    role: user.role,
    authProvider: isAuthProvider(user.authProvider) ? user.authProvider : "local",
    email: normalizeOptionalString(user.email),
    providerSubject: normalizeOptionalString(user.providerSubject),
    avatarUrl: normalizeOptionalString(user.avatarUrl),
    passwordHash: typeof user.passwordHash === "string" ? user.passwordHash : undefined,
    passwordSalt: typeof user.passwordSalt === "string" ? user.passwordSalt : undefined,
    createdAt: user.createdAt,
  };
}

async function readStore() {
  await ensureStore();
  const raw = await readFile(STORE_PATH, "utf8");
  return (JSON.parse(raw) as StoredUser[]).map(normalizeStoredUser);
}

async function writeStore(users: StoredUser[]) {
  await ensureStore();
  await writeFile(STORE_PATH, `${JSON.stringify(users, null, 2)}\n`, "utf8");
}

function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

export function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    authProvider: user.authProvider,
    email: user.email,
    providerSubject: user.providerSubject,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  };
}

export function toSessionUser(user: StoredUser): SessionUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    authProvider: user.authProvider,
    email: user.email,
  };
}

export async function countUsers() {
  const users = await readStore();
  return users.length;
}

export async function countAdmins() {
  const users = await readStore();
  return users.filter((user) => user.role === "admin").length;
}

export async function listUsers() {
  const users = await readStore();
  return users.map(toPublicUser);
}

export async function getUserById(id: string) {
  const users = await readStore();
  return users.find((user) => user.id === id) ?? null;
}

export async function getUserByUsername(username: string) {
  const normalizedUsername = normalizeUsername(username);
  const users = await readStore();
  return users.find((user) => user.username === normalizedUsername) ?? null;
}

export async function updateUserRole(id: string, role: StoredUser["role"]) {
  const users = await readStore();
  const index = users.findIndex((user) => user.id === id);

  if (index === -1) {
    return null;
  }

  users[index] = {
    ...users[index],
    role,
  };

  await writeStore(users);
  return users[index];
}

function normalizeEmailAddress(email: string) {
  return email.trim().toLowerCase();
}

function validateOptionalEmail(email: string) {
  if (!email.trim()) {
    return undefined;
  }

  const normalized = normalizeEmailAddress(email);

  if (!normalized.includes("@") || normalized.startsWith("@") || normalized.endsWith("@")) {
    throw new Error("Enter a valid email address.");
  }

  return normalized;
}

export async function updateUserProfile(input: {
  displayName: string;
  email?: string;
  id: string;
}) {
  const users = await readStore();
  const index = users.findIndex((user) => user.id === input.id);

  if (index === -1) {
    return null;
  }

  const currentUser = users[index];
  const nextDisplayName = normalizeDisplayName(input.displayName, currentUser.username);

  if (!nextDisplayName.trim()) {
    throw new Error("Display name is required.");
  }

  let nextEmail = currentUser.email;

  if (currentUser.authProvider === "local") {
    nextEmail = validateOptionalEmail(input.email ?? "");

    const conflictingUser = users.find((user) => {
      if (user.id === currentUser.id) {
        return false;
      }

      return Boolean(nextEmail && (user.email === nextEmail || user.username === nextEmail));
    });

    if (conflictingUser) {
      throw new Error("That email address is already attached to another account.");
    }
  }

  users[index] = {
    ...currentUser,
    displayName: nextDisplayName,
    email: currentUser.authProvider === "google" ? currentUser.email : nextEmail,
  };

  await writeStore(users);
  return users[index];
}

export async function updateUserPassword(input: {
  currentPassword: string;
  id: string;
  nextPassword: string;
}) {
  const users = await readStore();
  const index = users.findIndex((user) => user.id === input.id);

  if (index === -1) {
    return null;
  }

  const currentUser = users[index];

  if (currentUser.authProvider !== "local") {
    throw new Error("Google-managed accounts do not use local password reset here.");
  }

  if (!verifyUserPassword(currentUser, input.currentPassword)) {
    throw new Error("Your current password is incorrect.");
  }

  const nextPassword = input.nextPassword.trim();

  if (nextPassword.length < 8) {
    throw new Error("New password must be at least 8 characters long.");
  }

  const salt = randomBytes(16).toString("hex");
  users[index] = {
    ...currentUser,
    passwordHash: hashPassword(nextPassword, salt),
    passwordSalt: salt,
  };

  await writeStore(users);
  return users[index];
}

export async function deleteUser(id: string) {
  const users = await readStore();
  const index = users.findIndex((user) => user.id === id);

  if (index === -1) {
    return null;
  }

  const [deletedUser] = users.splice(index, 1);
  await writeStore(users);
  return deletedUser;
}

export async function createUser(input: {
  username: string;
  displayName: string;
  password: string;
}) {
  const users = await readStore();
  const username = normalizeUsername(input.username);

  if (!username) {
    throw new Error("Username is required.");
  }

  if (users.some((user) => user.username === username)) {
    throw new Error("That username is already in use.");
  }

  const salt = randomBytes(16).toString("hex");
  const user: StoredUser = {
    id: createId(),
    username,
    displayName: normalizeDisplayName(input.displayName, username),
    role: users.length === 0 ? "admin" : "operator",
    authProvider: "local",
    passwordHash: hashPassword(input.password, salt),
    passwordSalt: salt,
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  await writeStore(users);
  return user;
}

export async function upsertGoogleUser(input: {
  email: string;
  providerSubject: string;
  displayName: string;
  avatarUrl?: string;
}) {
  const users = await readStore();
  const email = normalizeUsername(input.email);
  const providerSubject = input.providerSubject.trim();

  if (!email) {
    throw new Error("Google account email is required.");
  }

  if (!providerSubject) {
    throw new Error("Google account subject is required.");
  }

  const matchingGoogleUser = users.find(
    (user) => user.authProvider === "google" && user.providerSubject === providerSubject,
  );

  if (matchingGoogleUser) {
    const updatedUser: StoredUser = {
      ...matchingGoogleUser,
      username: email,
      email,
      displayName: normalizeDisplayName(input.displayName, email),
      avatarUrl: normalizeOptionalString(input.avatarUrl),
      providerSubject,
    };

    const index = users.findIndex((user) => user.id === matchingGoogleUser.id);
    users[index] = updatedUser;
    await writeStore(users);
    return { user: updatedUser, created: false };
  }

  const conflictingUser = users.find(
    (user) => user.username === email || user.email === email,
  );

  if (conflictingUser) {
    if (conflictingUser.authProvider !== "google") {
      throw new Error("That email is already attached to a local account. Sign in locally or use a different Google account.");
    }

    const updatedUser: StoredUser = {
      ...conflictingUser,
      username: email,
      email,
      displayName: normalizeDisplayName(input.displayName, email),
      avatarUrl: normalizeOptionalString(input.avatarUrl),
      providerSubject,
    };

    const index = users.findIndex((user) => user.id === conflictingUser.id);
    users[index] = updatedUser;
    await writeStore(users);
    return { user: updatedUser, created: false };
  }

  const user: StoredUser = {
    id: createId(),
    username: email,
    displayName: normalizeDisplayName(input.displayName, email),
    role: users.length === 0 ? "admin" : "operator",
    authProvider: "google",
    email,
    providerSubject,
    avatarUrl: normalizeOptionalString(input.avatarUrl),
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  await writeStore(users);
  return { user, created: true };
}

export function verifyUserPassword(user: StoredUser, password: string) {
  if (user.authProvider !== "local" || !user.passwordHash || !user.passwordSalt) {
    return false;
  }

  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = Buffer.from(hashPassword(password, user.passwordSalt), "hex");

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}
