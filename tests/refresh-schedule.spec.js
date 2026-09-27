const { test, expect } = require('./fixtures');
const { ibjaPage } = require('./ibja-pages');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Whether refreshIfStale() fetches at `now` when the last fetch was `ageMs` earlier.
async function fetchesAt(extension, now, ageMs) {
    await extension.setStorage({ lastFetched: new Date(now).getTime() - ageMs });
    await extension.serviceWorker.evaluate(() => { self.ibjaRequests = []; });
    await extension.refreshIfStale(now);
    return (await extension.ibjaRequests()).length === 1;
}

test.describe('refresh schedule', () => {
    test.beforeEach(async ({ extension }) => {
        await extension.serveIbja(ibjaPage({ pm: { 999: '157739', 916: '144489' } }));
    });

    // Times are UTC; IST is UTC+5:30. 25-30 Sept 2026 is Friday to Wednesday.
    const cases = [
        ['every hour around the AM publication', '2026-09-28T06:45:00Z', '12:15 IST Monday', { refetchAfter: 55 * MINUTE, skipBefore: 50 * MINUTE }],
        ['every hour around the PM publication', '2026-09-25T12:00:00Z', '17:30 IST Friday', { refetchAfter: 55 * MINUTE, skipBefore: 50 * MINUTE }],
        ['every 6 hours at other times on weekdays', '2026-09-29T18:30:00Z', '00:00 IST Wednesday', { refetchAfter: 6 * HOUR, skipBefore: 5 * HOUR }],
        ['every 6 hours between the AM and PM windows', '2026-09-28T09:00:00Z', '14:30 IST Monday', { refetchAfter: 6 * HOUR, skipBefore: 2 * HOUR }],
        ['every 12 hours at weekends', '2026-09-26T06:45:00Z', '12:15 IST Saturday', { refetchAfter: 12 * HOUR, skipBefore: 6 * HOUR }],
    ];

    for (const [name, now, label, { refetchAfter, skipBefore }] of cases) {
        test(`checks ${name} (${label})`, async ({ extension }) => {
            expect(await fetchesAt(extension, now, skipBefore)).toBe(false);
            expect(await fetchesAt(extension, now, refetchAfter)).toBe(true);
        });
    }

    test('treats the window edges as IST times', async ({ extension }) => {
        // 11:29 IST is still outside the AM window, 11:30 is inside, 14:00 is outside again.
        expect(await fetchesAt(extension, '2026-09-28T05:59:00Z', HOUR)).toBe(false);
        expect(await fetchesAt(extension, '2026-09-28T06:00:00Z', HOUR)).toBe(true);
        expect(await fetchesAt(extension, '2026-09-28T08:30:00Z', HOUR)).toBe(false);
    });
});
