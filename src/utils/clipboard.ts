/**
 * Copies text to the clipboard and says whether it worked. `navigator.clipboard` exists only on a secure page (https or
 * localhost): on a plain-http address it is missing, so the older way (a hidden field and the copy command) is the fallback.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the older way
  }
  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.top = '-1000px';
    document.body.appendChild(field);
    const active = document.activeElement as HTMLElement | null;
    field.select();
    const done = document.execCommand('copy');
    document.body.removeChild(field);
    active?.focus?.();
    return done;
  } catch {
    return false;
  }
}
