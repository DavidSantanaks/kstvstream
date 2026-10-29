'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseReleaseVersion } = require('./release-version.cjs');

const { tag } = parseReleaseVersion(process.env.KS_RELEASE_VERSION);
const root = path.resolve(__dirname, '..');
const apk = path.join(root, 'android-firetv/app/build/outputs/apk/release/app-release.apk');
if (!fs.existsSync(apk)) throw new Error('APK de release assinado ausente. APK de debug não é alternativa.');
const output = path.join(root, 'dist');
fs.mkdirSync(output, { recursive: true });
const names = ['KS-TV-Stream.apk', `KS-TV-Stream-${tag}.apk`];
const checksum = crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex');
for (const name of names) fs.copyFileSync(apk, path.join(output, name));
fs.writeFileSync(path.join(output, 'checksums.txt'), names.map(name => `${checksum}  ${name}`).join('\n') + '\n');
console.log(`Release ${tag}: APK assinado e checksums preparados.`);
