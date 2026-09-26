const { test, expect, launchBrowser, Extension } = require('./fixtures');
const { ibjaPage } = require('./ibja-pages');

const HOUR = 60 * 60 * 1000;

test.describe('extension lifecycle', () => {
    test('sets up the hourly refresh alarm and fetches on install', async ({ context }) => {
        const extension = await Extension.attach(context);

        // The install fetch fails because the tests block DNS, which proves it was attempted.
        await expect.poll(async () => (await extension.storage()).lastError ?? null).toBe('Failed to fetch');
        expect(await extension.alarms()).toEqual([expect.objectContaining({ name: 'refresh-gold-rate', periodInMinutes: 60 })]);
    });

    test('only refetches once the stored rate is over 3 hours old', async ({ extension }) => {
        await extension.serveIbja(ibjaPage({ pm: { 999: '157739', 916: '144489' } }));

        await extension.setStorage({ lastFetched: Date.now() - 2 * HOUR });
        await extension.refreshIfStale();
        expect(await extension.ibjaRequests()).toEqual([]);

        await extension.setStorage({ lastFetched: Date.now() - 3.1 * HOUR });
        await extension.refreshIfStale();
        expect(await extension.ibjaRequests()).toHaveLength(1);
    });

    test('keeps rates, settings and the alarm across a browser restart', async ({ context, extension, userDataDir }) => {
        await extension.serveIbja(ibjaPage({ pm: { 999: '157739', 916: '144489' } }));
        await extension.refresh();
        await extension.updateStorage({ purity: '22K', targetRates: { '22K': 145000 } });
        await context.close();

        const restarted = await launchBrowser(userDataDir);
        try {
            const extensionAfterRestart = await Extension.attach(restarted);
            expect(await extensionAfterRestart.storage()).toMatchObject({
                goldRates: { '24K': 157739, '22K': 144489 },
                purity: '22K',
                targetRates: { '22K': 145000 },
                lastError: null, // The rate is still fresh, so nothing was refetched on startup.
            });
            expect(await extensionAfterRestart.alarms()).toHaveLength(1);
        } finally {
            await restarted.close();
        }
    });
});
