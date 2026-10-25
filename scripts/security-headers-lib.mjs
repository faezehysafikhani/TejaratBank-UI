// Pure: builds the response security headers from the contents of security-headers.json.
// Used by server.ts (bundled into the server) and by scripts/security-headers.mjs.
export function buildHeaders(config) {
  const headers = { ...config.always };
  headers['Strict-Transport-Security'] = config.strictTransportSecurity;
  headers['Permissions-Policy'] = config.permissionsPolicy;
  if (config.cspMode !== 'off') {
    // connectSrcExtra: API / SignalR origins when the API is not on the page's own origin.
    const extra = (config.connectSrcExtra || []).join(' ');
    const policy = config.contentSecurityPolicy.map((directive) =>
      extra && directive.startsWith('connect-src ') ? `${directive} ${extra}` : directive);
    if (config.cspReportUri) policy.push(`report-uri ${config.cspReportUri}`);
    headers[config.cspMode === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only'] = policy.join('; ');
  }
  return headers;
}
