// Canvas renderer for every slide. The live preview, the filmstrip and the exported PNG all come
// from this one function, so what you see is exactly what you get, in every browser. (Turning DOM
// into an image via SVG/foreignObject renders fonts, outlines and images differently per browser.)
import { THEMES, CAPTION_FONTS, PHOTO_ASPECTS, DEFAULT_CAPTION, EMOJI_RE, emojiUrls } from './slides.js';

export const W = 480;
export const H = 853;
const INTER = 'Inter, sans-serif';
const POP = 'Poppins, Inter, sans-serif';

// ---------------------------------------------------------------- assets
const images = new Map();
export function loadImage(url) {
  if (!url) return Promise.resolve(null);
  if (!images.has(url)) {
    images.set(
      url,
      new Promise((resolve) => {
        const im = new Image();
        if (!/^(blob|data):/.test(url)) im.crossOrigin = 'anonymous'; // keep the canvas exportable
        im.onload = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = url;
      }),
    );
  }
  return images.get(url);
}
const emojis = new Map();
function loadEmoji(e) {
  if (!emojis.has(e)) {
    const [a, b] = emojiUrls(e);
    emojis.set(e, loadImage(a).then((im) => im || loadImage(b)));
  }
  return emojis.get(e);
}
const ready = new Map(); // emoji -> image, filled before drawing

async function prepare(fonts, texts) {
  await Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => {})));
  const found = new Set();
  for (const t of texts) for (const part of String(t || '').split(new RegExp(EMOJI_RE.source, 'gu')).filter((_, i) => i % 2)) found.add(part);
  await Promise.all([...found].map(async (e) => ready.set(e, await loadEmoji(e))));
}

// ---------------------------------------------------------------- text layout
const EMOJI_W = 1.15; // emoji box, in em (matches the previous DOM preview)

/** Greedy word wrap with inline emoji. Honours "\n". Returns [{ items, w }]. */
function layout(ctx, text, maxW, size) {
  const space = ctx.measureText(' ').width;
  const lines = [];
  for (const para of String(text ?? '').split('\n')) {
    let line = { items: [], w: 0 };
    for (const word of para.split(' ')) {
      if (!word) continue;
      let items = word.split(new RegExp(EMOJI_RE.source, 'gu')).flatMap((s, i) => {
        if (!s) return [];
        return i % 2 ? [{ e: s, w: size * (EMOJI_W + 0.06) }] : [{ s, w: ctx.measureText(s).width }];
      });
      let ww = items.reduce((a, b) => a + b.w, 0);
      // a single word longer than the line: hard-break it by characters
      while (ww > maxW && items.length === 1 && items[0].s && items[0].s.length > 1) {
        let cut = items[0].s.length;
        while (cut > 1 && ctx.measureText(items[0].s.slice(0, cut)).width > maxW - (line.items.length ? line.w + space : 0)) cut--;
        const head = { s: items[0].s.slice(0, cut), w: ctx.measureText(items[0].s.slice(0, cut)).width };
        if (line.items.length) lines.push(line);
        lines.push({ items: [head], w: head.w });
        line = { items: [], w: 0 };
        items = [{ s: items[0].s.slice(cut), w: ctx.measureText(items[0].s.slice(cut)).width }];
        ww = items[0].w;
      }
      if (!line.items.length) line = { items: [...items], w: ww };
      else if (line.w + space + ww <= maxW + 0.5) line = { items: [...line.items, { s: ' ', w: space }, ...items], w: line.w + space + ww };
      else {
        lines.push(line);
        line = { items: [...items], w: ww };
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Draws laid-out lines; `cx` = line centre (align centre) or left edge (align left). */
function drawLines(ctx, lines, { x, y, lh, size, align = 'left', pass = 'fill' }) {
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    let cx = align === 'center' ? x - line.w / 2 : x;
    const cy = y + i * lh + lh / 2;
    for (const it of line.items) {
      if (it.s != null) {
        if (pass === 'stroke') ctx.strokeText(it.s, cx, cy);
        else if (pass === 'fill') ctx.fillText(it.s, cx, cy);
      } else if (pass === 'emoji' || pass === 'fill') {
        const im = ready.get(it.e);
        const es = size * EMOJI_W;
        if (im) ctx.drawImage(im, cx + size * 0.03, cy - es / 2 + size * 0.02, es, es);
      }
      cx += it.w;
    }
  });
}

// ---------------------------------------------------------------- shapes
function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}
function rrCustom(ctx, x, y, w, h, { tl = 0, tr = 0, br = 0, bl = 0 }) {
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}
function ellipseGlow(ctx, rect, cx, cy, rx, ry, stops) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g;
  ctx.fillRect(-rx * 3, -rx * 3, rx * 6, rx * 6);
  ctx.restore();
}
function cover(ctx, im, x, y, w, h) {
  const s = Math.max(w / im.width, h / im.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, y, w, h);
}
const path = (d) => new Path2D(d);

// Theme colours that were CSS gradients in the DOM version.
const PAINT = {
  dark: { emptyIn: '#2c2b31', emptyOut: '#161619', cardIn: '#2a2140', cardOut: '#141219' },
  light: { emptyIn: '#d9d8e0', emptyOut: '#bdbcc6', cardIn: '#f1ecff', cardOut: '#e6e3f0' },
};

// ---------------------------------------------------------------- slides
function capFont(cs, px) {
  const f = CAPTION_FONTS[cs.font] || CAPTION_FONTS.tiktok;
  return { font: `${f.weight} ${px}px ${f.family}`, family: f.family, weight: f.weight };
}

function drawCaption(ctx, text, { cs, px, color, cx, top, bottom, maxW, align = 'middle', outline }) {
  const { font } = capFont(cs, px);
  ctx.font = font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(cs.font === 'bebas' ? 0.5 : 0) + (outline > 0 ? 0.4 : 0)}px`;
  const lines = layout(ctx, text, maxW, px);
  const lh = px * 1.18;
  const th = lines.length * lh;
  const y = align === 'lower' ? bottom - th : top + (bottom - top - th) / 2;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  if (outline > 0) {
    // Outline behind the fill (like paint-order: stroke fill): visible width = outline px.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = outline * 2;
    drawLines(ctx, lines, { x: cx, y, lh, size: px, align: 'center', pass: 'stroke' });
    ctx.restore();
    ctx.fillStyle = color;
    drawLines(ctx, lines, { x: cx, y, lh, size: px, align: 'center', pass: 'fill' });
  } else {
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    drawLines(ctx, lines, { x: cx, y, lh, size: px, align: 'center', pass: 'fill' });
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 0;
    drawLines(ctx, lines, { x: cx, y, lh, size: px, align: 'center', pass: 'fill' });
    ctx.restore();
  }
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

async function photo(ctx, s, t, p) {
  const cs = { ...DEFAULT_CAPTION, ...s.cs };
  const big = !!s.big;
  const px = (big ? 34 : 28) * (cs.size || 1);
  const capF = capFont(cs, px);
  await prepare([capF.font, '600 12px Inter'], [s.caption]);
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, H);
  if (s.textOnly) {
    const tpx = (big ? 36 : 30) * (cs.size || 1);
    await prepare([capFont(cs, tpx).font], []);
    drawCaption(ctx, s.caption, { cs, px: tpx, color: t.text, cx: W / 2, top: 0, bottom: H, maxW: W - 80, outline: s.theme === 'light' ? 0 : cs.outline });
    return;
  }
  const h = PHOTO_ASPECTS[cs.aspect] || PHOTO_ASPECTS['3:4'];
  const top = H / 2 + (s.shift || 0) - h / 2;
  const im = await loadImage(s.image);
  if (im) cover(ctx, im, 0, top, W, h);
  else {
    ctx.fillStyle = p.emptyOut;
    ctx.fillRect(0, top, W, h);
    ellipseGlow(ctx, { x: 0, y: top, w: W, h }, W / 2, top + h * 0.4, W * 0.85, h * 0.65, [
      [0, p.emptyIn],
      [1, p.emptyOut],
    ]);
  }
  drawCaption(ctx, s.caption, {
    cs,
    px,
    color: '#fff',
    cx: W / 2,
    top,
    bottom: cs.pos === 'lower' ? top + h - W * 0.13 : top + h,
    align: cs.pos === 'lower' ? 'lower' : 'middle',
    maxW: W - 44,
    outline: Number(cs.outline ?? 3),
  });
  if (!im && s.hint) {
    ctx.font = '600 12px Inter, sans-serif';
    const tw = ctx.measureText('+ drop photo').width + 22;
    const bx = W - 10 - tw;
    const by = top + h - 10 - 26;
    rr(ctx, bx, by, tw, 26, 13);
    ctx.fillStyle = 'rgba(183,169,255,0.18)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(183,169,255,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#d9d2ff';
    ctx.textBaseline = 'middle';
    ctx.fillText('+ drop photo', bx + 11, by + 13);
  }
}

async function chat(ctx, s, t) {
  const size = s.size || 19;
  await prepare([`400 ${size}px Inter`], s.msgs.map((m) => m.text).concat(s.msgs.map((m) => m.reaction)));
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.font = `400 ${size}px ${INTER}`;
  const padX = size * 0.8;
  const padY = size * 0.5;
  const lh = size * 1.3;
  const maxBubble = (W - 20) * 0.72;
  const rows = s.msgs.map((m, i) => {
    const lines = layout(ctx, m.text || (m.sender === 'me' ? 'my reply…' : 'her message…'), maxBubble - padX * 2, size);
    const w = Math.min(maxBubble, Math.max(...lines.map((l) => l.w)) + padX * 2);
    const h = lines.length * lh + padY * 2;
    const mt = s.msgs[i - 1]?.sender === m.sender ? 5 : 9;
    const mb = m.reaction ? size * 0.95 : 0;
    return { m, lines, w, h, mt, mb };
  });
  const stripH = 8 + rows.reduce((a, r) => a + r.mt + r.h + r.mb, 0) + 12;
  const top = H / 2 + (s.shift || 0) - stripH / 2;
  ctx.fillStyle = t.strip;
  ctx.fillRect(0, top, W, stripH);
  let y = top + 8;
  for (const r of rows) {
    y += r.mt;
    const mine = r.m.sender === 'me';
    const x = mine ? W - 10 - r.w : 10;
    rr(ctx, x, y, r.w, r.h, size * 1.1);
    ctx.fillStyle = mine ? t.me : t.her;
    ctx.fill();
    ctx.fillStyle = mine ? t.meText : t.herText;
    ctx.font = `400 ${size}px ${INTER}`;
    drawLines(ctx, r.lines, { x: x + padX, y: y + padY, lh, size });
    if (r.m.reaction) {
      // Instagram-style reaction pill hanging off the bubble's outer bottom corner
      const bw = Math.max(2, size * 0.16);
      const es = size * 0.9;
      const ph = size * 1.55 + bw * 2;
      const pw = es + size * 0.38 * 2 + bw * 2;
      const px = mine ? x + r.w - size * 0.55 - pw : x + size * 0.55;
      const py = y + r.h + size * 1.15 - ph;
      rr(ctx, px, py, pw, ph, ph / 2);
      ctx.fillStyle = t.strip;
      ctx.fill();
      rr(ctx, px + bw, py + bw, pw - bw * 2, ph - bw * 2, (ph - bw * 2) / 2);
      ctx.fillStyle = t.pill;
      ctx.fill();
      const im = ready.get(r.m.reaction);
      if (im) ctx.drawImage(im, px + pw / 2 - es / 2, py + ph / 2 - es / 2, es, es);
    }
    y += r.h + r.mb;
  }
}

const RIZZ_TXT = '#0c0b10';
async function rizz(ctx, s, t) {
  const reply = s.reply || 'RIZZ reply…';
  const replySize = reply.length > 90 ? 19 : reply.length > 50 ? 21 : 23;
  await prepare(['400 16px Inter', '700 22px Poppins', `600 ${replySize}px Poppins`], [reply, '👇', ...s.context.map((m) => m.text)]);
  const [wm] = await Promise.all([loadImage('/brand/wordmark.png')]);
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, H);

  // measure everything first so the card can be centred
  ctx.font = `400 16.5px ${INTER}`;
  const bubbles = s.context.map((m) => {
    const lines = layout(ctx, m.text, 336 * 0.88 - 36, 16.5);
    const w = Math.min(336 * 0.88, Math.max(...lines.map((l) => l.w)) + 36);
    return { m, lines, w, h: lines.length * 16.5 * 1.32 + 22 };
  });
  const ctxH = bubbles.length ? 18 + bubbles.reduce((a, b) => a + b.h, 0) + 14 * (bubbles.length - 1) + 20 : 0;
  ctx.font = `600 ${replySize}px ${POP}`;
  const replyLines = layout(ctx, reply, 436 - 64 - 26, replySize);
  const replyH = 24 + replyLines.length * replySize * 1.34 + 26;
  const divH = 33;
  const cardH = 14 + 62 + (bubbles.length ? 20 + ctxH : 0) + 30 + divH + 24 + replyH + 22 + 16 + 18;
  const top = H / 2 + (s.shift || 0) - cardH / 2;

  // pastel app background
  const g = ctx.createLinearGradient(0, top, 0, top + cardH);
  g.addColorStop(0, '#ddd6ea');
  g.addColorStop(0.45, '#e6deef');
  g.addColorStop(1, '#dfe3f0');
  ctx.fillStyle = g;
  ctx.fillRect(0, top, W, cardH);
  const rect = { x: 0, y: top, w: W, h: cardH };
  ellipseGlow(ctx, rect, 0, top + cardH * 0.75, W * 0.7, cardH * 0.45, [[0, 'rgba(176,226,232,0.85)'], [0.7, 'rgba(176,226,232,0)']]);
  ellipseGlow(ctx, rect, W, top + cardH * 0.25, W * 0.7, cardH * 0.5, [[0, 'rgba(240,214,236,0.9)'], [0.7, 'rgba(240,214,236,0)']]);
  ellipseGlow(ctx, rect, W / 2, top + cardH, W * 0.8, cardH * 0.5, [[0, 'rgba(214,206,246,0.9)'], [0.7, 'rgba(214,206,246,0)']]);

  // header: back chevron, wordmark, plus
  let y = top + 14;
  ctx.save();
  ctx.translate(20, y + 13);
  ctx.scale(30 / 34, 36 / 40);
  const chev = path('M24 6 L10 20 L24 34');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#17141c';
  ctx.lineWidth = 10;
  ctx.stroke(chev);
  const cg = ctx.createLinearGradient(0, 0, 34, 40);
  cg.addColorStop(0, '#d9c7f4');
  cg.addColorStop(1, '#a99cf6');
  ctx.strokeStyle = cg;
  ctx.lineWidth = 5;
  ctx.stroke(chev);
  ctx.restore();
  ctx.save();
  ctx.translate(W - 22 - 34, y + 14);
  ctx.scale(34 / 40, 34 / 40);
  const plus = path('M20 6 V34 M6 20 H34');
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#17141c';
  ctx.lineWidth = 11;
  ctx.stroke(plus);
  ctx.strokeStyle = '#f4f1f8';
  ctx.lineWidth = 5;
  ctx.stroke(plus);
  ctx.restore();
  if (wm) {
    const ww = 275;
    const wh = (ww * wm.height) / wm.width;
    const free = W - 20 - 22 - 30 - 34 - ww;
    ctx.drawImage(wm, 20 + 30 + free / 2, y + (62 - wh) / 2, ww, wh);
  } else {
    ctx.save();
    ctx.font = 'italic 900 36px "Archivo", "TikTok Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = 'RIZZ APP';
    const tx = W / 2;
    const ty = y + 31;
    ctx.strokeStyle = '#141218';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, tx, ty);
    const grad = ctx.createLinearGradient(tx - 70, ty, tx + 70, ty);
    grad.addColorStop(0, '#ffd3e4');
    grad.addColorStop(0.5, '#dcc6f1');
    grad.addColorStop(1, '#ada9ff');
    ctx.fillStyle = grad;
    ctx.fillText(text, tx, ty);
    ctx.restore();
  }
  y += 62;

  // the conversation card
  if (bubbles.length) {
    y += 20;
    ctx.save();
    ctx.shadowColor = 'rgba(40,20,80,0.35)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 10;
    rr(ctx, 56, y, 368, ctxH, 28);
    const cg2 = ctx.createLinearGradient(0, y, 0, y + ctxH);
    cg2.addColorStop(0, '#211f26');
    cg2.addColorStop(0.55, '#0a0a0c');
    cg2.addColorStop(1, '#0a0a0c');
    ctx.fillStyle = cg2;
    ctx.fill();
    ctx.restore();
    let by = y + 18;
    for (const b of bubbles) {
      const mine = b.m.sender === 'me';
      const bx = mine ? 56 + 16 + 336 - b.w : 56 + 16;
      rr(ctx, bx, by, b.w, b.h, 24);
      ctx.fillStyle = mine ? '#7d3be3' : '#2c2b31';
      ctx.fill();
      ctx.fillStyle = '#f4f3f7';
      ctx.font = `400 16.5px ${INTER}`;
      drawLines(ctx, b.lines, { x: bx + 18, y: by + 11, lh: 16.5 * 1.32, size: 16.5 });
      by += b.h + 14;
    }
    y += ctxH;
  }

  // "👇 AI generated RIZZ 👇"
  y += 30;
  ctx.font = `700 22px ${POP}`;
  const label = 'AI generated RIZZ';
  const lw = ctx.measureText(label).width;
  const es = 22 * 1.05;
  const groupW = es + 7 + lw + 7 + es;
  const gx = W / 2 - groupW / 2;
  const cy = y + divH / 2;
  ctx.fillStyle = '#8e8a98';
  ctx.fillRect(32, cy - 0.75, gx - 10 - 32, 1.5);
  ctx.fillRect(gx + groupW + 10, cy - 0.75, W - 32 - (gx + groupW + 10), 1.5);
  const hand = ready.get('👇');
  if (hand) {
    ctx.drawImage(hand, gx, cy - es / 2, es, es);
    ctx.drawImage(hand, gx + groupW - es, cy - es / 2, es, es);
  }
  ctx.fillStyle = '#0e0d12';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, gx + es + 7, cy + 1);
  y += divH;

  // reply card + copy icon + bubble tail
  y += 24;
  ctx.save();
  ctx.shadowColor = 'rgba(60,40,110,0.18)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  rr(ctx, 22, y, 436, replyH, 28);
  ctx.fillStyle = 'rgba(250,248,252,0.86)';
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(22 + 436 - 7 - 24, y + replyH - 20);
  ctx.scale(24 / 26, 20 / 22);
  ctx.fillStyle = 'rgba(250,248,252,0.86)';
  ctx.fill(path('M0 0 H10 C10 10 15 18 26 22 C15 22 7 20 0 14 Z'));
  ctx.restore();
  ctx.fillStyle = RIZZ_TXT;
  ctx.font = `600 ${replySize}px ${POP}`;
  drawLines(ctx, replyLines, { x: 22 + 26, y: y + 24, lh: replySize * 1.34, size: replySize });
  ctx.save();
  ctx.translate(22 + 436 - 22 - 24, y + replyH / 2 - 12);
  ctx.strokeStyle = '#1d1b22';
  ctx.lineWidth = 1.8;
  rr(ctx, 8, 8, 12, 12, 2.5);
  ctx.stroke();
  ctx.stroke(path('M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8'));
  ctx.restore();
  y += replyH;

  // pager
  y += 22;
  const dots = [5, 5, 5, 5, 8, 5];
  const dotsW = dots.reduce((a, b) => a + b, 0) + 7 * (dots.length - 1);
  const rowW = 10 + 30 + dotsW + 30 + 10;
  let px = W / 2 - rowW / 2;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.save();
  ctx.translate(px, y);
  ctx.scale(10 / 12, 16 / 20);
  ctx.stroke(path('M10 2 L3 10 L10 18'));
  ctx.restore();
  px += 10 + 30;
  dots.forEach((d, i) => {
    ctx.beginPath();
    ctx.arc(px + d / 2, y + 8, d / 2, 0, Math.PI * 2);
    ctx.fillStyle = i === 4 ? '#fff' : 'rgba(255,255,255,0.65)';
    ctx.fill();
    px += d + 7;
  });
  px += 30 - 7;
  ctx.save();
  ctx.translate(px, y);
  ctx.scale(10 / 12, 16 / 20);
  ctx.stroke(path('M2 2 L9 10 L2 18'));
  ctx.restore();
}

async function shot(ctx, s, t) {
  const im = await loadImage(s.image);
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, H);
  if (!im) return;
  const h = (W * im.height) / im.width;
  ctx.drawImage(im, 0, H / 2 - h / 2, W, h);
}

const APPLE = 'M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z';

function badge(ctx, x, y, kind) {
  const apple = kind === 'apple';
  ctx.font = '400 8px Inter, sans-serif';
  const small = apple ? 'Download on the' : 'GET IT ON';
  const bigT = apple ? 'App Store' : 'Google Play';
  const sw = ctx.measureText(small).width;
  ctx.font = '600 15px Inter, sans-serif';
  const bw = ctx.measureText(bigT).width;
  const w = 1.5 + 10 + 17 + 7 + Math.max(sw, bw) + 12 + 1.5;
  const h = 39;
  rr(ctx, x + 0.75, y + 0.75, w - 1.5, h - 1.5, 10);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.strokeStyle = '#5d5b66';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const ix = x + 1.5 + 10;
  ctx.save();
  if (apple) {
    ctx.translate(ix, y + (h - 21) / 2);
    ctx.scale(17 / 384, 21 / 512);
    ctx.fillStyle = '#fff';
    ctx.fill(path(APPLE));
  } else {
    ctx.translate(ix, y + (h - 19) / 2);
    ctx.scale(17 / 24, 19 / 26);
    [
      ['M1 1 L13.5 13 L1 25 Z', '#00d7fe'],
      ['M1 1 L17.5 9.5 L13.5 13 Z', '#00f076'],
      ['M1 25 L17.5 16.5 L13.5 13 Z', '#ff3a44'],
      ['M17.5 9.5 L23 12.5 Q24 13 23 13.5 L17.5 16.5 L13.5 13 Z', '#ffd500'],
    ].forEach(([d, c]) => {
      ctx.fillStyle = c;
      ctx.fill(path(d));
    });
  }
  ctx.restore();
  const tx = ix + 17 + 7;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.font = '400 8px Inter, sans-serif';
  ctx.fillText(small, tx, y + h / 2 - 7);
  ctx.font = '600 15px Inter, sans-serif';
  ctx.fillText(bigT, tx, y + h / 2 + 5.5);
  return w;
}

async function cta(ctx, s, t, p) {
  await prepare(['700 28px Poppins', '600 18px Poppins', '600 15px Poppins', '400 8px Inter', '600 15px Inter'], [s.headline, s.subline]);
  const [icon, wm] = await Promise.all([loadImage('/brand/rizz-icon.png'), loadImage('/brand/wordmark.png')]);
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.font = `700 28px ${POP}`;
  const head = layout(ctx, s.headline, W - 60, 28);
  const headH = head.length * 28 * 1.15;
  const wmW = 220;
  const wmH = wm ? (wmW * wm.height) / wm.width : 42;
  const cardH = 34 + headH + 22 + 120 + 16 + wmH + 6 + 27 + 14 + 36.5 + 18 + 39 + 32;
  const top = H / 2 - cardH / 2;
  ctx.fillStyle = p.cardOut;
  ctx.fillRect(0, top, W, cardH);
  ellipseGlow(ctx, { x: 0, y: top, w: W, h: cardH }, W / 2, top + cardH * 0.3, W * 0.9, cardH * 0.8, [
    [0, p.cardIn],
    [0.7, p.cardOut],
  ]);
  let y = top + 34;
  ctx.fillStyle = t.cardText;
  ctx.font = `700 28px ${POP}`;
  drawLines(ctx, head, { x: W / 2, y, lh: 28 * 1.15, size: 28, align: 'center' });
  y += headH + 22;
  if (icon) {
    ctx.save();
    ctx.shadowColor = 'rgba(173,169,255,0.45)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 14;
    rr(ctx, W / 2 - 60, y, 120, 120, 28);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
    ctx.save();
    rr(ctx, W / 2 - 60, y, 120, 120, 28);
    ctx.clip();
    ctx.drawImage(icon, W / 2 - 60, y, 120, 120);
    ctx.restore();
    rr(ctx, W / 2 - 60, y, 120, 120, 28);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  y += 120 + 16;
  if (wm) ctx.drawImage(wm, W / 2 - wmW / 2, y, wmW, wmH);
  y += wmH + 6;
  ctx.font = `600 18px ${POP}`;
  ctx.fillStyle = t.handle;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(s.handle, W / 2, y + 13.5);
  ctx.textAlign = 'left';
  y += 27 + 14;
  ctx.font = `600 15px ${POP}`;
  const pl = layout(ctx, s.subline, W - 100, 15);
  const pw = Math.max(...pl.map((l) => l.w)) + 40;
  const pg = ctx.createLinearGradient(W / 2 - pw / 2, 0, W / 2 + pw / 2, 0);
  pg.addColorStop(0, '#ffd3e4');
  pg.addColorStop(1, '#ada9ff');
  rr(ctx, W / 2 - pw / 2, y, pw, 36.5, 18.25);
  ctx.fillStyle = pg;
  ctx.fill();
  ctx.fillStyle = '#120f1a';
  drawLines(ctx, pl.slice(0, 1), { x: W / 2, y: y + (36.5 - 22.5) / 2, lh: 22.5, size: 15, align: 'center' });
  y += 36.5 + 18;
  // measure both badges to centre the row
  const off = document.createElement('canvas').getContext('2d');
  const aw = badge(off, 0, 0, 'apple');
  const gw = badge(off, 0, 0, 'google');
  const bx = W / 2 - (aw + 10 + gw) / 2;
  badge(ctx, bx, y, 'apple');
  badge(ctx, bx + aw + 10, y, 'google');
}

async function wrizz(ctx, s, t, p) {
  const replyText = s.reply || 'Is your name Google? Because you have everything I\'ve been searching for.';
  await prepare([`600 20px ${INTER}`, `500 18px ${INTER}`, `400 16px ${INTER}`, `400 14px ${INTER}`], [
    replyText,
    'tap to copy',
    ...(s.context || []).map((c) => c.text),
  ]);

  const [topBar, cTL, cTR, cBL, cBR, cLine] = await Promise.all([
    loadImage('/brand/wrizz/top_bar.png'),
    loadImage('/brand/wrizz/corner_tl.png'),
    loadImage('/brand/wrizz/corner_tr.png'),
    loadImage('/brand/wrizz/corner_bl.png'),
    loadImage('/brand/wrizz/corner_br.png'),
    loadImage('/brand/wrizz/line.png'),
  ]);

  // Design baseline width matching authentic assets (554px)
  const CARD_W = 554;
  const TOP_H = 100;

  let shotImg = null;
  if (s.image) {
    shotImg = await loadImage(s.image);
  }

  // 1. Calculate Chat Box / Screenshot snippet height
  const containerW = 492;
  const containerX = 31;
  let chatH = 80;
  let preparedMsgs = [];

  if (shotImg) {
    chatH = Math.min(300, Math.round((containerW * shotImg.height) / shotImg.width));
  } else if (s.context && s.context.length) {
    ctx.font = `400 16px ${INTER}`;
    let totalMsgH = 16;
    for (const msg of s.context) {
      const isMe = msg.sender === 'me';
      // Restrict max bubble width to ~60% so conversational lines wrap naturally (e.g. 2 lines)
      const maxBubbleW = Math.round(containerW * 0.58);
      const msgLines = layout(ctx, msg.text, maxBubbleW - 32, 16);
      let mw = 0;
      msgLines.forEach((l) => { mw = Math.max(mw, l.w); });
      const bW = Math.max(140, mw + 32);
      const bH = msgLines.length * 22 + 20;
      preparedMsgs.push({ msg, isMe, lines: msgLines, bW, bH });
      totalMsgH += bH + 10;
      if (totalMsgH > 240) break;
    }
    chatH = Math.max(76, totalMsgH + 6);
  } else {
    chatH = 76;
  }

  // 2. Measure Reply Bubble (The Purple Gradient Pill)
  ctx.font = `600 20px ${INTER}`;
  const bubMaxTextW = 420;
  const replyLines = layout(ctx, replyText, bubMaxTextW, 20);
  let widestLine = 0;
  replyLines.forEach((l) => { widestLine = Math.max(widestLine, l.w); });
  const bubW = Math.min(480, Math.max(220, Math.ceil(widestLine) + 56));
  const bubH = Math.max(66, replyLines.length * 28 + 36);

  // 3. Layout vertical positions matching reference proportions
  const topBarY = 10;
  const topBracketY = topBarY + TOP_H + 32;
  const chatY = topBracketY + 62;
  const lineY = chatY + chatH + 2;
  const botBracketY = lineY + 85;
  const tapY = botBracketY + 28;
  const bubY = tapY + 20;
  const totalCardH = bubY + bubH + 30;

  // 4. Scale and center onto canvas (W = 480, H = 854)
  const scale = (W - 16) / CARD_W;
  const scaledCardH = totalCardH * scale;
  const cardY = Math.max(16, Math.round((H - scaledCardH) / 2));
  const cardX = Math.round((W - CARD_W * scale) / 2);

  // Pure black canvas background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(cardX, cardY);
  ctx.scale(scale, scale);

  // 1. Top bar: back arrow, WRizz logo, plus
  if (topBar) {
    ctx.drawImage(topBar, 0, topBarY, CARD_W, TOP_H);
  }

  // 2. Viewfinder Brackets - Top Corners
  if (cTL) ctx.drawImage(cTL, 24, topBracketY, 92, 91);
  if (cTR) ctx.drawImage(cTR, 530 - 91, topBracketY, 91, 91);

  // 3. Chat / Screenshot Snippet Area
  if (shotImg) {
    ctx.save();
    rr(ctx, containerX, chatY, containerW, chatH, 12);
    ctx.clip();
    ctx.drawImage(shotImg, containerX, chatY, containerW, chatH);
    ctx.restore();
  } else if (preparedMsgs.length) {
    // Dark chat container background
    rr(ctx, containerX, chatY, containerW, chatH, 8);
    ctx.fillStyle = '#141416';
    ctx.fill();

    let curY = chatY + 12;
    for (const pm of preparedMsgs) {
      const bX = pm.isMe ? containerX + containerW - 16 - pm.bW : containerX + 16;
      rr(ctx, bX, curY, pm.bW, pm.bH, 18);
      ctx.fillStyle = pm.isMe ? '#8b2cf5' : '#262628';
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = `400 16px ${INTER}`;
      drawLines(ctx, pm.lines, {
        x: bX + 16,
        y: curY + 11,
        lh: 22,
        size: 16,
        align: 'left',
      });
      curY += pm.bH + 10;
    }
  } else {
    // Default placeholder snippet
    rr(ctx, containerX, chatY, containerW, chatH, 8);
    ctx.fillStyle = '#141416';
    ctx.fill();

    const sampleText = "maybe i'll just get a smoothie with him then";
    ctx.font = `400 16px ${INTER}`;
    const sl = layout(ctx, sampleText, containerW * 0.58 - 32, 16);
    const sbW = Math.max(...sl.map((l) => l.w)) + 32;
    const sbH = sl.length * 22 + 20;
    const sbX = containerX + 16;
    const sbY = chatY + (chatH - sbH) / 2;
    rr(ctx, sbX, sbY, sbW, sbH, 18);
    ctx.fillStyle = '#262628';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    drawLines(ctx, sl, { x: sbX + 16, y: sbY + 11, lh: 22, size: 16, align: 'left' });
  }

  // 4. Neon Pink/Magenta Divider Line directly under chat snippet
  if (cLine) {
    ctx.drawImage(cLine, 31, lineY, 492, 13);
  }

  // 5. Viewfinder Brackets - Bottom Corners
  if (cBL) ctx.drawImage(cBL, 24, botBracketY - 88, 89, 88);
  if (cBR) ctx.drawImage(cBR, 530 - 88, botBracketY - 88, 88, 88);

  // 6. Clean "tap to copy" text
  ctx.save();
  ctx.font = `400 14px ${INTER}`;
  ctx.fillStyle = '#8e8e93';
  ctx.textAlign = 'center';
  ctx.fillText('tap to copy', CARD_W / 2, tapY);
  ctx.restore();

  // 7. The signature WRizz reply bubble (right-aligned)
  const bubX = 526 - bubW;
  const g = ctx.createLinearGradient(bubX, 0, bubX + bubW, 0);
  [
    [0, 'rgb(104,0,200)'],
    [0.15, 'rgb(120,1,215)'],
    [0.4, 'rgb(145,1,230)'],
    [0.7, 'rgb(185,1,245)'],
    [0.9, 'rgb(205,1,250)'],
    [1, 'rgb(208,1,251)'],
  ].forEach(([stop, color]) => g.addColorStop(stop, color));

  rr(ctx, bubX, bubY, bubW, bubH, bubH / 2);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `600 20px ${INTER}`;
  const textStartY = bubY + (bubH - replyLines.length * 28) / 2 + 3;
  drawLines(ctx, replyLines, {
    x: bubX + bubW / 2,
    y: textStartY,
    lh: 28,
    size: 20,
    align: 'center',
  });

  ctx.restore();
}

async function plug(ctx, s, t, p) {
  const replyText = s.reply || 'Is your name Google? Because you have everything I\'ve been searching for.';
  await prepare([`italic 900 50px ${INTER}`, `400 16.5px ${INTER}`, `400 14px ${INTER}`], [
    replyText,
    'Plug AI',
    'tap to copy',
    ...(s.context || []).map((c) => c.text),
  ]);

  // 1. Soft sky blue background (#a8d4f8 from magnificent-gumdrop-6a1ca9.netlify.app)
  ctx.fillStyle = '#a8d4f8';
  ctx.fillRect(0, 0, W, H);

  // 2. Top bar: Back chevron <, Plug AI logo, Plus +
  const topBarY = 22;

  // Left Chevron < (stroke #ff1500, width 4.5, rounded)
  ctx.save();
  ctx.strokeStyle = '#ff1500';
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(34, topBarY + 12);
  ctx.lineTo(20, topBarY + 28);
  ctx.lineTo(34, topBarY + 44);
  ctx.stroke();
  ctx.restore();

  // Right Plus + (stroke #ff1500, width 4.5, rounded)
  ctx.save();
  ctx.strokeStyle = '#ff1500';
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(W - 27, topBarY + 15);
  ctx.lineTo(W - 27, topBarY + 41);
  ctx.moveTo(W - 40, topBarY + 28);
  ctx.lineTo(W - 14, topBarY + 28);
  ctx.stroke();
  ctx.restore();

  // Center Plug AI Logo: italic, 900 bold, red with thick white outline
  ctx.save();
  ctx.font = `italic 900 50px ${INTER}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const logoX = W / 2;
  const logoY = topBarY + 28;
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 7;
  ctx.strokeText('Plug AI', logoX, logoY);
  ctx.fillStyle = '#ff1500';
  ctx.fillText('Plug AI', logoX, logoY);
  ctx.restore();

  // 3. Card Container: Solid pitch black rounded card
  const cardX = 18;
  const cardW = W - cardX * 2; // 444px
  const cardY = topBarY + 74;
  let cardH = 330;

  let shotImg = null;
  if (s.image) {
    shotImg = await loadImage(s.image);
  }

  let preparedMsgs = [];
  let totalMsgH = 0;
  if (shotImg) {
    cardH = Math.min(380, Math.round((cardW * shotImg.height) / shotImg.width));
  } else if (s.context && s.context.length) {
    ctx.font = `400 16px ${INTER}`;
    for (const msg of s.context) {
      const isMe = msg.sender === 'me';
      // Restrict max bubble width to ~48% to match 2-line conversational look in reference
      const msgLines = layout(ctx, msg.text, cardW * 0.48 - 32, 16);
      let mw = 0;
      msgLines.forEach((l) => { mw = Math.max(mw, l.w); });
      const bW = Math.max(130, mw + 32);
      const bH = msgLines.length * 22 + 20;
      preparedMsgs.push({ msg, isMe, lines: msgLines, bW, bH });
      totalMsgH += bH + 10;
      if (totalMsgH > 240) break;
    }
    cardH = Math.max(280, totalMsgH + 80);
  } else {
    cardH = 320;
  }

  // Draw black card container
  rr(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.fillStyle = '#000000';
  ctx.fill();

  if (shotImg) {
    ctx.save();
    rr(ctx, cardX, cardY, cardW, cardH, 24);
    ctx.clip();
    ctx.drawImage(shotImg, cardX, cardY, cardW, cardH);
    ctx.restore();
  } else {
    // Draw subtle Instagram chat mid-band behind messages
    const bandH = Math.min(cardH - 40, Math.max(110, totalMsgH + 40));
    const bandY = cardY + (cardH - bandH) / 2;
    ctx.save();
    rr(ctx, cardX, cardY, cardW, cardH, 24);
    ctx.clip();
    ctx.fillStyle = '#141416';
    ctx.fillRect(cardX, bandY, cardW, bandH);

    if (preparedMsgs.length) {
      let curY = cardY + (cardH - totalMsgH) / 2;
      for (const pm of preparedMsgs) {
        const bX = pm.isMe ? cardX + cardW - 20 - pm.bW : cardX + 20;
        rr(ctx, bX, curY, pm.bW, pm.bH, 18);
        ctx.fillStyle = pm.isMe ? '#2b8fff' : '#262628';
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = `400 16px ${INTER}`;
        drawLines(ctx, pm.lines, {
          x: bX + 16,
          y: curY + 11,
          lh: 22,
          size: 16,
          align: 'left',
        });
        curY += pm.bH + 10;
      }
    } else {
      // Default incoming chat bubble matching reference
      const sampleText = "maybe i'll just get a smoothie with him then";
      ctx.font = `400 17px ${INTER}`;
      const sl = layout(ctx, sampleText, 285, 17);
      const sbW = Math.max(...sl.map((l) => l.w)) + 36;
      const sbH = sl.length * 24 + 22;
      const sbX = cardX + 20;
      const sbY = cardY + (cardH - sbH) / 2;
      rr(ctx, sbX, sbY, sbW, sbH, 18);
      ctx.fillStyle = '#262628';
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      drawLines(ctx, sl, { x: sbX + 18, y: sbY + 11, lh: 24, size: 17, align: 'left' });
    }
    ctx.restore();
  }

  // 4. "tap to copy" text
  const tapY = cardY + cardH + 24;
  ctx.save();
  ctx.font = `400 14px ${INTER}`;
  ctx.fillStyle = '#5a8aaa';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('tap to copy', W / 2, tapY);
  ctx.restore();

  // 5. Reply Bubble (iMessage vibrant blue with bottom-right 5px tail)
  // Max width tuned to 275px so lines break exactly after "Because" and "been"
  const bubY = tapY + 20;
  const maxReplyW = 340;
  ctx.font = `400 18.5px ${INTER}`;
  const rLines = layout(ctx, replyText, 275, 18.5);
  let maxW = 0;
  rLines.forEach((l) => { maxW = Math.max(maxW, l.w); });
  const bubbleW = Math.min(maxReplyW, Math.max(160, maxW + 36));
  const bubbleH = Math.max(56, rLines.length * 26 + 26);
  const bubbleX = W - 18 - bubbleW;

  ctx.save();
  rrCustom(ctx, bubbleX, bubY, bubbleW, bubbleH, { tl: 22, tr: 22, bl: 22, br: 5 });
  ctx.fillStyle = '#2b8fff';
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `400 18.5px ${INTER}`;
  drawLines(ctx, rLines, {
    x: bubbleX + 18,
    y: bubY + 13,
    lh: 26,
    size: 18.5,
    align: 'left',
  });
  ctx.restore();
}

const DRAW = { photo, chat, rizz, shot, cta, plug, wrizz };

/**
 * Renders a slide spec onto `canvas` at `width` device pixels (height follows 9:16-ish 480×853).
 * Spec types: photo | chat | rizz | shot | cta (see app.js for the fields).
 */
export async function renderSlide(canvas, spec, width) {
  const scale = width / W;
  const off = document.createElement('canvas');
  off.width = Math.round(width);
  off.height = Math.round((width * 16) / 9); // 1080 -> exactly 1920
  const ctx = off.getContext('2d');
  ctx.setTransform(scale, 0, 0, off.height / H, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  const t = THEMES[spec.theme] || THEMES.dark;
  const p = PAINT[spec.theme] || PAINT.dark;
  await DRAW[spec.type]?.(ctx, spec, t, p);
  // Draw offscreen first, then copy in one go: no half-drawn frames in the preview.
  canvas.width = off.width;
  canvas.height = off.height;
  canvas.getContext('2d').drawImage(off, 0, 0);
  return canvas;
}

/** 1080×1920 PNG blob for export. */
export async function slideToBlob(spec) {
  const c = await renderSlide(document.createElement('canvas'), spec, 1080);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create PNG'))), 'image/png'));
}
