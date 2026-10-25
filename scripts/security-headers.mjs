// Builds the security response headers from security-headers.json and keeps the copies that
// cannot read it - public/web.config (IIS) and vercel.json - in step with it.
//
//   node scripts/security-headers.mjs sync    writes the two files
//   node scripts/security-headers.mjs check   fails when they differ (part of `npm run lint`)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHeaders } from './security-headers-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'security-headers.json'), 'utf8'));

const escapeXml = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function webConfig(headers) {
  const file = path.join(root, 'public', 'web.config');
  let xml = fs.readFileSync(file, 'utf8');
  const block =
    '    <httpProtocol>\n      <customHeaders>\n        <!-- generated from security-headers.json (npm run headers:sync) - do not edit by hand -->\n' +
    Object.entries(headers).map(([name, value]) => `        <add name="${name}" value="${escapeXml(value)}" />`).join('\n') +
    '\n      </customHeaders>\n    </httpProtocol>\n';
  xml = /\s*<httpProtocol>[\s\S]*?<\/httpProtocol>\n?/.test(xml)
    ? xml.replace(/[ \t]*<httpProtocol>[\s\S]*?<\/httpProtocol>\n?/, block)
    : xml.replace('  <system.webServer>\n', `  <system.webServer>\n${block}`);
  return { file, content: xml };
}

function vercelJson(headers) {
  const file = path.join(root, 'vercel.json');
  const current = JSON.parse(fs.readFileSync(file, 'utf8'));
  current.headers = [{ source: '/(.*)', headers: Object.entries(headers).map(([key, value]) => ({ key, value })) }];
  return { file, content: JSON.stringify(current, null, 2) + '\n' };
}

const mode = process.argv[2];
if (mode === 'sync' || mode === 'check') {
  const headers = buildHeaders(config);
  let stale = false;
  for (const { file, content } of [webConfig(headers), vercelJson(headers)]) {
    const existing = fs.readFileSync(file, 'utf8');
    if (existing !== content) {
      if (mode === 'sync') {
        fs.writeFileSync(file, content);
        console.log(`updated ${path.relative(root, file)}`);
      } else {
        console.error(`${path.relative(root, file)} is out of step with security-headers.json - run: npm run headers:sync`);
        stale = true;
      }
    }
  }
  if (stale) process.exit(1);
}
