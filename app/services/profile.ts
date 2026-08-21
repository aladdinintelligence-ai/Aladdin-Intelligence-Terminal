import { apiFetch } from "@/app/lib/api";
import type { AuthUser } from "@/app/types/auth";

export interface UpdateProfileParams {
  displayName?: string;
  username?: string;
  primaryProfile?: string;
}

export async function updateProfile(params: UpdateProfileParams): Promise<AuthUser> {
  return apiFetch<AuthUser>("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify(params),
  });
}
