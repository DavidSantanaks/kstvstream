/*
 * Local browser smoke test. No packages, IPTV account or external network needed.
 * Run the app with `node server.js`, then `node scripts/qa-ui.cjs`.
 * Requires a local Chrome/Edge installation and Node 22+ (built-in WebSocket).
 * Fixtures exercise UI and HTML media controls; real HLS/native Android playback
 * still requires verification on the target device with the owner's playlist.
 * Set QA_SCOPE=updates to check home/loading without repeating the older flows.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const origin = process.env.QA_URL || 'http://127.0.0.1:3099';
const port = Number(process.env.QA_CDP_PORT || 9333);
const output = process.env.QA_ARTIFACTS_DIR ? path.resolve(process.env.QA_ARTIFACTS_DIR) : fs.mkdtempSync(path.join(os.tmpdir(), 'ks-tv-ui-qa-'));
fs.mkdirSync(output, { recursive: true });
const results = [];
const pageErrors = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
let cdp;
let mediaMode = 'ready';
let mediaSerial = 0;
const heldMedia = [];

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.pending = new Map();
    this.listeners = new Map();
    this.id = 0;
    socket.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      if (data.id) {
        const pending = this.pending.get(data.id);
        if (!pending) return;
        this.pending.delete(data.id);
        clearTimeout(pending.timeout);
        if (data.error) pending.reject(new Error(JSON.stringify(data.error)));
        else pending.resolve(data.result);
      } else {
        for (const handler of this.listeners.get(data.method) || []) {
          Promise.resolve(handler(data.params)).catch(error => pageErrors.push(error.message));
        }
      }
    });
  }
  on(method, handler) {
    this.listeners.set(method, [...(this.listeners.get(method) || []), handler]);
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timed out: ${method}`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true, userGesture: true
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + (result.exceptionDetails.exception?.description || expression));
    return result.result.value;
  }
}

function art(title, index, wide = false) {
  const colors = ['#1b4660', '#4c304a', '#485137', '#3c365c', '#5d3d29'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${wide ? 1280 : 400}" height="${wide ? 720 : 600}" viewBox="0 0 400 600"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${colors[index % colors.length]}"/><stop offset="1" stop-color="#06080d"/></linearGradient></defs><rect width="400" height="600" fill="url(#g)"/><circle cx="275" cy="160" r="70" fill="#d6e5ef" opacity=".18"/><path d="M0 420L120 250 210 400 310 290 400 420V600H0" fill="#06080d" opacity=".5"/><text x="28" y="490" fill="white" font-family="Arial" font-size="30" font-weight="bold">${title}</text><text x="28" y="525" fill="#c9cbd0" font-family="Arial" font-size="13">CATÁLOGO DE TESTE · KS TV</text></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

const movieNames = ['Horizonte 4K Dublado', 'Horizonte HD Legendado', ...Array.from({ length: 26 }, (_, i) => `Filme ${String(i + 3).padStart(2, '0')}`)];
const movies = movieNames.map((name, i) => ({
  stream_id: 1000 + i, name, category_id: '20', num: i + 1, year: '2026', rating: '8.5',
  stream_icon: art(i < 2 ? 'HORIZONTE' : name.toUpperCase(), i),
  backdrop_path: [art('HORIZONTE', i, true)], container_extension: 'wav',
  plot: 'Um novo horizonte espera por você. Catálogo fictício para verificar a interface.'
}));
const series = Array.from({ length: 28 }, (_, i) => ({
  series_id: 2000 + i, name: `Série ${String(i + 1).padStart(2, '0')}`, category_id: '30', year: '2026', rating: '8.2',
  cover: art(`SÉRIE ${String(i + 1).padStart(2, '0')}`, i + 2), plot: 'Uma história para acompanhar. Catálogo fictício de teste.'
}));
const channels = Array.from({ length: 18 }, (_, i) => ({
  stream_id: 3000 + i, name: `Canal ${String(i + 1).padStart(2, '0')} HD`, num: i + 1, category_id: '10', stream_icon: art(`TV ${i + 1}`, i)
}));

// Valid PCM WAV gives real duration, playback, seeking and volume without a codec download.
const pcmBytes = 120 * 8000 * 2;
const wav = Buffer.alloc(44 + pcmBytes);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcmBytes, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(pcmBytes, 40);

async function fulfill(requestId, body, contentType = 'application/json') {
  await cdp.send('Fetch.fulfillRequest', {
    requestId, responseCode: 200,
    responseHeaders: [{ name: 'Content-Type', value: contentType }, { name: 'Access-Control-Allow-Origin', value: '*' }],
    body: (Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))).toString('base64')
  });
}

async function serveMedia({ requestId, request }) {
  const rangeHeader = Object.entries(request.headers).find(([key]) => key.toLowerCase() === 'range')?.[1];
  const range = /^bytes=(\d+)-(\d*)/.exec(rangeHeader || '');
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
  const body = wav.subarray(start, end + 1);
  return cdp.send('Fetch.fulfillRequest', {
    requestId, responseCode: range ? 206 : 200,
    responseHeaders: [
      { name: 'Content-Type', value: 'audio/wav' },
      { name: 'Access-Control-Allow-Origin', value: '*' },
      { name: 'Accept-Ranges', value: 'bytes' },
      { name: 'Content-Length', value: String(body.length) },
      ...(range ? [{ name: 'Content-Range', value: `bytes ${start}-${end}/${wav.length}` }] : [])
    ], body: body.toString('base64')
  });
}

async function releaseMedia(fail = false) {
  mediaMode = fail ? 'fail' : 'ready';
  // Closing playback legitimately cancels paused requests before we release them.
  await Promise.allSettled(heldMedia.splice(0).map(entry => fail
    ? cdp.send('Fetch.failRequest', { requestId: entry.requestId, errorReason: 'Failed' })
    : serveMedia(entry)));
}

async function intercept({ requestId, request }) {
  const url = new URL(request.url);
  if (url.hostname === 'fixture.invalid') {
    if (url.pathname.endsWith('.vtt')) return fulfill(requestId, 'WEBVTT\n\n00:00:00.000 --> 00:02:00.000\nLegenda de teste KS TV\n', 'text/vtt');
    if (mediaMode === 'hold') { heldMedia.push({ requestId, request }); return; }
    if (mediaMode === 'fail') return cdp.send('Fetch.failRequest', { requestId, errorReason: 'Failed' });
    return serveMedia({ requestId, request });
  }
  if (url.pathname === '/api/resolve') return fulfill(requestId, { resolvedUrl: 'http://fixture.invalid/media.wav?request=' + (++mediaSerial) });
  if (url.pathname === '/api/xtream') {
    const upstream = new URL(url.searchParams.get('url'));
    if (upstream.pathname.endsWith('.vtt')) return fulfill(requestId, 'WEBVTT\n\n00:00:00.000 --> 00:02:00.000\nLegenda de teste KS TV\n', 'text/vtt');
    const action = upstream.searchParams.get('action');
    if (!action) return fulfill(requestId, { user_info: { auth: 1, status: 'Active', username: 'ui-fixture', exp_date: '1999999999', max_connections: '2', active_cons: '0' }, server_info: {} });
    const categories = {
      get_live_categories: [{ category_id: '10', category_name: 'Canais | Entretenimento' }],
      get_vod_categories: [{ category_id: '20', category_name: 'Filmes | Cinema' }],
      get_series_categories: [{ category_id: '30', category_name: 'Séries | Destaques' }]
    };
    if (categories[action]) return fulfill(requestId, categories[action]);
    if (action === 'get_live_streams') return fulfill(requestId, channels);
    if (action === 'get_vod_streams') return fulfill(requestId, movies);
    if (action === 'get_series') return fulfill(requestId, series);
    if (action === 'get_vod_info') return fulfill(requestId, { info: { plot: movies[0].plot, genre: 'Aventura', episode_run_time: '2', subtitles: [{ name: 'Português', url: 'http://fixture.invalid/subs.vtt' }] } });
    if (action === 'get_series_info') return fulfill(requestId, { info: { plot: series[0].plot }, episodes: { '1': [{ id: 4001, title: 'Um novo começo', episode_num: 1, container_extension: 'wav', info: { duration: '00:02:00' } }, { id: 4002, title: 'O próximo capítulo', episode_num: 2, container_extension: 'wav', info: { duration: '00:02:00' } }] } });
    if (action === 'get_short_epg') return fulfill(requestId, { epg_listings: [{ title: Buffer.from('Agora no ar').toString('base64'), start: '2026-10-29 10:00:00', end: '2026-10-29 11:00:00' }] });
    return fulfill(requestId, {});
  }
  await cdp.send('Fetch.continueRequest', { requestId });
}

async function until(expression, label, timeout = 7000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await cdp.evaluate(expression)) return;
    await pause(100);
  }
  throw new Error('Timed out: ' + label);
}
async function screenshot(name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const destination = path.join(output, name + '.png');
  fs.writeFileSync(destination, Buffer.from(data, 'base64'));
  console.log('Screenshot: ' + destination);
}
async function center(selector, scroll = true) {
  const result = await cdp.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw new Error('Missing '+${JSON.stringify(selector)}); ${scroll ? "e.scrollIntoView({block:'center',inline:'nearest'});" : ''} const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}; })()`);
  await pause(140);
  return result;
}
async function click(selector) {
  const p = await center(selector);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await pause(180);
}
async function drag(selector, touch = false, vertical = false) {
  const p = await center(selector);
  const start = { x: Math.min(920, p.x + Math.min(p.w / 3, 230)), y: p.y };
  const steps = 12;
  if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, radiusX: 5, radiusY: 5, id: 0 }] });
  else await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= steps; i++) {
    const point = { x: start.x - (vertical ? 0 : 380 * i / steps), y: start.y - (vertical ? 170 * i / steps : 0) };
    if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, radiusX: 5, radiusY: 5, id: 0 }] });
    else await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, button: 'left', buttons: 1 });
    await pause(18);
  }
  if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  else await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: start.x - 380, y: start.y, button: 'left', buttons: 0, clickCount: 1 });
  await pause(600);
}
async function key(key, modifiers = 0) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, modifiers, windowsVirtualKeyCode: { Escape: 27, ArrowRight: 39, ArrowLeft: 37, ArrowUp: 38, ArrowDown: 40, Enter: 13, Tab: 9 }[key] });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, modifiers });
  await pause(120);
}
async function check(name, action) {
  try { await action(); results.push({ name, passed: true }); console.log('PASS ' + name); }
  catch (error) { results.push({ name, passed: false, error: error.message }); console.log('FAIL ' + name + ': ' + error.message); await screenshot('failure-' + results.length); }
}

const loadingVisible = '(()=>{const e=document.querySelector("#player-Spinner");return !!e && !e.classList.contains("hidden") && getComputedStyle(e).display!=="none";})()';
const loadingMessage = 'document.querySelector("#player-loading-text").textContent';

async function verifyLoadingPlacement(name, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await pause(150);
  const placement = await cdp.evaluate(`(() => {
    const status=document.querySelector('#player-Spinner'), transport=document.querySelector('.osd-transport-controls'), header=document.querySelector('.osd-media-header');
    const s=status.getBoundingClientRect(), t=transport.getBoundingClientRect(), h=header.getBoundingClientRect();
    const old=status.style.pointerEvents; status.style.pointerEvents='auto';
    const topmost=status.contains(document.elementFromPoint(s.x+s.width/2,s.y+s.height/2)); status.style.pointerEvents=old;
    return {x:s.x,y:s.y,right:s.right,bottom:s.bottom,transportBottom:t.bottom,headerTop:h.top,topmost};
  })()`);
  assert.ok(placement.x >= 0 && placement.y >= placement.transportBottom && placement.right <= width && placement.bottom <= height, JSON.stringify(placement));
  assert.ok(placement.bottom <= placement.headerTop, JSON.stringify(placement));
  assert.equal(placement.topmost, true, 'Loading status must appear above the control overlay');
  await screenshot('player-loading-' + name);
}

async function main() {
  const updatesOnly = process.env.QA_SCOPE === 'updates';
  assert.equal((await fetch(origin)).ok, true, 'Start node server.js first');
  const executable = process.env.QA_BROWSER || [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].find(file => fs.existsSync(file));
  assert.ok(executable, 'Chrome or Edge is required');
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', ...(process.env.CI ? ['--no-sandbox'] : []), '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + port, '--user-data-dir=' + path.join(output, 'profile'), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let target;
  for (let i = 0; i < 80; i++) {
    try { target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json(); break; } catch { await pause(100); }
  }
  assert.ok(target?.webSocketDebuggerUrl, 'Chrome debugging endpoint unavailable');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  cdp = new CDP(socket);
  cdp.on('Runtime.exceptionThrown', data => pageErrors.push(data.exceptionDetails.exception?.description || data.exceptionDetails.text));
  cdp.on('Fetch.requestPaused', intercept);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*api/*' }, { urlPattern: '*fixture.invalid*' }] });
  await cdp.send('Page.navigate', { url: origin });
  await until('!!document.querySelector("#xtream-name")', 'login');
  await check('Login logo and favicon load', async () => {
    await until('document.querySelector(".app-logo")?.naturalWidth > 0', 'logo loaded');
    assert.equal(await cdp.evaluate('document.querySelector("link[rel=icon]").getAttribute("href").includes("assets/")'), true);
    await screenshot('login');
  });
  await cdp.evaluate(`document.querySelector('#xtream-server').value='http://fixture.invalid';document.querySelector('#xtream-user').value='ui-fixture';document.querySelector('#xtream-pass').value='local-only';`);
  await click('#btn-login-submit');
  await until('document.querySelector("#app-screen.active") && document.querySelectorAll(".home-row-track").length >= 3', 'catalog');

  await check('Welcoming home and hero fit desktop and mobile', async () => {
    const greeting = await cdp.evaluate('document.querySelector("#home-greeting")?.parentElement.textContent.trim()');
    assert.ok(greeting && greeting.length > 10, greeting);
    for (const [name, width, height] of [['desktop', 1280, 800], ['mobile', 390, 844]]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await cdp.evaluate('document.querySelector("#section-home").scrollTop=0');
      await pause(150);
      const dimensions = await cdp.evaluate('(()=>{const s=document.querySelector("#section-home"),h=document.querySelector("#hero-banner").getBoundingClientRect(),g=document.querySelector(".home-welcome").getBoundingClientRect();return {scrollWidth:s.scrollWidth,width:s.clientWidth,heroLeft:h.left,heroRight:h.right,greetingLeft:g.left,greetingRight:g.right};})()');
      assert.ok(dimensions.scrollWidth <= dimensions.width + 1 && dimensions.heroLeft >= 0 && dimensions.heroRight <= width + 1 && dimensions.greetingLeft >= 0 && dimensions.greetingRight <= width + 1, JSON.stringify(dimensions));
      if (name === 'mobile') {
        const header = await cdp.evaluate('(()=>{const n=document.querySelector(".tvos-nav-pill"),b=document.querySelector(".tvos-brand .tv-text"),live=n.querySelector("[data-section=live]");const r=document.createRange();r.selectNodeContents(live);return {brandHeight:b.getBoundingClientRect().height,liveTextHeight:r.getBoundingClientRect().height,navWidth:n.clientWidth,navScrollWidth:n.scrollWidth,scrollbarHidden:getComputedStyle(n).scrollbarWidth==="none"||getComputedStyle(n,"::-webkit-scrollbar").display==="none"};})()');
        assert.ok(header.brandHeight <= 32 && header.liveTextHeight <= 28, JSON.stringify(header));
        assert.ok(header.navScrollWidth <= header.navWidth || header.scrollbarHidden, JSON.stringify(header));
        await cdp.evaluate('document.querySelector(".tv-focused")?.classList.remove("tv-focused");const home=document.querySelector(".nav-item[data-section=home]");home.classList.add("tv-focused");home.focus({preventScroll:true});');
        for (let i = 0; i < 6; i++) await key('ArrowRight');
        const account = await cdp.evaluate('(()=>{const e=document.querySelector(".tv-focused"),a=e.getBoundingClientRect(),n=document.querySelector(".tvos-nav-pill").getBoundingClientRect();return {section:e.dataset.section,left:a.left,right:a.right,navLeft:n.left,navRight:n.right};})()');
        assert.equal(account.section, 'account');
        assert.ok(account.left >= account.navLeft - 1 && account.right <= account.navRight + 1 && account.right <= width, JSON.stringify(account));
        await screenshot('home-mobile-nav-account');
        await cdp.evaluate('document.querySelector(".tv-focused")?.classList.remove("tv-focused");document.activeElement.blur();document.querySelector(".tvos-nav-pill").scrollLeft=0;');
      }
      await screenshot('home-' + name);
    }
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  });

  if (!updatesOnly) {
    for (const [name, row] of [['Movies', 1], ['Series', 2]]) {
      const selector = `.home-row:nth-child(${row + 1}) .home-row-track`;
      await check(name + ' mouse drag scrolls and does not open details', async () => {
        await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollLeft=0`);
        await drag(selector);
        assert.ok(await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollLeft`) > 100);
        assert.equal(await cdp.evaluate('document.querySelector("#details-modal").classList.contains("hidden")'), true);
      });
      await check(name + ' touch drag scrolls horizontally', async () => {
        await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
        await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollLeft=0`);
        await drag(selector, true);
        assert.ok(await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollLeft`) > 100);
        assert.equal(await cdp.evaluate('document.querySelector("#details-modal").classList.contains("hidden")'), true);
        await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
      });
    }
    await check('Vertical touch on shelf scrolls the page', async () => {
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
      const selector = '.home-row:nth-child(2) .home-row-track';
      await center(selector);
      const before = await cdp.evaluate('document.querySelector("#section-home").scrollTop');
      await drag(selector, true, true);
      const after = await cdp.evaluate('document.querySelector("#section-home").scrollTop');
      assert.ok(after > before + 25, `page scroll: ${before} -> ${after}`);
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    });
    await check('A normal card click still opens details after dragging', async () => {
      await cdp.evaluate('document.querySelector(".home-row:nth-child(2) .home-row-track").scrollLeft=0');
      await pause(650);
      await click('.home-row:nth-child(2) .poster-card');
      await until('!document.querySelector("#details-modal").classList.contains("hidden")', 'movie details');
    });
  } else {
    await click('.home-row:nth-child(2) .poster-card');
    await until('!document.querySelector("#details-modal").classList.contains("hidden")', 'movie details');
  }
  mediaMode = 'hold';
  await click('#btn-details-play');
  await until('!document.querySelector("#player-overlay").classList.contains("hidden")', 'player');
  await check('Loading stays below transport and above the overlay in all layouts', async () => {
    await until(loadingVisible, 'loading indicator');
    for (const [name, width, height] of [['desktop', 1280, 800], ['landscape', 844, 390], ['portrait', 390, 844]]) {
      await verifyLoadingPlacement(name, width, height);
    }
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  });
  await check('Connection jokes rotate while media is loading', async () => {
    const initial = await cdp.evaluate(loadingMessage);
    assert.match(initial, /antena|tela|Bombril|sinal|pipoca/i);
    await pause(3400);
    const next = await cdp.evaluate(loadingMessage);
    assert.notEqual(next, initial);
    await pause(3400);
    assert.notEqual(await cdp.evaluate(loadingMessage), next);
    assert.equal(await cdp.evaluate(loadingVisible), true);
  });
  await releaseMedia();
  await until('document.querySelector("#video-element").readyState >= 2', 'media');
  await check('Ready playback hides loading and stops rotating its message', async () => {
    await until('!(' + loadingVisible + ')', 'loading cleared after ready');
    const message = await cdp.evaluate(loadingMessage);
    await pause(3400);
    assert.equal(await cdp.evaluate(loadingVisible), false);
    assert.equal(await cdp.evaluate(loadingMessage), message);
  });
  if (!updatesOnly) {
    await cdp.evaluate('document.querySelector("#video-element").loop=true');
    await check('VOD playback, pause, resume and skip controls', async () => {
      assert.equal(await cdp.evaluate('document.querySelector("#video-element").paused'), false);
      await click('#btn-osd-playpause');
      assert.equal(await cdp.evaluate('document.querySelector("#video-element").paused'), true);
      await click('#btn-osd-ff');
      const media = await cdp.evaluate('(()=>{const v=document.querySelector("#video-element"); return {time:v.currentTime,duration:v.duration,seekable:v.seekable.length,paused:v.paused};})()');
      assert.ok(media.time >= 10, JSON.stringify(media));
      await click('#btn-osd-playpause');
      assert.equal(await cdp.evaluate('document.querySelector("#video-element").paused'), false);
      await screenshot('player');
    });
    await check('Options opens and Back closes its popover', async () => {
      const more = await cdp.evaluate('!!document.querySelector("#btn-osd-more")');
      await click(more ? '#btn-osd-more' : '#btn-osd-quality');
      await until('!document.querySelector("#osd-tracks-popover").classList.contains("hidden")', 'popover');
      if (more) {
        const dimensions = await cdp.evaluate('(()=>{const e=document.querySelector("#osd-options-list");return {width:e.clientWidth,scrollWidth:e.scrollWidth};})()');
        assert.ok(dimensions.scrollWidth <= dimensions.width, JSON.stringify(dimensions));
      }
      await screenshot('player-options');
      await key('Escape');
      assert.equal(await cdp.evaluate('document.querySelector("#osd-tracks-popover").classList.contains("hidden")'), true);
      assert.equal(await cdp.evaluate('document.querySelector("#player-osd").classList.contains("osd-hidden")'), false);
    });
    for (const [label, button, expected] of [
      ['Quality', '#btn-osd-quality', 'Horizonte'],
      ['Audio', '#btn-osd-audio', 'Dublado'],
      ['Subtitles', '#btn-osd-subs', 'Desativada']
    ]) {
      await check(label + ' submenu remains available', async () => {
        await click('#btn-osd-more');
        await click(button);
        await until('!document.querySelector("#osd-tracks-popover").classList.contains("hidden")', label + ' menu');
        const text = await cdp.evaluate('document.querySelector("#osd-popover-list").textContent');
        assert.ok(text.includes(expected), text);
        if (label === 'Subtitles') {
          assert.ok(text.includes('Português'), text);
          assert.ok(text.includes('.srt / .vtt'), text);
          await screenshot('player-subtitles');
        }
        await key('Escape');
      });
    }
    await check('Tab and Shift+Tab keep keyboard focus inside the options menu', async () => {
      await click('#btn-osd-more');
      for (const modifiers of [0, 8]) {
        for (let i = 0; i < 15; i++) {
          await key('Tab', modifiers);
          assert.equal(await cdp.evaluate('!!document.activeElement.closest("#osd-tracks-popover")'), true);
          assert.equal(await cdp.evaluate('document.activeElement === document.querySelector(".tv-focused")'), true);
        }
      }
      await key('Escape');
    });
    await check('Clicking outside the options menu restores focus to More', async () => {
      await click('#btn-osd-more');
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 150 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 150, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 150, button: 'left', clickCount: 1 });
      await until('document.querySelector("#osd-tracks-popover").classList.contains("hidden")', 'outside click closes menu');
      assert.equal(await cdp.evaluate('document.querySelector(".tv-focused")?.id'), 'btn-osd-more');
      assert.equal(await cdp.evaluate('document.activeElement.id'), 'btn-osd-more');
    });
    for (const [label, button] of [['Quality', '#btn-osd-quality'], ['Audio', '#btn-osd-audio']]) {
      await check(label + ' variant preserves resume point and catalog focus on exit', async () => {
        const before = await cdp.evaluate('({title:document.querySelector("#osd-title").textContent,time:document.querySelector("#video-element").currentTime})');
        await click('#btn-osd-more');
        await click(button);
        await click('#osd-popover-list .osd-popover-item:not(.active)');
        await until(`document.querySelector('#osd-title').textContent !== ${JSON.stringify(before.title)} && document.querySelector('#video-element').readyState >= 2`, 'variant is playing');
        assert.ok(await cdp.evaluate('document.querySelector("#video-element").currentTime') >= before.time - 1);
        await click('#btn-osd-top-exit');
        assert.equal(await cdp.evaluate('document.querySelector(".tv-focused")?.id'), 'btn-details-play');
        assert.equal(await cdp.evaluate('document.activeElement.id'), 'btn-details-play');
        await click('#btn-details-play');
        await until('document.querySelector("#video-element").readyState >= 2', 'reopen movie');
      });
    }
    await check('D-pad scrolls the last menu option into view in landscape', async () => {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: false });
      await click('#btn-osd-more');
      for (let i = 0; i < 5; i++) await key('ArrowDown');
      assert.equal(await cdp.evaluate('document.querySelector(".tv-focused")?.id'), 'btn-osd-close');
      const visible = await cdp.evaluate('(()=>{const list=document.querySelector("#osd-options-list"),a=list.getBoundingClientRect(),b=document.querySelector("#btn-osd-close").getBoundingClientRect();return {scrolled:list.scrollTop,top:b.top,listTop:a.top,bottom:b.bottom,listBottom:a.bottom};})()');
      assert.ok(visible.scrolled > 0 && visible.top >= visible.listTop - 1 && visible.bottom <= visible.listBottom + 1, JSON.stringify(visible));
      await screenshot('player-options-scrolled-landscape');
      await key('Escape');
    });
    for (const [name, width, height] of [['landscape', 844, 390], ['portrait', 390, 844]]) {
      await check(name + ' player controls and menu fit the viewport', async () => {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await pause(150);
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: width / 2, y: height / 2 });
        await screenshot('player-' + name);
        await click('#btn-osd-more');
        const menu = await cdp.evaluate('(()=>{const e=document.querySelector("#osd-options-list");return {width:e.clientWidth,scrollWidth:e.scrollWidth};})()');
        assert.ok(menu.scrollWidth <= menu.width, JSON.stringify(menu));
        await screenshot('player-options-' + name);
        const rects = await cdp.evaluate(`['.osd-transport-controls','#osd-tracks-popover','#osd-time-display'].map(selector=>{ const r=document.querySelector(selector).getBoundingClientRect(); return {selector,x:r.x,y:r.y,right:r.right,bottom:r.bottom}; })`);
        for (const rect of rects) assert.ok(rect.x >= -1 && rect.y >= -1 && rect.right <= width + 1 && rect.bottom <= height + 1, JSON.stringify(rect));
        await key('Escape');
      });
    }
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await check('D-pad moves focus in the player', async () => {
      await click('#btn-osd-playpause');
      const before = await cdp.evaluate('document.querySelector(".tv-focused")?.id');
      // More is at the right edge after closing a popover; Left has a neighbor.
      await key('ArrowLeft');
      const after = await cdp.evaluate('document.querySelector(".tv-focused")?.id');
      assert.ok(after && after !== before, `${before} -> ${after}`);
    });
    await check('Back hides controls, then exits VOD', async () => {
      await key('Escape');
      assert.equal(await cdp.evaluate('document.querySelector("#player-osd").classList.contains("osd-hidden")'), true);
      await key('Escape');
      assert.equal(await cdp.evaluate('document.querySelector("#player-overlay").classList.contains("hidden")'), true);
      await key('Escape');
    });
    await check('Live Back enters PiP; expand and close remain functional', async () => {
      // The live UI is exercised against local WAV; live HLS itself is out of scope.
      await cdp.evaluate('if(window.Hls) window.Hls.isSupported=()=>false');
      await click('.nav-item[data-section="live"]');
      await click('#live-channels-grid .channel-card');
      await until('!document.querySelector("#player-overlay").classList.contains("hidden")', 'live player');
      assert.equal(await cdp.evaluate('document.querySelector("#osd-channel-drawer").classList.contains("hidden")'), true);
      await click('#btn-osd-channels');
      assert.equal(await cdp.evaluate('getComputedStyle(document.querySelector(".osd-transport-controls")).visibility'), 'hidden');
      await key('ArrowRight');
      assert.equal(await cdp.evaluate('document.querySelector("#osd-channel-drawer").classList.contains("hidden")'), true);
      assert.equal(await cdp.evaluate('document.querySelector(".tv-focused")?.id'), 'btn-osd-playpause');
      await click('#btn-osd-channels');
      for (let i = 0; i < channels.length; i++) await key('ArrowDown');
      assert.equal(await cdp.evaluate('document.querySelector("#osd-channel-drawer").classList.contains("hidden")'), true);
      assert.equal(await cdp.evaluate('document.querySelector(".tv-focused")?.id'), 'btn-osd-playpause');
      await key('Escape'); await key('Escape');
      assert.equal(await cdp.evaluate('document.querySelector("#player-overlay").classList.contains("mini-pip-mode")'), true);
      await screenshot('live-pip');
      await click('#btn-mini-pip-expand');
      assert.equal(await cdp.evaluate('document.querySelector("#player-overlay").classList.contains("mini-pip-mode")'), false);
      await click('#btn-osd-top-exit');
      assert.equal(await cdp.evaluate('document.querySelector("#player-overlay").classList.contains("hidden")'), true);
    });
  } else {
    await click('#btn-osd-top-exit');
    await key('Escape');
    await cdp.evaluate('if(window.Hls) window.Hls.isSupported=()=>false');
  }

  await click('.nav-item[data-section="movies"]');
  await click('#movies-grid .poster-card');
  await until('!document.querySelector("#details-modal").classList.contains("hidden")', 'movie details for loading lifecycle');
  await check('A failed media request replaces loading jokes with a clear error', async () => {
    mediaMode = 'fail';
    await click('#btn-details-play');
    await until('!document.querySelector("#player-error-box").classList.contains("hidden")', 'media error');
    assert.equal(await cdp.evaluate(loadingVisible), false);
    const text = await cdp.evaluate('document.querySelector("#player-error-box").textContent');
    assert.match(text, /indisponível|não foi possível|tentar/i);
    assert.doesNotMatch(text, /Bombril|mexendo na antena|limpando a tela/i);
    const message = await cdp.evaluate(loadingMessage);
    await pause(3400);
    assert.equal(await cdp.evaluate(loadingMessage), message);
    await click('#btn-osd-top-exit');
    mediaMode = 'ready';
  });
  await check('Closing while connecting hides loading and stops its message timer', async () => {
    mediaMode = 'hold';
    await click('#btn-details-play');
    await until(loadingVisible, 'connecting before close');
    await click('#btn-osd-top-exit');
    await releaseMedia();
    const message = await cdp.evaluate(loadingMessage);
    await pause(3400);
    assert.equal(await cdp.evaluate(loadingVisible), false);
    assert.equal(await cdp.evaluate(loadingMessage), message);
    assert.equal(await cdp.evaluate('document.querySelector("#player-overlay").classList.contains("hidden")'), true);
  });
  await key('Escape');
  await check('Entering live PiP while connecting clears its loading status', async () => {
    mediaMode = 'hold';
    await click('.nav-item[data-section="live"]');
    await click('#live-channels-grid .channel-card');
    await until(loadingVisible, 'live connecting before PiP');
    await click('#btn-osd-back');
    assert.equal(await cdp.evaluate('document.querySelector("#player-overlay").classList.contains("mini-pip-mode")'), true);
    assert.equal(await cdp.evaluate(loadingVisible), false);
    await releaseMedia();
    const message = await cdp.evaluate(loadingMessage);
    await pause(3400);
    assert.equal(await cdp.evaluate(loadingVisible), false);
    assert.equal(await cdp.evaluate(loadingMessage), message);
    await click('#btn-mini-pip-expand');
    await click('#btn-osd-top-exit');
  });
  await check('Recent movies and channels have separate, consistent home shelves', async () => {
    await click('.nav-item[data-section="home"]');
    const rows = await cdp.evaluate(`['recent-media','recent-live'].map(type=>{
      const row=document.querySelector('.home-row[data-shelf-type="'+type+'"]');
      return {type,count:row?.querySelectorAll('.home-row-track > button').length||0,heights:[...(row?.querySelectorAll('.home-row-track > button')||[])].map(e=>e.getBoundingClientRect().height),text:row?.textContent};
    })`);
    for (const row of rows) {
      assert.ok(row.count > 0, JSON.stringify(row));
      assert.ok(Math.max(...row.heights) - Math.min(...row.heights) <= 2, JSON.stringify(row));
    }
    for (const [name, width, height] of [['desktop', 1280, 800], ['mobile', 390, 844]]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await cdp.evaluate('document.querySelector("#section-home").scrollTop=0');
      await pause(150);
      await screenshot('home-recents-' + name);
    }
  });
  await check('No uncaught browser exceptions', async () => assert.deepEqual(pageErrors, []));
}

(async () => {
  try { await main(); }
  catch (error) { console.error(error.stack); results.push({ name: 'Harness', passed: false, error: error.message }); }
  finally {
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ origin, results, pageErrors }, null, 2));
    console.log('Results: ' + path.join(output, 'results.json'));
    if (cdp) { try { await cdp.send('Browser.close'); } catch {} cdp.socket.close(); }
    if (browser) browser.kill();
    process.exitCode = results.some(result => !result.passed) ? 1 : 0;
  }
})();
