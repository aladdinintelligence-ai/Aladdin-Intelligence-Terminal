import { apiFetch } from "@/app/lib/api";
import type { AuthResponse } from "@/app/types/auth";

export interface TelegramLoginData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

function buildInitData(data: TelegramLoginData): string {
  const entries: [string, string][] = [];
  entries.push(["auth_date", String(data.auth_date)]);
  entries.push(["first_name", data.first_name]);
  if (data.id) entries.push(["id", String(data.id)]);
  if (data.last_name) entries.push(["last_name", data.last_name]);
  if (data.photo_url) entries.push(["photo_url", data.photo_url]);
  if (data.username) entries.push(["username", data.username]);
  entries.push(["hash", data.hash]);
  return new URLSearchParams(entries).toString();
}

export async function telegramLogin(data: TelegramLoginData): Promise<AuthResponse> {
  const initData = buildInitData(data);
  return apiFetch<AuthResponse>("/api/auth/telegram", {
    method: "POST",
    body: JSON.stringify({ initData }),
  });
}
