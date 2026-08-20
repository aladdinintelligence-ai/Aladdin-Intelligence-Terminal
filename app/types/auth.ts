export interface AuthUser {
  id: string;
  displayName: string;
  username: string;
  email?: string;
  avatarUrl: string | null;
  primaryProfile: string;
  hasWallet: boolean;
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface AuthError {
  error: string;
}
