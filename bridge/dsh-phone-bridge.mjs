#!/usr/bin/env node
/**
 * TechPulse DSH bridge
 *
 * A loopback-only reverse proxy in front of the running DSH Desktop web GUI,
 * meant to be published to your own Tailscale tailnet with `tailscale serve`.
 * It does three things:
 *
 *   1. finds the DSH web port (Desktop binds 127.0.0.1 with an OS-assigned port);
 *   2. mints the browser-session cookie DSH would otherwise only issue after a
 *      one-time `?token=` exchange — so the phone never needs to paste a token;
 *   3. proxies HTTP and WebSocket traffic to DSH with a loopback Host/Origin.
 *
 * Security: the cookie-signing secret is read from the owner's own
 * `~/.dsh/.credentials.yaml`. Anyone who can read that file can already act as
 * the DSH owner on this machine, so this adds no local privilege. The bridge
 * itself listens on 127.0.0.1 only; `tailscale serve` keeps it inside the
 * tailnet. Never publish this port with `tailscale funnel` or a router rule.
 */
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const LISTEN_HOST = '127.0.0.1';
const LISTEN_PORT = Number(process.env.BRIDGE_PORT ?? 8787);
const DSH_HOME = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
const COOKIE_DAYS = Number(process.env.BRIDGE_COOKIE_DAYS ?? 30);
const AUTH_PREFIX = 'dsh-auth-';
const DSH_MANIFEST_MARK = '"short_name": "DSH"';

let upstreamPort = Number(process.env.DSH_PORT ?? 0) || null;
let cookieName = null;
let cookieValue = null;

const log = (...args) => console.log(new Date().toISOString(), ...args);

function b64url(value) {
  return Buffer.from(value).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function readSigningSecret() {
  const file = path.join(DSH_HOME, '.credentials.yaml');
  const text = fs.readFileSync(file, 'utf8');
  const at = text.indexOf('client-connection/browser-session:');
  if (at === -1) throw new Error(`no client-connection/browser-session record in ${file}`);
  const block = text.slice(at).split('\n').slice(0, 8).join('\n');
  const match = block.match(/secret:\s*([A-Za-z0-9_-]+)/u);
  if (!match) throw new Error('browser-session record has no secret');
  return Buffer.from(match[1], 'base64url');
}

/** Same payload, name, signature and attributes as @deepseek-ai/dsh-client-connection. */
function mintSessionCookie(secret, authority) {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + COOKIE_DAYS * 24 * 60 * 60 * 1000;
  const payload = { version: 1, authority, issuedAt, expiresAt };
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signature = crypto.createHmac('sha256', secret).update(body).digest();
  const name = AUTH_PREFIX + b64url(crypto.createHash('sha256').update(authority).digest());
  const value = `v1.${body}.${b64url(signature)}`;
  return {
    name,
    value,
    header: `${name}=${value}; Max-Age=${COOKIE_DAYS * 86400}; Path=/; Expires=${new Date(expiresAt).toUTCString()}; HttpOnly; SameSite=Strict`,
  };
}

function probeDsh(port, timeoutMs = 400) {
  return new Promise((resolve) => {
    const request = http.get({ host: LISTEN_HOST, port, path: '/manifest.webmanifest', timeout: timeoutMs }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { if (body.length < 4096) body += chunk; });
      response.on('end', () => resolve(response.statusCode === 200 && body.includes(DSH_MANIFEST_MARK)));
    });
    request.on('timeout', () => { request.destroy(); resolve(false); });
    request.on('error', () => resolve(false));
  });
}

async function detectDshPort() {
  const candidates = new Set();
  try {
    const output = execFileSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true });
    for (const line of output.split(/\r?\n/u)) {
      const match = line.match(/TCP\s+127\.0\.0\.1:(\d+)\s+\S+\s+LISTENING/u);
      if (match) candidates.add(Number(match[1]));
    }
  } catch (error) {
    log('netstat failed:', error.message);
  }
  candidates.delete(LISTEN_PORT);
  for (const port of candidates) {
    if (await probeDsh(port)) return port;
  }
  return null;
}

async function ensureUpstream() {
  if (upstreamPort !== null && await probeDsh(upstreamPort)) return upstreamPort;
  const detected = await detectDshPort();
  if (detected !== null) {
    upstreamPort = detected;
    log('DSH web port:', detected);
  } else {
    log('DSH web port not found; will retry on the next request');
  }
  return upstreamPort;
}

function rewriteHeaders(headers, port) {
  const next = { ...headers };
  next.host = `127.0.0.1:${port}`;
  if (typeof next.origin === 'string' && next.origin.length > 0) next.origin = `http://127.0.0.1:${port}`;
  if (typeof next.referer === 'string' && next.referer.length > 0) {
    try {
      const url = new URL(next.referer);
      next.referer = `http://127.0.0.1:${port}${url.pathname}${url.search}`;
    } catch {
      delete next.referer;
    }
  }
  return next;
}

async function proxy(req, res) {
  if (req.url === '/__health') {
    const port = await ensureUpstream();
    const online = port !== null && await probeDsh(port);
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify({ ok: online, port: port ?? null, cookie: cookieName !== null }));
    return;
  }

  const port = await ensureUpstream();
  if (port === null) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('DSH is not running, or its web server is not listening yet.');
    return;
  }
  if (cookieName === null) {
    const authority = `127.0.0.1:${String(port)}`;
    const minted = mintSessionCookie(readSigningSecret(), authority);
    cookieName = minted.name;
    cookieValue = minted.value;
    log('minted browser-session cookie for', authority);
  }
  const hasCookie = typeof req.headers.cookie === 'string' && req.headers.cookie.includes(`${cookieName}=`);
  const headers = rewriteHeaders(req.headers, port);
  if (!hasCookie) {
    headers.cookie = req.headers.cookie === undefined
      ? `${cookieName}=${cookieValue}`
      : `${req.headers.cookie}; ${cookieName}=${cookieValue}`;
  }

  const upstream = http.request({
    host: LISTEN_HOST,
    port,
    method: req.method,
    path: req.url,
    headers,
  }, (response) => {
    const headers = { ...response.headers };
    delete headers['set-cookie'];
    if (!hasCookie) headers['set-cookie'] = [`${cookieName}=${cookieValue}; Max-Age=${COOKIE_DAYS * 86400}; Path=/; Expires=${new Date(Date.now() + COOKIE_DAYS * 86400000).toUTCString()}; HttpOnly; SameSite=Strict`];
    res.writeHead(response.statusCode ?? 502, headers);
    response.pipe(res);
  });
  upstream.on('error', (error) => {
    log('upstream error:', error.message);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('DSH upstream error: ' + error.message);
  });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  proxy(req, res).catch((error) => {
    log('proxy failed:', error.message);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('bridge error: ' + error.message);
  });
});

server.on('upgrade', (req, socket, head) => {
  (async () => {
    const port = await ensureUpstream();
    if (port === null) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      return;
    }
    if (cookieName === null) {
      const minted = mintSessionCookie(readSigningSecret(), `127.0.0.1:${String(port)}`);
      cookieName = minted.name;
      cookieValue = minted.value;
    }
    const headers = rewriteHeaders(req.headers, port);
    if (typeof req.headers.cookie !== 'string' || !req.headers.cookie.includes(`${cookieName}=`)) {
      headers.cookie = req.headers.cookie === undefined
        ? `${cookieName}=${cookieValue}`
        : `${req.headers.cookie}; ${cookieName}=${cookieValue}`;
    }
    const lines = [`GET ${req.url} HTTP/1.1`];
    for (const [key, value] of Object.entries(headers)) {
      if (Array.isArray(value)) for (const item of value) lines.push(`${key}: ${item}`);
      else if (value !== undefined) lines.push(`${key}: ${value}`);
    }
    const upstream = net.connect(port, LISTEN_HOST, () => {
      upstream.write(lines.join('\r\n') + '\r\n\r\n');
      if (head.length > 0) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  })().catch((error) => {
    log('upgrade failed:', error.message);
    socket.destroy();
  });
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  log(`bridge listening on http://${LISTEN_HOST}:${String(LISTEN_PORT)} -> DSH (auto-detected)`);
});

void ensureUpstream();
