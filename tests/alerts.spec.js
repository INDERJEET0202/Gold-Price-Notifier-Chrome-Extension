const { test, expect } = require('./fixtures');
const { ibjaPage } = require('./ibja-pages');

const pmRates = (rate999, rate916) => ibjaPage({ pm: { 999: String(rate999), 916: String(rate916) } });

test.describe('price-drop notifications', () => {
    test('are not sent without an alert price', async ({ extension }) => {
        await extension.serveIbja(pmRates(157739, 144489));
        await extension.refresh();

        expect(await extension.notifications()).toEqual([]);
    });

    test('are sent when a new rate is below the alert price', async ({ extension }) => {
        await extension.setStorage({ targetRates: { '24K': 158000 } });
        await extension.serveIbja(pmRates(157739, 144489));
        await extension.refresh();

        expect(await extension.notifications()).toEqual([
            '24K gold is now ₹1,57,739/10g, below your rate of ₹1,58,000/10g. Buy Gold now!',
        ]);
        // A real Chrome notification appears once Chrome has loaded its icon.
        await expect.poll(() => extension.serviceWorker.evaluate(() => chrome.notifications.getAll())).toHaveProperty('price-drop');
    });

    test('are not repeated while IBJA has not published a new rate', async ({ extension }) => {
        await extension.setStorage({ targetRates: { '24K': 158000 } });
        await extension.serveIbja(pmRates(157739, 144489));
        await extension.refresh();
        await extension.clearNotifications();
        await extension.refresh();

        expect(await extension.notifications()).toEqual([]);
    });

    test('are sent again when IBJA publishes another rate below the alert price', async ({ extension }) => {
        await extension.setStorage({ targetRates: { '24K': 158000 } });
        await extension.serveIbja(pmRates(157739, 144489));
        await extension.refresh();
        await extension.clearNotifications();
        await extension.serveIbja(pmRates(157200, 144000));
        await extension.refresh();

        expect(await extension.notifications()).toEqual([
            '24K gold is now ₹1,57,200/10g, below your rate of ₹1,58,000/10g. Buy Gold now!',
        ]);
    });

    test('are not sent when the rate is at or above the alert price', async ({ extension }) => {
        await extension.setStorage({ targetRates: { '24K': 157739 } });
        await extension.serveIbja(pmRates(157739, 144489));
        await extension.refresh();
        await extension.serveIbja(pmRates(158200, 145000));
        await extension.refresh();

        expect(await extension.notifications()).toEqual([]);
    });

    test('follow the selected purity', async ({ extension }) => {
        await extension.setStorage({ purity: '24K', targetRates: { '24K': 150000, '22K': 145000 } });
        await extension.serveIbja(pmRates(157739, 144489)); // Only 22K is below its alert price.
        await extension.refresh();

        expect(await extension.notifications()).toEqual([]);
    });

    test('are sent straight away when a saved alert price is already above the rate', async ({ extension }) => {
        await extension.setStorage({ goldRates: { '24K': 157739, '22K': 144489 }, rateSession: 'PM', lastFetched: Date.now() });
        await extension.updateStorage({ targetRates: { '24K': 160000 } });

        await expect.poll(() => extension.notifications()).toEqual([
            '24K gold is now ₹1,57,739/10g, below your rate of ₹1,60,000/10g. Buy Gold now!',
        ]);
    });

    test('are sent when switching to a purity whose alert price is already met', async ({ extension }) => {
        await extension.setStorage({
            goldRates: { '24K': 157739, '22K': 144489 },
            purity: '24K',
            targetRates: { '24K': 150000, '22K': 145000 },
        });
        await extension.updateStorage({ purity: '22K' });

        await expect.poll(() => extension.notifications()).toEqual([
            '22K gold is now ₹1,44,489/10g, below your rate of ₹1,45,000/10g. Buy Gold now!',
        ]);

        await extension.clearNotifications();
        await extension.updateStorage({ purity: '24K' });
        await extension.settle();
        expect(await extension.notifications()).toEqual([]);
    });
});
