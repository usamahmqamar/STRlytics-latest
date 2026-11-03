import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(() => {
  return {
    // Absolute base so assets load on nested routes such as /app/dashboard.
    base: '/',
    plugins: [react(), tailwindcss()],
    build: {
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-firebase-auth': ['firebase/auth'],
            'vendor-firebase-firestore': ['firebase/firestore'],
            'vendor-firebase-app': ['firebase/app'],
            'vendor-ui': ['lucide-react', 'framer-motion', 'clsx', 'tailwind-merge'],
            'vendor-utils': ['date-fns'],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
