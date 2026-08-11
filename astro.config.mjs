// astro.config.mjs
import { defineConfig } from 'astro/config';

export default defineConfig({
  server: {
    port: 4042, // Change port to 4000
    host: '0.0.0.0', // Allow connections from any IP
  },
});