const { test, expect, launchBrowser, Extension } = require('./fixtures');
const { ibjaPage } = require('./ibja-pages');

const GOLD = [161, 98, 7, 255];
const GREEN = [21, 128, 61, 255];

function badge(extension) {
    return extension.serviceWorker.evaluate(async () => ({
        text: await chrome.action.getBadgeText({}),
        color: await chrome.action.getBadgeBackgroundColor({}),
        title: await chrome.action.getTitle({}),
    }));
}

test.describe('toolbar badge', () => {
    test('is empty until there is a rate', async ({ extension }) => {
        expect(await badge(extension)).toMatchObject({ text: '', title: 'Gold Price Drop Notifier' });
    });

    test('shows the rate in thousands after a fetch', async ({ extension }) => {
        await extension.serveIbja(ibjaPage({ pm: { 999: '157739', 916: '144489' } }));
        await extension.refresh();

        await expect.poll(() => badge(extension)).toEqual({ text: '158K', color: GOLD, title: '24K gold: ₹1,57,739/10g (IBJA PM rate)' });
    });

    test('turns green while the rate is below the alert price', async ({ extension }) => {
        await extension.setStorage({ goldRates: { '24K': 157739, '22K': 144489 }, rateSession: 'PM', targetRates: { '24K': 157000 } });
        await expect.poll(() => badge(extension)).toEqual({
            text: '158K',
            color: GOLD,
            title: '24K gold: ₹1,57,739/10g (IBJA PM rate)\nAlert when it drops below ₹1,57,000',
        });

        await extension.updateStorage({ targetRates: { '24K': 158000 } });
        await expect.poll(() => badge(extension)).toEqual({
            text: '158K',
            color: GREEN,
            title: '24K gold: ₹1,57,739/10g (IBJA PM rate)\n₹261 below your alert price',
        });
    });

    test('follows the selected purity', async ({ extension }) => {
        await extension.setStorage({ goldRates: { '24K': 157739, '22K': 144489 }, rateSession: 'AM', purity: '24K' });
        await extension.updateStorage({ purity: '22K' });

        await expect.poll(() => badge(extension)).toMatchObject({ text: '144K', title: '22K gold: ₹1,44,489/10g (IBJA AM rate)' });
    });

    test('comes back after a browser restart', async ({ context, extension, userDataDir }) => {
        await extension.serveIbja(ibjaPage({ pm: { 999: '157739', 916: '144489' } }));
        await extension.refresh();
        await context.close();

        const restarted = await launchBrowser(userDataDir);
        try {
            const extensionAfterRestart = await Extension.attach(restarted);
            await expect.poll(() => badge(extensionAfterRestart)).toMatchObject({ text: '158K' });
        } finally {
            await restarted.close();
        }
    });
});
