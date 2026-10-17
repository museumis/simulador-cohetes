import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Debe coincidir con el nombre del repositorio para GitHub Pages.
  base: '/simulador-cohetes/',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
