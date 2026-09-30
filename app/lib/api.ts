const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data as T;
}

export interface AskSseFrame {
  type: "activity" | "complete" | "error";
  events?: import("@/app/types/analytics/query").ActivityEvent[];
  result?: import("@/app/types/analytics/query").AnalyticalRunResult;
  error?: string;
}

/**
 * POSTs a JSON body to an SSE endpoint and streams typed frames.
 * Supports AbortController for cancellation.
 */
export async function askSseFetch<T extends AskSseFrame = AskSseFrame>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<{
  frames: T[];
  complete: (T & { type: "complete" }) | null;
  error: string | null;
}> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
    signal,
  });

  if (!response.ok || !response.body) {
    let msg = `Request failed with status ${response.status}`;
    try {
      const data = await response.json();
      if (data.error) msg = data.error;
    } catch {
      /* ignore parse failure */
    }
    throw new Error(msg);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const frames: T[] = [];
  let complete: (T & { type: "complete" }) | null = null;
  let error: string | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = raw
        .split("\n")
        .find((line) => line.startsWith("data:"));
      if (!dataLine) continue;
      try {
        const frame = JSON.parse(dataLine.slice(5).trim()) as T;
        frames.push(frame);
        if (frame.type === "complete") complete = frame as T & { type: "complete" };
        if (frame.type === "error") error = frame.error || "Analysis failed";
      } catch {
        /* ignore malformed frames */
      }
    }
  }

  if (error) throw new Error(error);
  return { frames, complete, error };
}
