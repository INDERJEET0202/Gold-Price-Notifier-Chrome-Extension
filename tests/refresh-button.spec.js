const { test, expect } = require('./fixtures');
const { ibjaPage } = require('./ibja-pages');

const RATES = { '24K': 157739, '22K': 144489 };
const HOUR = 60 * 60 * 1000;

test.describe('refresh button', () => {
    test('fetches a new rate right away, whatever the schedule says', async ({ extension }) => {
        await extension.setStorage({ goldRates: RATES, rateSession: 'AM', lastFetched: Date.now() - 2 * HOUR });
        await extension.serveIbja(ibjaPage({ am: { 999: '157739', 916: '144489' }, pm: { 999: '157200', 916: '144000' } }));
        const popup = await extension.openPopup();
        await expect(popup.locator('#rate-meta')).toContainText('checked 2 h ago');

        await popup.getByRole('button', { name: 'Check for a new rate' }).click();

        await expect(popup.locator('#rate-value')).toHaveText('₹1,57,200');
        await expect(popup.locator('#rate-session')).toHaveText('IBJA PM rate');
        await expect(popup.locator('#rate-meta')).toContainText('checked just now');
        await expect(popup.locator('#refresh')).toBeEnabled();
        await expect(popup.locator('#refresh')).toHaveAttribute('aria-busy', 'false');
        expect(await extension.ibjaRequests()).toEqual(['https://ibjarates.com/']);
    });

    test('spins while the check runs', async ({ extension }) => {
        await extension.setStorage({ goldRates: RATES, rateSession: 'PM', lastFetched: Date.now() });
        await extension.serveIbja(ibjaPage({ pm: { 999: '157739', 916: '144489' } }));
        // Hold the fetch until the test lets it go.
        await extension.serviceWorker.evaluate(() => {
            const serve = self.fetch;
            self.fetch = async (url, ...rest) => {
                if (String(url).includes('ibjarates.com')) {
                    await new Promise((resolve) => { self.releaseFetch = resolve; });
                }
                return serve(url, ...rest);
            };
        });
        const popup = await extension.openPopup();

        await popup.locator('#refresh').click();
        await expect(popup.locator('#refresh')).toBeDisabled();
        await expect(popup.locator('#refresh')).toHaveAttribute('aria-busy', 'true');

        await expect.poll(() => extension.serviceWorker.evaluate(() => typeof self.releaseFetch)).toBe('function');
        await extension.serviceWorker.evaluate(() => self.releaseFetch());
        await expect(popup.locator('#refresh')).toBeEnabled();
        await expect(popup.locator('#refresh')).toHaveAttribute('aria-busy', 'false');
    });

    test('shows the error and keeps the last rate when the check fails', async ({ extension }) => {
        await extension.setStorage({ goldRates: RATES, rateSession: 'PM', lastFetched: Date.now() - HOUR });
        await extension.serveIbja('Service Unavailable', 503);
        const popup = await extension.openPopup();

        await popup.locator('#refresh').click();

        await expect(popup.locator('#error-banner')).toHaveText("Couldn't update the gold rate: ibjarates.com returned HTTP 503");
        await expect(popup.locator('#rate-value')).toHaveText('₹1,57,739');
        await expect(popup.locator('#refresh')).toBeEnabled();
    });

    test('alerts if the new rate is below the alert price', async ({ extension }) => {
        await extension.setStorage({ goldRates: RATES, rateSession: 'AM', lastFetched: Date.now() - HOUR, targetRates: { '24K': 157500 } });
        await extension.serveIbja(ibjaPage({ pm: { 999: '157200', 916: '144000' } }));
        const popup = await extension.openPopup();

        await popup.locator('#refresh').click();

        await expect.poll(() => extension.notifications()).toEqual(['24K gold is now ₹1,57,200/10g, below your rate of ₹1,57,500/10g. Buy Gold now!']);
    });
});
