export type UserRole = "viewer" | "operator" | "admin";

export type AuthProvider = "local" | "google";

export type GoogleAuthMode = "none" | "broker" | "direct" | "redirect";

export type StoredUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  authProvider: AuthProvider;
  email?: string;
  providerSubject?: string;
  avatarUrl?: string;
  passwordHash?: string;
  passwordSalt?: string;
  createdAt: string;
};

export type PublicUser = Omit<StoredUser, "passwordHash" | "passwordSalt">;

export type ManagedUser = PublicUser & {
  savedConversationCount: number;
};

export type SessionUser = Pick<PublicUser, "id" | "username" | "displayName" | "role" | "authProvider">;

export type UserSessionStatus = {
  authAvailable: boolean;
  googleAuthEnabled: boolean;
  googleAuthMode: GoogleAuthMode;
  userCount: number;
  user: SessionUser | null;
};