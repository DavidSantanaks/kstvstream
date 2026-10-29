const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3099);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');

// Simple in-memory LRU cache for API responses to make navigation instantaneous
const apiCache = new Map();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const MAX_CACHE_ENTRIES = 150;

function getCache(key) {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    apiCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  if (apiCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = apiCache.keys().next().value;
    apiCache.delete(oldestKey);
  }
  apiCache.set(key, { ts: Date.now(), data });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
}

function sendJson(res, status, payload) {
  setCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

// Resolve 302 redirect on the IPTV panel without consuming the single-use CDN token
async function resolveStreamUrl(targetUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'KS-TV-Player/1.0',
        'Accept': '*/*'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.body) {
      res.body.cancel().catch(() => {});
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (location) {
        return new URL(location, targetUrl).href;
      }
    }
    return targetUrl;
  } catch (err) {
    clearTimeout(timeout);
    return targetUrl;
  }
}

// Parse standard M3U playlist (up to 3000 items for non-Xtream static M3Us)
function parseM3uContent(m3uText, limit = 3000) {
  const lines = m3uText.split(/\r?\n/);
  const items = [];
  const categoriesMap = new Map();
  let current = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      const nameMatch = line.match(/,(.+)$/);
      const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
      const groupMatch = line.match(/group-title="([^"]*)"/i);
      const idMatch = line.match(/tvg-id="([^"]*)"/i);

      const groupName = (groupMatch && groupMatch[1] ? groupMatch[1].trim() : 'Geral') || 'Geral';
      if (!categoriesMap.has(groupName)) {
        categoriesMap.set(groupName, String(categoriesMap.size + 1));
      }

      current = {
        name: nameMatch ? nameMatch[1].trim() : 'Canal sem nome',
        stream_icon: logoMatch ? logoMatch[1].trim() : '',
        epg_channel_id: idMatch ? idMatch[1].trim() : '',
        category_id: categoriesMap.get(groupName),
        category_name: groupName
      };
    } else if (!line.startsWith('#') && current) {
      current.direct_source = line;
      current.stream_id = items.length + 1;
      const lower = line.toLowerCase();
      if (lower.includes('/movie/') || (lower.endsWith('.mp4') && !lower.includes('/series/'))) {
        current.stream_type = 'movie';
      } else if (lower.includes('/series/')) {
        current.stream_type = 'series';
      } else {
        current.stream_type = 'live';
      }
      items.push(current);
      current = null;
      if (items.length >= limit) break;
    }
  }

  const categories = Array.from(categoriesMap.entries()).map(([category_name, category_id]) => ({
    category_id,
    category_name
  }));

  return { categories, items };
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 0. Clear proxy cache when user switches account / source
  if (pathname === '/api/clear-cache') {
    apiCache.clear();
    return sendJson(res, 200, { success: true, message: 'Cache limpo com sucesso' });
  }

  // 1. Proxy Xtream API calls with smart caching
  if (pathname === '/api/xtream') {
    const targetUrl = parsedUrl.searchParams.get('url');
    const noCache = parsedUrl.searchParams.get('nocache') === '1';
    if (!targetUrl) {
      return sendJson(res, 400, { error: 'Parâmetro url obrigatório' });
    }

    const isAuthCall = !targetUrl.includes('action=');
    if (!noCache && !isAuthCall) {
      const cached = getCache(targetUrl);
      if (cached) {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Cache': 'HIT'
        });
        return res.end(cached);
      }
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const upstream = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'KS-TV-Player/1.0',
          'Accept': 'application/json, text/plain, */*'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);

      const text = await upstream.text();
      if (upstream.ok && !isAuthCall && text.length < 5 * 1024 * 1024) {
        setCache(targetUrl, text);
      }

      res.writeHead(upstream.status, {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Cache': 'MISS'
      });
      return res.end(text);
    } catch (err) {
      return sendJson(res, 502, {
        error: 'Falha ao conectar ao servidor IPTV',
        details: err.message
      });
    }
  }

  // 2. Resolve 302 redirect for Live (.m3u8 / .ts) and VOD (.mp4 / .mkv) streams
  if (pathname === '/api/resolve') {
    const targetUrl = parsedUrl.searchParams.get('url');
    if (!targetUrl) {
      return sendJson(res, 400, { error: 'Parâmetro url obrigatório' });
    }
    const resolvedUrl = await resolveStreamUrl(targetUrl);
    return sendJson(res, 200, { url: targetUrl, resolvedUrl });
  }

  // 3. Parse generic M3U playlist
  if (pathname === '/api/parse-m3u') {
    const targetUrl = parsedUrl.searchParams.get('url');
    if (!targetUrl) {
      return sendJson(res, 400, { error: 'Parâmetro url obrigatório' });
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const upstream = await fetch(targetUrl, {
        headers: { 'User-Agent': 'KS-TV-Player/1.0' },
        signal: controller.signal
      });
      clearTimeout(timeout);
      const text = await upstream.text();
      const parsed = parseM3uContent(text, 4000);
      return sendJson(res, 200, parsed);
    } catch (err) {
      return sendJson(res, 502, { error: 'Não foi possível carregar a lista M3U', details: err.message });
    }
  }

  // 4. Serve static frontend assets
  let safePath = path.normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

function getLocalIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

server.listen(PORT, HOST, () => {
  const ips = getLocalIps();
  console.log('\n============================================================');
  console.log(' KS TV-Stream (Fire TV Stick 4K & Web)');
  console.log('============================================================');
  console.log(` -> No Computador:       http://localhost:${PORT}`);
  if (HOST === '0.0.0.0') ips.forEach(ip => {
    console.log(` -> No Fire TV Stick 4K: http://${ip}:${PORT}`);
  });
  console.log('============================================================\n');
});
