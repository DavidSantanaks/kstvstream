'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');

async function run() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const root = path.resolve(__dirname, '..');
  const server = spawn(process.execPath, ['server.js'], {
    cwd: root, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' }, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('O servidor de QA não iniciou.')), 10000);
      server.stdout.once('data', () => { clearTimeout(timeout); resolve(); });
      server.once('error', error => { clearTimeout(timeout); reject(error); });
      server.once('exit', code => { clearTimeout(timeout); if (code) reject(new Error(`Servidor encerrou: ${code}`)); });
    });
    const code = await new Promise((resolve, reject) => {
      const test = spawn(process.execPath, ['scripts/qa-ui.cjs'], {
        cwd: root, env: { ...process.env, QA_URL: `http://127.0.0.1:${port}` }, windowsHide: true, stdio: 'inherit'
      });
      test.once('error', reject);
      test.once('exit', code => resolve(code ?? 1));
    });
    process.exitCode = code;
  } finally {
    server.kill();
  }
}

run().catch(error => { console.error(error.message); process.exitCode = 1; });
