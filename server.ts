import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { buildHeaders } from "./scripts/security-headers-lib.mjs";
import securityHeadersConfig from "./security-headers.json";

dotenv.config();

export const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "100kb" }));

app.disable("x-powered-by");

// The response security headers (security-headers.json): the Content-Security-Policy (report-only
// until switched to enforce there), HSTS, Permissions-Policy and the basics. Not in development:
// the dev server's own scripts and websocket would trip the policy.
const securityHeaders = process.env.NODE_ENV === "production" ? buildHeaders({
  ...securityHeadersConfig,
  // When the API is on another origin (not the intended same-origin setup): its address for the
  // report endpoint and for connect-src, e.g. CSP_REPORT_URI=http://localhost:5271/api/platform/csp-report
  // CSP_CONNECT_SRC="http://localhost:5271 ws://localhost:5271".
  cspReportUri: process.env.CSP_REPORT_URI || securityHeadersConfig.cspReportUri,
  connectSrcExtra: process.env.CSP_CONNECT_SRC ? process.env.CSP_CONNECT_SRC.split(/\s+/) : securityHeadersConfig.connectSrcExtra,
}) : {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};
app.use((_req, res, next) => {
  for (const [name, value] of Object.entries(securityHeaders)) {
    res.setHeader(name, value as string);
  }
  next();
});

// Health check endpoint
app.get(["/api/health", "/health"], (_req, res) => {
  res.json({ status: "ok" });
});

// App Icon endpoint with link-preview crawler compatibility
app.get(["/icon.svg", "/favicon.svg"], (req, res) => {
  const userAgent = (req.headers["user-agent"] || "").toLowerCase();
  // WhatsApp and Facebook scrapers fail on vector SVGs and require raster images (PNG)
  const isRasterOnlyCrawler = /whatsapp|facebookexternalhit|facebot/i.test(userAgent);
  
  const publicDir = path.join(process.cwd(), "public");
  const distDir = path.join(process.cwd(), "dist");

  if (isRasterOnlyCrawler) {
    const pngCandidate = fs.existsSync(path.join(publicDir, "icon-512.png"))
      ? path.join(publicDir, "icon-512.png")
      : path.join(distDir, "icon-512.png");
    if (fs.existsSync(pngCandidate)) {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.sendFile(pngCandidate);
    }
  }

  const svgCandidate = fs.existsSync(path.join(publicDir, "icon.svg"))
    ? path.join(publicDir, "icon.svg")
    : path.join(distDir, "icon.svg");
  if (fs.existsSync(svgCandidate)) {
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.sendFile(svgCandidate);
  }

  res.status(404).end();
});

// Vite middleware setup for dev vs static build (only when not running on Vercel)
async function startServer() {
  if (process.env.VERCEL !== "1") {
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      
      // Serve static files with proper caching headers
      app.use(express.static(distPath, {
        maxAge: '1d',
        setHeaders: (res, filepath) => {
          if (filepath.endsWith('.png') || filepath.endsWith('.svg') || filepath.endsWith('.ico')) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
          }
          // The page, the runtime settings and the service worker are re-checked on every load,
          // so a new header policy or API address reaches people at once, not after a day. The
          // hashed files under /assets never change and may be kept for long.
          if (/[\\/]dist[\\/](index\.html|sw\.js|config[\\/]runtime-config\.json)$/.test(filepath)) {
            res.setHeader('Cache-Control', 'no-cache');
          } else if (/[\\/]assets[\\/]/.test(filepath)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        }
      }));

      app.get("*", (req, res) => {
        const indexPath = path.join(distPath, "index.html");
        if (fs.existsSync(indexPath)) {
          try {
            const html = fs.readFileSync(indexPath, "utf-8");
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-cache');
            return res.send(html);
          } catch (e) {
            console.error("Error reading index.html:", e);
          }
        }
        res.sendFile(indexPath);
      });
    }

    app.listen(Number(PORT), "0.0.0.0", () => {
      console.log(`Server listening on http://0.0.0.0:${PORT}`);
    });
  }
}

startServer();

export default app;
