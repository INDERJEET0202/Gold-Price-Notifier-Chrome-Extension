// The Chrome Web Store package (`npm run package`): complete, and loadable by Chrome.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { test, expect, launchBrowser, Extension } = require('./fixtures');
const { PACKAGE_FILES, buildPackage } = require('../scripts/package');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Every local file the extension refers to: from the manifest, from the pages it opens (and
// the files those load), and from background.js (importScripts, tabs and notification icons).
function referencedFiles() {
    const manifest = JSON.parse(read('manifest.json'));
    const files = new Set([
        'manifest.json',
        ...Object.values(manifest.icons),
        ...Object.values(manifest.action.default_icon),
        manifest.background.service_worker,
        manifest.action.default_popup,
    ]);
    const background = read(manifest.background.service_worker);
    for (const [, file] of background.matchAll(/(?:importScripts\(|url: |iconUrl: )'([^':]+)'/g)) {
        files.add(file);
    }
    for (const page of [...files].filter((file) => file.endsWith('.html'))) {
        for (const [, file] of read(page).matchAll(/(?:src|href)="([^"#:]+)"/g)) {
            files.add(file);
        }
    }
    return [...files];
}

// Reads a zip's central directory and inflates each entry.
function unzip(buffer) {
    const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = buffer.readUInt16LE(end + 10);
    let offset = buffer.readUInt32LE(end + 16);
    const entries = new Map();
    for (let i = 0; i < count; i++) {
        const method = buffer.readUInt16LE(offset + 10);
        const compressedSize = buffer.readUInt32LE(offset + 20);
        const nameLength = buffer.readUInt16LE(offset + 28);
        const localOffset = buffer.readUInt32LE(offset + 42);
        const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
        const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
        const data = buffer.subarray(dataStart, dataStart + compressedSize);
        entries.set(name, method === 8 ? zlib.inflateRawSync(data) : data);
        offset += 46 + nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
    }
    return entries;
}

test.describe('Chrome Web Store package', () => {
    test('contains exactly the files the extension refers to', () => {
        expect([...PACKAGE_FILES].sort()).toEqual(referencedFiles().sort());
    });

    test('the manifest meets the store limits', () => {
        const manifest = JSON.parse(read('manifest.json'));
        expect(manifest.name.length).toBeLessThanOrEqual(75);
        expect(manifest.description.length).toBeLessThanOrEqual(132);
        expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test('the store images have the sizes the store requires', () => {
        const sizes = {
            'store/screenshot-1-rate.png': [1280, 800],
            'store/screenshot-2-alert.png': [1280, 800],
            'store/screenshot-3-dark-gst.png': [1280, 800],
            'store/promo-small.png': [440, 280],
            'store/promo-marquee.png': [1400, 560],
        };
        for (const [file, size] of Object.entries(sizes)) {
            const data = fs.readFileSync(path.join(ROOT, file));
            expect([data.readUInt32BE(16), data.readUInt32BE(20)], file).toEqual(size);
        }
    });

    test('builds a zip that Chrome loads and runs', async ({}, testInfo) => {
        const zipPath = buildPackage(testInfo.outputPath('package.zip'));
        const entries = unzip(fs.readFileSync(zipPath));
        expect([...entries.keys()].sort()).toEqual(['Icons/', ...PACKAGE_FILES].sort());

        const unpacked = testInfo.outputPath('unpacked');
        for (const [name, data] of entries) {
            if (name.endsWith('/')) {
                continue;
            }
            expect(data.equals(fs.readFileSync(path.join(ROOT, name))), `${name} is unchanged`).toBe(true);
            fs.mkdirSync(path.dirname(path.join(unpacked, name)), { recursive: true });
            fs.writeFileSync(path.join(unpacked, name), data);
        }

        const context = await launchBrowser(testInfo.outputPath('profile'), unpacked);
        try {
            const extension = await Extension.attach(context);
            expect(await extension.serviceWorker.evaluate(() => chrome.runtime.getManifest().version)).toBe(JSON.parse(read('manifest.json')).version);
            await expect.poll(() => context.pages().map((page) => page.url())).toContain(`chrome-extension://${extension.id}/welcome.html`);

            await extension.setStorage({ goldRates: { '24K': 157739, '22K': 144489 }, rateSession: 'PM', lastFetched: Date.now() });
            const popup = await extension.openPopup();
            await expect(popup.locator('#rate-value')).toHaveText('₹1,57,739');
            await expect(popup.locator('.app-logo')).toHaveJSProperty('naturalWidth', 256);
            expect(extension.pageErrors).toEqual([]);
        } finally {
            await context.close();
        }
    });
});
