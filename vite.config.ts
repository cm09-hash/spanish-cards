import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative paths, so the app works at any address
  // (GitHub Pages serves it from /<repository-name>/).
  base: './',
  define: {
    // Shown on the Settings screen so you can tell which build your phone has.
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
