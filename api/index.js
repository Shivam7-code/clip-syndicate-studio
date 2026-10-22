const VALID_PASSWORD = process.env.PASSWORD || 'Clip_Syndicate@03';
const UPSTREAM = 'https://rizzmentaltemplate.vercel.app';
const UPSTREAM_SESSION = process.env.UPSTREAM_SESSION || 'rizz_session=1795237032.VgBlsseSrHH9dlENFdNabGLWEF2r1JF-XiYF-7lZJiQ';

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

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch {
      return Promise.resolve({});
    }
  }
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      try {
        resolve(buffer.length ? JSON.parse(buffer.toString('utf8')) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function readRawBuffer(req) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(Buffer.alloc(0)));
  });
}

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // 1. /api/login
  if (pathname.endsWith('/login') && req.method === 'POST') {
    const body = await readBody(req);
    if (body.password === VALID_PASSWORD) {
      const sessionVal = '1795237032.VgBlsseSrHH9dlENFdNabGLWEF2r1JF-XiYF-7lZJiQ';
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `rizz_session=${sessionVal}; Path=/; SameSite=Lax; Max-Age=2592000`,
      });
      return res.end(JSON.stringify({ ok: true }));
    }
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Wrong password.' }));
  }

  // 2. /api/logout
  if (pathname.endsWith('/logout')) {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': 'rizz_session=; Path=/; Max-Age=0',
    });
    return res.end(JSON.stringify({ ok: true }));
  }

  // 3. /api/config
  if (pathname.endsWith('/config')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(DEFAULT_CONFIG));
  }

  // 4. /api/export-zip
  if (pathname.endsWith('/export-zip') && req.method === 'POST') {
    const buffer = await readRawBuffer(req);
    const filename = url.searchParams.get('filename') || 'clip-syndicate.zip';
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    downloadCache.set(id, { buffer, filename, at: Date.now() });
    setTimeout(() => downloadCache.delete(id), 180000);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, id, filename }));
  }

  // 5. /api/download-zip
  if (pathname.endsWith('/download-zip') && req.method === 'GET') {
    const id = url.searchParams.get('id');
    const entry = downloadCache.get(id);
    if (!entry) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Download link expired or not found. Please click Export again.');
    }
    const filename = url.searchParams.get('filename') || entry.filename;
    const isZip = filename.endsWith('.zip');
    res.writeHead(200, {
      'Content-Type': isZip ? 'application/zip' : 'image/png',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': entry.buffer.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    return res.end(entry.buffer);
  }

  // 6. /api/generate
  if (pathname.endsWith('/generate') && req.method === 'POST') {
    const body = await readBody(req);
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

    // Local fallback generator
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

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}
