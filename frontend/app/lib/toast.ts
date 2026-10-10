export type ToastKind = "success" | "error";

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

let seq = 0;
let items: ToastItem[] = [];
const listeners = new Set<(items: ToastItem[]) => void>();

function emit() {
  for (const listener of listeners) listener([...items]);
}

// Tiny module-level toast store: any component can fire a popup without a
// provider; <ToastHost /> (mounted in the root layout) renders the stack.
export function toast(message: string, kind: ToastKind = "success") {
  const id = ++seq;
  items = [...items, { id, message, kind }];
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, 3200);
}

export function subscribeToasts(listener: (items: ToastItem[]) => void) {
  listeners.add(listener);
  listener([...items]);
  return () => {
    listeners.delete(listener);
  };
}
