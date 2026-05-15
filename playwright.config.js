const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  testMatch: '*.pw.js',
  use: { baseURL: 'http://localhost:3999' },
  timeout: 15000,
  webServer: {
    command: 'npm run serve:workspace',
    port: 3999,
    reuseExistingServer: true,
  },
});
