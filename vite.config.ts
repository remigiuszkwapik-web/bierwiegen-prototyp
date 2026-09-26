import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => {
    return {
      // GitHub Pages liefert Projektseiten unter /<repo>/ aus. Nur fuer den
      // Build setzen: im Dev-Modus wuerde das den lokalen Server unter
      // localhost:3000/bierwiegen-prototyp/ verstecken.
      // Kommt spaeter eine eigene Domain dazu, muss das hier zurueck auf '/'.
      base: command === 'build' ? '/bierwiegen-prototyp/' : '/',
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
