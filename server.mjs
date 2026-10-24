import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const UPSTREAM = 'https://rizzmentaltemplate.vercel.app';
const UPSTREAM_SESSION = 'rizz_session=1795237032.VgBlsseSrHH9dlENFdNabGLWEF2r1JF-XiYF-7lZJiQ';
const VALID_PASSWORD = process.env.PASSWORD || 'Clip_Syndicate@03';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
};

const DEFAULT_CONFIG = {
  tactics: [
    "guilt trip", "jealousy test", "silent treatment", "hot and cold", "breadcrumbing",
    "\"we need to talk\"", "friendzone then jealous", "double standard", "ultimatum",
    "testing if you will chase", "playing the victim", "threats / blackmail"
  ],
  languages: [
    "English", "Spanish", "Portuguese (Brazil)", "French", "German", "Italian",
    "Polish", "Dutch", "Turkish", "Romanian", "Czech", "Swedish", "Indonesian", "Filipino (Taglish)"
  ],
  tapbacks: ["❤️","😂","😮","😢","😡","👍","👎","‼️","❓","💀","🔥"],
  moods: ["smirk","called-it","shocked","facepalm","laugh","skeptical","thinking","unbothered","phone","confident","serious","exit"],
  models: {
    writer: "surplus:gpt-6-luna",
    editor: "surplus:claude-sonnet-5.5"
  }
};

const downloadCache = new Map();

function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (!rc) return list;
  rc.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    list[parts.shift().trim()] = decodeURI(parts.join('='));
  });
  return list;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

export async function handleRequest(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const cookies = parseCookies(req);
  const isAuthenticated = Boolean(cookies.rizz_session) || parsedUrl.searchParams.has('authed');

  console.log(`[${new Date().toISOString().slice(11, 19)}] ${req.method} ${pathname}`);

  // API Routes
  if (pathname === '/api/login' && req.method === 'POST') {
    const body = await readBody(req);
    const pass = (body.password || body.passcode || body.code || '').trim();
    if (pass === VALID_PASSWORD.trim()) {
      const sessionVal = '1795237032.VgBlsseSrHH9dlENFdNabGLWEF2r1JF-XiYF-7lZJiQ';
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `rizz_session=${sessionVal}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
      });
      return res.end(JSON.stringify({ ok: true }));
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Wrong password.' }));
    }
  }

  if (pathname === '/api/logout') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'rizz_session=; Path=/; HttpOnly; Max-Age=0',
    });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (pathname === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(DEFAULT_CONFIG));
  }

  // Relay endpoint for ZIP and file downloads
  if (pathname === '/api/export-zip' && req.method === 'POST') {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const filename = parsedUrl.searchParams.get('filename') || 'rizz-slideshow.zip';
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      downloadCache.set(id, { buffer, filename, at: Date.now() });
      setTimeout(() => downloadCache.delete(id), 180000);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id, filename }));
    });
    return;
  }

  if (pathname === '/api/download-zip' && req.method === 'GET') {
    const id = parsedUrl.searchParams.get('id');
    const entry = downloadCache.get(id);
    if (!entry) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Download link expired or not found. Please click Export again.');
    }
    const filename = parsedUrl.searchParams.get('filename') || entry.filename;
    const isZip = filename.endsWith('.zip');
    res.writeHead(200, {
      'Content-Type': isZip ? 'application/zip' : 'image/png',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': entry.buffer.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    });
    res.end(entry.buffer);
    return;
  }

  if (pathname === '/api/generate' && req.method === 'POST') {
    const body = await readBody(req);

    // Try forwarding to upstream live API with session cookie
    try {
      const upstreamRes = await fetch(`${UPSTREAM}/api/generate`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'cookie': UPSTREAM_SESSION,
        },
        body: JSON.stringify(body),
      });

      if (upstreamRes.ok) {
        const data = await upstreamRes.json();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(data));
      }
    } catch (err) {
      console.warn('Upstream generate failed, falling back to local generator:', err.message);
    }

    // Local fallback generator for offline mode
    if (body.mode === 'list') {
      const mockHooks = [
        "She Tried To Make Me Jealous. It Backfired.",
        "She Left Me On Read For Hours… So I Replied Like This.",
        "How To Reply When She Says 'Idc' But Clearly Does.",
        "The 3-Word Reply That Flips The Power Dynamic Instantly.",
        "When She Gives One-Word Answers, Send This."
      ];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ items: mockHooks.slice(0, body.count || 3), model: 'local-fallback' }));
    }

    if (body.mode === 'draft' || body.mode === 'polish') {
      const mockScript = {
        hook: { text: "She tried to play hard to get, so I gave her a reality check." },
        tactic: body.tactic || "jealousy test",
        slides: [
          {
            id: "s1",
            type: "chat",
            reveal: false,
            messages: [
              { id: "m1", sender: "her", text: "i'm going to a party tonight with this guy from work" },
              { id: "m2", sender: "me", text: "sounds fun, don't wait up on texting me" }
            ]
          },
          {
            id: "s2",
            type: "reaction",
            caption: "When she thought you would panic and get jealous",
            mood: "smirk"
          },
          {
            id: "s3",
            type: "chat",
            reveal: false,
            messages: [
              { id: "m3", sender: "her", text: "wait you don't even care?" },
              { id: "m4", sender: "me", text: "why would i stress over something that isn't my business? enjoy your night" }
            ]
          },
          {
            id: "s4",
            type: "reaction",
            caption: "And just like that, the entire dynamic flipped.",
            mood: "called-it"
          }
        ],
        cta: { text: "Get the full play-by-play guide in bio." }
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ script: mockScript, scores: { hook: 9.2, tension: 9.5, payoff: 9.4 }, model: 'local-fallback' }));
    }

    if (body.mode === 'rewrite') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ text: "have fun, i'm busy tonight anyway.", model: 'local-fallback' }));
    }

    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Unsupported mode' }));
  }

  // Auth gate for root
  if (pathname === '/' || pathname === '/index.html') {
    if (!isAuthenticated) {
      res.writeHead(302, { 'Location': '/login.html' });
      return res.end();
    }
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  // Static files
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(__dirname, safePath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
    });
    return fs.createReadStream(filePath).pipe(res);
  }

  // 404 fallback
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

const server = http.createServer(handleRequest);
export default handleRequest;

if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  Clip Syndicate Local Server is running!`);
    console.log(`  Local URL:    http://localhost:${PORT}`);
    console.log(`  Direct App:   http://localhost:${PORT}/?authed=true`);
    console.log(`  Login Page:   http://localhost:${PORT}/login.html`);
    console.log(`  Password:     ${VALID_PASSWORD}`);
    console.log(`=======================================================`);
  });
}
