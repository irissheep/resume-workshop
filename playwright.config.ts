import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', testMatch: '**/*.e2e.ts', timeout: 90000, expect: { timeout: 12000 }, workers: 1, reporter: [['list']], outputDir: 'test-results' });
