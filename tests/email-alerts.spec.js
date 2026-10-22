// The Google Apps Script in email-alerts/, run in Node against fake Google services (UrlFetchApp,
// MailApp, PropertiesService, ScriptApp, Session) and the same fake ibjarates.com pages as the
// extension's tests. No browser needed.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('@playwright/test');
const { ibjaPage, saturdayPage } = require('./ibja-pages');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'email-alerts', 'gold-price-alert.gs'), 'utf8');
// Times are UTC; IST is UTC+5:30. 28 Sept 2026 is a Monday.
const MONDAY_NOON_IST = Date.parse('2026-09-28T06:30:00Z');
const pmRates = (rate999, rate916) => ibjaPage({ pm: { 999: String(rate999), 916: String(rate916) } });

// Loads the script with `alertPrices` in place of its settings. `google.page` is what
// ibjarates.com returns and `google.now` the clock; both can change between runs.
function loadScript(alertPrices = { '24K': 0, '22K': 0 }) {
    const google = { page: pmRates(157739, 144489), status: 200, now: MONDAY_NOON_IST, fetches: 0, emails: [], triggers: [], properties: {} };
    const context = vm.createContext({
        console: { log() {}, error() {} },
        UrlFetchApp: {
            fetch(url) {
                expect(url).toBe('https://ibjarates.com/');
                google.fetches++;
                return { getResponseCode: () => google.status, getContentText: () => google.page };
            },
        },
        MailApp: { sendEmail: (to, subject, body) => google.emails.push({ to, subject, body }) },
        Session: { getEffectiveUser: () => ({ getEmail: () => 'me@example.com' }) },
        PropertiesService: {
            getScriptProperties: () => ({
                getProperty: (key) => (key in google.properties ? google.properties[key] : null),
                setProperty: (key, value) => { google.properties[key] = value; },
                deleteProperty: (key) => { delete google.properties[key]; },
            }),
        },
        ScriptApp: {
            getProjectTriggers: () => [...google.triggers],
            deleteTrigger: (trigger) => { google.triggers.splice(google.triggers.indexOf(trigger), 1); },
            newTrigger: (handler) => ({
                timeBased: () => ({
                    everyHours: (hours) => ({
                        create: () => google.triggers.push({ handler, hours, getHandlerFunction: () => handler }),
                    }),
                }),
            }),
        },
    });
    const settings = `const ALERT_PRICES = ${JSON.stringify(alertPrices)};`;
    vm.runInContext(SCRIPT.replace(/const ALERT_PRICES = \{[\s\S]*?\};/, settings), context);
    // The script's own Date, so Date.now() follows google.now.
    vm.runInContext('Date.now = () => clock()', Object.assign(context, { clock: () => google.now }));
    return { google, run: (name) => vm.runInContext(`${name}()`, context) };
}

test.describe('email alerts script', () => {
    test('emails once when the rate drops below the alert price, and again after the next drop', () => {
        const { google, run } = loadScript({ '24K': 158000, '22K': 0 });

        run('checkGoldRate');
        expect(google.emails).toEqual([{
            to: 'me@example.com',
            subject: 'Gold price drop: 24K at ₹1,57,739 (below ₹1,58,000)',
            body: [
                '24K gold (999) is now ₹1,57,739 per 10 g, below your alert price of ₹1,58,000.',
                '',
                'IBJA PM rate, Mon, 28 Sept 2026',
                'With 3% GST: ₹1,62,471 · per gram: ₹15,774',
                'All rates: https://ibjarates.com/',
                '',
                'You get one email each time the rate drops below your price. To change it, edit ALERT_PRICES in the script.',
            ].join('\n'),
        }]);

        // Still below, and lower still: same dip, no new email.
        google.page = pmRates(157200, 144000);
        run('checkGoldRate');
        expect(google.emails).toHaveLength(1);

        // Back up to the alert price ends the dip; the next drop emails again.
        google.page = pmRates(158000, 144800);
        run('checkGoldRate');
        google.page = pmRates(157900, 144700);
        run('checkGoldRate');
        expect(google.emails.map((email) => email.subject)).toEqual([
            'Gold price drop: 24K at ₹1,57,739 (below ₹1,58,000)',
            'Gold price drop: 24K at ₹1,57,900 (below ₹1,58,000)',
        ]);
    });

    test('watches each purity separately and ignores purities without an alert price', () => {
        const { google, run } = loadScript({ '24K': 0, '22K': 145000 });

        run('checkGoldRate');

        expect(google.emails.map((email) => email.subject)).toEqual(['Gold price drop: 22K at ₹1,44,489 (below ₹1,45,000)']);
    });

    test('a new alert price during a dip emails once for the new price', () => {
        const first = loadScript({ '24K': 158000, '22K': 0 });
        first.run('checkGoldRate');

        // Editing ALERT_PRICES and saving reloads the script; its stored state stays.
        const second = loadScript({ '24K': 158500, '22K': 0 });
        second.google.properties = first.google.properties;
        second.run('checkGoldRate');
        second.run('checkGoldRate');

        expect(second.google.emails.map((email) => email.subject)).toEqual(['Gold price drop: 24K at ₹1,57,739 (below ₹1,58,500)']);
    });

    test('checks only on weekdays from 11 AM to 8 PM in India', () => {
        const { google, run } = loadScript({ '24K': 158000, '22K': 0 });
        const checksAt = (iso) => {
            google.now = Date.parse(iso);
            const before = google.fetches;
            run('checkGoldRate');
            return google.fetches > before;
        };

        expect(checksAt('2026-09-28T05:29:00Z')).toBe(false); // Monday 10:59 IST
        expect(checksAt('2026-09-28T05:30:00Z')).toBe(true); // Monday 11:00 IST
        expect(checksAt('2026-09-28T14:29:00Z')).toBe(true); // Monday 19:59 IST
        expect(checksAt('2026-09-28T14:30:00Z')).toBe(false); // Monday 20:00 IST
        expect(checksAt('2026-09-26T06:30:00Z')).toBe(false); // Saturday noon IST
        expect(checksAt('2026-09-27T06:30:00Z')).toBe(false); // Sunday noon IST
    });

    test("on a weekday holiday, uses the latest day in the history tables", () => {
        const { google, run } = loadScript({ '24K': 158000, '22K': 0 });
        google.page = saturdayPage; // Today's spans are empty, as on a holiday.

        run('checkGoldRate');

        expect(google.emails[0].body).toContain('IBJA PM rate, Fri, 25 Sept 2026');
        expect(google.emails[0].subject).toBe('Gold price drop: 24K at ₹1,57,739 (below ₹1,58,000)');
    });

    test('emails one warning after a working day of failed checks, and resets once a check works', () => {
        const { google, run } = loadScript({ '24K': 150000, '22K': 0 });
        google.status = 503;

        for (let i = 0; i < 12; i++) {
            run('checkGoldRate');
        }
        expect(google.emails).toEqual([expect.objectContaining({
            subject: "Gold price alerts: can't read ibjarates.com",
            body: expect.stringContaining('The last 9 checks failed'),
        })]);

        google.status = 200;
        run('checkGoldRate');
        expect(google.properties.failures).toBeUndefined();
    });

    test("an unreadable page counts as a failure, with the extension's error message", () => {
        const { google, run } = loadScript({ '24K': 150000, '22K': 0 });
        google.page = '<html><body>Maintenance</body></html>';

        expect(() => run('checkNow')).toThrow('the 24K and 22K rates are missing from ibjarates.com (the page may have changed)');
        run('checkGoldRate');
        expect(google.properties.failures).toBe('1');
    });

    test('setup turns on one hourly check and sends a test email', () => {
        const { google, run } = loadScript({ '24K': 158000, '22K': 145000 });

        run('setup');
        run('setup'); // Running it again replaces the check rather than adding a second one.

        expect(google.triggers.map(({ handler, hours }) => ({ handler, hours }))).toEqual([{ handler: 'checkGoldRate', hours: 1 }]);
        expect(google.emails[0]).toEqual({
            to: 'me@example.com',
            subject: 'Gold price alerts are on',
            body: [
                "Today's IBJA PM rate (Mon, 28 Sept 2026): 24K ₹1,57,739, 22K ₹1,44,489 per 10 g.",
                '',
                "You'll get an email when 24K drops below ₹1,58,000 or 22K drops below ₹1,45,000. The script checks every hour on working days, 11 AM to 8 PM IST.",
            ].join('\n'),
        });

        run('turnOff');
        expect(google.triggers).toEqual([]);
    });

    test('setup refuses to start without an alert price', () => {
        const { google, run } = loadScript();

        expect(() => run('setup')).toThrow('Set your alert price in ALERT_PRICES');
        expect(google.triggers).toEqual([]);
    });

    test('the copy in the repo has no alert prices or email address filled in', () => {
        expect(SCRIPT).toContain("const ALERT_PRICES = {\n    '24K': 0,\n    '22K': 0,\n};");
        expect(SCRIPT).toContain("const EMAIL_TO = '';");
    });
});
