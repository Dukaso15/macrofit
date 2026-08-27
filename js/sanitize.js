/**
 * Saneado de copias de seguridad.
 *
 * Importar es la unica puerta por la que entran datos que no ha escrito la
 * propia app. Un fichero manipulado podria traer, por ejemplo, una edad que
 * en vez de un numero fuera texto con etiquetas HTML, y acabar inyectado en
 * la interfaz. Aqui se reconstruye la estructura entera desde cero: solo se
 * copian los campos conocidos y cada uno se fuerza a su tipo.
 *
 * Regla: nunca se confia en la forma del fichero, solo en su contenido
 * despues de pasar por aqui.
 */

const MEAL_IDS = ['desayuno', 'almuerzo', 'comida', 'merienda', 'cena'];
const SOURCES = ['manual', 'scan', 'seed'];
const UNITS = ['g', 'ml'];
const SEXES = ['m', 'f'];
const MODES = ['auto', 'manual'];
const ACTIVITIES = ['sedentary', 'light', 'moderate', 'active', 'veryActive'];
const GOAL_IDS = ['lose', 'maintain', 'gain'];
const PRESETS = ['balanced', 'highProt', 'lowCarb', 'bulk', 'custom'];
const THEMES = ['light', 'dark', 'system'];
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/* ------------------------------------------------------------------ */
/* Primitivas                                                          */
/* ------------------------------------------------------------------ */

/** Texto plano: sin caracteres de control y con longitud acotada. */
export function cleanText(v, max = 120) {
  if (typeof v !== 'string') {
    if (typeof v === 'number' && Number.isFinite(v)) v = String(v);
    else return null;
  }
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

/** Numero finito dentro de un rango. Devuelve null si no lo es. */
export function cleanNum(v, min, max) {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(n, min), max);
}

function pick(v, allowed, fallback) {
  return allowed.includes(v) ? v : fallback;
}

function cleanId(v) {
  return typeof v === 'string' && ID_RE.test(v) ? v : null;
}

function cleanDate(v) {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return null;
  const d = new Date(v + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? null : v;
}

function cleanTimestamp(v) {
  return cleanNum(v, 0, 4102444800000) ?? Date.now();   // tope: ano 2100
}

/**
 * Solo se aceptan imagenes, y el tipo se reescribe a partir de la lista
 * blanca: un data URL que dijera ser text/html no debe llegar a un Blob.
 */
function cleanPhoto(v) {
  if (!v) return null;
  if (typeof v !== 'string' || !v.startsWith('data:')) return null;
  const m = v.match(/^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (!IMAGE_MIMES.includes(mime)) return null;
  if (m[2].length > 8 * 1024 * 1024) return null;        // ~6 MB de imagen
  return { dataUrl: 'data:' + mime + ';base64,' + m[2].replace(/\s/g, ''), mime };
}

/* ------------------------------------------------------------------ */
/* Registros                                                           */
/* ------------------------------------------------------------------ */

const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat', 'satFat', 'sugars', 'fiber', 'salt'];

export function cleanFood(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = cleanText(raw.name, 120);
  if (!name) return null;

  const food = {
    id: cleanId(raw.id),
    name,
    brand: cleanText(raw.brand, 80),
    unit: pick(raw.unit, UNITS, 'g'),
    portions: Array.isArray(raw.portions)
      ? raw.portions.slice(0, 24).map((p) => {
          const label = cleanText(p && p.label, 40);
          const grams = cleanNum(p && p.grams, 0, 100000);
          return label && grams ? { label, grams } : null;
        }).filter(Boolean)
      : [],
    photo: cleanPhoto(raw.photo),
    favorite: raw.favorite ? 1 : 0,
    timesUsed: cleanNum(raw.timesUsed, 0, 1e9) ?? 0,
    lastUsed: cleanNum(raw.lastUsed, 0, 4102444800000) ?? 0,
    createdAt: cleanTimestamp(raw.createdAt),
    updatedAt: Date.now(),
    source: pick(raw.source, SOURCES, 'manual'),
  };

  for (const k of NUTRIENTS) food[k] = cleanNum(raw[k], 0, 100000);
  if (food.kcal === null) food.kcal = 0;
  for (const k of ['protein', 'carbs', 'fat']) if (food[k] === null) food[k] = 0;

  return food;
}

export function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const date = cleanDate(raw.date);
  const name = cleanText(raw.name, 120);
  if (!date || !name) return null;

  const nutrients = {};
  const src = raw.nutrients && typeof raw.nutrients === 'object' ? raw.nutrients : {};
  for (const k of NUTRIENTS) nutrients[k] = cleanNum(src[k], 0, 1e6);
  if (nutrients.kcal === null) nutrients.kcal = 0;

  const snap = raw.snapshot && typeof raw.snapshot === 'object' ? raw.snapshot : null;
  const snapshot = snap ? {} : null;
  if (snap) for (const k of NUTRIENTS) snapshot[k] = cleanNum(snap[k], 0, 100000);

  return {
    id: cleanId(raw.id),
    date,
    meal: pick(raw.meal, MEAL_IDS, 'comida'),
    foodId: cleanId(raw.foodId),
    name,
    brand: cleanText(raw.brand, 80),
    grams: cleanNum(raw.grams, 0, 100000) ?? 0,
    unit: pick(raw.unit, UNITS, 'g'),
    portionLabel: cleanText(raw.portionLabel, 40),
    nutrients,
    snapshot,
    createdAt: cleanTimestamp(raw.createdAt),
  };
}

export function cleanWeight(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const date = cleanDate(raw.date);
  const kg = cleanNum(raw.kg, 10, 500);
  if (!date || kg === null) return null;
  return { date, kg, updatedAt: cleanTimestamp(raw.updatedAt) };
}

/** El perfil alimenta los formularios de objetivos: aqui todo es numero o lista blanca. */
export function cleanProfile(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const split = p.split && typeof p.split === 'object' ? p.split : {};
  const manual = p.manual && typeof p.manual === 'object' ? p.manual : {};

  return {
    mode: pick(p.mode, MODES, 'auto'),
    sex: pick(p.sex, SEXES, 'm'),
    age: cleanNum(p.age, 10, 120) ?? 30,
    heightCm: cleanNum(p.heightCm, 80, 260) ?? 175,
    weightKg: cleanNum(p.weightKg, 20, 400) ?? 75,
    activity: pick(p.activity, ACTIVITIES, 'moderate'),
    goal: pick(p.goal, GOAL_IDS, 'maintain'),
    rateKgWeek: cleanNum(p.rateKgWeek, -1.5, 1.5) ?? 0,
    preset: pick(p.preset, PRESETS, 'balanced'),
    split: {
      protein: cleanNum(split.protein, 0, 100) ?? 30,
      carbs: cleanNum(split.carbs, 0, 100) ?? 40,
      fat: cleanNum(split.fat, 0, 100) ?? 30,
    },
    proteinPerKg: cleanNum(p.proteinPerKg, 0.5, 5),
    manual: {
      kcal: cleanNum(manual.kcal, 0, 20000) ?? 2200,
      protein: cleanNum(manual.protein, 0, 2000) ?? 165,
      carbs: cleanNum(manual.carbs, 0, 2000) ?? 220,
      fat: cleanNum(manual.fat, 0, 2000) ?? 73,
    },
    onboarded: !!p.onboarded,
  };
}

/* ------------------------------------------------------------------ */
/* Copia completa                                                      */
/* ------------------------------------------------------------------ */

const MAX = { foods: 20000, entries: 200000, weights: 20000 };

/**
 * Reconstruye una copia de seguridad campo a campo.
 * @returns {{data: object, stats: object}} datos limpios y que se descarto
 */
export function sanitizeBackup(raw) {
  if (!raw || typeof raw !== 'object' || raw.app !== 'macrofit') {
    throw new Error('El fichero no es una copia de seguridad de MacroFit.');
  }

  const arr = (v) => (Array.isArray(v) ? v : []);
  const stats = { descartados: { foods: 0, entries: 0, weights: 0, meta: 0 } };

  const clean = (list, fn, cap, key) => {
    const out = [];
    for (const item of list.slice(0, cap)) {
      const c = fn(item);
      if (c) out.push(c);
      else stats.descartados[key]++;
    }
    if (list.length > cap) stats.descartados[key] += list.length - cap;
    return out;
  };

  const foods = clean(arr(raw.foods), cleanFood, MAX.foods, 'foods');
  const entries = clean(arr(raw.entries), cleanEntry, MAX.entries, 'entries');
  const weights = clean(arr(raw.weights), cleanWeight, MAX.weights, 'weights');

  // De los ajustes solo se reconocen dos claves; el resto se tira.
  const meta = [];
  for (const m of arr(raw.meta)) {
    if (!m || typeof m !== 'object') { stats.descartados.meta++; continue; }
    if (m.key === 'profile') meta.push({ key: 'profile', value: cleanProfile(m.value) });
    else if (m.key === 'theme') meta.push({ key: 'theme', value: pick(m.value, THEMES, 'system') });
    else stats.descartados.meta++;
  }

  stats.total = { foods: foods.length, entries: entries.length, weights: weights.length };
  return { data: { app: 'macrofit', foods, entries, weights, meta }, stats };
}

export default { sanitizeBackup, cleanFood, cleanEntry, cleanWeight, cleanProfile, cleanText, cleanNum };
