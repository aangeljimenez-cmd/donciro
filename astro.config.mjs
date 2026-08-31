import { defineConfig } from 'astro/config';

import node from '@astrojs/node';

export default defineConfig({
  output: 'server',   // ← agrega esta línea

  server: {
    port: 4042, // Change port to 4000
    host: '0.0.0.0', // Allow connections from any IP
  },

  adapter: node({
    mode: 'standalone',
  }),
});
