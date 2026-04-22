import nodemailer from "nodemailer";

import { getDataStorePath, readJsonStore, writeJsonStore } from "@/lib/data-store";
import type { EmailVerificationPurpose } from "@/lib/user-types";

type VerificationOutboxEntry = {
  code: string;
  email: string;
  expiresAt: string;
  purpose: EmailVerificationPurpose;
  requestedAt: string;
  subject: string;
};

const OUTBOX_PATH = getDataStorePath("email-outbox.json");

function getVerificationPurposeLabel(purpose: EmailVerificationPurpose) {
  if (purpose === "register") {
    return "complete your account setup";
  }

  if (purpose === "login") {
    return "finish signing in";
  }

  return "confirm your email change";
}

function getSmtpConfig() {
  const host = process.env.OLOAD_SMTP_HOST?.trim();
  const port = Number(process.env.OLOAD_SMTP_PORT ?? "587");
  const user = process.env.OLOAD_SMTP_USER?.trim();
  const pass = process.env.OLOAD_SMTP_PASS?.trim();
  const from = process.env.OLOAD_SMTP_FROM?.trim();

  return {
    configured: Boolean(host && from),
    from,
    host,
    pass,
    port: Number.isFinite(port) ? port : 587,
    user,
  };
}

async function appendToOutbox(entry: VerificationOutboxEntry) {
  const current = await readJsonStore<VerificationOutboxEntry[]>(OUTBOX_PATH, []);
  await writeJsonStore(OUTBOX_PATH, [entry, ...current].slice(0, 50), []);
}

export async function sendLocalVerificationCode(input: {
  code: string;
  displayName: string;
  email: string;
  expiresAt: string;
  purpose: EmailVerificationPurpose;
  requestedAt: string;
}) {
  const purposeLabel = getVerificationPurposeLabel(input.purpose);
  const subject = `oload verification code: ${input.code}`;
  const text = [
    `Hello ${input.displayName},`,
    "",
    `Use this 6-digit code to ${purposeLabel}: ${input.code}`,
    "",
    `This code expires at ${input.expiresAt}.`,
    "If you did not request this code, you can ignore this email.",
  ].join("\n");
  const smtpConfig = getSmtpConfig();

  if (!smtpConfig.configured || process.env.PLAYWRIGHT_TEST === "1") {
    await appendToOutbox({
      code: input.code,
      email: input.email,
      expiresAt: input.expiresAt,
      purpose: input.purpose,
      requestedAt: input.requestedAt,
      subject,
    });
    return;
  }

  const transport = nodemailer.createTransport({
    auth: smtpConfig.user && smtpConfig.pass ? { user: smtpConfig.user, pass: smtpConfig.pass } : undefined,
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.port === 465,
  });

  await transport.sendMail({
    from: smtpConfig.from,
    subject,
    text,
    to: input.email,
  });
}
