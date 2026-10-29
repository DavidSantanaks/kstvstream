'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
async function main() {
  const windows = process.platform === 'win32';
  const dir = path.resolve('.local-tools/actionlint');
  const binary = path.join(dir, windows ? 'actionlint.exe' : 'actionlint');
  if (!fs.existsSync(binary)) {
    if (!windows && process.platform !== 'linux') throw new Error('Instale actionlint para esta plataforma.');
    fs.mkdirSync(dir, { recursive: true });
    const name = windows ? 'actionlint_1.7.12_windows_amd64.zip' : 'actionlint_1.7.12_linux_amd64.tar.gz';
    const expected = windows ? '6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9' : '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8';
    const response = await fetch(`https://github.com/rhysd/actionlint/releases/download/v1.7.12/${name}`);
    if (!response.ok) throw new Error(`Download actionlint: HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (crypto.createHash('sha256').update(buffer).digest('hex') !== expected) throw new Error('Checksum actionlint inválido.');
    const archive = path.join(dir, name);
    fs.writeFileSync(archive, buffer);
    execFileSync('tar', ['-xf', archive, '-C', dir]);
  }
  execFileSync(binary, ['-color'], { stdio: 'inherit', windowsHide: true });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
