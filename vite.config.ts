import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves the app under /zophous-clone/
  base: process.env.GITHUB_PAGES ? '/zophous-clone/' : '/',
  plugins: [react()],
});
