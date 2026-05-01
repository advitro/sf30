import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';
import path from 'path';
import { readFileSync, existsSync } from 'fs';

/**
 * Loads the ECDSA P-256 public key for license verification.
 * Priority: env var → ../license-tools/public.key file → empty (dev builds)
 */
function getLicensePublicKey(): string {
  if (process.env.VITE_LICENSE_PUBLIC_KEY) {
    return process.env.VITE_LICENSE_PUBLIC_KEY;
  }
  const keyPath = path.resolve(__dirname, '../license-tools/public.key');
  if (existsSync(keyPath)) {
    return readFileSync(keyPath, 'utf-8').trim();
  }
  return '';
}

export default defineConfig(({ mode }) => {
  const isDebug = mode === 'debug';

  return {
    plugins: [
      webExtension({
        manifest: 'manifest.json',
        additionalInputs: [
          'src/content/isolated/index.ts',
          'src/content/main/index.ts',
        ],
        watchFilePaths: ['src/**/*.ts', 'src/**/*.css', 'src/**/*.html'],
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@core': path.resolve(__dirname, 'src/core'),
        '@shared': path.resolve(__dirname, 'src/shared'),
        '@types': path.resolve(__dirname, 'src/types'),
      },
    },
    define: {
      // Build-time integrity hash — null disables the check in dev builds.
      // For production, a two-pass build or custom plugin would inject the actual hash.
      __SW_INTEGRITY_HASH__: JSON.stringify(process.env.SF30_INTEGRITY_HASH || null),
      __LICENSE_PUBLIC_KEY__: JSON.stringify(getLicensePublicKey()),
    },
    build: {
      sourcemap: isDebug,
      minify: isDebug ? false : 'terser',
      terserOptions: {
        compress: {
          drop_console: !isDebug,
          drop_debugger: !isDebug,
          passes: 2,
          unused: true,
          dead_code: true,
        },
        mangle: {
          properties: false,
        },
        format: {
          comments: isDebug,
        },
      },
    },
    css: {
      // Inline CSS for content scripts to avoid separate file injection
      devSourcemap: isDebug,
    },
  };
});
