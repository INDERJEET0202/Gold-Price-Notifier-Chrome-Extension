const { test, expect, Extension } = require('./fixtures');

test.describe('welcome page', () => {
    test('opens once on install', async ({ context }) => {
        const extension = await Extension.attach(context);
        const welcomeUrl = `chrome-extension://${extension.id}/welcome.html`;

        await expect.poll(() => context.pages().map((page) => page.url())).toContain(welcomeUrl);
        expect(context.pages().filter((page) => page.url() === welcomeUrl)).toHaveLength(1);
    });

    for (const [colorScheme, width] of [['light', 1280], ['dark', 1280], ['light', 420]]) {
        test(`fits the window in ${colorScheme} mode at ${width}px`, async ({ extension }) => {
            const page = await extension.openPage('welcome.html', { colorScheme, width });

            await expect(page.locator('h1')).toHaveText('Gold Price Drop Notifier is ready');
            await expect(page.locator('.steps li')).toHaveCount(4);
            await expect(page.locator('.welcome-logo')).toHaveJSProperty('complete', true);
            expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
        });
    }
});
