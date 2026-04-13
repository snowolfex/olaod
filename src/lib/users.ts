import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { getDataStorePath } from "@/lib/data-store";
import type { PublicUser, SessionUser, StoredUser } from "@/lib/user-types";

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

async function readStore() {
  await ensureStore();
  const raw = await readFile(STORE_PATH, "utf8");
  return JSON.parse(raw) as StoredUser[];
}

async function writeStore(users: StoredUser[]) {
  await ensureStore();
  await writeFile(STORE_PATH, `${JSON.stringify(users, null, 2)}\n`, "utf8");
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
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
    createdAt: user.createdAt,
  };
}

export function toSessionUser(user: StoredUser): SessionUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
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
    displayName: input.displayName.trim() || username,
    role: users.length === 0 ? "admin" : "operator",
    passwordHash: hashPassword(input.password, salt),
    passwordSalt: salt,
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  await writeStore(users);
  return user;
}

export function verifyUserPassword(user: StoredUser, password: string) {
  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = Buffer.from(hashPassword(password, user.passwordSalt), "hex");

  if (expected.length !== actual.length) {
    return false;
  }

  return timingSafeEqual(expected, actual);
}