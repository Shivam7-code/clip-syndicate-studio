
import { createHmac, timingSafeEqual } from 'node:crypto';

const VALID_PASSWORD = process.env.PASSWORD || 'Clip_Syndicate@03';
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_DURATION = 60 * 60 * 24 * 7;

const UPSTREAM = 'https://rizzmentaltemplate.vercel.app';
const UPSTREAM_SESSION = process.env.UPSTREAM_SESSION || '';

const DEFAULT_CONFIG = {
  tactics: [
    'guilt trip',
    'jealousy test',
    'silent treatment',
    'hot and cold',
    'breadcrumbing',
    '"we need to talk"',
    'friendzone then jealous',
    'double standard',
    'ultimatum',
    'testing if you will chase',
    'playing the victim',
    'threats / blackmail'
  ],
  languages: [
    'English',
    'Spanish',
    'Portuguese (Brazil)',
    'French',
    'German',
    'Italian',
    'Polish',
    'Dutch',
    'Turkish',
    'Romanian',
    'Czech',
    'Swedish',
    'Indonesian',
    'Filipino (Taglish)'
  ],
  tapbacks: ['❤️', '😂', '😮', '😢', '😡', '👍', '👎', '‼️', '❓', '💀', '🔥'],
  moods: [
    'smirk',
    'called-it',
    'shocked',
    'facepalm',
    'laugh',
    'skeptical',
    'thinking',
    'unbothered',
    'phone',
    'confident',
    'serious',
    'exit'
  ],
  models: {
    writer: 'surplus:gpt-6-luna',
    editor: 'surplus:claude-sonnet-5.5'
  }
};

// In-memory ZIP cache. Downloads must reach the same running instance.
const downloadCache = new Map();

function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });

  return res.end(JSON.stringify(data));
}

function parseCookies(req) {
  const result = {};

  for (const part of (req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');

    if (index < 0) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }

  return result;
}

function signSession(payload) {
  return createHmac('sha256', SESSION_SECRET)
    .update(payload)
    .digest('base64url');
}

function createSession() {
  const payload = Buffer.from(
    JSON.stringify({
      exp: Math.floor(Date.now() / 1000) + SESSION_DURATION
    })
  ).toString('base64url');

  return `${payload}.${signSession(payload)}`;
}

function isAuthenticated(req) {
  if (!SESSION_SECRET) return false;

  const token = parseCookies(req).clip_session;

  if (!token) return false;

  const separator = token.lastIndexOf('.');

  if (separator < 1) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = signSession(payload);

  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) return false;

  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return false;

  try {
    const session = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    );

    return Number.isFinite(session.exp) &&
      session.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      return req.body;
    }

    if (Buffer.isBuffer(req.body)) {
      try {
        return JSON.parse(req.body.toString('utf8'));
      } catch {
        return {};
      }
    }

    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
  }

  return new Promise((resolve) => {
    const chunks = [];

    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });

    req.on('error', () => resolve({}));
  });
}

async function readRawBuffer(req) {
  if (Buffer.isBuffer(req.body)) return req.body;

  if (typeof req.body === 'string') {
    return Buffer.from(req.body);
  }

  return new Promise((resolve) => {
    const chunks = [];

    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

function clearSessionCookie() {
  return 'clip_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';
}

function sessionCookie(token) {
  return `clip_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DURATION}`;
}

function isApiPath(pathname, route) {
  return pathname === `/api/${route}` ||
    pathname.endsWith(`/api/${route}`);
}

function isPublicPath(pathname) {
  return (
    isApiPath(pathname, 'login') ||
    isApiPath(pathname, 'logout') ||
    isApiPath(pathname, 'config')
  );
}

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method || 'GET';

  // 1. Login
  if (isApiPath(pathname, 'login') && method === 'POST') {
    const body = await readBody(req);
    const pass = body?.password ?? body?.passcode ?? body?.code;

    if (typeof pass !== 'string' || pass !== VALID_PASSWORD) {
      return sendJson(res, 401, { error: 'Wrong password.' });
    }

    if (!SESSION_SECRET) {
      console.error('SESSION_SECRET is not configured.');
      return sendJson(res, 500, {
        error: 'Server authentication is not configured. Set SESSION_SECRET in deployment settings.'
      });
    }

    const token = createSession();

    return sendJson(
      res,
      200,
      { ok: true },
      { 'Set-Cookie': sessionCookie(token) }
    );
  }

  // 2. Logout
  if (isApiPath(pathname, 'logout')) {
    return sendJson(
      res,
      200,
      { ok: true },
      { 'Set-Cookie': clearSessionCookie() }
    );
  }

  // 3. Public configuration
  if (isApiPath(pathname, 'config')) {
    return sendJson(res, 200, DEFAULT_CONFIG);
  }

  // All remaining API routes require a valid login session.
  if (pathname.startsWith('/api/') && !isPublicPath(pathname)) {
    if (!isAuthenticated(req)) {
      return sendJson(res, 401, {
        error: 'Authentication required. Please sign in again.'
      });
    }
  }

  // 4. Export ZIP
  if (isApiPath(pathname, 'export-zip') && method === 'POST') {
    const buffer = await readRawBuffer(req);

    if (buffer.length === 0) {
      return sendJson(res, 400, { error: 'No ZIP data received.' });
    }

    const requestedName = url.searchParams.get('filename') ||
      'clip-syndicate.zip';

    const safeFilename = requestedName
      .replace(/[\\/"\r\n]/g, '_')
      .slice(0, 150);

    const id = `${Date.now().toString(36)}${Math.random()
      .toString(36).slice(2, 10)}`;

    downloadCache.set(id, {
      buffer,
      filename: safeFilename,
      at: Date.now()
    });

    setTimeout(() => downloadCache.delete(id), 180000);

    return sendJson(res, 200, {
      ok: true,
      id,
      filename: safeFilename
    });
  }

  // 5. Download ZIP
  if (isApiPath(pathname, 'download-zip') && method === 'GET') {
    const id = url.searchParams.get('id');
    const entry = downloadCache.get(id);

    if (!entry) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(
        'Download expired or unavailable. Please export again.'
      );
    }

    const filename = entry.filename;
    const isZip = filename.toLowerCase().endsWith('.zip');

    res.writeHead(200, {
      'Content-Type': isZip ? 'application/zip' : 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': entry.buffer.length,
      'Cache-Control': 'no-store'
    });

    return res.end(entry.buffer);
  }

  // 6. Generate content
  if (isApiPath(pathname, 'generate') && method === 'POST') {
    const body = await readBody(req);

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return sendJson(res, 400, { error: 'Invalid request body.' });
    }

    // Try the upstream service first.
    if (UPSTREAM_SESSION) {
      try {
        const upstreamRes = await fetch(`${UPSTREAM}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: UPSTREAM_SESSION
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20000)
        });

        if (upstreamRes.ok) {
          const data = await upstreamRes.json();
          return sendJson(res, 200, data);
        }

        console.warn(
          'Upstream generate returned HTTP',
          upstreamRes.status
        );
      } catch (err) {
        console.warn(
          'Upstream generate failed:',
          err.message
        );
      }
    }

    // Local fallback generator.
    if (body.mode === 'list') {
      const mockHooks = [
        'She Tried To Make Me Jealous. It Backfired.',
        'She Left Me On Read For Hours… So I Replied Like This.',
        "How To Reply When She Says 'Idc' But Clearly Does.",
        'The 3-Word Reply That Flips The Power Dynamic Instantly.',
        'When She Gives One-Word Answers, Send This.'
      ];

      const count = Math.min(
        5,
        Math.max(1, Number.parseInt(body.count, 10) || 3)
      );

      return sendJson(res, 200, {
        items: mockHooks.slice(0, count),
        model: 'local-fallback'
      });
    }

    if (body.mode === 'draft' || body.mode === 'polish') {
      const mockScript = {
        hook: {
          text: 'She tried to play hard to get, so I gave her a reality check.'
        },
        tactic: body.tactic || 'jealousy test',
        slides: [
          {
            id: 's1',
            type: 'chat',
            reveal: false,
            messages: [
              {
                id: 'm1',
                sender: 'her',
                text: "i'm going to a party tonight with this guy from work"
              },
              {
                id: 'm2',
                sender: 'me',
                text: "sounds fun, don't wait up on texting me"
              }
            ]
          },
          {
            id: 's2',
            type: 'reaction',
            caption: 'When she thought you would panic and get jealous',
            mood: 'smirk'
          },
          {
            id: 's3',
            type: 'chat',
            reveal: false,
            messages: [
              {
                id: 'm3',
                sender: 'her',
                text: 'wait you don’t even care?'
              },
              {
                id: 'm4',
                sender: 'me',
                text: "why would i stress over something that isn't my business? enjoy your night"
              }
            ]
          },
          {
            id: 's4',
            type: 'reaction',
            caption: 'And just like that, the entire dynamic flipped.',
            mood: 'called-it'
          }
        ],
        cta: { text: 'Get the full play-by-play guide in bio.' }
      };

      return sendJson(res, 200, {
        script: mockScript,
        scores: { hook: 9.2, tension: 9.5, payoff: 9.4 },
        model: 'local-fallback'
      });
    }

    if (body.mode === 'rewrite') {
      return sendJson(res, 200, {
        text: "have fun, i'm busy tonight anyway.",
        model: 'local-fallback'
      });
    }

    return sendJson(res, 400, {
      error: 'Unsupported mode.'
    });
  }

  return sendJson(res, 404, { error: 'Not found.' });
}
