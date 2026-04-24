export type UserRole = "viewer" | "operator" | "admin";

export type AuthProvider = "local" | "google";

export type GoogleAuthMode = "none" | "broker" | "direct" | "redirect";

export type EmailVerificationPurpose = "register" | "login" | "email-change" | "password-reset";

export type PendingEmailVerification = {
  codeHash: string;
  codeSalt: string;
  email: string;
  expiresAt: string;
  purpose: EmailVerificationPurpose;
  rememberSession: boolean;
  requestedAt: string;
};

export type VoiceTranscriptionLanguage =
  | "auto"
  | "united-states"
  | "arabic"
  | "bengali"
  | "chinese"
  | "english"
  | "farsi"
  | "french"
  | "hindi"
  | "japanese"
  | "korean"
  | "portuguese"
  | "russian"
  | "spanish";

export type StoredUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  authProvider: AuthProvider;
  email?: string;
  emailVerifiedAt?: string;
  requireEmailVerificationOnLogin?: boolean;
  preferredModel?: string;
  preferredTemperature?: number;
  preferredSystemPrompt?: string;
  preferredVoiceTranscriptionLanguage?: VoiceTranscriptionLanguage;
  providerSubject?: string;
  avatarUrl?: string;
  passwordHash?: string;
  passwordSalt?: string;
  pendingEmailVerification?: PendingEmailVerification;
  createdAt: string;
};

export type PublicUser = Omit<StoredUser, "passwordHash" | "passwordSalt" | "pendingEmailVerification">;

export type ManagedUser = PublicUser & {
  savedConversationCount: number;
};

export type SessionUser = Pick<PublicUser, "id" | "username" | "displayName" | "role" | "authProvider" | "email" | "emailVerifiedAt" | "preferredModel" | "preferredTemperature" | "preferredSystemPrompt" | "preferredVoiceTranscriptionLanguage">;

export type UserSessionStatus = {
  authAvailable: boolean;
  googleAuthEnabled: boolean;
  googleAuthMode: GoogleAuthMode;
  userCount: number;
  user: SessionUser | null;
};