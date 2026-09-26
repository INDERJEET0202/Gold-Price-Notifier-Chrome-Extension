// End-to-end tests for the extension. Each test launches its own Chromium profile with the
// unpacked extension loaded (see tests/fixtures.js), so no browser projects are configured here.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: 'tests',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    reporter: 'list',
});
