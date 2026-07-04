#!/usr/bin/env node

const http = require('http');
const { execFile } = require('child_process');
const path = require('path');

const PORT = Number(process.env.SPEEDPART_QQ_PASTE_PORT || 5299);
const SCRIPT_PATH = process.env.SPEEDPART_QQ_PASTE_SCRIPT ||
  path.join(process.env.HOME, 'Library/Scripts/Speed Part Search/PasteInquiryToQQ.applescript');

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    send(res, 204, {});
    return;
  }

  if (req.url === '/health') {
    send(res, 200, { ok: true });
    return;
  }

  if (req.url !== '/paste' || req.method !== 'POST') {
    send(res, 404, { ok: false, error: 'not_found' });
    return;
  }

  req.resume();
  setTimeout(() => {
    execFile('/usr/bin/osascript', [SCRIPT_PATH], { timeout: 8000 }, (error) => {
      if (error) {
        send(res, 500, { ok: false, error: error.message });
        return;
      }
      send(res, 200, { ok: true });
    });
  }, 900);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Speed Part Search QQ paste helper listening on http://127.0.0.1:${PORT}`);
});
