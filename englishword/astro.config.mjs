import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://englishword.pjmi.dpdns.org',
  output: 'static',
  // Keep bundled assets compatible with the existing strict CSP.
  build: { inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
});
