'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
for (const file of new Set(files)) {
  if (!fs.existsSync(file)) continue;
  assert.ok(!/\.(?:apk|aab|jks|keystore|p12|pfx|pem|key)$/.test(file), `Arquivo privado/gerado rastreado: ${file}`);
  const data = fs.readFileSync(file);
  if (data.subarray(0, 8192).includes(0)) continue;
  const source = data.toString('utf8');
  assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}|\bAKIA[A-Z0-9]{16}\b/.test(source), `Possivel segredo: ${file}`);
  if (/\.(?:js|cjs)$/.test(file) && !file.includes('/vendor/')) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe', windowsHide: true });
}
const html = fs.readFileSync('public/index.html', 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(ids.length, new Set(ids).size, 'IDs HTML duplicados');
for (const match of fs.readFileSync('public/app.js', 'utf8').matchAll(/document.getElementById\('([^']+)'\)/g)) assert.ok(ids.includes(match[1]), `Elemento ausente: ${match[1]}`);
for (const match of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g)) assert.ok(fs.existsSync(path.join('public', match[1])), `Asset ausente: ${match[1]}`);
let count = 0;
function verify(dir = '') {
  for (const entry of fs.readdirSync(path.join('public', dir), { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) verify(relative);
    else { assert.deepEqual(fs.readFileSync(path.join('public', relative)), fs.readFileSync(path.join('android-firetv/app/src/main/assets/www', relative)), `Asset Android desatualizado: ${relative}`); count++; }
  }
}
verify();
for (const file of ['APACHE-2.0.txt', 'hls.js-LICENSE.txt', 'THIRD_PARTY_NOTICES.txt']) assert.ok(fs.existsSync(path.join('public/licenses', file)), `Licenca ausente: ${file}`);
console.log(`Fontes, assets (${count}), IDs e verificacao preventiva de segredos: OK.`);
