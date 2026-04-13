export type UserRole = "viewer" | "operator" | "admin";

export type StoredUser = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
};

export type PublicUser = Omit<StoredUser, "passwordHash" | "passwordSalt">;

export type SessionUser = Pick<PublicUser, "id" | "username" | "displayName" | "role">;

export type UserSessionStatus = {
  authAvailable: boolean;
  userCount: number;
  user: SessionUser | null;
};