import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5176,
    allowedHosts: ['topicdash.ngrok.app', 'rapperdraft.ngrok.app'],
    proxy: {
      '/tsi': {
        target: 'https://tsi.us-east-2.cnt-tags.prod.cloud.siriusxm.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tsi/, ''),
      },
      '/tagomatic': {
        target: 'https://tagomatic.savagebeast.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tagomatic/, ''),
      },
      '/ems': {
        target: 'https://entity-management-service.us-east-2.cnt-entity.prod.cloud.siriusxm.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ems/, ''),
      },
    },
  },
});
