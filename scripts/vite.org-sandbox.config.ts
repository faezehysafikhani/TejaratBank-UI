// Builds only the org chart preview page (dev/org-sandbox.html) for measuring it in production
// mode (scripts/measure-org-chart.mjs). Not part of the app's build.
import { defineConfig, mergeConfig } from 'vite';
import base from '../vite.config';

export default defineConfig((env) =>
  mergeConfig(typeof base === 'function' ? base(env) : base, {
    build: {
      outDir: 'dist-org-sandbox',
      emptyOutDir: true,
      rollupOptions: { input: 'dev/org-sandbox.html' },
    },
  }),
);
