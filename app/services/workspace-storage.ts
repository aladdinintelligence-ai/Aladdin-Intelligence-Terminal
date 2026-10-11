"use client";

// Workspace persistence gate.
//
// Signed-in users get durable localStorage. Anonymous visitors get an
// in-memory store instead: Ask Aladdin stays fully usable during the visit,
// but nothing is written to disk, so a reload always starts fresh.
let ephemeral = false;
const memory = new Map<string, string>();

export function setWorkspaceEphemeral(enabled: boolean) {
  if (enabled === ephemeral) return;
  ephemeral = enabled;
  memory.clear();
}

export function workspaceIsEphemeral() {
  return ephemeral;
}

export function readWorkspaceItem(key: string): string | null {
  if (ephemeral) return memory.has(key) ? (memory.get(key) as string) : null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeWorkspaceItem(key: string, value: string) {
  if (ephemeral) {
    memory.set(key, value);
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota exceeded or storage disabled */
  }
}

export function removeWorkspaceItem(key: string) {
  if (ephemeral) {
    memory.delete(key);
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
