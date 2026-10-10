import { apiFetch } from "@/app/lib/api";
import type { AuthResponse } from "@/app/types/auth";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

interface GoogleCredentialResponse {
  credential: string;
}

// PromptMomentNotification reported by the One Tap `prompt()` call. We use it
// to tell the difference between "the user is signing in" and "Google decided
// not to show the window at all" (popup blocked, no Google session, origin not
// authorized, One Tap suppressed, ...). Without it a caller has no way to stop
// a spinner that would otherwise hang forever.
export interface GooglePromptNotification {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  isDismissedMoment: () => boolean;
  getNotDisplayedReason?: () => string;
  getSkippedReason?: () => string;
  getDismissedReason?: () => string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          prompt: (
            momentListener?: (notification: GooglePromptNotification) => void,
          ) => void;
        };
      };
    };
  }
}

let googleInitialized = false;

export function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const existing = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      // A previously failed load would leave the tag without ever firing again.
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Google Identity Services")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
}

// Throws (instead of silently returning) when sign-in cannot be attempted, so
// the caller can surface a real message to the user.
export function initGoogleAuth(
  callback: (idToken: string) => void,
  onResult?: (notification: GooglePromptNotification) => void,
): void {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error("Google sign-in is not configured");
  }
  if (!window.google?.accounts?.id) {
    throw new Error("Google Identity Services failed to load");
  }
  if (!googleInitialized) {
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => callback(response.credential),
    });
    googleInitialized = true;
  }
  window.google.accounts.id.prompt((notification) => {
    if (!notification || !onResult) return;
    if (
      notification.isNotDisplayed() ||
      notification.isSkippedMoment() ||
      notification.isDismissedMoment()
    ) {
      onResult(notification);
    }
  });
}

export async function googleLogin(idToken: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ idToken }),
  });
}
