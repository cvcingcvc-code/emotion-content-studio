import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, '.', 'VITE_');

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': environment.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8787',
      },
    },
    preview: { port: 4173 },
  };
});
