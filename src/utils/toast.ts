// Small in-app message ("toast") shown by components/ToastHost.tsx; replaces blocking alerts.
export type ToastKind = 'info' | 'ok' | 'error';
export interface ToastItem { id: number; text: string; kind: ToastKind }

type Listener = (items: ToastItem[]) => void;
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(items);
  return () => { listeners.delete(listener); };
}

export function showToast(text: string, kind: ToastKind = 'info', ms = 7000): void {
  const id = nextId++;
  items = [...items, { id, text, kind }];
  listeners.forEach((l) => l(items));
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    listeners.forEach((l) => l(items));
  }, ms);
}
