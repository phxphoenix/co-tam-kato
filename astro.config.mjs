import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import keystatic from '@keystatic/astro';

const isDev = process.env.NODE_ENV !== 'production';

// https://astro.build/config
export default defineConfig({
  site: 'https://co-tam-kato.pl',
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    react(),
    // Keystatic CMS - w pełni aktywny lokalnie w trybie dev (http://localhost:4321/keystatic)
    ...(isDev || process.env.ENABLE_KEYSTATIC_BUILD === 'true' ? [keystatic()] : []),
  ],
});
