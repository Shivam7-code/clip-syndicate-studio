import { html, render, useState, useEffect, useRef, useLayoutEffect, useMemo } from './vendor/preact-htm.js';
import { listPhotos, addPhotos, setPhotoTags, deletePhoto, purgeOldPhotos } from './photos.js';
import { Txt } from './slides.js';
import { RizzWordmark, chatShift, photoShift, CAPTION_FONTS, PHOTO_ASPECTS, DEFAULT_CAPTION, captionStyle } from './slides.js';
import { W, H, renderSlide, slideToBlob } from './render.js';

// ---------------------------------------------------------------- utils
const rid = () => Math.random().toString(36).slice(2, 10);
const STORE = 'rizz-studio-v3';
const HISTORY = 'rizz-studio-history-v3';
// Nothing is kept longer than this: projects, history and photos are wiped 12 h after creation.
const TTL = 12 * 3600 * 1000;
const fresh = (t) => !!t && Date.now() - t < TTL;
// Leftovers from older versions of the app.
['rizz-studio-v1', 'rizz-studio-v2', 'rizz-studio-history', 'rizz-studio-history-v2', 'rizz-coach', 'rizz-coach-open', 'rizz-access-code'].forEach((k) => {
  try {
    localStorage.removeItem(k);
  } catch {}
});
const ls = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

async function api(path, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
  if (res.status === 401) {
    location.href = '/login.html'; // session expired
    throw new Error('Please log in again.');
  }
  if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
  return data;
}

const MOODS = ['smirk', 'called-it', 'shocked', 'facepalm', 'laugh', 'skeptical', 'thinking', 'unbothered', 'phone', 'confident', 'serious', 'exit'];
const EXAMPLES = [
  'She keeps bringing up the gym guy to see if I get jealous, then acts hurt when I don’t react.',
  'She friendzoned me, then got weird when I started hanging out with someone else.',
  'Hot and cold: all over me at the party, one-word replies the next day, then “why are you so distant?”',
  'She sends “we need to talk” and goes silent for hours to make me panic.',
  'She guilt-trips me for going out with my friends instead of facetiming her all night.',
];
const DEFAULT_SETTINGS = {
  chatSize: 19,
  rizzContext: 2,
  hookStyle: 'image',
  theme: 'dark',
  caption: DEFAULT_CAPTION,
  time: '9:41',
  ctaHeadline: 'Get your replies\nfrom RIZZ APP.',
  ctaSub: 'Link in Bio',
  handle: '@rizz.app',
  numberFrom: 1,
};
const CTA_TEXT = {
  English: ['Get your replies\nfrom RIZZ APP.', 'Link in Bio'],
  Spanish: ['Consigue tus respuestas\ncon RIZZ APP.', 'Link en la bio'],
  'Portuguese (Brazil)': ['Pegue suas respostas\nno RIZZ APP.', 'Link na bio'],
  French: ['Tes réponses\navec RIZZ APP.', 'Lien en bio'],
  German: ['Hol dir deine Antworten\nmit RIZZ APP.', 'Link in Bio'],
  Italian: ['Le tue risposte\ncon RIZZ APP.', 'Link in bio'],
  Polish: ['Odpowiedzi od\nRIZZ APP.', 'Link w bio'],
  Dutch: ['Haal je antwoorden\nuit RIZZ APP.', 'Link in bio'],
  Turkish: ['Cevaplarını\nRIZZ APP ile al.', "Link bio'da"],
  Romanian: ['Ia-ți răspunsurile\ndin RIZZ APP.', 'Link în bio'],
  Czech: ['Odpovědi od\nRIZZ APP.', 'Odkaz v biu'],
  Swedish: ['Få dina svar\nfrån RIZZ APP.', 'Länk i bio'],
  Indonesian: ['Dapatkan balasanmu\ndari RIZZ APP.', 'Link di bio'],
  'Filipino (Taglish)': ['Kunin ang replies mo\nsa RIZZ APP.', 'Link sa bio'],
};
const TAPBACKS = ['❤️', '😂', '😮', '😢', '😡', '👍', '👎', '‼️', '❓', '💀', '🔥'];
const EMPTY_CAPTION = '@rizz.app read her mind games in seconds. Link in Bio #rizzapp #darkpsychology #mindgames';
const EMPTY = {
  brief: { text: '', tactic: '', slideCount: 28, coldness: 60, herName: '', skipEditor: false, language: 'English' },
  script: null,
  rizzShot: null,
  settings: DEFAULT_SETTINGS,
};

function loadDoc() {
  const d = ls.get(STORE, null);
  if (!d) return EMPTY;
  if (d.script && !fresh(d.createdAt)) return { ...EMPTY, settings: { ...DEFAULT_SETTINGS, ...d.settings } }; // expired project
  const settings = { ...DEFAULT_SETTINGS, ...d.settings };
  if (settings.chatSize < 17) settings.chatSize = DEFAULT_SETTINGS.chatSize; // older saves used tiny text
  settings.caption = { ...DEFAULT_CAPTION, ...settings.caption };
  return { ...EMPTY, ...d, brief: { ...EMPTY.brief, ...d.brief }, settings };
}

function fromServer(s) {
  return {
    hook: s.hook || '',
    hookImageId: null,
    language: s.language || 'English',
    tactic: s.tactic || '',
    herName: s.herName || '',
    caption: s.caption || EMPTY_CAPTION,
    altReplies: s.altReplies || [],
    slides: (s.slides || []).map((x) =>
      x.type === 'chat'
        ? { id: rid(), type: 'chat', reveal: !!x.reveal, messages: x.messages.map((m) => ({ id: rid(), sender: m.sender, text: m.text, reaction: m.reaction || '' })) }
        : x.type === 'reaction'
          ? { id: rid(), type: 'reaction', caption: x.caption, mood: x.mood || 'smirk', imageId: null }
          : { id: rid(), type: 'rizz', reply: x.reply || '' },
    ),
  };
}

function transcript(script) {
  const lines = [`HOOK: ${script.hook}`];
  for (const s of script.slides) {
    if (s.type === 'chat') s.messages.forEach((m) => lines.push(`${m.sender}: ${m.text}${m.reaction ? ` [${m.reaction} reaction]` : ''}`));
    else if (s.type === 'reaction') lines.push(`[reaction] ${s.caption}`);
    else lines.push(`[RIZZ APP screen] AI-generated reply: ${s.reply}`);
  }
  return lines.join('\n');
}

const photoSlots = (script) => [
  { key: 'hook', imageId: script.hookImageId, mood: 'smirk' },
  ...script.slides.filter((s) => s.type === 'reaction').map((s) => ({ key: s.id, imageId: s.imageId, mood: s.mood })),
];
function setSlotImage(script, key, imageId) {
  if (key === 'hook') return { ...script, hookImageId: imageId };
  return { ...script, slides: script.slides.map((s) => (s.id === key ? { ...s, imageId } : s)) };
}
// Fills empty photo slots from the library: matching vibe first, never the same photo twice.
function fillFromLibrary(script, library) {
  if (!library.length) return script;
  const ids = new Set(library.map((l) => l.id));
  const used = new Set(photoSlots(script).map((p) => p.imageId).filter((id) => ids.has(id)));
  let out = script;
  for (const slot of photoSlots(script)) {
    if (slot.imageId && ids.has(slot.imageId)) continue;
    const pool = library.filter((l) => !used.has(l.id));
    if (!pool.length) break;
    const match = pool.filter((l) => (l.tags || []).includes(slot.mood));
    const from = match.length ? match : pool;
    const pick = from[Math.floor(Math.random() * from.length)];
    used.add(pick.id);
    out = setSlotImage(out, slot.key, pick.id);
  }
  return out;
}

// Paste format: her:/me: lines (blank line = new chat slide), her!: = reveal, react: caption | vibe, rizz: the reply
function parsePasted(text) {
  const t = text.trim();
  if (!t) throw new Error('Paste a script first.');
  if (t.startsWith('{')) return fromServer(JSON.parse(t.slice(0, t.lastIndexOf('}') + 1)));
  const slides = [];
  let hook = '';
  let caption = '';
  let beat = null;
  const close = () => {
    if (beat?.messages.length) slides.push(beat);
    beat = null;
  };
  for (const raw of t.split(/\r?\n/)) {
    const line = raw.trim();
    let m;
    if (!line) close();
    else if ((m = line.match(/^hook\s*:\s*(.+)$/i))) hook = m[1];
    else if ((m = line.match(/^caption\s*:\s*(.+)$/i))) caption = m[1];
    else if ((m = line.match(/^react(?:ion)?\s*:\s*(.+?)(?:\s*\|\s*([a-z-]+))?$/i))) {
      close();
      slides.push({ id: rid(), type: 'reaction', caption: m[1], mood: MOODS.includes(m[2]) ? m[2] : 'smirk', imageId: null });
    } else if ((m = line.match(/^rizz\s*:\s*(.*)$/i))) {
      close();
      slides.push({ id: rid(), type: 'rizz', reply: m[1].split('|').pop().trim() });
    } else if ((m = line.match(/^plug\s*:\s*(.*)$/i))) {
      close();
      slides.push({ id: rid(), type: 'plug', reply: m[1].split('|').pop().trim() });
    } else if ((m = line.match(/^wrizz\s*:\s*(.*)$/i))) {
      close();
      slides.push({ id: rid(), type: 'wrizz', reply: m[1].split('|').pop().trim() });
    } else if ((m = line.match(/^(her|she|me|i|him|he)\s*(!?)\s*:\s*(.+)$/i))) {
      if (!beat) beat = { id: rid(), type: 'chat', reveal: false, messages: [] };
      if (m[2]) beat.reveal = true;
      const tb = m[3].match(/^(.*?)\s*\[([^\]\s]{1,4})\]$/u); // "text [❤️]" = tapback
      beat.messages.push({ id: rid(), sender: /^(me|i|him|he)$/i.test(m[1]) ? 'me' : 'her', text: tb ? tb[1] : m[3], reaction: tb ? tb[2] : '' });
    } else if (beat?.messages.length) beat.messages.at(-1).text += ' ' + line;
  }
  close();
  if (!slides.some((s) => s.type === 'chat')) throw new Error('No messages found. Start lines with "her:" or "me:".');
  if (!slides.some((s) => s.type === 'rizz' || s.type === 'plug' || s.type === 'wrizz')) {
    const at = Math.max(1, Math.floor(slides.length * 0.35));
    slides.splice(at, 0, { id: rid(), type: 'rizz', reply: '' });
  }
  return { hook, hookImageId: null, caption: caption || EMPTY_CAPTION, tactic: '', herName: '', altReplies: [], slides };
}
const PASTE_EXAMPLE = `hook: She Kept Bringing Up The Gym Guy… So I Stopped Reacting.
her: omg the gym guy fixed my squat form today
me: nice.

react: She's checking the temperature. | thinking

her!: he's actually so funny btw
me: good for him

react: The gym guy was getting a lot of screen time. | skeptical

her: maybe i'll just get a smoothie with him then

react: And there's the real move. | called-it
rizz: get the mango one, it's the best

me: get the mango one, it's the best

react: She did not expect a menu recommendation. | shocked

her: that's it??
me: what else is there

her: most guys would be jealous
me: most guys are tired

react: Her plan just ran out of fuel. | laugh

her: ok fine i didn't even go
her: i just wanted to see if you cared
me: i care. i just don't compete.

react: Jealousy only works on people who are afraid to lose. | exit
caption: @rizz.app saw her jealousy test coming. Link in Bio #rizzapp #darkpsychology #mindgames`;

// ---------------------------------------------------------------- export + files
async function download(blob, name) {
  // 1. Try server-backed download first: 100% guarantees correct filename and .zip extension in Windows/Chrome
  try {
    const res = await fetch('/api/export-zip?filename=' + encodeURIComponent(name), {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: blob,
    });
    if (res.ok) {
      const data = await res.json();
      if (data.id) {
        const dlLink = document.createElement('a');
        dlLink.href = `/api/download-zip?id=${data.id}&filename=${encodeURIComponent(name)}`;
        dlLink.download = name;
        document.body.appendChild(dlLink);
        dlLink.click();
        setTimeout(() => {
          try {
            document.body.removeChild(dlLink);
          } catch {}
        }, 3000);
        return;
      }
    }
  } catch (err) {
    console.warn('Server download relay failed, falling back to client blob:', err);
  }

  // 2. Client-side fallback
  const mime = name.endsWith('.zip') ? 'application/zip' : (name.endsWith('.png') ? 'image/png' : (blob.type || 'application/octet-stream'));
  const typedBlob = blob.type === mime ? blob : new Blob([blob], { type: mime });
  const url = URL.createObjectURL(typedBlob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = name;
  a.setAttribute('download', name);
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {}
  }, 4000);
}
const canShareFiles = () => {
  try {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && !!navigator.canShare?.({ files: [new File([new Blob()], 'x.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
};
function fileToDataUrl(file, max = 1600, q = 0.88) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => reject(new Error(`Could not read ${file.name}`));
    img.src = URL.createObjectURL(file);
  });
}

// ---------------------------------------------------------------- small components
const Btn = ({ children, onClick, disabled, kind = 'ghost', title, busy, size = '' }) =>
  html`<button type="button" class=${`btn ${kind} ${size}`} onClick=${onClick} disabled=${disabled || busy} title=${title}>${busy || children}</button>`;
const Field = ({ label, hint, children }) => html`<div class="field">
  <div class="field-label">${label}${hint && html`<span>${hint}</span>`}</div>
  ${children}
</div>`;

function AutoText({ value, onInput, placeholder, className = '', rows = 1 }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 2 + 'px';
    }
  }, [value]);
  return html`<textarea ref=${ref} rows=${rows} class=${`input autotext ${className}`} value=${value} placeholder=${placeholder} onInput=${(e) => onInput(e.target.value)}></textarea>`;
}

function Slider({ label, value, min, max, onInput, suffix = '', hint }) {
  return html`<${Field} label=${label} hint=${hint}>
    <div class="slider-row">
      <input type="range" min=${min} max=${max} value=${value} onInput=${(e) => onInput(Number(e.target.value))} />
      <span class="slider-val">${value}${suffix}</span>
    </div>
  <//>`;
}

/** Draws a slide spec into a canvas sized to its box (same renderer as the PNG export). */
function SlideCanvas({ spec, hint = false }) {
  const box = useRef();
  const cv = useRef();
  const [w, setW] = useState(0);
  const key = JSON.stringify(spec) + hint;
  useLayoutEffect(() => {
    const el = box.current;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!w) return;
    let live = true;
    const target = document.createElement('canvas');
    renderSlide(target, { ...spec, hint }, Math.round(w * Math.min(2, window.devicePixelRatio || 1))).then(() => {
      if (!live || !cv.current) return;
      cv.current.width = target.width;
      cv.current.height = target.height;
      cv.current.getContext('2d').drawImage(target, 0, 0);
    });
    return () => {
      live = false;
    };
  }, [key, w]);
  return html`<div ref=${box} class="scaled" style=${{ aspectRatio: '9 / 16' }}><canvas ref=${cv} style=${{ width: '100%', height: '100%', display: 'block' }}></canvas></div>`;
}

function useDrop(onFiles) {
  const [over, setOver] = useState(false);
  if (!onFiles) return [false, {}];
  return [
    over,
    {
      onDragOver: (e) => (e.preventDefault(), setOver(true)),
      onDragLeave: () => setOver(false),
      onDrop: (e) => (e.preventDefault(), setOver(false), onFiles(e.dataTransfer.files)),
    },
  ];
}

const SLIDE_MIME = 'text/x-rizz-slide';
const movable = (kind) => kind === 'chat' || kind === 'reaction' || kind === 'rizz' || kind === 'plug' || kind === 'wrizz';

/** Filmstrip thumbnail: click to open, drag to reorder, drop an image file to set its photo, ✕ to delete. */
function Thumb({ slide, on, onClick, onFiles, onReorder, onDelete }) {
  const [over, setOver] = useState(null); // 'files' | 'left' | 'right'
  const isSlideDrag = (e) => [...e.dataTransfer.types].includes(SLIDE_MIME);
  const sideOf = (e) => {
    if (slide.kind === 'hook') return 'right';
    if (slide.kind === 'cta') return 'left';
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientX < r.left + r.width / 2 ? 'left' : 'right';
  };
  return html`<div
    class=${`thumb ${on ? 'on' : ''} ${over === 'files' ? 'over' : ''} ${over === 'left' || over === 'right' ? `drop-${over}` : ''} t-${slide.kind}`}
    role="button"
    tabindex="0"
    title=${movable(slide.kind) ? 'Click to open · drag to move' : 'Click to open'}
    draggable=${movable(slide.kind)}
    onClick=${onClick}
    onDragStart=${(e) => {
      e.dataTransfer.setData(SLIDE_MIME, slide.item);
      e.dataTransfer.effectAllowed = 'move';
    }}
    onDragOver=${(e) => {
      if (isSlideDrag(e)) {
        e.preventDefault();
        setOver(sideOf(e));
      } else if (onFiles) {
        e.preventDefault();
        setOver('files');
      }
    }}
    onDragLeave=${() => setOver(null)}
    onDrop=${(e) => {
      e.preventDefault();
      const from = e.dataTransfer.getData(SLIDE_MIME);
      if (from) onReorder(from, slide.item, sideOf(e));
      else if (onFiles && e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      setOver(null);
    }}
  >
    <${SlideCanvas} spec=${slide.spec} />
    <span class="thumb-num">${slide.num}</span>
    ${slide.empty && html`<span class="thumb-flag" title="Needs a photo">+</span>`}
    ${onDelete &&
    html`<span class="thumb-del" role="button" title="Delete slide" onClick=${(e) => (e.stopPropagation(), onDelete())}>✕</span>`}
  </div>`;
}

function AddTile({ onAdd }) {
  return html`<div class="add-tile">
    <button type="button" onClick=${() => onAdd('chat')} title="Add a chat slide at the end">+ Chat</button>
    <button type="button" onClick=${() => onAdd('reaction')} title="Add a photo slide at the end">+ Photo</button>
  </div>`;
}

/** Inspector photo box: preview with caption, drop/click to upload, or pick from library. */
function PhotoBox({ url, caption, onFiles, onLibrary, onClear, busy, cs = DEFAULT_CAPTION }) {
  const [over, dropProps] = useDrop(onFiles);
  return html`<div class=${`photobox ${over ? 'over' : ''} ${url ? 'has' : ''}`} ...${dropProps}>
    <label class="photobox-img" style=${{ aspectRatio: `480 / ${PHOTO_ASPECTS[cs.aspect] || 640}` }}>
      ${url ? html`<img src=${url} />` : html`<div class="photobox-empty"></div>`}
      <div class="photobox-cap" style=${{ ...captionStyle({ ...cs, outline: (cs.outline || 0) * 0.6 }, 15), textShadow: 'none' }}>${caption || 'Caption'}</div>
      ${!url && html`<div class="photobox-hint">${busy || '⬆ Drop a photo or click to upload'}</div>`}
      <input type="file" accept="image/*" hidden onChange=${(e) => (onFiles(e.target.files), (e.target.value = ''))} />
    </label>
    <div class="row gap">
      <${Btn} size="sm" onClick=${onLibrary}>🖼 From library<//>
      ${url && html`<${Btn} size="sm" onClick=${onClear}>Remove<//>`}
    </div>
  </div>`;
}

/** Tapback picker: the emoji the other person reacted to this message with. */
function ReactionPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return html`<div class="react-pick">
    <button type="button" class=${`icon xs ${value ? 'on' : ''}`} title="Reaction on this message" onClick=${() => setOpen(!open)}>${value ? html`<${Txt} text=${value} />` : '☺︎'}</button>
    ${open &&
    html`<div class="react-pop" onMouseLeave=${() => setOpen(false)}>
      ${TAPBACKS.map((e) => html`<button type="button" class=${e === value ? 'on' : ''} title=${e} onClick=${() => (onChange(e), setOpen(false))}><${Txt} text=${e} /></button>`)}
      <button type="button" class="none" onClick=${() => (onChange(''), setOpen(false))}>none</button>
    </div>`}
  </div>`;
}

/** Generation progress: the two real stages (draft, viral pass) with an estimated bar. */
function GenProgress({ phase, elapsed, skipEditor }) {
  const stages = skipEditor
    ? [['draft', 'Building the conversation', 45]]
    : [
        ['draft', 'Building the conversation', 45],
        ['polish', 'Viral pass on hook, captions and RIZZ line', 45],
      ];
  const at = Math.max(0, stages.findIndex(([k]) => k === phase));
  const total = stages.reduce((a, [, , t]) => a + t, 0);
  const pct = Math.min(96, Math.round((elapsed / total) * 100));
  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  return html`<div class="gen" role="status" aria-live="polite">
    <div class="gen-top">
      <span class="gen-orb"></span>
      <b>${stages[at][1]}</b>
      <span class="gen-time">${mmss}</span>
    </div>
    <div class="gen-bar"><div style=${{ width: `${pct}%` }}></div></div>
    <div class="gen-steps" hidden=${stages.length < 2}>
      ${stages.map(([k, label], i) => html`<span class=${i < at ? 'done' : i === at ? 'now' : ''}>${i < at ? '✓' : i + 1} ${label}</span>`)}
    </div>
  </div>`;
}

function Suggestions({ items, onPick, prefix = '' }) {
  if (!items?.length) return null;
  return html`<div class="suggest">${items.map((t) => html`<button type="button" onClick=${() => onPick(t)}>${prefix}${t}</button>`)}</div>`;
}

// ---------------------------------------------------------------- photo library modal
function LibraryModal({ library, setLibrary, target, onPick, onClose, caption }) {
  const [progress, setProgress] = useState('');
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('');
  const upload = async (files) => {
    setErr('');
    try {
      const added = await addPhotos(files, (i, n) => setProgress(`Adding ${i}/${n}…`));
      setLibrary((l) => [...added, ...l]);
      if (target && added.length === 1) onPick(added[0].id);
    } catch (e) {
      setErr(e.message);
    } finally {
      setProgress('');
    }
  };
  const [over, dropProps] = useDrop(upload);
  const items = filter === 'untagged' ? library.filter((l) => !(l.tags || []).length) : filter ? library.filter((l) => (l.tags || []).includes(filter)) : library;
  const tag = async (id, mood) => {
    await setPhotoTags(id, mood ? [mood] : []);
    setLibrary((l) => l.map((x) => (x.id === id ? { ...x, tags: mood ? [mood] : [] } : x)));
  };
  const remove = async (id) => {
    if (!confirm('Delete this photo from the library?')) return;
    await deletePhoto(id);
    setLibrary((l) => l.filter((x) => x.id !== id));
  };
  return html`<div class="modal-bg" onClick=${onClose}>
    <div class="modal" onClick=${(e) => e.stopPropagation()}>
      <div class="modal-head">
        <div>
          <h3>Photo library <span class="muted">${library.length}</span></h3>
          <p class="muted">${target ? `Choose a photo for “${caption || 'this slide'}”` : 'Reusable reaction photos. Tag a vibe and they get auto-picked for matching captions.'}</p>
        </div>
        <button type="button" class="icon" onClick=${onClose}>✕</button>
      </div>
      <label class=${`dropzone ${over ? 'over' : ''}`} ...${dropProps}>
        <input type="file" accept="image/*" multiple hidden onChange=${(e) => (upload(e.target.files), (e.target.value = ''))} />
        <b>${progress || 'Drop photos here or click to upload'}</b>
        <span class="muted">Any amount at once · JPG, PNG, WEBP · landscape stills fit best · stored only in this browser</span>
      </label>
      <label class="btn ghost sm folder-btn" title="Add every image in a folder. Sub-folders named after a vibe (smirk, called-it…) get tagged automatically.">
        📁 Add a whole folder
        <input type="file" webkitdirectory multiple hidden onChange=${(e) => (upload(e.target.files), (e.target.value = ''))} />
      </label>
      ${err && html`<div class="err">${err}</div>`}
      <div class="chips">
        <button type="button" class=${`chip ${!filter ? 'on' : ''}`} onClick=${() => setFilter('')}>All</button>
        <button type="button" class=${`chip ${filter === 'untagged' ? 'on' : ''}`} onClick=${() => setFilter('untagged')}>Untagged</button>
        ${MOODS.map((m) => html`<button type="button" class=${`chip ${filter === m ? 'on' : ''}`} onClick=${() => setFilter(m)}>${m}</button>`)}
      </div>
      <div class="lib-grid">
        ${items.map(
          (l) => html`<div class="lib-item">
            <button type="button" class="lib-img" onClick=${() => target && onPick(l.id)}><img src=${l.url} loading="lazy" /></button>
            <div class="lib-bar">
              <select class="input xs" value=${(l.tags || [])[0] || ''} onChange=${(e) => tag(l.id, e.target.value)}>
                <option value="">no vibe</option>
                ${MOODS.map((m) => html`<option value=${m}>${m}</option>`)}
              </select>
              <button type="button" class="icon xs" title="Delete" onClick=${() => remove(l.id)}>✕</button>
            </div>
          </div>`,
        )}
        ${!items.length && html`<div class="muted">No photos here yet.</div>`}
      </div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- app
function App() {
  const [doc, setDoc] = useState(loadDoc);
  const [config, setConfig] = useState(null);
  const [library, setLibrary] = useState([]);
  const [composing, setComposing] = useState(!doc.script);
  const [tab, setTab] = useState('ai');
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [toast, setToast] = useState(null);
  const [phase, setPhase] = useState('');
  const [cur, setCur] = useState(0);
  const [panel, setPanel] = useState('slide');
  const [rewriting, setRewriting] = useState('');
  const [openNote, setOpenNote] = useState(null);
  const [note, setNote] = useState('');
  const [suggest, setSuggest] = useState({});
  const [suggestBusy, setSuggestBusy] = useState('');
  const [picker, setPicker] = useState(null);
  const [uploading, setUploading] = useState('');
  const [exporting, setExporting] = useState('');
  const [history, setHistory] = useState(() => ls.get(HISTORY, []).filter((h) => fresh(h.at)));
  const [selectItem, setSelectItem] = useState(null);
  const strip = useRef();

  useEffect(() => ls.set(STORE, doc), [doc]);
  useEffect(() => {
    api('/api/config').then(setConfig).catch(() => {});
    const sweep = async () => {
      const removed = await purgeOldPhotos(TTL).catch(() => 0);
      if (removed) setLibrary(await listPhotos());
      setHistory((h) => {
        const kept = h.filter((x) => fresh(x.at));
        ls.set(HISTORY, kept);
        return kept;
      });
      setDoc((d) => (d.script && !fresh(d.createdAt) ? { ...EMPTY, settings: d.settings } : d));
    };
    sweep();
    const iv = setInterval(sweep, 5 * 60 * 1000);
    listPhotos().then(setLibrary).catch(() => setToast({ ok: false, text: 'This browser blocked photo storage (private window?). Photos will not be saved.' }));
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const iv = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(iv);
  }, [busy]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.ok ? 5000 : 9000);
    return () => clearTimeout(t);
  }, [toast]);

  const { brief, script, settings } = doc;
  const setBrief = (p) => setDoc((d) => ({ ...d, brief: { ...d.brief, ...p } }));
  const setScript = (fn) => setDoc((d) => ({ ...d, script: typeof fn === 'function' ? fn(d.script) : { ...d.script, ...fn } }));
  const setLanguage = (language) =>
    setDoc((d) => {
      const defaults = Object.values(CTA_TEXT);
      const isDefault = defaults.some(([h, sub]) => h === d.settings.ctaHeadline && sub === d.settings.ctaSub);
      const [ctaHeadline, ctaSub] = CTA_TEXT[language] || CTA_TEXT.English;
      return { ...d, brief: { ...d.brief, language }, settings: isDefault ? { ...d.settings, ctaHeadline, ctaSub } : d.settings };
    });
  const setSettings = (p) => setDoc((d) => ({ ...d, settings: { ...d.settings, ...p } }));
  const setSlides = (fn) => setScript((s) => ({ ...s, slides: fn(s.slides) }));
  const updateSlide = (id, p) => setSlides((ss) => ss.map((s) => (s.id === id ? { ...s, ...(typeof p === 'function' ? p(s) : p) } : s)));
  const updateMsg = (slideId, msgId, p) => updateSlide(slideId, (s) => ({ messages: s.messages.map((m) => (m.id === msgId ? { ...m, ...p } : m)) }));
  const libUrl = (id) => library.find((l) => l.id === id)?.url;
  const fail = (e) => {
    setToast({ ok: false, text: e.message });
  };

  // ---------------- rendered slide list
  const slides = useMemo(() => {
    if (!script) return [];
    const out = [];
    let chatN = 0;
    let photoN = 1;
    out.push({
      key: 'hook',
      item: 'hook',
      kind: 'hook',
      photoKey: 'hook',
      label: 'Hook',
      spec: { type: 'photo', theme: settings.theme, cs: settings.caption, image: libUrl(script.hookImageId), caption: script.hook || 'Your hook…', big: true, textOnly: settings.hookStyle === 'text' },
    });
    script.slides.forEach((s, i) => {
      if (s.type === 'chat') {
        const firstMe = s.messages.findIndex((m) => m.sender === 'me');
        const lead = firstMe > 0 ? s.messages.slice(0, firstMe) : [];
        const shift = chatShift(chatN++);
        const chatSpec = (msgs) => ({ type: 'chat', theme: settings.theme, msgs: msgs.map(({ sender, text, reaction }) => ({ sender, text, reaction })), size: settings.chatSize, shift });
        if (s.reveal && lead.length) out.push({ key: `${s.id}-a`, item: s.id, kind: 'chat', label: 'Chat', spec: chatSpec(lead) });
        out.push({ key: s.id, item: s.id, kind: 'chat', label: 'Chat', spec: chatSpec(s.messages) });
      } else if (s.type === 'reaction') {
        const shift = photoShift(photoN++);
        out.push({
          key: s.id,
          item: s.id,
          kind: 'reaction',
          photoKey: s.id,
          label: 'Photo',
          empty: !libUrl(s.imageId),
          spec: { type: 'photo', theme: settings.theme, cs: settings.caption, image: libUrl(s.imageId), caption: s.caption || '…', shift },
        });
      } else if (s.type === 'plug') {
        const prev = [...script.slides.slice(0, i)].reverse().find((x) => x.type === 'chat');
        const context = prev ? prev.messages.slice(-settings.rizzContext || prev.messages.length).slice(0, settings.rizzContext) : [];
        out.push({
          key: s.id,
          item: s.id,
          kind: 'plug',
          label: 'Plug AI',
          spec: s.screenshot || doc.plugShot
            ? { type: 'shot', theme: settings.theme, image: s.screenshot || doc.plugShot }
            : { type: 'plug', theme: settings.theme, context: context.map(({ sender, text }) => ({ sender, text })), reply: s.reply },
        });
      } else if (s.type === 'wrizz') {
        const prev = [...script.slides.slice(0, i)].reverse().find((x) => x.type === 'chat');
        const context = prev ? prev.messages.slice(-settings.rizzContext || prev.messages.length).slice(0, settings.rizzContext) : [];
        out.push({
          key: s.id,
          item: s.id,
          kind: 'wrizz',
          label: 'WRIZZ',
          spec: s.screenshot || doc.wrizzShot
            ? { type: 'shot', theme: settings.theme, image: s.screenshot || doc.wrizzShot }
            : { type: 'wrizz', theme: settings.theme, context: context.map(({ sender, text }) => ({ sender, text })), reply: s.reply },
        });
      } else {
        const prev = [...script.slides.slice(0, i)].reverse().find((x) => x.type === 'chat');
        const context = prev ? prev.messages.slice(-settings.rizzContext || prev.messages.length).slice(0, settings.rizzContext) : [];
        out.push({
          key: s.id,
          item: s.id,
          kind: 'rizz',
          label: 'RIZZ',
          spec: s.screenshot || doc.rizzShot
            ? { type: 'shot', theme: settings.theme, image: s.screenshot || doc.rizzShot }
            : { type: 'rizz', theme: settings.theme, context: context.map(({ sender, text }) => ({ sender, text })), reply: s.reply },
        });
      }
    });
    out.push({ key: 'cta', item: 'cta', kind: 'cta', label: 'CTA', spec: { type: 'cta', theme: settings.theme, headline: settings.ctaHeadline, subline: settings.ctaSub, handle: settings.handle } });
    if (!libUrl(script.hookImageId) && settings.hookStyle !== 'text') out[0].empty = true;
    return out.map((s, i) => ({ ...s, num: settings.numberFrom + i, file: `${settings.numberFrom + i}.png` }));
  }, [script, settings, doc.rizzShot, library]);

  const idx = Math.min(cur, Math.max(0, slides.length - 1));
  const active = slides[idx];
  const go = (i) => setCur(Math.max(0, Math.min(slides.length - 1, i)));

  // select a newly inserted item once it's rendered
  useEffect(() => {
    if (!selectItem) return;
    const i = slides.findIndex((s) => s.item === selectItem);
    if (i >= 0) {
      setCur(i);
      setSelectItem(null);
    }
  }, [slides, selectItem]);
  // keyboard ← →
  useEffect(() => {
    const onKey = (e) => {
      if (composing || picker || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      if (e.key === 'ArrowRight') go(idx + 1);
      if (e.key === 'ArrowLeft') go(idx - 1);
      if ((e.key === 'Delete' || e.key === 'Backspace') && (active?.kind === 'chat' || active?.kind === 'reaction')) deleteItem(active.item);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, slides, script, composing, picker]);
  // keep the active thumbnail in view
  useEffect(() => {
    strip.current?.querySelector('.thumb.on')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [idx]);

  const logout = async () => {
    localStorage.removeItem('cs_authed');
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    location.href = '/login.html';
  };

  // ---------------- AI
  const pushHistory = (s) => {
    const h = [{ id: rid(), at: Date.now(), hook: s.hook, script: s }, ...history].slice(0, 20);
    setHistory(h);
    ls.set(HISTORY, h);
  };
  const openScript = (s, createdAt = Date.now()) => {
    setDoc((d) => ({ ...d, script: fillFromLibrary(s, library), rizzShot: null, createdAt }));
    setCur(0);
    setPanel('slide');
    setComposing(false);
  };
  const generate = async () => {
    setBusy(true);
    try {
      setPhase('draft');
      const params = { ...brief, brief: brief.text };
      let r = await api('/api/generate', { mode: 'draft', ...params });
      r.script.language = brief.language;
      if (!brief.skipEditor) {
        setPhase('polish');
        r = await api('/api/generate', { mode: 'polish', script: r.script, slideCount: brief.slideCount, language: brief.language });
        r.script.language = brief.language;
      }
      const s = fromServer(r.script);
      openScript(s);
      pushHistory(s);
      const sc = r.scores ? Object.values(r.scores).reduce((a, b) => a + b, 0) / Object.values(r.scores).length : 0;
      setToast({ ok: true, text: `Slideshow ready${sc ? ` · viral score ${sc.toFixed(1)}/10` : ''}${r.changes ? ` · ${r.changes}` : ''}` });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
      setPhase('');
    }
  };
  const usePasted = () => {
    try {
      openScript({ ...parsePasted(pasted), language: brief.language });
    } catch (e) {
      setToast({ ok: false, text: `Couldn’t read that script: ${e.message}` });
    }
  };
  const suggestList = async (key, kind, extra = {}) => {
    setSuggestBusy(key);
    try {
      const r = await api('/api/generate', { mode: 'list', kind, count: 6, transcript: script ? transcript(script) : '', language: script?.language || brief.language, ...extra });
      setSuggest((s) => ({ ...s, [key]: r.items }));
    } catch (e) {
      fail(e);
    } finally {
      setSuggestBusy('');
    }
  };
  const rewrite = async (key, target, apply) => {
    setRewriting(key);
    setOpenNote(null);
    try {
      const r = await api('/api/generate', { mode: 'rewrite', transcript: transcript(script), target, note, tactic: script.tactic, language: script.language || brief.language });
      apply(r.text);
    } catch (e) {
      fail(e);
    } finally {
      setRewriting('');
    }
  };

  // ---------------- structure ops
  const itemIndex = (item) => (item === 'hook' ? -1 : item === 'cta' ? script.slides.length - 1 : script.slides.findIndex((s) => s.id === item));
  const insertAfterActive = (type) => {
    let slide;
    if (type === 'chat') {
      slide = { id: rid(), type: 'chat', reveal: false, messages: [{ id: rid(), sender: 'her', text: '' }, { id: rid(), sender: 'me', text: '' }] };
    } else if (type === 'reaction') {
      slide = { id: rid(), type: 'reaction', caption: '', mood: 'smirk', imageId: null };
    } else if (type === 'rizz') {
      slide = { id: rid(), type: 'rizz', reply: '' };
    } else if (type === 'plug') {
      slide = { id: rid(), type: 'plug', reply: '' };
    } else if (type === 'wrizz') {
      slide = { id: rid(), type: 'wrizz', reply: '' };
    }
    const at = itemIndex(active.item) + 1;
    setSlides((ss) => [...ss.slice(0, at), slide, ...ss.slice(at)]);
    setSelectItem(slide.id);
  };
  const moveActive = (dir) => {
    const i = itemIndex(active.item);
    if (i < 0 || i + dir < 0 || i + dir >= script.slides.length) return;
    setSlides((ss) => {
      const n = [...ss];
      [n[i], n[i + dir]] = [n[i + dir], n[i]];
      return n;
    });
    setSelectItem(active.item);
  };
  const deleteItem = (item) => {
    const at = script.slides.findIndex((s) => s.id === item);
    if (at < 0 || script.slides.length <= 1) return;
    const removed = script.slides[at];
    setSlides((ss) => ss.filter((s) => s.id !== item));
    if (active?.item === item) go(idx - 1);
    setToast({
      ok: true,
      text: 'Slide deleted.',
      action: { label: 'Undo', run: () => (setSlides((ss) => [...ss.slice(0, at), removed, ...ss.slice(at)]), setSelectItem(removed.id)) },
    });
  };
  const deleteActive = () => deleteItem(active.item);
  // Drag-and-drop from the filmstrip: put `from` on the given side of `to` (hook = very start, CTA = very end).
  const reorder = (from, to, side) => {
    if (from === to) return;
    setSlides((ss) => {
      const fi = ss.findIndex((x) => x.id === from);
      if (fi < 0) return ss;
      const moving = ss[fi];
      const rest = ss.filter((_, i) => i !== fi);
      let ti;
      if (to === 'hook') ti = 0;
      else if (to === 'cta') ti = rest.length;
      else {
        const t = rest.findIndex((x) => x.id === to);
        if (t < 0) return ss;
        ti = side === 'left' ? t : t + 1;
      }
      return [...rest.slice(0, ti), moving, ...rest.slice(ti)];
    });
    setSelectItem(from);
  };
  const addAtEnd = (type) => {
    let slide;
    if (type === 'chat') {
      slide = { id: rid(), type: 'chat', reveal: false, messages: [{ id: rid(), sender: 'her', text: '' }, { id: rid(), sender: 'me', text: '' }] };
    } else if (type === 'reaction') {
      slide = { id: rid(), type: 'reaction', caption: '', mood: 'smirk', imageId: null };
    } else if (type === 'rizz') {
      slide = { id: rid(), type: 'rizz', reply: '' };
    } else if (type === 'plug') {
      slide = { id: rid(), type: 'plug', reply: '' };
    } else if (type === 'wrizz') {
      slide = { id: rid(), type: 'wrizz', reply: '' };
    }
    setSlides((ss) => [...ss, slide]);
    setSelectItem(slide.id);
  };
  const rizzIdx = script ? script.slides.findIndex((s) => s.type === 'rizz') : -1;
  const rizzItem = script?.slides[rizzIdx];
  const setReplyFor = (targetId, text) =>
    setSlides((ss) => {
      const r = ss.findIndex((s) => (targetId ? s.id === targetId : ['rizz', 'plug', 'wrizz'].includes(s.type)));
      if (r < 0) return ss;
      const old = ss[r].reply;
      return ss.map((s, i) => {
        if (i === r) return { ...s, reply: text };
        if (i === r + 1 && s.type === 'chat') return { ...s, messages: s.messages.map((m) => (m.sender === 'me' && m.text === old ? { ...m, text } : m)) };
        return s;
      });
    });
  const setReply = (text) => setReplyFor(active?.item, text);

  // ---------------- photos
  const assign = (key, imageId) => setScript((s) => setSlotImage(s, key, imageId));
  const uploadInto = async (files, keys) => {
    try {
      const added = await addPhotos(files, (i, n) => setUploading(`Adding ${i}/${n}…`));
      setLibrary((l) => [...added, ...l]);
      setScript((s) => {
        let out = s;
        const known = new Set(library.map((l) => l.id));
        const targets = keys || photoSlots(s).filter((p) => !p.imageId || !known.has(p.imageId)).map((p) => p.key);
        added.forEach((a, i) => targets[i] && (out = setSlotImage(out, targets[i], a.id)));
        return out;
      });
      if (!keys) setToast({ ok: true, text: `Added ${added.length} photo(s) to the empty slots.` });
    } catch (e) {
      fail(e);
    } finally {
      setUploading('');
    }
  };

  // ---------------- checks + export
  const rizzPos = slides.findIndex((s) => s.key === 'rizz') + 1;
  const firstHalf = rizzPos > 0 && rizzPos <= Math.ceil(slides.length / 2);
  const replyOk = rizzItem && script.slides[rizzIdx + 1]?.type === 'chat' && script.slides[rizzIdx + 1].messages.some((m) => m.sender === 'me' && m.text.trim() === rizzItem.reply.trim());
  const captionOk =
    script &&
    /^@rizz\.app\b/i.test(script.caption.trim()) &&
    /link in (the )?bio|enlace en (la )?bio|link en (la )?bio|link na bio|lien en bio|link w bio|odkaz v biu|länk i bio|link di bio|link sa bio|link în bio|link bio'da|link in de bio/i.test(script.caption);
  const slots = script ? photoSlots(script) : [];
  const filled = slots.filter((p) => libUrl(p.imageId)).length;
  const checks = script
    ? [
        [!!script.hook, 'Hook on slide 1'],
        [firstHalf, `RIZZ screen in first half (${rizzPos}/${slides.length})`],
        [!!replyOk, 'RIZZ reply is sent right after'],
        [filled === slots.length, `Photos ${filled}/${slots.length}`],
        [!!captionOk, 'Caption: @rizz.app … Link in Bio'],
        [slides.length >= 22 && slides.length <= 34, `${slides.length} slides (sweet spot 24–30)`],
      ]
    : [];

  const exportAll = async () => {
    setExporting('all');
    try {
      const files = [];
      for (const s of slides) {
        setExporting(`Rendering ${files.length + 1}/${slides.length}…`);
        files.push({ name: s.file, blob: await slideToBlob(s.spec) });
      }
      if (canShareFiles()) {
        await navigator.share({ files: files.map((f) => new File([f.blob], f.name, { type: 'image/png' })) });
      } else {
        const zip = new window.JSZip();
        const t0 = Date.now() - files.length * 60000;
        files.forEach((f, i) => zip.file(f.name, f.blob, { date: new Date(t0 + i * 60000) }));
        const zipBlob = await zip.generateAsync({
          type: 'blob',
          mimeType: 'application/zip',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 },
        });
        const dateStr = new Date().toISOString().slice(0, 10);
        download(zipBlob, `C-S-${dateStr}.zip`);
      }
    } catch (e) {
      if (e.name !== 'AbortError') fail(new Error(`Export failed: ${e.message}`));
    } finally {
      setExporting('');
    }
  };
  const exportOne = async () => {
    try {
      download(await slideToBlob(active.spec), active.file);
    } catch (e) {
      fail(new Error(`Export failed: ${e.message}`));
    }
  };

  // ================================================================ views

  const composer = html`<div class="compose">
    <div class="compose-head">
      <div class="eyebrow" style=${{ color: '#ff4d4d', letterSpacing: '0.08em', fontWeight: 700 }}>CLIP SYNDICATE · Dark Psychology Studio</div>
      <h1>Turn a mind game into a slideshow<br /><span class="grad" style=${{ background: 'linear-gradient(90deg, #ff4d4d, #ffffff 60%, #ff1a1a)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>and Make $$.</span></h1>
      <p class="muted">Describe the situation, or let the AI invent one. You'll get hook, chat beats, reaction captions and viral template screens, ready to edit slide by slide.</p>
    </div>
    <div class="compose-card">
      <div class="seg">
        ${[
          ['ai', '✨ Write with AI'],
          ['paste', 'Paste a script'],
        ].map(([k, l]) => html`<button type="button" class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${l}</button>`)}
      </div>
      ${tab === 'ai'
        ? html`<div class="compose-grid">
            <div class="stack">
              <textarea
                class="input big"
                rows="5"
                value=${brief.text}
                onInput=${(e) => setBrief({ text: e.target.value })}
                placeholder="She keeps bringing up the gym guy to see if I get jealous…"
              ></textarea>
              <div class="examples">
                ${EXAMPLES.map((e) => html`<button type="button" onClick=${() => setBrief({ text: e })}>${e}</button>`)}
              </div>
              <div>
                <${Btn} size="sm" onClick=${() => suggestList('ideas', 'ideas', { transcript: '', note: brief.tactic ? `Focus on: ${brief.tactic}` : '' })} busy=${suggestBusy === 'ideas' ? 'Thinking…' : ''}>🎲 Fresh ideas<//>
              </div>
              <${Suggestions} items=${suggest.ideas} onPick=${(t) => setBrief({ text: t })} />
            </div>
            <div class="stack">
              <${Field} label="Mind game">
                <div class="chips">
                  <button type="button" class=${`chip ${!brief.tactic ? 'on' : ''}`} onClick=${() => setBrief({ tactic: '' })}>AI picks</button>
                  ${(config?.tactics || []).map((t) => html`<button type="button" class=${`chip ${brief.tactic === t ? 'on' : ''}`} onClick=${() => setBrief({ tactic: t })}>${t}</button>`)}
                </div>
              <//>
              <div class="two">
                <${Slider} label="Slides" value=${brief.slideCount} min=${18} max=${34} onInput=${(v) => setBrief({ slideCount: v })} />
                <${Slider} label="Coldness" hint=${brief.coldness >= 75 ? 'ice' : brief.coldness >= 45 ? 'deadpan' : 'warm'} value=${brief.coldness} min=${0} max=${100} suffix="%" onInput=${(v) => setBrief({ coldness: v })} />
              </div>
              <div class="two">
                <${Field} label="Language">
                  <select class="input" value=${brief.language} onChange=${(e) => setLanguage(e.target.value)}>
                    ${(config?.languages || ['English']).map((l) => html`<option value=${l}>${l}</option>`)}
                  </select>
                <//>
                <${Field} label="Her name"><input class="input" value=${brief.herName} placeholder="AI picks" onInput=${(e) => setBrief({ herName: e.target.value })} /><//>
                <label class="toggle"><input type="checkbox" checked=${brief.skipEditor} onChange=${(e) => setBrief({ skipEditor: e.target.checked })} /><span>Fast mode</span></label>
              </div>
              ${busy ? html`<${GenProgress} phase=${phase} elapsed=${elapsed} skipEditor=${brief.skipEditor} />` : html`<${Btn} kind="primary" size="lg" onClick=${generate}>Generate slideshow →<//>`}
            </div>
          </div>`
        : html`<div class="compose-grid">
            <textarea class="input mono" rows="16" value=${pasted} onInput=${(e) => setPasted(e.target.value)} placeholder=${PASTE_EXAMPLE}></textarea>
            <div class="stack">
              <div class="format">
                <div><code>her:</code> / <code>me:</code> lines · blank line = new chat slide</div>
                <div><code>her!:</code> her line shows alone first</div>
                <div><code>react: caption | vibe</code> photo slide</div>
                <div><code>rizz: the reply</code> RIZZ APP screen</div>
                <div><code>plug: the reply</code> Plug AI template screen</div>
                <div><code>wrizz: the reply</code> WRizz template screen</div>
                <div><code>hook:</code> · <code>caption:</code> · or JSON</div>
              </div>
              <${Btn} size="sm" onClick=${() => setPasted(PASTE_EXAMPLE)}>Load example<//>
              <${Btn} kind="primary" size="lg" onClick=${usePasted} disabled=${!pasted.trim()}>Open in studio →<//>
            </div>
          </div>`}
    </div>
    ${history.length > 0 &&
    html`<div class="recent">
      <div class="field-label">Recent</div>
      <div class="recent-list">
        ${history.slice(0, 8).map(
          (h) => html`<button type="button" onClick=${() => openScript(h.script, h.at)}>
            <b>${h.hook || 'Untitled'}</b>
            <span class="muted">${new Date(h.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </button>`,
        )}
      </div>
    </div>`}
    ${script && html`<button type="button" class="back" onClick=${() => setComposing(false)}>← Back to the current slideshow</button>`}
  </div>`;

  // ---------------- inspector
  const slideActions =
    active &&
    html`<div class="actions">
      ${!['hook', 'cta'].includes(active.item) &&
      html`<${Btn} size="sm" title="Move earlier" onClick=${() => moveActive(-1)}>←<//><${Btn} size="sm" title="Move later" onClick=${() => moveActive(1)}>→<//>`}
      ${active.kind !== 'cta' && html`<${Btn} size="sm" onClick=${() => insertAfterActive('chat')}>+ Chat<//><${Btn} size="sm" onClick=${() => insertAfterActive('reaction')}>+ Photo<//><${Btn} size="sm" onClick=${() => insertAfterActive('rizz')}>+ Rizz<//><${Btn} size="sm" onClick=${() => insertAfterActive('plug')}>+ Plug<//><${Btn} size="sm" onClick=${() => insertAfterActive('wrizz')}>+ Wrizz<//>`}
      ${['chat', 'reaction', 'plug', 'wrizz'].includes(active.kind) && html`<${Btn} size="sm" kind="danger" onClick=${deleteActive}>Delete<//>`}
    </div>`;

  const inspectSlide = () => {
    if (!active) return null;
    if (active.kind === 'hook')
      return html`<div class="stack">
        <${Field} label="Hook" hint="slide 1 · stops the scroll">
          <${AutoText} rows=${2} value=${script.hook} onInput=${(v) => setScript({ hook: v.replace(/\n/g, ' ') })} placeholder="She Tried To Make Me Jealous. It Backfired." />
        <//>
        <div class="row gap">
          <${Btn} size="sm" onClick=${() => suggestList('hooks', 'hooks')} busy=${suggestBusy === 'hooks' ? 'Thinking…' : ''}>✨ Hook ideas<//>
          <div class="seg sm">
            ${[
              ['image', 'Photo'],
              ['text', 'Text only'],
            ].map(([k, l]) => html`<button type="button" class=${settings.hookStyle === k ? 'on' : ''} onClick=${() => setSettings({ hookStyle: k })}>${l}</button>`)}
          </div>
        </div>
        <${Suggestions} items=${suggest.hooks} onPick=${(t) => setScript({ hook: t })} />
        ${settings.hookStyle !== 'text' &&
        html`<${PhotoBox}
          cs=${settings.caption}
          url=${libUrl(script.hookImageId)}
          caption=${script.hook}
          busy=${uploading}
          onFiles=${(f) => uploadInto(f, ['hook'])}
          onLibrary=${() => setPicker({ key: 'hook' })}
          onClear=${() => assign('hook', null)}
        />`}
      </div>`;

    if (active.kind === 'reaction') {
      const s = script.slides.find((x) => x.id === active.item);
      return html`<div class="stack">
        <${Field} label="Caption" hint="the narrator's inner voice">
          <${AutoText} rows=${2} value=${s.caption} onInput=${(v) => updateSlide(s.id, { caption: v.replace(/\n/g, ' ') })} placeholder="She's checking the temperature." />
        <//>
        <div class="row gap">
          <${Btn} size="sm" onClick=${() => suggestList(`r-${s.id}`, 'reactions', { note: `Replace this caption: "${s.caption}". Vibe: ${s.mood}. Keep it consistent with the beats around it.` })} busy=${suggestBusy === `r-${s.id}` ? 'Thinking…' : ''}>✨ Caption ideas<//>
          <select class="input xs" value=${s.mood} title="Vibe (used to auto-pick photos)" onChange=${(e) => updateSlide(s.id, { mood: e.target.value })}>
            ${MOODS.map((m) => html`<option value=${m}>vibe: ${m}</option>`)}
          </select>
        </div>
        <${Suggestions} items=${suggest[`r-${s.id}`]} onPick=${(t) => updateSlide(s.id, { caption: t })} />
        <${PhotoBox} cs=${settings.caption} url=${libUrl(s.imageId)} caption=${s.caption} busy=${uploading} onFiles=${(f) => uploadInto(f, [s.id])} onLibrary=${() => setPicker({ key: s.id })} onClear=${() => assign(s.id, null)} />
      </div>`;
    }

    if (active.kind === 'chat') {
      const s = script.slides.find((x) => x.id === active.item);
      return html`<div class="stack">
        <div class="msgs">
          ${s.messages.map((m) => {
            const key = m.id;
            const isReply = rizzItem && itemIndex(s.id) === rizzIdx + 1 && m.sender === 'me' && m.text === rizzItem.reply;
            return html`<div class=${`msg ${m.sender} ${rewriting === key ? 'busy' : ''}`}>
              <button type="button" class="who" onClick=${() => updateMsg(s.id, m.id, { sender: m.sender === 'me' ? 'her' : 'me' })} title="Switch sender">${m.sender === 'me' ? 'Me' : 'Her'}</button>
              <${AutoText} value=${m.text} onInput=${(v) => updateMsg(s.id, m.id, { text: v.replace(/\n/g, ' ') })} placeholder=${m.sender === 'me' ? 'your reply…' : 'her message…'} className=${isReply ? 'accent' : ''} />
              <div class="msg-tools">
                <${ReactionPicker} value=${m.reaction} onChange=${(r) => updateMsg(s.id, m.id, { reaction: r })} />
                <button type="button" class="icon xs" title="Rewrite with AI" onClick=${() => (setNote(''), setOpenNote(openNote === key ? null : key))}>${rewriting === key ? '…' : '✨'}</button>
                <button type="button" class="icon xs" title="Remove" disabled=${s.messages.length === 1} onClick=${() => updateSlide(s.id, (x) => ({ messages: x.messages.filter((y) => y.id !== m.id) }))}>✕</button>
              </div>
            </div>
            ${openNote === key &&
            html`<div class="note">
              <input
                class="input"
                autofocus
                value=${note}
                placeholder="optional: shorter, colder, more gen-z…"
                onInput=${(e) => setNote(e.target.value)}
                onKeyDown=${(e) => e.key === 'Enter' && rewrite(key, `${m.sender}: "${m.text}"`, (t) => updateMsg(s.id, m.id, { text: t }))}
              />
              <${Btn} size="sm" kind="accent" onClick=${() => rewrite(key, `${m.sender}: "${m.text}"`, (t) => updateMsg(s.id, m.id, { text: t }))}>Rewrite<//>
            </div>`}`;
          })}
        </div>
        <div class="row gap">
          <${Btn} size="sm" onClick=${() => updateSlide(s.id, (x) => ({ messages: [...x.messages, { id: rid(), sender: 'her', text: '' }] }))}>+ Her<//>
          <${Btn} size="sm" onClick=${() => updateSlide(s.id, (x) => ({ messages: [...x.messages, { id: rid(), sender: 'me', text: '' }] }))}>+ Me<//>
        </div>
        <label class="toggle">
          <input type="checkbox" checked=${s.reveal} onChange=${(e) => updateSlide(s.id, { reveal: e.target.checked })} />
          <span>Cliffhanger: her line alone first, your reply on the next swipe</span>
        </label>
      </div>`;
    }

    if (active.kind === 'rizz') {
      const s = rizzItem || script.slides.find((x) => x.id === active.item) || { reply: '' };
      const alts = [...new Set([...(script.altReplies || []), ...(suggest.replies || [])])].filter((a) => a.trim());
      return html`<div class="stack">
        <div class=${`pill ${firstHalf ? 'ok' : 'bad'}`}>${firstHalf ? `✓ Slide ${rizzPos} of ${slides.length} · first half` : `Slide ${rizzPos} of ${slides.length} · move it into the first half`}</div>
        <${Field} label="The RIZZ reply" hint="you send this next">
          <${AutoText} className="accent" value=${s.reply} onInput=${setReply} placeholder="get the mango one, it's the best" />
        <//>
        ${!replyOk && html`<div class="pill bad">The next chat slide should send exactly this reply.</div>`}
        <div><${Btn} size="sm" onClick=${() => suggestList('replies', 'replies')} busy=${suggestBusy === 'replies' ? 'Thinking…' : ''}>✨ Colder replies<//></div>
        <${Suggestions} items=${alts} onPick=${setReply} prefix="↳ " />
        <div class="divider"></div>
        ${doc.rizzShot || s.screenshot
          ? html`<${Btn} size="sm" onClick=${() => (setDoc((d) => ({ ...d, rizzShot: null })), updateSlide(active.item, { screenshot: null }))}>✕ Back to the generated RIZZ screen<//>`
          : html`<label class="btn ghost sm" title="The campaign asks for a real, unedited screenshot from the RIZZ app.">
              📸 Use a real RIZZ screenshot
              <input type="file" accept="image/*" hidden onChange=${async (e) => {
                const f = e.target.files[0];
                e.target.value = '';
                if (f) {
                  const url = await fileToDataUrl(f, 1920, 0.9);
                  setDoc((d) => ({ ...d, rizzShot: url }));
                  updateSlide(active.item, { screenshot: url });
                }
              }} />
            </label>`}
        <${Field} label="Messages shown on the screen">
          <div class="seg sm">${[0, 1, 2, 3].map((v) => html`<button type="button" class=${settings.rizzContext === v ? 'on' : ''} onClick=${() => setSettings({ rizzContext: v })}>${v}</button>`)}</div>
        <//>
      </div>`;
    }

    if (active.kind === 'plug') {
      const s = script.slides.find((x) => x.id === active.item) || { reply: '' };
      return html`<div class="stack">
        <div class="pill ok" style=${{ borderColor: 'rgba(0, 152, 252, 0.5)', color: '#0098fc' }}>⚡ Plug AI Screenshot Template</div>
        <${Field} label="The Plug AI reply" hint="generates the Plug AI blue response bubble">
          <${AutoText} className="accent" value=${s.reply} onInput=${setReply} placeholder="your slick reply here…" />
        <//>
        <div class="divider"></div>
        ${s.screenshot
          ? html`<${Btn} size="sm" onClick=${() => updateSlide(active.item, { screenshot: null })}>✕ Back to generated Plug AI screen<//>`
          : html`<label class="btn ghost sm" title="Upload a custom screenshot for this Plug AI slide.">
              📸 Upload custom screenshot
              <input type="file" accept="image/*" hidden onChange=${async (e) => {
                const f = e.target.files[0];
                e.target.value = '';
                if (f) {
                  const url = await fileToDataUrl(f, 1920, 0.9);
                  updateSlide(active.item, { screenshot: url });
                }
              }} />
            </label>`}
        <${Field} label="Messages shown on the screen">
          <div class="seg sm">${[0, 1, 2, 3].map((v) => html`<button type="button" class=${settings.rizzContext === v ? 'on' : ''} onClick=${() => setSettings({ rizzContext: v })}>${v}</button>`)}</div>
        <//>
      </div>`;
    }

    if (active.kind === 'wrizz') {
      const s = script.slides.find((x) => x.id === active.item) || { reply: '' };
      return html`<div class="stack">
        <div class="pill ok" style=${{ borderColor: 'rgba(208, 1, 251, 0.5)', color: '#d001fb' }}>🔥 WRizz Screenshot Template</div>
        <${Field} label="The WRizz reply" hint="generates the WRizz purple gradient pill">
          <${AutoText} className="accent" value=${s.reply} onInput=${setReply} placeholder="your slick reply here…" />
        <//>
        <div class="divider"></div>
        ${s.screenshot
          ? html`<${Btn} size="sm" onClick=${() => updateSlide(active.item, { screenshot: null })}>✕ Back to generated WRizz screen<//>`
          : html`<label class="btn ghost sm" title="Upload a custom screenshot for this WRizz slide.">
              📸 Upload custom screenshot
              <input type="file" accept="image/*" hidden onChange=${async (e) => {
                const f = e.target.files[0];
                e.target.value = '';
                if (f) {
                  const url = await fileToDataUrl(f, 1920, 0.9);
                  updateSlide(active.item, { screenshot: url });
                }
              }} />
            </label>`}
        <${Field} label="Messages shown on the screen">
          <div class="seg sm">${[0, 1, 2, 3].map((v) => html`<button type="button" class=${settings.rizzContext === v ? 'on' : ''} onClick=${() => setSettings({ rizzContext: v })}>${v}</button>`)}</div>
        <//>
      </div>`;
    }

    return html`<div class="stack">
      <${Field} label="Headline" hint="use / for a line break">
        <input class="input" value=${settings.ctaHeadline.replace(/\n/g, ' / ')} onInput=${(e) => setSettings({ ctaHeadline: e.target.value.replace(/\s*\/\s*/g, '\n') })} />
      <//>
      <div class="two">
        <${Field} label="Pill"><input class="input" value=${settings.ctaSub} onInput=${(e) => setSettings({ ctaSub: e.target.value })} /><//>
        <${Field} label="Handle"><input class="input" value=${settings.handle} onInput=${(e) => setSettings({ handle: e.target.value })} /><//>
      </div>
      <p class="muted small">The CTA is always the last slide.</p>
    </div>`;
  };

  const setCaption = (p) => setSettings({ caption: { ...settings.caption, ...p } });
  const cs = settings.caption;
  const inspectStyle = () => html`<div class="stack">
    <${Field} label="Caption font" hint="hook + photo slides">
      <div class="fonts">
        ${Object.entries(CAPTION_FONTS).map(
          ([k, f]) => html`<button type="button" class=${`font-opt ${cs.font === k ? 'on' : ''}`} onClick=${() => setCaption({ font: k })}>
            <span style=${{ fontFamily: f.family, fontWeight: f.weight }}>She stayed calm.</span>
            <small>${f.label}</small>
          </button>`,
        )}
      </div>
    <//>
    <${Slider} label="Black outline" hint=${cs.outline ? `${cs.outline}px` : 'off'} value=${cs.outline} min=${0} max=${6} onInput=${(v) => setCaption({ outline: v })} />
    <${Slider} label="Caption size" value=${Math.round(cs.size * 100)} min=${70} max=${150} suffix="%" onInput=${(v) => setCaption({ size: v / 100 })} />
    <div class="two">
      <${Field} label="Caption position">
        <div class="seg sm">
          ${[
            ['center', 'Middle'],
            ['lower', 'Lower'],
          ].map(([k, l]) => html`<button type="button" class=${cs.pos === k ? 'on' : ''} onClick=${() => setCaption({ pos: k })}>${l}</button>`)}
        </div>
      <//>
      <${Field} label="Photo shape">
        <div class="seg sm">
          ${Object.keys(PHOTO_ASPECTS).map((k) => html`<button type="button" class=${cs.aspect === k ? 'on' : ''} onClick=${() => setCaption({ aspect: k })}>${k}</button>`)}
        </div>
      <//>
    </div>
    <div class="divider"></div>
    <div class="two">
      <${Field} label="Slide theme">
        <div class="seg sm">
          ${[
            ['dark', '◐ Dark'],
            ['light', '◑ Light'],
          ].map(([k, l]) => html`<button type="button" class=${settings.theme === k ? 'on' : ''} onClick=${() => setSettings({ theme: k })}>${l}</button>`)}
        </div>
      <//>
      <${Field} label="Chat text">
        <select class="input" value=${settings.chatSize} onChange=${(e) => setSettings({ chatSize: Number(e.target.value) })}>
          ${[
            [17, 'Small'],
            [19, 'Normal'],
            [21, 'Large'],
            [23, 'XL'],
          ].map(([v, l]) => html`<option value=${v}>${l}</option>`)}
        </select>
      <//>
    </div>
    <p class="muted small">Style applies to every slide and is remembered for your next slideshows.</p>
  </div>`;

  const inspectPost = () => html`<div class="stack">
    <${Field} label="TikTok caption">
      <${AutoText} rows=${3} value=${script.caption} onInput=${(v) => setScript({ caption: v })} />
    <//>
    <div class="row gap">
      <${Btn} size="sm" onClick=${() => (navigator.clipboard.writeText(script.caption), setToast({ ok: true, text: 'Caption copied' }))}>Copy<//>
      <${Btn} size="sm" onClick=${() => suggestList('captions', 'captions')} busy=${suggestBusy === 'captions' ? 'Thinking…' : ''}>✨ Variants<//>
    </div>
    <${Suggestions} items=${suggest.captions} onPick=${(t) => setScript({ caption: t })} />
    <div class="divider"></div>
    <div class="field-label">Checklist</div>
    <div class="checks">${checks.map(([ok, t]) => html`<div class=${ok ? 'ok' : 'bad'}>${ok ? '✓' : '•'} ${t}</div>`)}</div>
    <div class="divider"></div>
    <div class="two">
      <${Field} label="Phone clock"><input class="input" value=${settings.time} onInput=${(e) => setSettings({ time: e.target.value })} /><//>
    </div>
    <${Field} label="File numbering starts at">
      <input class="input" type="number" min="0" value=${settings.numberFrom} onInput=${(e) => setSettings({ numberFrom: Math.max(0, Number(e.target.value) || 0) })} />
    <//>
    <p class="muted small">Exports are 1080×1920 PNGs named in posting order. On Instagram, post as a Reel.</p>
  </div>`;

  const [stageOver, stageDrop] = useDrop(active?.photoKey ? (f) => uploadInto(f, [active.photoKey]) : null);

  const studio =
    script &&
    html`<div class="studio">
      <header class="bar">
        <div class="bar-left" style=${{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/brand/clip-syndicate-logo.jpg" alt="Clip Syndicate" style=${{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', boxShadow: '0 0 10px rgba(255, 30, 30, 0.5)', border: '1px solid rgba(255, 60, 60, 0.4)' }} />
          <span style=${{ fontWeight: 800, fontSize: '15px', letterSpacing: '0.04em', color: '#ffffff', whiteSpace: 'nowrap' }}>CLIP SYNDICATE</span>
          <span class="dot" style=${{ opacity: 0.35 }}>·</span>
          <span class="bar-title" title=${script.hook}>${script.hook || 'Untitled slideshow'}</span>
        </div>
        <div class="bar-right">
          <${Btn} size="sm" onClick=${() => setComposing(true)}>＋ New<//>
          <${Btn} size="sm" title="Sign out" onClick=${logout}>⎋<//>
          <${Btn} size="sm" onClick=${() => setPicker({ key: null })}>🖼 Photos ${library.length ? html`<span class="badge">${library.length}</span>` : ''}<//>
          <label class=${`btn ghost sm ${filled < slots.length ? 'attn' : ''}`} title="Pick several photos: they fill the empty photo slides in order">
            ${uploading || `⬆ Fill photos (${slots.length - filled} empty)`}
            <input type="file" accept="image/*" multiple hidden onChange=${(e) => (uploadInto(e.target.files), (e.target.value = ''))} />
          </label>
          <${Btn} kind="primary" size="sm" onClick=${exportAll} busy=${exporting}>${canShareFiles() ? 'Save to Photos' : 'Export ZIP'}<//>
        </div>
      </header>

      <aside class="inspector">
        <div class="seg full">
          <button type="button" class=${panel === 'slide' ? 'on' : ''} onClick=${() => setPanel('slide')}>Slide ${active ? active.num : ''}</button>
          <button type="button" class=${panel === 'style' ? 'on' : ''} onClick=${() => setPanel('style')}>Style</button>
          <button type="button" class=${panel === 'post' ? 'on' : ''} onClick=${() => setPanel('post')}>Post ${checks.every(([ok]) => ok) ? '✓' : `· ${checks.filter(([ok]) => !ok).length}`}</button>
        </div>
        ${panel === 'slide'
          ? html`<div class="inspect-head">
                <span class=${`kind k-${active?.kind}`}>${{ hook: 'Hook', chat: 'Chat', reaction: 'Photo + caption', rizz: 'RIZZ APP screen', plug: 'Plug AI screen', wrizz: 'WRizz screen', cta: 'Call to action' }[active?.kind] || active?.kind}</span>
                ${slideActions}
              </div>
              ${inspectSlide()}`
          : panel === 'style'
            ? inspectStyle()
            : inspectPost()}
      </aside>

      <section class="stage">
        <button type="button" class="nav prev" disabled=${idx === 0} onClick=${() => go(idx - 1)} aria-label="Previous slide">‹</button>
        <div class="stage-col">
          <div class=${`phone ${stageOver ? 'over' : ''}`} ...${stageDrop}>
            ${active && html`<${SlideCanvas} spec=${active.spec} hint=${!!active.photoKey} />`}
          </div>
          <div class="stage-meta">
            <span>${idx + 1} / ${slides.length}</span>
            <span class="dot">·</span>
            <span>${active?.label}</span>
            <button type="button" class="link" onClick=${exportOne}>⬇ PNG</button>
          </div>
        </div>
        <button type="button" class="nav next" disabled=${idx === slides.length - 1} onClick=${() => go(idx + 1)} aria-label="Next slide">›</button>
      </section>

      <footer class="filmstrip" ref=${strip}>
        ${slides.map(
          (s, i) => html`<${Thumb}
            key=${s.key}
            slide=${s}
            on=${i === idx}
            onClick=${() => go(i)}
            onFiles=${s.photoKey ? (f) => uploadInto(f, [s.photoKey]) : null}
            onReorder=${reorder}
            onDelete=${s.kind === 'chat' || s.kind === 'reaction' ? () => deleteItem(s.item) : null}
          />`,
        )}
        <${AddTile} onAdd=${addAtEnd} />
      </footer>
    </div>`;

  return html`<div class="app">
    ${composing || !script ? composer : studio}
    ${toast &&
    html`<div class=${`toast ${toast.ok ? 'ok' : 'bad'}`} onClick=${() => setToast(null)}>
      <span>${toast.text}</span>
      ${toast.action && html`<button type="button" class="toast-action" onClick=${(e) => (e.stopPropagation(), toast.action.run(), setToast(null))}>${toast.action.label}</button>`}
    </div>`}
    ${picker &&
    html`<${LibraryModal}
      library=${library}
      setLibrary=${setLibrary}
      target=${!!picker.key}
      caption=${picker.key === 'hook' ? script?.hook : script?.slides.find((x) => x.id === picker.key)?.caption}
      onClose=${() => setPicker(null)}
      onPick=${(id) => {
        assign(picker.key, id);
        setPicker(null);
      }}
    />`}
  </div>`;
}

render(html`<${App} />`, document.getElementById('app'));
