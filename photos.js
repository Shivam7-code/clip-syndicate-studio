// Reaction-photo library stored in this browser (IndexedDB). Photos never leave the device,
// which keeps them private and means the hosted site needs no file storage.
const DB = 'rizz-photos';
const STORE = 'photos';
const urls = new Map(); // id -> object URL (kept for the session so slides render instantly)

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
}

const view = (rec) => {
  if (!urls.has(rec.id)) urls.set(rec.id, URL.createObjectURL(rec.blob));
  return { id: rec.id, url: urls.get(rec.id), tags: rec.tags || [], name: rec.name, createdAt: rec.createdAt };
};

export async function listPhotos() {
  const all = await tx('readonly', (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt).map(view);
}

// Downscale big photos so hundreds of them stay light (max 1600 px, JPEG).
function shrink(file, max = 1600, q = 0.88) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error(`Could not read ${file.name}`))), 'image/jpeg', q);
    };
    img.onerror = () => reject(new Error(`Could not read ${file.name}`));
    img.src = URL.createObjectURL(file);
  });
}

export async function addPhotos(files, onProgress) {
  const list = [...files].filter((f) => f.type.startsWith('image/'));
  const added = [];
  for (const [i, f] of list.entries()) {
    onProgress?.(i + 1, list.length);
    // Sub-folder names that match a vibe (smirk/, called-it/…) become the tag.
    const folder = (f.webkitRelativePath || '').split('/').slice(-2, -1)[0]?.toLowerCase();
    const rec = { id: Math.random().toString(36).slice(2, 12), blob: await shrink(f), name: f.name, tags: folder ? [folder] : [], createdAt: Date.now() + i };
    await tx('readwrite', (s) => s.put(rec));
    added.push(view(rec));
  }
  return added;
}

export async function setPhotoTags(id, tags) {
  const rec = await tx('readonly', (s) => s.get(id));
  if (rec) await tx('readwrite', (s) => s.put({ ...rec, tags }));
}

/** Deletes photos older than `maxAgeMs`. Returns how many were removed. */
export async function purgeOldPhotos(maxAgeMs) {
  const cutoff = Date.now() - maxAgeMs;
  const old = (await tx('readonly', (s) => s.getAll())).filter((r) => r.createdAt < cutoff);
  for (const r of old) await deletePhoto(r.id);
  return old.length;
}

export async function deletePhoto(id) {
  await tx('readwrite', (s) => s.delete(id));
  if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
  urls.delete(id);
}
