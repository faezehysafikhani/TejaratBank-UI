import { clearLookups } from './lookupCache';

/**
 * Keys of everything this app keeps in the browser about a person: chat history, notes, task
 * details, caches and the like. Signing out removes them all, so the next person at the same
 * computer - or a script in the page - finds nothing of the previous one. Plain preferences
 * (palette, sidebar, board layout) are not on this list and stay.
 */
const PRIVATE_KEY_PREFIXES = [
  'parstask_',
  'nexuscore_',
  'nexus_lookup_v1:',
  'read_notifications_',
  'saved_filters_',
  'tm_welcome_',
  'kanban_tasks_v2',
];

export function clearPrivateData(): void {
  clearLookups();
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const name = localStorage.key(i);
      if (name && PRIVATE_KEY_PREFIXES.some((prefix) => name.startsWith(prefix))) {
        localStorage.removeItem(name);
      }
    }
  } catch {
    // Storage unavailable: nothing stored there.
  }

  try {
    sessionStorage.clear();
  } catch {
    // Storage unavailable.
  }
}
