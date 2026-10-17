import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Debe coincidir con el nombre del repositorio para GitHub Pages.
  base: '/simulador-cohetes/',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Hasta la fase 1 no hay tests; sin esto CI fallaría.
    passWithNoTests: true,
  },
});
