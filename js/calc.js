/**
 * Calculos nutricionales: gasto energetico, reparto de macros y agregados del diario.
 * Todo en unidades del sistema internacional (kg, cm, g, kcal).
 */

/* ------------------------------------------------------------------ */
/* Gasto energetico                                                    */
/* ------------------------------------------------------------------ */

/** Metabolismo basal por Mifflin-St Jeor (el mas fiable para poblacion general). */
export function bmr({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(sex === 'f' ? base - 161 : base + 5);
}

export const ACTIVITY = [
  { id: 'sedentary', factor: 1.2,   label: 'Sedentario',      hint: 'Trabajo de oficina, sin ejercicio' },
  { id: 'light',     factor: 1.375, label: 'Ligero',          hint: 'Ejercicio suave 1-3 dias por semana' },
  { id: 'moderate',  factor: 1.55,  label: 'Moderado',        hint: 'Ejercicio 3-5 dias por semana' },
  { id: 'active',    factor: 1.725, label: 'Activo',          hint: 'Ejercicio intenso 6-7 dias por semana' },
  { id: 'veryActive',factor: 1.9,   label: 'Muy activo',      hint: 'Trabajo fisico o doble sesion diaria' },
];

/** Gasto energetico total diario. */
export function tdee(profile) {
  const act = ACTIVITY.find((a) => a.id === profile.activity) || ACTIVITY[0];
  return Math.round(bmr(profile) * act.factor);
}

export const GOALS = [
  { id: 'lose',     label: 'Perder grasa',   defaultRate: -0.5 },
  { id: 'maintain', label: 'Mantenimiento',  defaultRate: 0 },
  { id: 'gain',     label: 'Ganar musculo',  defaultRate: 0.25 },
];

/**
 * Calorias objetivo a partir del ritmo semanal deseado en kg.
 * 1 kg de grasa corporal equivale aproximadamente a 7700 kcal.
 */
export function targetCalories(profile) {
  const maintenance = tdee(profile);
  const rate = Number(profile.rateKgWeek || 0);
  const daily = Math.round((rate * 7700) / 7);
  // Suelo de seguridad: nunca por debajo del metabolismo basal ni de 1200 kcal.
  const floor = Math.max(1200, Math.round(bmr(profile) * 0.95));
  return Math.max(floor, maintenance + daily);
}

/* ------------------------------------------------------------------ */
/* Reparto de macros                                                   */
/* ------------------------------------------------------------------ */

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9, alcohol: 7 };

export const MACRO_PRESETS = [
  { id: 'balanced', label: 'Equilibrada',    split: { protein: 30, carbs: 40, fat: 30 }, hint: 'Buen punto de partida para casi todo' },
  { id: 'highProt', label: 'Alta en proteina', split: { protein: 40, carbs: 35, fat: 25 }, hint: 'Definicion manteniendo musculo' },
  { id: 'lowCarb',  label: 'Baja en carbos',  split: { protein: 35, carbs: 20, fat: 45 }, hint: 'Menos hidratos, mas grasa saludable' },
  { id: 'bulk',     label: 'Volumen',         split: { protein: 25, carbs: 50, fat: 25 }, hint: 'Mas energia para entrenar y crecer' },
  { id: 'custom',   label: 'Personalizada',   split: null, hint: 'Ajusta tu los tres porcentajes' },
];

/** Convierte un reparto en porcentajes a gramos diarios. */
export function macrosFromSplit(kcal, split) {
  return {
    protein: Math.round((kcal * (split.protein / 100)) / KCAL_PER_G.protein),
    carbs: Math.round((kcal * (split.carbs / 100)) / KCAL_PER_G.carbs),
    fat: Math.round((kcal * (split.fat / 100)) / KCAL_PER_G.fat),
  };
}

/** Convierte gramos diarios en porcentajes (para mostrar el reparto real). */
export function splitFromMacros(macros) {
  const kcal =
    macros.protein * KCAL_PER_G.protein +
    macros.carbs * KCAL_PER_G.carbs +
    macros.fat * KCAL_PER_G.fat;
  if (!kcal) return { protein: 0, carbs: 0, fat: 0 };
  return {
    protein: Math.round((macros.protein * KCAL_PER_G.protein * 100) / kcal),
    carbs: Math.round((macros.carbs * KCAL_PER_G.carbs * 100) / kcal),
    fat: Math.round((macros.fat * KCAL_PER_G.fat * 100) / kcal),
  };
}

/**
 * Calcula los objetivos finales a partir del perfil.
 * Si el perfil esta en modo manual se respetan los valores introducidos a mano.
 */
export function computeTargets(profile) {
  if (profile.mode === 'manual') {
    const m = profile.manual || {};
    const protein = Math.round(m.protein || 0);
    const carbs = Math.round(m.carbs || 0);
    const fat = Math.round(m.fat || 0);
    const kcal = Math.round(
      m.kcal || protein * KCAL_PER_G.protein + carbs * KCAL_PER_G.carbs + fat * KCAL_PER_G.fat
    );
    return { kcal, protein, carbs, fat, maintenance: null, bmr: null };
  }

  const kcal = targetCalories(profile);
  let split;

  if (profile.preset === 'custom' && profile.split) {
    split = profile.split;
  } else {
    const preset = MACRO_PRESETS.find((p) => p.id === profile.preset) || MACRO_PRESETS[0];
    split = preset.split || MACRO_PRESETS[0].split;
  }

  const macros = macrosFromSplit(kcal, normalizeSplit(split));

  // Si el usuario fija la proteina por kg de peso, esa manda y el resto se reparte.
  if (profile.proteinPerKg) {
    const target = Math.round(profile.proteinPerKg * profile.weightKg);
    const rest = Math.max(0, kcal - target * KCAL_PER_G.protein);
    const ratio = split.carbs + split.fat || 1;
    macros.protein = target;
    macros.carbs = Math.round((rest * (split.carbs / ratio)) / KCAL_PER_G.carbs);
    macros.fat = Math.round((rest * (split.fat / ratio)) / KCAL_PER_G.fat);
  }

  return {
    kcal,
    ...macros,
    maintenance: tdee(profile),
    bmr: bmr(profile),
  };
}

/** Ajusta tres porcentajes para que sumen exactamente 100. */
export function normalizeSplit(split) {
  const total = split.protein + split.carbs + split.fat;
  if (!total) return { protein: 30, carbs: 40, fat: 30 };
  if (total === 100) return split;
  const p = (split.protein / total) * 100;
  const c = (split.carbs / total) * 100;
  return { protein: Math.round(p), carbs: Math.round(c), fat: 100 - Math.round(p) - Math.round(c) };
}

/* ------------------------------------------------------------------ */
/* Escalado de alimentos                                               */
/* ------------------------------------------------------------------ */

const NUTRIENT_KEYS = ['kcal', 'protein', 'carbs', 'fat', 'satFat', 'sugars', 'fiber', 'salt'];

/**
 * Calcula los nutrientes de una cantidad concreta de un alimento.
 * El alimento guarda siempre los valores por 100 g / 100 ml.
 */
export function scaleFood(food, grams) {
  const k = (Number(grams) || 0) / 100;
  const out = {};
  for (const key of NUTRIENT_KEYS) {
    const v = food[key];
    out[key] = v === null || v === undefined ? null : round(v * k, key === 'kcal' ? 0 : 1);
  }
  return out;
}

/** Suma los nutrientes de una lista de registros del diario. */
export function sumEntries(entries) {
  const total = { kcal: 0, protein: 0, carbs: 0, fat: 0, satFat: 0, sugars: 0, fiber: 0, salt: 0 };
  for (const e of entries || []) {
    for (const key of NUTRIENT_KEYS) {
      const v = e.nutrients ? e.nutrients[key] : null;
      if (typeof v === 'number' && Number.isFinite(v)) total[key] += v;
    }
  }
  for (const key of NUTRIENT_KEYS) total[key] = round(total[key], key === 'kcal' ? 0 : 1);
  return total;
}

/** Reparte los totales por comida (desayuno, almuerzo...). */
export function groupByMeal(entries, meals) {
  const out = {};
  for (const m of meals) out[m.id] = [];
  for (const e of entries || []) {
    if (!out[e.meal]) out[e.meal] = [];
    out[e.meal].push(e);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Ayudas de presentacion                                              */
/* ------------------------------------------------------------------ */

/** Porcentaje de un objetivo, acotado para las barras de progreso. */
export function pct(value, target) {
  if (!target) return 0;
  return Math.max(0, Math.min(999, Math.round((value / target) * 100)));
}

/** Reparto sugerido de calorias por comida, como referencia visual. */
export const MEALS = [
  { id: 'desayuno', label: 'Desayuno', icon: '☕', share: 0.25 },
  { id: 'almuerzo', label: 'Almuerzo', icon: '\u{1F34E}', share: 0.1 },
  { id: 'comida',   label: 'Comida',   icon: '\u{1F37D}', share: 0.35 },
  { id: 'merienda', label: 'Merienda', icon: '\u{1F36B}', share: 0.1 },
  { id: 'cena',     label: 'Cena',     icon: '\u{1F319}', share: 0.2 },
];

export function round(n, d = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

/** Formatea un numero al estilo espanol (coma decimal, sin decimales inutiles). */
export function fmt(n, decimals = 1) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  const r = round(n, decimals);
  return Number.isInteger(r) ? String(r) : String(r).replace('.', ',');
}

/* ------------------------------------------------------------------ */
/* Fechas                                                              */
/* ------------------------------------------------------------------ */

/** Clave de dia en horario local, no UTC (evita el salto de medianoche). */
export function dayKey(date = new Date()) {
  const d = new Date(date);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function addDays(key, n) {
  const d = new Date(key + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function humanDate(key) {
  const today = dayKey();
  if (key === today) return 'Hoy';
  if (key === addDays(today, -1)) return 'Ayer';
  if (key === addDays(today, 1)) return 'Manana';
  const d = new Date(key + 'T12:00:00');
  const name = DAY_NAMES[d.getDay()];
  return name.charAt(0).toUpperCase() + name.slice(1) + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
}
