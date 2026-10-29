'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
async function main() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk) throw new Error('Configure ANDROID_HOME.');
  const required = ['platforms/android-35/android.jar', `build-tools/35.0.0/aapt2${process.platform === 'win32' ? '.exe' : ''}`];
  if (required.every(file => fs.existsSync(path.join(sdk, file)))) return console.log('SDK Android 35 pronto.');
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('Instale Android 35 e build-tools 35.0.0.');
  const dir = path.resolve('.local-tools/android-cli23');
  fs.mkdirSync(dir, { recursive: true });
  const response = await fetch('https://dl.google.com/android/repository/commandlinetools-linux-16111833_latest.zip');
  if (!response.ok) throw new Error(`Download SDK: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (crypto.createHash('sha256').update(buffer).digest('hex') !== '0877a1d048fe4a24efe2eff536ca4223f7adeb58648bb81909d33c446918cfa8') throw new Error('Checksum SDK inválido.');
  const archive = path.join(dir, 'cli.zip');
  fs.writeFileSync(archive, buffer);
  execFileSync('unzip', ['-q', '-o', archive, '-d', dir]);
  const cli = path.join(dir, 'cmdline-tools/bin/android');
  fs.chmodSync(cli, 0o755);
  for (const item of ['platforms;android-35', 'build-tools;35.0.0']) execFileSync(cli, ['--no-metrics', `--sdk=${sdk}`, 'sdk', 'install', item], { input: 'y\n'.repeat(100), stdio: ['pipe', 'inherit', 'inherit'] });
  if (!required.every(file => fs.existsSync(path.join(sdk, file)))) throw new Error('SDK incompleto.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
