import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getDataStorePath } from "@/lib/data-store";
import { normalizeModelName, normalizeSystemPrompt, normalizeTemperature } from "@/lib/system-prompt";
import type {
  AuthProvider,
  EmailVerificationPurpose,
  PendingEmailVerification,
  PublicUser,
  SessionUser,
  StoredUser,
  VoiceTranscriptionLanguage,
} from "@/lib/user-types";
import { isVoiceTranscriptionLanguage } from "@/lib/voice-types";

const STORE_PATH = getDataStorePath("users.json");
const ADMIN_EMAIL_ALLOWLIST = new Set([
  "keith@bayou.com",
  "snowolofex@yahoo.com",
  "snowolfex@gmail.com",
  "snowoflex@gmail.com",
]);

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

function normalizeLocalEmailAddress(email: string) {
  return email.trim().toLowerCase();
}

function resolveRoleForEmail(email: string, isFirstUser: boolean): StoredUser["role"] {
  if (isFirstUser || ADMIN_EMAIL_ALLOWLIST.has(normalizeLocalEmailAddress(email))) {
    return "admin";
  }

  return "operator";
}

function normalizeDisplayName(displayName: string, fallback: string) {
  const trimmed = displayName.trim();
  return trimmed || fallback;
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeVoiceTranscriptionLanguage(value: unknown): VoiceTranscriptionLanguage | undefined {
  return typeof value === "string" && isVoiceTranscriptionLanguage(value)
    ? value as VoiceTranscriptionLanguage
    : undefined;
}

function isEmailVerificationPurpose(value: unknown): value is EmailVerificationPurpose {
  return value === "register" || value === "login" || value === "email-change" || value === "password-reset";
}

function normalizePendingEmailVerification(value: unknown): PendingEmailVerification | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.codeHash !== "string"
    || typeof record.codeSalt !== "string"
    || typeof record.email !== "string"
    || typeof record.expiresAt !== "string"
    || !isEmailVerificationPurpose(record.purpose)
    || typeof record.rememberSession !== "boolean"
    || typeof record.requestedAt !== "string"
  ) {
    return undefined;
  }

  return {
    codeHash: record.codeHash,
    codeSalt: record.codeSalt,
    email: normalizeLocalEmailAddress(record.email),
    expiresAt: record.expiresAt,
    purpose: record.purpose,
    rememberSession: record.rememberSession,
    requestedAt: record.requestedAt,
  };
}

function isAuthProvider(value: unknown): value is AuthProvider {
  return value === "local" || value === "google";
}

function normalizeStoredUser(user: StoredUser): StoredUser {
  const username = normalizeUsername(user.username);
  const normalizedEmail = normalizeOptionalString(user.email);
  const localEmail = user.authProvider === "local"
    ? normalizeOptionalString(normalizedEmail ?? username)
    : normalizedEmail;

  return {
    id: user.id,
    username,
    displayName: normalizeDisplayName(user.displayName, username),
    role: user.role,
    authProvider: isAuthProvider(user.authProvider) ? user.authProvider : "local",
    email: localEmail,
    emailVerifiedAt: normalizeOptionalString(user.emailVerifiedAt),
    requireEmailVerificationOnLogin: normalizeOptionalBoolean(user.requireEmailVerificationOnLogin) ?? false,
    preferredModel: normalizeModelName(user.preferredModel),
    preferredTemperature: normalizeTemperature(user.preferredTemperature),
    preferredSystemPrompt: normalizeSystemPrompt(user.preferredSystemPrompt),
    preferredVoiceTranscriptionLanguage: normalizeVoiceTranscriptionLanguage(user.preferredVoiceTranscriptionLanguage),
    providerSubject: normalizeOptionalString(user.providerSubject),
    avatarUrl: normalizeOptionalString(user.avatarUrl),
    passwordHash: typeof user.passwordHash === "string" ? user.passwordHash : undefined,
    passwordSalt: typeof user.passwordSalt === "string" ? user.passwordSalt : undefined,
    pendingEmailVerification: normalizePendingEmailVerification(user.pendingEmailVerification),
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
    emailVerifiedAt: user.emailVerifiedAt,
    requireEmailVerificationOnLogin: user.requireEmailVerificationOnLogin ?? false,
    preferredModel: user.preferredModel,
    preferredTemperature: user.preferredTemperature,
    preferredSystemPrompt: user.preferredSystemPrompt,
    preferredVoiceTranscriptionLanguage: user.preferredVoiceTranscriptionLanguage,
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
    emailVerifiedAt: user.emailVerifiedAt,
    preferredModel: user.preferredModel,
    preferredTemperature: user.preferredTemperature,
    preferredSystemPrompt: user.preferredSystemPrompt,
    preferredVoiceTranscriptionLanguage: user.preferredVoiceTranscriptionLanguage,
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

export async function getUserByEmail(email: string) {
  const normalizedEmail = normalizeLocalEmailAddress(email);
  const users = await readStore();
  return users.find((user) => user.email === normalizedEmail) ?? null;
}

export async function getUserByLoginIdentifier(identifier: string) {
  const normalizedIdentifier = normalizeLocalEmailAddress(identifier);
  const users = await readStore();
  return users.find((user) => {
    if (user.authProvider !== "local") {
      return false;
    }

    return user.email === normalizedIdentifier || user.username === normalizedIdentifier;
  }) ?? null;
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

function validateOptionalEmail(email: string) {
  if (!email.trim()) {
    return undefined;
  }

  const normalized = normalizeLocalEmailAddress(email);

  if (!normalized.includes("@") || normalized.startsWith("@") || normalized.endsWith("@")) {
    throw new Error("Enter a valid email address.");
  }

  return normalized;
}

export async function updateUserProfile(input: {
  displayName: string;
  email?: string;
  id: string;
  preferredModel?: string;
  preferredTemperature?: number;
  preferredSystemPrompt?: string;
  preferredVoiceTranscriptionLanguage?: VoiceTranscriptionLanguage;
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
    const requestedEmail = validateOptionalEmail(input.email ?? currentUser.email ?? "");

    if (!requestedEmail) {
      throw new Error("A local account must keep a valid email address.");
    }

    if (requestedEmail !== currentUser.email) {
      throw new Error("Email address changes must go through the verification flow.");
    }

    nextEmail = requestedEmail;

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
    preferredModel: normalizeModelName(input.preferredModel),
    preferredTemperature: normalizeTemperature(input.preferredTemperature),
    preferredSystemPrompt: normalizeSystemPrompt(input.preferredSystemPrompt),
    preferredVoiceTranscriptionLanguage: normalizeVoiceTranscriptionLanguage(input.preferredVoiceTranscriptionLanguage),
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

export async function resetUserPassword(input: {
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

  const nextPassword = input.nextPassword.trim();

  if (nextPassword.length < 8) {
    throw new Error("New password must be at least 8 characters long.");
  }

  const salt = randomBytes(16).toString("hex");
  users[index] = {
    ...currentUser,
    passwordHash: hashPassword(nextPassword, salt),
    passwordSalt: salt,
    pendingEmailVerification: undefined,
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
  email: string;
  displayName: string;
  password: string;
}) {
  const users = await readStore();
  const email = validateOptionalEmail(input.email);

  if (!email) {
    throw new Error("Email address is required.");
  }

  if (users.some((user) => user.username === email || user.email === email)) {
    throw new Error("That email address is already in use.");
  }

  const salt = randomBytes(16).toString("hex");
  const user: StoredUser = {
    id: createId(),
    username: email,
    displayName: normalizeDisplayName(input.displayName, email),
    role: resolveRoleForEmail(email, users.length === 0),
    authProvider: "local",
    email,
    requireEmailVerificationOnLogin: false,
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
  const email = normalizeLocalEmailAddress(input.email);
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
      role: resolveRoleForEmail(email, users.length === 0),
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
      role: resolveRoleForEmail(email, users.length === 0),
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
    role: resolveRoleForEmail(email, users.length === 0),
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

function hashVerificationCode(code: string, salt: string) {
  return scryptSync(code, salt, 64).toString("hex");
}

export async function updateUserEmailVerificationPolicy(input: {
  id: string;
  requireEmailVerificationOnLogin: boolean;
}) {
  const users = await readStore();
  const index = users.findIndex((user) => user.id === input.id);

  if (index === -1) {
    return null;
  }

  users[index] = {
    ...users[index],
    requireEmailVerificationOnLogin: input.requireEmailVerificationOnLogin,
  };

  await writeStore(users);
  return users[index];
}

export async function issueEmailVerificationChallenge(input: {
  email?: string;
  purpose: EmailVerificationPurpose;
  rememberSession?: boolean;
  userId?: string;
}) {
  const users = await readStore();
  const normalizedEmail = input.email ? validateOptionalEmail(input.email) : undefined;
  const index = input.userId
    ? users.findIndex((user) => user.id === input.userId)
    : users.findIndex((user) => user.email === normalizedEmail);

  if (index === -1) {
    return null;
  }

  const targetUser = users[index];
  const verificationEmail = validateOptionalEmail(normalizedEmail ?? targetUser.email ?? "");

  if (!verificationEmail) {
    throw new Error("A verified email address is required for local authentication.");
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const salt = randomBytes(16).toString("hex");
  const requestedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60_000).toISOString();

  users[index] = {
    ...targetUser,
    email: verificationEmail,
    pendingEmailVerification: {
      codeHash: hashVerificationCode(code, salt),
      codeSalt: salt,
      email: verificationEmail,
      expiresAt,
      purpose: input.purpose,
      rememberSession: input.rememberSession === true,
      requestedAt,
    },
  };

  await writeStore(users);
  return {
    code,
    expiresAt,
    purpose: input.purpose,
    rememberSession: input.rememberSession === true,
    user: users[index],
  };
}

export async function consumeEmailVerificationChallenge(input: {
  code: string;
  email: string;
  purpose?: EmailVerificationPurpose;
}) {
  const users = await readStore();
  const normalizedEmail = validateOptionalEmail(input.email);

  if (!normalizedEmail) {
    throw new Error("A valid email address is required.");
  }

  const index = users.findIndex((user) => user.pendingEmailVerification?.email === normalizedEmail);

  if (index === -1) {
    return { error: "No active verification challenge exists for that email address.", user: null as StoredUser | null };
  }

  const targetUser = users[index];
  const challenge = targetUser.pendingEmailVerification;

  if (!challenge) {
    return { error: "No active verification challenge exists for that email address.", user: null as StoredUser | null };
  }

  if (input.purpose && challenge.purpose !== input.purpose) {
    return { error: "The verification challenge does not match this request.", user: null as StoredUser | null };
  }

  if (Date.parse(challenge.expiresAt) <= Date.now()) {
    users[index] = {
      ...targetUser,
      pendingEmailVerification: undefined,
    };
    await writeStore(users);
    return { error: "That verification code has expired. Request a new code and try again.", user: null as StoredUser | null };
  }

  const expected = Buffer.from(challenge.codeHash, "hex");
  const actual = Buffer.from(hashVerificationCode(input.code.trim(), challenge.codeSalt), "hex");

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { error: "That verification code is not valid.", user: null as StoredUser | null };
  }

  users[index] = {
    ...targetUser,
    email: challenge.email,
    emailVerifiedAt: new Date().toISOString(),
    pendingEmailVerification: undefined,
  };

  await writeStore(users);
  return {
    error: null,
    purpose: challenge.purpose,
    rememberSession: challenge.rememberSession,
    user: users[index],
  };
}
