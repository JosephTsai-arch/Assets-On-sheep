import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

function suppressHmrWsPlugin(): Plugin {
  return {
    name: 'suppress-hmr-ws-error',
    transform(code: string, id: string) {
      if (id.includes('vite/dist/client') || id.includes('/@vite/client')) {
        let transformed = code;
        transformed = transformed.replaceAll(
          'reject(/* @__PURE__ */ new Error("WebSocket closed without opened."));',
          'resolve();'
        );
        transformed = transformed.replaceAll(
          'reject(new Error("WebSocket closed without opened."));',
          'resolve();'
        );
        transformed = transformed.replaceAll(
          'throw e;',
          '/* suppressed hmr ws error */'
        );
        transformed = transformed.replaceAll(
          'transport.connect(createHMRHandler(handleMessage));',
          'transport.connect(createHMRHandler(handleMessage)).catch(() => {});'
        );
        return { code: transformed, map: null };
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), suppressHmrWsPlugin()],
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },
    build: {
      rollupOptions: {
        onwarn(warning, warn) {
          if (warning.code === 'MODULE_EXTERNALIZED' || warning.message?.includes('worker_threads')) {
            return;
          }
          warn(warning);
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
