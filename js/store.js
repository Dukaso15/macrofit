/**
 * Persistencia local sobre IndexedDB.
 * Todo vive en el movil: no hay servidor ni cuentas.
 */

const DB_NAME = 'macrofit';
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (ev) => {
      const db = req.result;

      if (!db.objectStoreNames.contains('foods')) {
        const foods = db.createObjectStore('foods', { keyPath: 'id' });
        foods.createIndex('search', 'search');
        foods.createIndex('lastUsed', 'lastUsed');
        foods.createIndex('favorite', 'favorite');
      }

      if (!db.objectStoreNames.contains('entries')) {
        const entries = db.createObjectStore('entries', { keyPath: 'id' });
        entries.createIndex('date', 'date');
        entries.createIndex('dateMeal', ['date', 'meal']);
        entries.createIndex('foodId', 'foodId');
      }

      if (!db.objectStoreNames.contains('weights')) {
        db.createObjectStore('weights', { keyPath: 'date' });
      }

      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }

      void ev;
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Hay otra pestana de la app abierta bloqueando la actualizacion.'));
  });
  return dbPromise;
}

function tx(storeNames, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeNames, mode);
        const stores = Array.isArray(storeNames)
          ? storeNames.map((n) => t.objectStore(n))
          : t.objectStore(storeNames);
        let result;
        try {
          result = fn(stores, t);
        } catch (err) {
          t.abort();
          reject(err);
          return;
        }
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error('Transaccion cancelada'));
      })
  );
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Clave de busqueda normalizada: sin acentos, en minusculas. */
export function searchKey(...parts) {
  return parts
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/* ------------------------------------------------------------------ */
/* Alimentos                                                           */
/* ------------------------------------------------------------------ */

export const foods = {
  async all() {
    const db = await open();
    return reqToPromise(db.transaction('foods').objectStore('foods').getAll());
  },

  async get(id) {
    const db = await open();
    return reqToPromise(db.transaction('foods').objectStore('foods').get(id));
  },

  async save(food) {
    const now = Date.now();
    const record = {
      unit: 'g',
      favorite: 0,
      timesUsed: 0,
      lastUsed: 0,
      portions: [],
      source: 'manual',
      ...food,
      id: food.id || uid(),
      search: searchKey(food.name, food.brand),
      createdAt: food.createdAt || now,
      updatedAt: now,
    };
    await tx('foods', 'readwrite', (store) => store.put(record));
    return record;
  },

  async remove(id) {
    return tx('foods', 'readwrite', (store) => store.delete(id));
  },

  /**
   * Marca uso para que los recientes suban en la lista.
   * El get y el put van en el mismo turno de la transaccion: si se usara
   * await en medio, IndexedDB la habria cerrado antes del put.
   */
  async touch(id) {
    return tx('foods', 'readwrite', (store) => {
      const req = store.get(id);
      req.onsuccess = () => {
        const food = req.result;
        if (!food) return;
        food.timesUsed = (food.timesUsed || 0) + 1;
        food.lastUsed = Date.now();
        store.put(food);
      };
    });
  },

  /** Busqueda por prefijo de palabra, tolerante a acentos. */
  async search(query, limit = 60) {
    const all = await foods.all();
    const q = searchKey(query);
    if (!q) {
      return all
        .sort((a, b) => (b.favorite - a.favorite) || (b.lastUsed || 0) - (a.lastUsed || 0) || a.name.localeCompare(b.name))
        .slice(0, limit);
    }
    const terms = q.split(/\s+/);
    return all
      .map((f) => ({ f, score: score(f, terms) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.f.name.localeCompare(b.f.name))
      .slice(0, limit)
      .map((x) => x.f);
  },
};

function score(food, terms) {
  const hay = food.search || '';
  let total = 0;
  for (const t of terms) {
    const at = hay.indexOf(t);
    if (at < 0) return 0;
    total += at === 0 ? 3 : /\s/.test(hay[at - 1] || '') ? 2 : 1;
  }
  if (food.favorite) total += 4;
  if (food.timesUsed) total += Math.min(food.timesUsed, 5) * 0.4;
  return total;
}

/* ------------------------------------------------------------------ */
/* Registros del diario                                                */
/* ------------------------------------------------------------------ */

export const entries = {
  async byDate(date) {
    const db = await open();
    const idx = db.transaction('entries').objectStore('entries').index('date');
    const rows = await reqToPromise(idx.getAll(IDBKeyRange.only(date)));
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  },

  async range(fromDate, toDate) {
    const db = await open();
    const idx = db.transaction('entries').objectStore('entries').index('date');
    return reqToPromise(idx.getAll(IDBKeyRange.bound(fromDate, toDate)));
  },

  async save(entry) {
    const record = { ...entry, id: entry.id || uid(), createdAt: entry.createdAt || Date.now() };
    await tx('entries', 'readwrite', (store) => store.put(record));
    return record;
  },

  async remove(id) {
    return tx('entries', 'readwrite', (store) => store.delete(id));
  },

  /** Copia todos los registros de un dia a otro (util para dias repetidos). */
  async copyDay(fromDate, toDate) {
    const rows = await entries.byDate(fromDate);
    const now = Date.now();
    await tx('entries', 'readwrite', (store) => {
      rows.forEach((r, i) => {
        store.put({ ...r, id: uid(), date: toDate, createdAt: now + i });
      });
    });
    return rows.length;
  },
};

/* ------------------------------------------------------------------ */
/* Peso corporal                                                       */
/* ------------------------------------------------------------------ */

export const weights = {
  async all() {
    const db = await open();
    const rows = await reqToPromise(db.transaction('weights').objectStore('weights').getAll());
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  },
  async save(date, kg) {
    await tx('weights', 'readwrite', (store) => store.put({ date, kg: Number(kg), updatedAt: Date.now() }));
  },
  async remove(date) {
    return tx('weights', 'readwrite', (store) => store.delete(date));
  },
};

/* ------------------------------------------------------------------ */
/* Ajustes y perfil                                                    */
/* ------------------------------------------------------------------ */

export const meta = {
  async get(key, fallback = null) {
    const db = await open();
    const row = await reqToPromise(db.transaction('meta').objectStore('meta').get(key));
    return row ? row.value : fallback;
  },
  async set(key, value) {
    return tx('meta', 'readwrite', (store) => store.put({ key, value }));
  },
};

/* ------------------------------------------------------------------ */
/* Copia de seguridad                                                  */
/* ------------------------------------------------------------------ */

async function blobToDataUrl(blob) {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => resolve(null);
    fr.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  try {
    const [head, b64] = dataUrl.split(',');
    const mime = (head.match(/:(.*?);/) || [])[1] || 'image/jpeg';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  } catch {
    return null;
  }
}

/** Vuelca toda la base de datos a un objeto JSON serializable. */
export async function exportAll({ includePhotos = true } = {}) {
  const db = await open();
  const [f, e, w] = await Promise.all([
    reqToPromise(db.transaction('foods').objectStore('foods').getAll()),
    reqToPromise(db.transaction('entries').objectStore('entries').getAll()),
    reqToPromise(db.transaction('weights').objectStore('weights').getAll()),
  ]);
  const m = await reqToPromise(db.transaction('meta').objectStore('meta').getAll());

  const outFoods = [];
  for (const food of f) {
    const copy = { ...food };
    if (copy.photo instanceof Blob) {
      copy.photo = includePhotos ? await blobToDataUrl(copy.photo) : null;
    }
    outFoods.push(copy);
  }

  return {
    app: 'macrofit',
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    foods: outFoods,
    entries: e,
    weights: w,
    meta: m,
  };
}

/**
 * Restaura una copia de seguridad.
 * @param {object} data       objeto devuelto por exportAll
 * @param {'merge'|'replace'} mode
 */
export async function importAll(data, mode = 'merge') {
  if (!data || data.app !== 'macrofit') {
    throw new Error('El fichero no es una copia de seguridad de MacroFit.');
  }

  const db = await open();
  const t = db.transaction(['foods', 'entries', 'weights', 'meta'], 'readwrite');
  const sFoods = t.objectStore('foods');
  const sEntries = t.objectStore('entries');
  const sWeights = t.objectStore('weights');
  const sMeta = t.objectStore('meta');

  if (mode === 'replace') {
    sFoods.clear();
    sEntries.clear();
    sWeights.clear();
    sMeta.clear();
  }

  for (const food of data.foods || []) {
    const copy = { ...food };
    if (typeof copy.photo === 'string' && copy.photo.startsWith('data:')) {
      copy.photo = dataUrlToBlob(copy.photo);
    }
    copy.search = searchKey(copy.name, copy.brand);
    sFoods.put(copy);
  }
  for (const e of data.entries || []) sEntries.put(e);
  for (const w of data.weights || []) sWeights.put(w);
  for (const m of data.meta || []) sMeta.put(m);

  return new Promise((resolve, reject) => {
    t.oncomplete = () =>
      resolve({
        foods: (data.foods || []).length,
        entries: (data.entries || []).length,
        weights: (data.weights || []).length,
      });
    t.onerror = () => reject(t.error);
  });
}

/** Borra todo. Usado solo desde Ajustes, con doble confirmacion. */
export async function wipe() {
  return tx(['foods', 'entries', 'weights', 'meta'], 'readwrite', (stores) => {
    stores.forEach((s) => s.clear());
  });
}

/** Espacio ocupado, para mostrarlo en Ajustes. */
export async function usage() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    const { usage: used, quota } = await navigator.storage.estimate();
    return { used, quota };
  } catch {
    return null;
  }
}

export default { foods, entries, weights, meta, exportAll, importAll, wipe, usage, uid, searchKey };
