/* =========================================================================
 * BLACKOUT :: server.js
 * Static file server + WebSocket relay for the remote controller.
 * Usage:  npm start   (or:  node server.js)
 * ========================================================================= */
'use strict';
const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.wav':  'audio/wav',
  '.webm': 'video/webm',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.ttf':  'font/ttf',
  '.otf':  'font/otf',
};

/* ----------------------------- HTTP server ----------------------------- */
const server = http.createServer((req, res) => {
  let url = (req.url || '/').split('?')[0].split('#')[0];
  if (url === '/') url = '/index.html';
  url = decodeURIComponent(url);

  // Security: block directory traversal
  if (url.includes('..')) { res.writeHead(403); res.end('Forbidden'); return; }

  const filePath = path.join(ROOT, url);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

/* ----------------------------- WebSocket ------------------------------ */
const wss = new WebSocketServer({ server });
const pool = { game: new Set(), controller: new Set() };

wss.on('connection', (ws, req) => {
  const params = new URL(req.url || '/', 'http://localhost').searchParams;
  const role   = params.get('role') === 'controller' ? 'controller' : 'game';
  pool[role].add(ws);

  const summary = () => `(game: ${pool.game.size}, ctrl: ${pool.controller.size})`;
  console.log(`  ✚  ${role} connected ${summary()}`);

  ws.on('message', (raw) => {
    const msg = typeof raw === 'string' ? raw : raw.toString();
    const targets = role === 'controller' ? pool.game : pool.controller;
    targets.forEach(c => { if (c.readyState === 1) c.send(msg); });
  });

  ws.on('close', () => {
    pool[role].delete(ws);
    console.log(`  ✖  ${role} disconnected ${summary()}`);
  });

  ws.on('error', () => { pool[role].delete(ws); });
});

function startServer(port = PORT, cb) {
  server.listen(port, '0.0.0.0', () => {
    const nets = os.networkInterfaces();
    let ip = 'localhost';
    for (const name in nets) {
      for (const n of nets[name]) {
        if (n.family === 'IPv4' && !n.internal) { ip = n.address; break; }
      }
    }
    console.log('');
    console.log('  ╔═══════════════════════════════════════╗');
    console.log('  ║         🎮  BLACKOUT SERVER            ║');
    console.log('  ╠═══════════════════════════════════════╣');
    console.log(`  ║  Game:  http://${ip}:${port}`.padEnd(43) + '║');
    console.log(`  ║  Lab:   http://${ip}:${port}/boss-lab.html`.padEnd(43) + '║');
    console.log('  ╚═══════════════════════════════════════╝');
    console.log('');
    if (cb) cb(null, { ip, port });
  });

  server.once('error', (err) => {
    if (cb) cb(err);
    else console.error('Server error:', err);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer, server, wss, PORT };
