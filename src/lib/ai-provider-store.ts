import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { getSessionSecret } from "@/lib/auth";
import { getDataStorePath, readJsonStore, updateJsonStore } from "@/lib/data-store";
import type { AiProviderConfigSummary, AiProviderId } from "@/lib/ai-types";

type ManagedHostedProviderId = Extract<AiProviderId, "anthropic" | "openai">;

type StoredProviderSecretRecord = {
  encryptedApiKey: string;
  iv: string;
  tag: string;
  updatedAt: string;
};

type StoredProviderSecrets = Partial<Record<ManagedHostedProviderId, StoredProviderSecretRecord>>;

const STORE_PATH = getDataStorePath("ai-provider-secrets.json");

function getProviderEncryptionSecret() {
  const secret = process.env.OLOAD_PROVIDER_SECRET || getSessionSecret();

  if (!secret) {
    throw new Error("Provider secret storage requires OLOAD_PROVIDER_SECRET or OLOAD_SESSION_SECRET.");
  }

  return createHash("sha256").update(secret).digest();
}

function encryptApiKey(value: string) {
  const key = getProviderEncryptionSecret();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encryptedApiKey: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    updatedAt: new Date().toISOString(),
  } satisfies StoredProviderSecretRecord;
}

function decryptApiKey(record: StoredProviderSecretRecord) {
  const key = getProviderEncryptionSecret();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(record.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(record.tag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(record.encryptedApiKey, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function getEnvironmentApiKey(providerId: ManagedHostedProviderId) {
  return providerId === "anthropic"
    ? process.env.ANTHROPIC_API_KEY?.trim() || null
    : process.env.OPENAI_API_KEY?.trim() || null;
}

async function readProviderSecrets() {
  return readJsonStore<StoredProviderSecrets>(STORE_PATH, {});
}

export async function listProviderConfigSummaries(): Promise<AiProviderConfigSummary[]> {
  const secrets = await readProviderSecrets();

  return (["anthropic", "openai"] as const).map((providerId) => {
    const environmentApiKey = getEnvironmentApiKey(providerId);
    const storedRecord = secrets[providerId];

    return {
      providerId,
      hasStoredApiKey: Boolean(storedRecord),
      hasEnvironmentApiKey: Boolean(environmentApiKey),
      configured: Boolean(environmentApiKey || storedRecord),
      updatedAt: storedRecord?.updatedAt ?? null,
    };
  });
}

export async function getProviderApiKey(providerId: ManagedHostedProviderId) {
  const environmentApiKey = getEnvironmentApiKey(providerId);

  if (environmentApiKey) {
    return environmentApiKey;
  }

  const secrets = await readProviderSecrets();
  const record = secrets[providerId];

  if (!record) {
    return null;
  }

  return decryptApiKey(record);
}

export async function saveProviderApiKey(providerId: ManagedHostedProviderId, apiKey: string) {
  const trimmedApiKey = apiKey.trim();

  await updateJsonStore<StoredProviderSecrets>(STORE_PATH, {}, (current) => {
    const next = { ...current };

    if (!trimmedApiKey) {
      delete next[providerId];
      return next;
    }

    next[providerId] = encryptApiKey(trimmedApiKey);
    return next;
  });
}