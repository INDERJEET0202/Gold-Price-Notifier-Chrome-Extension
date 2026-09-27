// Builds the zip to upload to the Chrome Web Store: `npm run package`.
// It contains only the files the extension loads (no tests, docs, node_modules or sources),
// taken from the working tree. Node's zlib does the compression, so nothing needs installing.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');

// Everything Chrome loads. tests/package.spec.js checks this against the files that the
// manifest, the pages and background.js refer to.
const PACKAGE_FILES = [
    'manifest.json',
    'background.js',
    'format.js',
    'popup.html',
    'popup.css',
    'popup.js',
    'theme.css',
    'welcome.html',
    'welcome.css',
    'logo16x16.png',
    'logo32x32.png',
    'logo48x48.png',
    'logo128x128.png',
    'Icons/logo.png',
];

function packagePath() {
    const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    return path.join(ROOT, 'dist', `gold-price-drop-notifier-${version}.zip`);
}

function buildPackage(outputPath = packagePath()) {
    // Folders get their own entries (e.g. "Icons/"), as zip tools expect.
    const folders = [...new Set(PACKAGE_FILES.filter((name) => name.includes('/')).map((name) => `${path.posix.dirname(name)}/`))];
    const entries = [
        ...folders.map((name) => ({ name, data: Buffer.alloc(0) })),
        ...PACKAGE_FILES.map((name) => ({ name, data: fs.readFileSync(path.join(ROOT, name)) })),
    ];
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, zip(entries));
    return outputPath;
}

// A minimal zip writer (deflate, no zip64), enough for a few small files. Names ending in "/"
// are folders.
function zip(entries) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    for (const { name, data } of entries) {
        const isFolder = name.endsWith('/');
        const nameBytes = Buffer.from(name, 'utf8');
        const compressed = isFolder ? data : zlib.deflateRawSync(data, { level: 9 });
        const crc = crc32(data);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0); // Local file header signature.
        local.writeUInt16LE(20, 4); // Version needed: 2.0.
        local.writeUInt16LE(0x0800, 6); // Flags: names are UTF-8.
        local.writeUInt16LE(isFolder ? 0 : 8, 8); // Method: stored for folders, deflate for files.
        local.writeUInt16LE(0, 10); // Time and date left at the DOS epoch, so builds are
        local.writeUInt16LE(0x21, 12); // reproducible (1980-01-01 00:00).
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(compressed.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBytes.length, 26);
        local.writeUInt16LE(0, 28); // No extra field.
        localParts.push(local, nameBytes, compressed);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0); // Central directory header signature.
        central.writeUInt16LE(20, 4); // Made by: 2.0.
        local.copy(central, 6, 4, 30); // Version needed through name length, same as above.
        central.writeUInt16LE(0, 30); // No extra field.
        central.writeUInt16LE(0, 32); // No comment.
        central.writeUInt16LE(0, 34); // Disk 0.
        central.writeUInt16LE(0, 36); // Internal attributes.
        central.writeUInt32LE(isFolder ? 0x10 : 0, 38); // External attributes: 0x10 is the MS-DOS folder flag.
        central.writeUInt32LE(offset, 42); // Where the local header starts.
        centralParts.push(central, nameBytes);

        offset += local.length + nameBytes.length + compressed.length;
    }
    const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); // End of central directory signature.
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...localParts, ...centralParts, end]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return c >>> 0;
});

function crc32(data) {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

if (require.main === module) {
    const output = buildPackage();
    console.log(`${path.relative(ROOT, output)} (${PACKAGE_FILES.length} files, ${Math.round(fs.statSync(output).size / 1024)} KB)`);
}

module.exports = { PACKAGE_FILES, buildPackage };
