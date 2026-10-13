import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import keystatic from '@keystatic/astro';
import vercel from '@astrojs/vercel';
import { fileURLToPath } from 'node:url';

const isDev = process.env.NODE_ENV !== 'production';
const isVercel = process.env.VERCEL === '1' || process.env.DEPLOY_TARGET === 'vercel';

const vercelKeystaticApiIntegration = {
  name: 'vercel-keystatic-api',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      injectRoute({
        pattern: '/api/keystatic/[...params]',
        entrypoint: fileURLToPath(new URL('./src/server/keystatic-api.ts', import.meta.url)),
        prerender: false,
      });
    },
  },
};

// https://astro.build/config
export default defineConfig({
  site: isVercel ? 'https://co-tam-kato.vercel.app' : 'https://phxphoenix.github.io',
  base: isVercel || isDev ? '/' : '/co-tam-kato/',
  output: 'static',
  adapter: isVercel ? vercel() : undefined,
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    react(),
    // Keystatic CMS - aktywny lokalnie w dev lub na Vercelu
    ...(isDev || isVercel || process.env.ENABLE_KEYSTATIC_BUILD === 'true' ? [keystatic()] : []),
    ...(isVercel ? [vercelKeystaticApiIntegration] : []),
  ],
});
