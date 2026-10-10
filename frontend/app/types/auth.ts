export interface AuthUser {
  id: string;
  displayName: string;
  username: string;
  email?: string;
  avatarUrl: string | null;
  primaryProfile: string;
  authProvider: "google" | "telegram" | "phantom" | null;
  walletAddress: string | null;
  hasWallet: boolean;
  createdAt?: string;
}

export interface AuthResponse {
  user: AuthUser;
}

export interface AuthError {
  error: string;
}
