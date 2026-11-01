// The system's name, logo and browser-tab icon, as the administrator set them in «ظاهر سامانه»
// (GET /api/platform/branding, readable before sign-in). Nothing set: the product's own.
import { useSyncExternalStore } from 'react';
import { NEXUS_API_BASE_URL, apiRequest } from '../services/nexusApi';

export const DEFAULT_SYSTEM_NAME = 'مدیریت وظایف (TM)';
export const DEFAULT_LOGO = '/tm-logo.png';
const DEFAULT_FAVICON = '/favicon.svg';
const CACHE_KEY = 'tm_branding_v1';

export interface Branding {
  /** The administrator's name for the system; null: the product's own. */
  customName: string | null;
  /** What to show: the administrator's name or the product's own. */
  name: string;
  /** Image addresses ready for <img> and canvas (data: URLs of the administrator's images). */
  logo: string;
  favicon: string;
  hasCustomLogo: boolean;
  hasCustomFavicon: boolean;
}

interface BrandingResponse { systemName: string | null; logoUrl: string | null; faviconUrl: string | null; version: string }

function make(customName: string | null, logo: string | null, favicon: string | null): Branding {
  return {
    customName,
    name: customName || DEFAULT_SYSTEM_NAME,
    logo: logo || DEFAULT_LOGO,
    // No tab icon of its own: the administrator's logo, else the product's icon.
    favicon: favicon || logo || DEFAULT_FAVICON,
    hasCustomLogo: !!logo,
    hasCustomFavicon: !!favicon,
  };
}

function cachedName(): string | null {
  try {
    return localStorage.getItem(CACHE_KEY) || null;
  } catch {
    return null;
  }
}

let current: Branding = make(cachedName(), null, null);
const listeners = new Set<() => void>();

function setCurrent(next: Branding) {
  current = next;
  try {
    if (next.customName) localStorage.setItem(CACHE_KEY, next.customName);
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    // Storage unavailable: the name simply shows a moment later next time.
  }
  applyFavicon(next.favicon);
  listeners.forEach((listener) => listener());
}

/** The browser tab's icon. */
function applyFavicon(href: string) {
  if (typeof document === 'undefined') return;
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
  if (links.length === 0) {
    const link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
    links.push(link);
  }
  for (const link of links) {
    link.removeAttribute('type');
    link.removeAttribute('sizes');
    link.href = href;
  }
}

/** An image of the API as a data: URL (no cross-origin trouble in the printed / PDF report). */
async function asDataUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const response = await fetch(`${NEXUS_API_BASE_URL}${path}`, { credentials: 'omit' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

let loading: Promise<void> | null = null;

/** Reads the branding again (at start-up, and after the administrator changed it). */
export function refreshBranding(): Promise<void> {
  loading = (async () => {
    try {
      const branding = await apiRequest<BrandingResponse>('GET', '/api/platform/branding', { auth: false, retryOnUnauthorized: false, cache: 'no-store' });
      const [logo, favicon] = await Promise.all([asDataUrl(branding.logoUrl), asDataUrl(branding.faviconUrl)]);
      setCurrent(make(branding.systemName?.trim() || null, logo, favicon));
    } catch {
      // An older server without branding, or offline: the product's own stays.
    }
  })();
  return loading;
}

export function getBranding(): Branding {
  return current;
}

/** The current branding; re-renders when the administrator changes it. */
export function useBranding(): Branding {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => current,
    () => current,
  );
}

/** Saves the name and images (settings.update). null image: unchanged; remove*: back to the default. */
export async function saveBranding(input: {
  systemName: string;
  logo: File | null;
  favicon: File | null;
  removeLogo: boolean;
  removeFavicon: boolean;
}): Promise<void> {
  const form = new FormData();
  form.append('systemName', input.systemName.trim());
  if (input.logo) form.append('logo', input.logo);
  if (input.favicon) form.append('favicon', input.favicon);
  if (input.removeLogo) form.append('removeLogo', 'true');
  if (input.removeFavicon) form.append('removeFavicon', 'true');
  await apiRequest<unknown>('PUT', '/api/platform/branding', { form });
  await refreshBranding();
}
