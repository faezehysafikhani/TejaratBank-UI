// Run with: npm test   (Node's built-in test runner, TypeScript through tsx)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHeaders } from './security-headers-lib.mjs';
import { sanitizeRuntimeConfig } from '../src/runtimeConfig';
import { toSafeBlob } from '../src/utils/safeBlob';
import { clearPrivateData } from '../src/utils/privateStorage';

test('runtime config: unknown or malformed values fall back to the same origin', () => {
  assert.deepEqual(sanitizeRuntimeConfig(undefined), { apiBaseUrl: '', signalRBaseUrl: '' });
  assert.deepEqual(sanitizeRuntimeConfig('<script>alert(1)</script>'), { apiBaseUrl: '', signalRBaseUrl: '' });
  assert.equal(sanitizeRuntimeConfig({ apiBaseUrl: 'javascript:alert(1)' }).apiBaseUrl, '');
  assert.equal(sanitizeRuntimeConfig({ apiBaseUrl: 'https://user:pw@api.example.local' }).apiBaseUrl, '');
  assert.equal(sanitizeRuntimeConfig({ apiBaseUrl: 'https://api.example.local/?x=1' }).apiBaseUrl, '');
  assert.equal(sanitizeRuntimeConfig({ apiBaseUrl: 'ftp://api.example.local' }).apiBaseUrl, '');
});

test('runtime config: a good address passes, without a trailing slash', () => {
  const config = sanitizeRuntimeConfig({ apiBaseUrl: 'https://api.example.local/', signalRBaseUrl: 'https://api.example.local' });
  assert.equal(config.apiBaseUrl, 'https://api.example.local');
  assert.equal(config.signalRBaseUrl, 'https://api.example.local');
});

test('runtime config: when the build lists the API origins, others are refused', () => {
  const allowed = ['https://api.bank.local'];
  assert.equal(sanitizeRuntimeConfig({ apiBaseUrl: 'https://api.bank.local' }, allowed, 'https://app.bank.local').apiBaseUrl, 'https://api.bank.local');
  assert.equal(sanitizeRuntimeConfig({ apiBaseUrl: 'https://evil.example' }, allowed, 'https://app.bank.local').apiBaseUrl, '');
  // The page's own origin is always fine.
  assert.equal(sanitizeRuntimeConfig({ apiBaseUrl: 'https://app.bank.local' }, allowed, 'https://app.bank.local').apiBaseUrl, 'https://app.bank.local');
});

test('runtime config: tenant slug and timeout are checked', () => {
  assert.equal(sanitizeRuntimeConfig({ tenantSlug: 'bank-1' }).tenantSlug, 'bank-1');
  assert.equal(sanitizeRuntimeConfig({ tenantSlug: 'a b<c' }).tenantSlug, undefined);
  assert.equal(sanitizeRuntimeConfig({ requestTimeoutMs: 45000 }).requestTimeoutMs, 45000);
  assert.equal(sanitizeRuntimeConfig({ requestTimeoutMs: 10 }).requestTimeoutMs, undefined);
  assert.equal(sanitizeRuntimeConfig({ requestTimeoutMs: 'soon' }).requestTimeoutMs, undefined);
});

test('security headers: report-only first, enforce on request, HSTS and Permissions-Policy always', () => {
  const base = {
    cspMode: 'report-only', cspReportUri: '/r', contentSecurityPolicy: ["default-src 'self'"],
    strictTransportSecurity: 'max-age=1', permissionsPolicy: 'camera=()', always: { 'X-Content-Type-Options': 'nosniff' },
  };
  const reportOnly = buildHeaders(base);
  assert.equal(reportOnly['Content-Security-Policy-Report-Only'], "default-src 'self'; report-uri /r");
  assert.equal(reportOnly['Content-Security-Policy'], undefined);
  assert.equal(reportOnly['Strict-Transport-Security'], 'max-age=1');
  assert.equal(reportOnly['Permissions-Policy'], 'camera=()');
  const enforced = buildHeaders({ ...base, cspMode: 'enforce' });
  assert.equal(enforced['Content-Security-Policy'], "default-src 'self'; report-uri /r");
  assert.equal(enforced['Content-Security-Policy-Report-Only'], undefined);
  assert.equal(buildHeaders({ ...base, cspMode: 'off' })['Content-Security-Policy-Report-Only'], undefined);
});

test('attachments: only safe types keep their type, everything else becomes a download', () => {
  assert.equal(toSafeBlob(new Blob(['x'], { type: 'text/html' })).type, 'application/octet-stream');
  assert.equal(toSafeBlob(new Blob(['x'], { type: 'image/svg+xml' })).type, 'application/octet-stream');
  assert.equal(toSafeBlob(new Blob(['x'], { type: 'image/png' })).type, 'image/png');
  assert.equal(toSafeBlob(new Blob(['x'], { type: 'application/pdf' })).type, 'application/pdf');
});

class MemoryStorage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}

test('sign-out: everything kept about the person goes, plain preferences stay', () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  (globalThis as any).localStorage = local;
  (globalThis as any).sessionStorage = session;
  for (const key of [
    'parstask_chat_1_2', 'parstask_notes_1', 'parstask_team_chat_1_9', 'parstask_meta_abc', 'parstask_unread_counts_1',
    'nexuscore_auth_profile_v2', 'nexus_lookup_v1:me', 'read_notifications_1', 'saved_filters_1', 'tm_welcome_2026-10-25',
  ]) local.setItem(key, 'private');
  for (const key of ['app_color_palette', 'tm_desktop_sidebar_open', 'tm_board_view_v1']) local.setItem(key, 'preference');
  session.setItem('anything', 'x');

  clearPrivateData();

  const left: string[] = [];
  for (let i = 0; i < local.length; i++) left.push(local.key(i)!);
  assert.deepEqual(left.sort(), ['app_color_palette', 'tm_board_view_v1', 'tm_desktop_sidebar_open']);
  assert.equal(session.length, 0);
});
