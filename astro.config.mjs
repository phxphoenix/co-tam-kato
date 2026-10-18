import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const isDev = process.env.NODE_ENV !== 'production';
const isVercel = process.env.VERCEL === '1' || process.env.DEPLOY_TARGET === 'vercel';

function keystaticCustomIntegration() {
  return {
    name: 'keystatic',
    hooks: {
      'astro:config:setup': ({ injectRoute, updateConfig, config }) => {
        updateConfig({
          server: config.server?.host ? {} : {
            host: '127.0.0.1',
          },
          vite: {
            plugins: [{
              name: 'keystatic',
              resolveId(id) {
                if (id === 'virtual:keystatic-config') {
                  return this.resolve('./keystatic.config', './a');
                }
                return null;
              },
            }],
            optimizeDeps: {
              entries: ['keystatic.config.*', '.astro/keystatic-imports.js'],
            },
          },
        });
        const dotAstroDir = new URL('./.astro/', config.root);
        mkdirSync(dotAstroDir, { recursive: true });
        writeFileSync(
          new URL('keystatic-imports.js', dotAstroDir),
          'import "@keystatic/astro/ui";\nimport "@keystatic/astro/api";\nimport "@keystatic/core/ui";\n'
        );
        injectRoute({
          entrypoint: '@keystatic/astro/internal/keystatic-astro-page.astro',
          pattern: '/keystatic/[...params]',
          prerender: false,
        });
        injectRoute({
          entrypoint: fileURLToPath(new URL('./src/server/keystatic-api.ts', import.meta.url)),
          pattern: '/api/keystatic/[...params]',
          prerender: false,
        });
        injectRoute({
          entrypoint: fileURLToPath(new URL('./src/server/archive-api.ts', import.meta.url)),
          pattern: '/api/archive',
          prerender: false,
        });
        injectRoute({
          entrypoint: fileURLToPath(new URL('./src/server/archive-settings-api.ts', import.meta.url)),
          pattern: '/api/archive-settings',
          prerender: false,
        });
        injectRoute({
          entrypoint: fileURLToPath(new URL('./src/server/archive-run-api.ts', import.meta.url)),
          pattern: '/api/archive-run',
          prerender: false,
        });
        injectRoute({
          entrypoint: fileURLToPath(new URL('./src/server/sources-api.ts', import.meta.url)),
          pattern: '/api/sources',
          prerender: false,
        });
      },
    },
  };
}

// https://astro.build/config
export default defineConfig({
  site: isVercel ? 'https://co-tam-kato.vercel.app' : 'https://phxphoenix.github.io',
  base: isVercel || isDev ? '/' : '/co-tam-kato/',
  output: 'static',
  adapter: isVercel
    ? vercel({
        includeFiles: ['./src/content/news/**', './src/content/settings/**', './config/**'],
      })
    : undefined,
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    react(),
    // Keystatic CMS - aktywny lokalnie w dev lub na Vercelu
    ...(isDev || isVercel || process.env.ENABLE_KEYSTATIC_BUILD === 'true' ? [keystaticCustomIntegration()] : []),
  ],
});

