import { apiFetch } from "@/app/lib/api";
import type { AuthResponse } from "@/app/types/auth";

export interface PhantomLoginParams {
  publicKey: string;
  signedMessage: string;
  nonce: string;
}

export async function fetchNonce(): Promise<string> {
  const data = await apiFetch<{ nonce: string }>("/api/auth/nonce");
  return data.nonce;
}

export async function phantomLogin(
  params: PhantomLoginParams,
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/phantom", {
    method: "POST",
    body: JSON.stringify(params),
  });
}
