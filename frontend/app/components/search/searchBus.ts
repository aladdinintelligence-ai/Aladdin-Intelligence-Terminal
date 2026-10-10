"use client";
import { useSyncExternalStore } from "react";

let open = false;
let focusFn: (() => void) | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return open;
}

function getServerSnapshot() {
  return false;
}

export function useSearchOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function openSearch() {
  open = true;
  notify();
  const focus = focusFn;
  if (focus) requestAnimationFrame(() => focus());
}

export function closeSearch() {
  if (!open) return;
  open = false;
  notify();
}

export function registerFocusSearchInput(fn: () => void) {
  focusFn = fn;
}

export function clearFocusSearchInput(fn: () => void) {
  if (focusFn === fn) focusFn = null;
}