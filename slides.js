import { html } from './vendor/preact-htm.js';

// Every slide is laid out on a 480×853 canvas and exported at 1080×1920 (×2.25).
export const W = 480;
export const H = 853;

// Slide themes. Dark matches the viral pages; light is a clean iMessage-style alternative.
export const THEMES = {
  dark: { bg: '#000000', strip: '#141416', me: '#6f3ff0', meText: '#fff', her: '#2a2a2e', herText: '#fff', pill: '#262629', text: '#fff', empty: 'radial-gradient(120% 90% at 50% 40%, #2c2b31 0%, #161619 70%)', cardBg: 'radial-gradient(90% 80% at 50% 30%, #2a2140 0%, #141219 70%)', cardText: '#fff', handle: '#d7ccff' },
  light: { bg: '#ffffff', strip: '#f2f2f6', me: '#6f3ff0', meText: '#fff', her: '#e4e4ea', herText: '#111114', pill: '#efeff4', text: '#111114', empty: 'radial-gradient(120% 90% at 50% 40%, #d9d8e0 0%, #bdbcc6 75%)', cardBg: 'radial-gradient(90% 80% at 50% 30%, #f1ecff 0%, #e6e3f0 70%)', cardText: '#111114', handle: '#5b3fd0' },
};

// ---------- emoji → Apple-style images (system emoji don't survive PNG export reliably) ----------
const EMOJI_CDN = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/';
export const EMOJI_RE = /(\p{Regional_Indicator}{2}|[#*0-9]️?⃣|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*)/u;
const code = (e, keepFe0f) =>
  [...e].map((c) => c.codePointAt(0).toString(16)).filter((c) => keepFe0f || c !== 'fe0f').join('-');

export const emojiUrls = (e) => [EMOJI_CDN + code(e, true) + '.png', EMOJI_CDN + code(e, false) + '.png'];

function Emoji({ e, size = '1.15em' }) {
  return html`<img
    src=${EMOJI_CDN + code(e, true) + '.png'}
    alt=${e}
    draggable="false"
    crossorigin="anonymous"
    style=${{ width: size, height: size, display: 'inline-block', verticalAlign: '-0.2em', margin: '0 0.03em' }}
    onError=${(ev) => {
      const alt = EMOJI_CDN + code(e, false) + '.png';
      if (ev.currentTarget.src !== alt) ev.currentTarget.src = alt;
    }}
  />`;
}

export function Txt({ text }) {
  if (!text || !EMOJI_RE.test(text)) return text;
  return text.split(new RegExp(EMOJI_RE.source, 'gu')).map((part, i) => (i % 2 ? html`<${Emoji} e=${part} />` : part));
}


// On the viral pages every block sits around the vertical middle of the frame (48–52%) and grows
// in both directions as messages are added; only small shifts between swipes.
const CHAT_SHIFTS = [0, -16, 12, -6, 20, -22, 8, 16];
const PHOTO_SHIFTS = [0, -12, 10, -4, 16, -18];
export const chatShift = (i) => CHAT_SHIFTS[i % CHAT_SHIFTS.length];
export const photoShift = (i) => PHOTO_SHIFTS[i % PHOTO_SHIFTS.length];

// ---------- photo + caption (hook and reaction beats) ----------

/**
 * Full-width film still with a centred caption. Without a photo the caption still shows on a dark
 * film-grey frame; `hint` adds a small "drop a photo" pill (editor only, never exported).
 */
// Caption fonts (all self-hosted, open licence). "TikTok Sans" is TikTok's own on-video font.
export const CAPTION_FONTS = {
  tiktok: { label: 'TikTok Sans', family: '"TikTok Sans", sans-serif', weight: 800 },
  montserrat: { label: 'Montserrat', family: 'Montserrat, sans-serif', weight: 800 },
  inter: { label: 'Inter', family: 'Inter, sans-serif', weight: 700 },
  poppins: { label: 'Poppins', family: 'Poppins, sans-serif', weight: 700 },
  nunito: { label: 'Nunito (rounded)', family: 'Nunito, sans-serif', weight: 900 },
  roboto: { label: 'Roboto Black', family: 'Roboto, sans-serif', weight: 900 },
  archivo: { label: 'Archivo Black', family: '"Archivo Black", sans-serif', weight: 400 },
  oswald: { label: 'Oswald (condensed)', family: 'Oswald, sans-serif', weight: 700 },
  anton: { label: 'Anton (impact)', family: 'Anton, sans-serif', weight: 400 },
  bebas: { label: 'Bebas Neue (caps)', family: '"Bebas Neue", sans-serif', weight: 400 },
};
// Photo frame shapes, full width of the slide.
export const PHOTO_ASPECTS = { '3:4': 640, '4:5': 600, '1:1': 480, '16:9': 270 };
export const DEFAULT_CAPTION = { font: 'tiktok', outline: 3, size: 1, pos: 'center', aspect: '3:4' };

/** Caption text style: white fill with a solid black outline drawn behind it (stays readable on any photo). */
export function captionStyle(cs = DEFAULT_CAPTION, px = 22, color = '#fff') {
  const f = CAPTION_FONTS[cs.font] || CAPTION_FONTS.tiktok;
  const o = Number(cs.outline ?? 3);
  return {
    color,
    fontFamily: f.family,
    fontWeight: f.weight,
    fontSize: px * (cs.size || 1),
    lineHeight: 1.18,
    textAlign: 'center',
    whiteSpace: 'pre-wrap',
    letterSpacing: (cs.font === 'bebas' ? 0.5 : 0) + (o > 0 ? 0.4 : 0),
    // paint-order puts the stroke behind the fill, so the outline is 2× wider than it looks: double it.
    WebkitTextStroke: o > 0 ? `${o * 2}px #000` : '0',
    paintOrder: 'stroke fill',
    textShadow: o > 0 ? '0 2px 8px rgba(0,0,0,0.35)' : '0 0 3px rgba(0,0,0,0.95), 0 2px 10px rgba(0,0,0,0.6)',
  };
}

// ---------- RIZZ APP ----------

/** The RIZZ wordmark: chunky italic, pink→lavender gradient, heavy dark outline. */
export function RizzWordmark({ text = 'RIZZ APP', size = 54, id = 'wm' }) {
  const w = Math.round(size * text.length * 0.86);
  const h = Math.round(size * 1.3);
  // The wrapper's font-family is what makes html-to-image embed Archivo for the SVG text on export.
  return html`<span style=${{ display: 'block', fontFamily: 'Archivo', fontStyle: 'italic', fontWeight: 900, fontStretch: '125%', lineHeight: 0 }}>
    <svg width=${w} height=${h} viewBox=${`0 0 ${w} ${h}`} style=${{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id=${id} x1="0" y1="0" x2="1" y2="0.25">
          <stop offset="0" stop-color="#ffd3e4" />
          <stop offset="0.5" stop-color="#dcc6f1" />
          <stop offset="1" stop-color="#ada9ff" />
        </linearGradient>
      </defs>
      <text
        x=${w / 2}
        y=${h * 0.8}
        text-anchor="middle"
        font-family="Archivo"
        font-style="italic"
        font-weight="900"
        font-size=${size}
        letter-spacing=${size * 0.01}
        fill=${`url(#${id})`}
        stroke="#141218"
        stroke-width=${size * 0.13}
        stroke-linejoin="round"
        paint-order="stroke fill"
        style=${{ fontStretch: '125%', fontVariationSettings: '"wdth" 125' }}
      >
        ${text}
      </text>
    </svg>
  </span>`;
}
