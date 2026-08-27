import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri drives the dev server on a fixed port and needs a predictable target.
const host = process.env.TAURI_DEV_HOST;

// The version badge reads this, so package.json is the one place it lives.
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Tauri expects a fixed port and fails if it is already taken.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: {
      // src-tauri is watched by the Rust side, not by Vite.
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    // Matches the webview versions Tauri ships against.
    target: 'es2021',
    sourcemap: !!process.env.TAURI_DEBUG,
    minify: process.env.TAURI_DEBUG ? false : 'esbuild',
    rollupOptions: {
      output: {
        /*
         * Three groups that are genuinely three things.
         *
         * Not to make the application load faster — it is loaded from disk
         * inside a desktop binary, where a chunk boundary buys nothing — but
         * because one 860 kB file says nothing about what is in it. Split
         * this way, a build tells you at a glance whether the thing that grew
         * was the interface, the words, or the target states.
         *
         * Everything is still imported eagerly. Splitting a chunk out and
         * loading it on demand would trade a few milliseconds of parse time
         * for a blank panel the first time a view is opened, which is a bad
         * trade for an application whose files are already on the machine.
         */
        manualChunks: {
          // React and the runtime, which change when a dependency is upgraded
          // and not otherwise.
          vendor: ['react', 'react-dom', 'react-dom/client'],
          // Every string the interface says, in both languages. Prose does not
          // minify, so this is large and honestly so.
          i18n: ['./src/i18n/hu.ts', './src/i18n/en.ts'],
          // The blueprint presets: the target states and the handbook text
          // that comes with them.
          presets: [
            './src/blueprint/presets/multiHousehold.ts',
            './src/blueprint/presets/multiHousehold.text.ts',
            './src/blueprint/presets/multiHousehold.modules.ts',
            './src/blueprint/presets/proxmoxHost.ts',
            './src/blueprint/presets/kubernetesHomelab.ts',
          ],
        },
      },
    },
  },
});
