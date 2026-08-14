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
  },
});
