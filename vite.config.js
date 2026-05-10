import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: ['localhost', '127.0.0.1', 'host.docker.internal'],
    proxy: {
      '/api': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4174'
    }
  }
});
