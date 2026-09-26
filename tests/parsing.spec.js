const { test, expect } = require('./fixtures');
const { ibjaPage, saturdayPage } = require('./ibja-pages');

test.describe('reading rates from ibjarates.com', () => {
    test('uses the PM rates once IBJA has published them', async ({ extension }) => {
        await extension.serveIbja(ibjaPage({ am: { 999: '157821', 916: '144568' }, pm: { 999: '157739', 916: '144489' } }));
        await extension.refresh();

        expect(await extension.storage()).toMatchObject({
            goldRates: { '24K': 157739, '22K': 144489 },
            rateSession: 'PM',
            rateDate: null,
            lastError: null,
        });
        expect(await extension.ibjaRequests()).toEqual(['https://ibjarates.com/']);
    });

    test('uses the AM rates until the PM rates are published, ignoring commas and decimals', async ({ extension }) => {
        await extension.serveIbja(ibjaPage({ am: { 999: '1,56,500.00', 916: '1,43,400.40' } }));
        await extension.refresh();

        expect(await extension.storage()).toMatchObject({ goldRates: { '24K': 156500, '22K': 143400 }, rateSession: 'AM' });
    });

    test('takes both purities from the same session', async ({ extension }) => {
        await extension.serveIbja(ibjaPage({ am: { 999: '155000', 916: '142000' }, pm: { 999: '154000' } }));
        await extension.refresh();

        expect(await extension.storage()).toMatchObject({ goldRates: { '24K': 155000, '22K': 142000 }, rateSession: 'AM' });
    });

    test('on weekends, uses the latest day in the history tables', async ({ extension }) => {
        await extension.serveIbja(saturdayPage);
        await extension.refresh();

        expect(await extension.storage()).toMatchObject({
            goldRates: { '24K': 157739, '22K': 144489 },
            rateSession: 'PM',
            rateDate: '2026-09-25',
            lastError: null,
        });
    });

    test('picks the latest date whatever order the history tables are in', async ({ extension }) => {
        await extension.serveIbja(ibjaPage({
            amHistory: [['23/09/2026', 150000, 137000], ['24/09/2026', 151000, 138000], ['25/09/2026', 152000, 139000]],
            pmHistory: [['23/09/2026', 150100, 137100], ['24/09/2026', 151100, 138100]],
        }));
        await extension.refresh();

        expect(await extension.storage()).toMatchObject({ goldRates: { '24K': 152000, '22K': 139000 }, rateSession: 'AM', rateDate: '2026-09-25' });
    });

    test('accepts dates with month names and skips holiday rows', async ({ extension }) => {
        await extension.serveIbja(ibjaPage({
            pmHistory: [['02-Oct-2026', 'Holiday'], ['01-Oct-2026', 159000, 145600], ['30-Sep-2026', 158500, 145200]],
        }));
        await extension.refresh();

        expect(await extension.storage()).toMatchObject({ goldRates: { '24K': 159000, '22K': 145600 }, rateDate: '2026-10-01' });
    });

    test("prefers today's rates over the history tables", async ({ extension }) => {
        await extension.serveIbja(ibjaPage({
            am: { 999: '158000', 916: '144700' },
            pmHistory: [['25/09/2026', 157739, 144489]],
        }));
        await extension.refresh();

        expect(await extension.storage()).toMatchObject({ goldRates: { '24K': 158000, '22K': 144700 }, rateSession: 'AM', rateDate: null });
    });

    test("explains when IBJA hasn't published and there is no earlier rate", async ({ extension }) => {
        await extension.serveIbja(ibjaPage());
        await extension.refresh();

        expect((await extension.storage()).lastError).toBe(
            "IBJA hasn't published a rate today (it doesn't on weekends and holidays) and no earlier rate was found on ibjarates.com",
        );
    });

    test('reports a page it does not recognise', async ({ extension }) => {
        await extension.serveIbja('<html><body>Something else</body></html>');
        await extension.refresh();

        expect((await extension.storage()).lastError).toBe('the 24K and 22K rates are missing from ibjarates.com (the page may have changed)');
    });

    test('reports HTTP errors', async ({ extension }) => {
        await extension.serveIbja('Forbidden', 403);
        await extension.refresh();

        expect((await extension.storage()).lastError).toBe('ibjarates.com returned HTTP 403');
    });

    test('keeps the last good rates when a fetch fails', async ({ extension }) => {
        await extension.serveIbja(ibjaPage({ pm: { 999: '157739', 916: '144489' } }));
        await extension.refresh();
        await extension.serveIbja('Forbidden', 403);
        await extension.refresh();

        expect(await extension.storage()).toMatchObject({
            goldRates: { '24K': 157739, '22K': 144489 },
            lastError: 'ibjarates.com returned HTTP 403',
        });
    });
});
