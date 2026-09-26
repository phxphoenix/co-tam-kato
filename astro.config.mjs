import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import keystatic from '@keystatic/astro';

const isDev = process.env.NODE_ENV !== 'production';

// https://astro.build/config
export default defineConfig({
  site: 'https://phxphoenix.github.io',
  // Keystatic's API routes are rooted at /api/keystatic in local dev.
  // GitHub Pages needs the repository prefix only in production builds.
  base: isDev ? '/' : '/co-tam-kato/',
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    react(),
    // Keystatic CMS - aktywny lokalnie w dev
    ...(isDev || process.env.ENABLE_KEYSTATIC_BUILD === 'true' ? [keystatic()] : []),
  ],
});
