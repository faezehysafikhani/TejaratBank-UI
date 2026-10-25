// Pure: builds the response security headers from the contents of security-headers.json.
// Used by server.ts (bundled into the server) and by scripts/security-headers.mjs.
export function buildHeaders(config) {
  const headers = { ...config.always };
  headers['Strict-Transport-Security'] = config.strictTransportSecurity;
  headers['Permissions-Policy'] = config.permissionsPolicy;
  if (config.cspMode !== 'off') {
    const policy = [...config.contentSecurityPolicy];
    if (config.cspReportUri) policy.push(`report-uri ${config.cspReportUri}`);
    headers[config.cspMode === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only'] = policy.join('; ');
  }
  return headers;
}
