/**
 * Parser de etiquetas nutricionales.
 *
 * Pensado para el texto que devuelve Google Lens / Circle to Search al leer la
 * tabla "Informacion nutricional" de un producto europeo (Reglamento UE 1169/2011).
 * Soporta etiquetas multilingues (es / ca / gl / pt / en / fr / it), coma decimal,
 * punto de millar, varias columnas (por 100 g, por racion, %VRN) y los errores
 * tipicos de OCR.
 *
 * Sin dependencias: se usa igual desde el navegador que desde node.
 */

/* ------------------------------------------------------------------ */
/* Utilidades de texto                                                 */
/* ------------------------------------------------------------------ */

export function stripAccents(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Normaliza el texto crudo del OCR a lineas limpias y comparables. */
export function normalize(raw) {
  let t = String(raw || '');

  // Espacios raros -> espacio normal. Guiones y comillas tipograficas -> ascii.
  t = t.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
  t = t.replace(/[\u2010-\u2015\u2212]/g, '-');
  t = t.replace(/[\u2018\u2019\u201B]/g, "'").replace(/[\u201C\u201D]/g, '"');
  // Separador de millar fino que a veces mete el OCR entre digitos.
  t = t.replace(/(\d)[\u2009\u202F](\d)/g, '$1.$2');
  // Unidades micro.
  t = t.replace(/[\u00B5\u03BC]g/gi, 'ug');

  return t
    .split(/\r?\n|[\u2028\u2029]|(?:\s*[|;]\s*)/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);
}

/**
 * Arregla confusiones de OCR solo dentro de tokens que ya parecen numericos.
 * "1O,5" -> "10,5"   "O,8" -> "0,8"   "l,2" -> "1,2"
 * Nunca toca palabras normales.
 */
export function fixOcrDigits(line) {
  return line.replace(/[\dOoIlSB][\dOoIlSB.,]*/g, (tok) => {
    if (!/\d/.test(tok)) return tok;          // ningun digito real: es una palabra
    if (/^B\d+$/.test(tok)) return tok;       // vitaminas B1, B6, B12...
    if (/^[\d.,]+l$/.test(tok)) return tok;   // "0,5l" son litros, no un 1
    return tok
      .replace(/[Oo]/g, '0')
      .replace(/[Il]/g, '1')
      .replace(/S/g, '5')
      .replace(/B/g, '8');
  });
}

/* ------------------------------------------------------------------ */
/* Numeros                                                             */
/* ------------------------------------------------------------------ */

/**
 * Interpreta un numero escrito a la europea.
 *   "3,2"     -> 3.2
 *   "1.987"   -> 1987   (punto de millar)
 *   "0.500"   -> 0.5    (empieza por 0 => decimal)
 *   "1.234,5" -> 1234.5
 *   "<0,5"    -> 0.5
 *   "trazas"  -> 0
 */
export function parseNumber(raw) {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim().toLowerCase();
  if (!s) return null;

  if (/^(trazas?|traces?|vestigios?|indicios?)$/.test(stripAccents(s))) return 0;

  s = s.replace(/^[<>≤≥~≈=]+\s*/, '').replace(/\s+/g, '');
  if (!/\d/.test(s)) return null;

  const hasDot = s.includes('.');
  const hasComma = s.includes(',');

  if (hasDot && hasComma) {
    // El separador mas a la derecha es el decimal.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    // En etiqueta europea la coma es decimal. Si hay varias, solo cuenta la ultima.
    const i = s.lastIndexOf(',');
    s = s.slice(0, i).replace(/,/g, '') + '.' + s.slice(i + 1);
  } else if (hasDot) {
    // Punto ambiguo: "1.987" (millar) frente a "0.5" (decimal anglosajon).
    const m = s.match(/^(\d+)\.(\d{3})$/);
    if (m && !/^0/.test(m[1])) {
      s = m[1] + m[2];
    } else {
      const parts = s.split('.');
      if (parts.length > 2) s = parts.join('');
    }
  }

  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------ */
/* Extraccion de valores de una linea                                  */
/* ------------------------------------------------------------------ */

const UNIT = '(kcal|kilocalor[ia]as?|kj|kilojulios?|kilojoules?|gramos?|mg|ug|mcg|ml|cl|gr|g|%)';
const VALUE_SRC =
  '([<>\\u2264\\u2265~\\u2248]?\\s*\\d+(?:[.,]\\d+)*)\\s*' + UNIT + '?(?![a-z0-9\\u00e1\\u00e9\\u00ed\\u00f3\\u00fa\\u00f1])';

/**
 * Devuelve todos los valores numericos de una linea, con su unidad.
 * [{ n, unit, percent, approx, raw }]
 */
export function extractValues(line) {
  const re = new RegExp(VALUE_SRC, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(line)) !== null) {
    const rawNum = m[1].trim();
    const n = parseNumber(rawNum);
    if (n === null) continue;
    let unit = (m[2] || '').toLowerCase();
    if (/^gramos?$/.test(unit) || unit === 'gr') unit = 'g';
    if (/^kilocalor/.test(unit)) unit = 'kcal';
    if (/^kilojul|^kilojoul/.test(unit)) unit = 'kj';
    out.push({
      n,
      unit,
      percent: unit === '%',
      approx: /^[<>\u2264\u2265~\u2248]/.test(rawNum),
      raw: m[0].trim(),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Diccionario de nutrientes                                           */
/* ------------------------------------------------------------------ */

/* El orden importa: lo mas especifico primero (saturadas antes que grasas). */
const NUTRIENTS = [
  { key: 'energy',    re: /valor\s*energetic|\benergia\b|\benergy\b|\benergie\b|calorias|valore\s*energetico/ },
  { key: 'satFat',    re: /saturad|saturates|satures|\bags\b|gesattigte/ },
  { key: 'transFat',  re: /(grasas?|acidos?\s*grasos?)\s*trans|\btrans\b/ },
  { key: 'monoFat',   re: /monoinsaturad|monounsaturat|monoinsatur/ },
  { key: 'polyFat',   re: /poliinsaturad|polyunsaturat|polinsatur/ },
  { key: 'sugars',    re: /azucar|acucar|sucres?|sugars?|zuccher/ },
  { key: 'polyols',   re: /polialcoholes|polioles|polyols/ },
  { key: 'starch',    re: /almidon|amido|starch/ },
  { key: 'fiber',     re: /\bfibra|\bfibre|\bfiber|ballaststoffe/ },
  { key: 'protein',   re: /protein|proteina|eiweiss/ },
  { key: 'carbs',     re: /hidratos?\s*(de\s*)?carbono|hidrats?\s*(de\s*)?carboni|carbohidrat|carbohydrate|glucid|glicid|kohlenhydrate|carboidrat|\bh\.?\s*de\s*c\.?\b|\bhc\b/ },
  { key: 'fat',       re: /\bgrasas?\b|\bgreixos?\b|\bgordura|\bfat\b|matieres?\s*grasses|\blipid|\bfett\b|\bgrassi\b|materia\s*grasa/ },
  { key: 'salt',      re: /\bsal\b|\bsalt\b|\bsel\b|\bsale\b|\bsalz\b/ },
  { key: 'sodium',    re: /\bsodio\b|\bsodium\b|\bnatrium\b|\bsodi\b/ },
  { key: 'energyAlt', re: /\bkcal\b|\bkj\b/ },
];

/** Divide "Grasas 24 g de las cuales saturadas 3,2 g" en dos trozos. */
function splitSubclauses(line) {
  const re = /(?=\bde\s+(?:las?|los?)\s+cual(?:es)?\b|\bde\s+les\s+quals\b|\bdos\s+quais\b|\bof\s+which\b|\bdont\b|\bdavon\b|\bdi\s+cui\b)/i;
  return line.split(re).map((p) => p.trim()).filter(Boolean);
}

function classify(segment) {
  const s = stripAccents(segment).toLowerCase();
  for (const nut of NUTRIENTS) {
    if (nut.re.test(s)) return nut.key === 'energyAlt' ? 'energy' : nut.key;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Deteccion de columnas                                               */
/* ------------------------------------------------------------------ */

const PER100_RE = /(?:por|per|pour|cada|\/)?\s*100\s*(g|ml|gr|gramos)\b/i;
const PORTION_RE = /\b(racion|racio|racao|portion|porcion|porzione|serving|unidad|unitat|envase|paquete|sobre|vaso|pieza|barrita|galleta|tarrina|bote|lata)\b/i;
const PERCENT_RE = /%\s*(vrn|ir|cdr|cdo|vd|ar|ri|nrv|gda)|\bvrn\b|\bnrv\b|ingesta[s]?\s*de\s*referencia|valores?\s*de\s*referencia|cantidad\s*diaria/i;

/**
 * Localiza la cabecera de la tabla y devuelve las columnas en orden de aparicion.
 * Si no hay cabecera, asume una unica columna por 100 g.
 */
export function detectColumns(lines) {
  let best = null;

  lines.forEach((line, idx) => {
    const s = stripAccents(line).toLowerCase();
    const marks = [];

    const p100 = s.search(PER100_RE);
    if (p100 >= 0) {
      const um = s.match(PER100_RE);
      const u = ((um && um[1]) || 'g').toLowerCase();
      marks.push({ pos: p100, type: 'per100', unit: u.startsWith('m') ? 'ml' : 'g', amount: 100 });
    }

    const pPort = s.search(PORTION_RE);
    if (pPort >= 0) {
      // Intenta capturar el gramaje: "racion (30 g)" / "por galleta de 15 g"
      const g = line.match(
        /(?:racion|ración|por[cç][aã]o|portion|serving|unidad|unitat|envase|sobre|vaso|barrita|galleta)[^\d%]{0,18}?(\d+(?:[.,]\d+)?)\s*(g|ml|gr)\b/i
      );
      marks.push({
        pos: pPort,
        type: 'portion',
        unit: g && /ml/i.test(g[2]) ? 'ml' : 'g',
        amount: g ? parseNumber(g[1]) : null,
        noun: (s.match(PORTION_RE) || [])[1] || 'racion',
      });
    }

    const pPct = s.search(PERCENT_RE);
    if (pPct >= 0) marks.push({ pos: pPct, type: 'percent', unit: '%', amount: null });

    if (marks.length === 0) return;
    marks.sort((a, b) => a.pos - b.pos);
    if (!best || marks.length > best.marks.length) best = { idx, marks };
  });

  if (!best) {
    return {
      columns: [{ type: 'per100', unit: 'g', amount: 100, label: 'por 100 g' }],
      headerLine: -1,
      assumed: true,
    };
  }

  const columns = best.marks.map((m) => ({
    type: m.type,
    unit: m.unit,
    amount: m.amount,
    noun: m.noun || null,
    label:
      m.type === 'per100'
        ? 'por 100 ' + m.unit
        : m.type === 'portion'
        ? m.amount
          ? 'por ' + (m.noun || 'racion') + ' (' + esNum(m.amount) + ' ' + m.unit + ')'
          : 'por ' + (m.noun || 'racion')
        : '%VRN',
  }));

  return { columns, headerLine: best.idx, assumed: false };
}

/* ------------------------------------------------------------------ */
/* Nombre del producto                                                 */
/* ------------------------------------------------------------------ */

const HEADER_NOISE = /informacion\s*nutricional|informacio\s*nutricional|informacao\s*nutricional|nutrition\s*(facts|information)|valores?\s*(medios|nutricionales)|declaracion\s*nutricional|tabla\s*nutricional|valeurs?\s*nutritionnelles|dichiarazione\s*nutrizionale|nahrwertangaben/i;
const META_NOISE = /ingredientes?|conservar|consumir|lote|caduc|fabricado|envasado|peso\s*neto|alergenos|contiene|modo\s*de\s*empleo|agitar|una\s*vez\s*abierto/i;

function guessName(lines, firstNutrientIdx) {
  const limit = firstNutrientIdx >= 0 ? firstNutrientIdx : Math.min(lines.length, 4);
  const candidates = [];
  for (let i = 0; i < limit && i < 8; i++) {
    const raw = lines[i];
    const s = stripAccents(raw).toLowerCase();
    if (HEADER_NOISE.test(s) || META_NOISE.test(s)) continue;
    if (PER100_RE.test(s) || PERCENT_RE.test(s)) continue;
    if (/^[\d\s.,%/g-]+$/.test(raw)) continue;
    // Solo se descarta como fila de la tabla si ademas trae cifras.
    if (classify(raw) && extractValues(raw).length) continue;
    const letters = (raw.match(/[a-záéíóúñ]/gi) || []).length;
    if (letters < 3 || raw.length > 70) continue;
    candidates.push(raw);
  }
  if (!candidates.length) return null;
  return candidates.slice(0, 2).sort((a, b) => b.length - a.length)[0].replace(/\s*[.,;:]$/, '');
}

/* ------------------------------------------------------------------ */
/* Parser principal                                                    */
/* ------------------------------------------------------------------ */

const CORE = ['energyKcal', 'protein', 'carbs', 'fat'];

/**
 * @param {string} rawText texto pegado desde Google Lens
 * @returns {object} columnas detectadas, valores por columna y valores resueltos
 */
export function parseLabel(rawText) {
  const warnings = [];
  const lines = normalize(rawText).map(fixOcrDigits);

  if (!lines.length) {
    return {
      ok: false, error: 'empty', columns: [], chosen: 0, rows: {},
      values: resolveColumn({}, 0), warnings: ['No hay texto que analizar.'],
      confidence: 0, per: { amount: 100, unit: 'g' }, portion: null, name: null, lines: [],
    };
  }

  const { columns, headerLine, assumed } = detectColumns(lines);

  /** rows[key] = array alineado con `columns` */
  const rows = {};
  let firstNutrientIdx = -1;

  lines.forEach((line, idx) => {
    if (idx === headerLine) return;
    for (const seg of splitSubclauses(line)) {
      const key = classify(seg);
      if (!key) continue;

      // Una fila de la tabla lleva numeros. "Bebida sin azucares" nombra el
      // producto aunque contenga una palabra de nutriente: no es una fila.
      const vals = extractValues(seg);
      if (!vals.length) continue;
      if (firstNutrientIdx < 0) firstNutrientIdx = idx;

      if (key === 'energy') {
        assignEnergy(vals, rows, columns);
        continue;
      }

      const usable = vals.filter((v) => !v.percent);
      if (!usable.length) continue;
      mergeRow(rows, key, alignToColumns(usable, columns, 'mass'));
    }
  });

  reconcileEnergy(rows, warnings);

  if (!rows.salt && rows.sodium) {
    rows.salt = rows.sodium.map((v) => (v === null ? null : round(v * 2.5, 3)));
    warnings.push('La etiqueta indicaba sodio: se ha convertido a sal (sodio x 2,5).');
  }

  let chosen = columns.findIndex((c) => c.type === 'per100');
  if (chosen < 0) chosen = columns.findIndex((c) => c.type !== 'percent');
  if (chosen < 0) chosen = 0;

  const values = resolveColumn(rows, chosen);

  const portionCol = columns.find((c) => c.type === 'portion' && c.amount);
  const portion = portionCol
    ? { grams: portionCol.amount, unit: portionCol.unit, label: cap(portionCol.noun || 'racion') }
    : detectPortionInText(lines);

  const basisUnit = columns[chosen] && columns[chosen].unit === 'ml' ? 'ml' : 'g';
  const basisAmount = columns[chosen] && columns[chosen].amount ? columns[chosen].amount : 100;

  const check = validate(values, warnings);
  const found = CORE.filter((k) => values[k] !== null && values[k] !== undefined);

  let confidence = found.length / CORE.length;
  if (assumed && columns.length === 1) confidence *= 0.9;
  if (!check.energyOk) confidence *= 0.6;
  if (!check.massOk) confidence *= 0.5;
  confidence = Math.max(0, Math.min(1, round(confidence, 2)));

  return {
    ok: found.length >= 3,
    columns, chosen, rows, values,
    per: { amount: basisAmount, unit: basisUnit },
    portion,
    name: guessName(lines, firstNutrientIdx),
    warnings, check, confidence, lines,
  };
}

/** Devuelve los valores de una columna concreta (para el selector de la UI). */
export function resolveColumn(rows, index) {
  const out = {};
  for (const [k, arr] of Object.entries(rows || {})) {
    out[k] = Array.isArray(arr) && arr[index] !== undefined ? arr[index] : null;
  }
  for (const k of ['energyKcal', 'energyKj', 'protein', 'carbs', 'fat', 'satFat', 'sugars', 'fiber', 'salt']) {
    if (!(k in out)) out[k] = null;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Ayudantes internos                                                  */
/* ------------------------------------------------------------------ */

function mergeRow(rows, key, arr) {
  if (!rows[key]) rows[key] = arr;
  else rows[key] = rows[key].map((v, i) => (v === null ? arr[i] : v));
}

function alignToColumns(vals, columns, kind) {
  const n = columns.length;
  const arr = new Array(n).fill(null);

  if (vals.length === n) {
    vals.forEach((v, i) => {
      arr[i] = columns[i].type === 'percent' ? null : normUnit(v, kind);
    });
    return arr;
  }

  // Menos valores que columnas: rellenamos saltando las columnas de porcentaje.
  const dataIdx = columns.map((c, i) => (c.type === 'percent' ? -1 : i)).filter((i) => i >= 0);
  vals.slice(0, dataIdx.length).forEach((v, i) => {
    arr[dataIdx[i]] = normUnit(v, kind);
  });
  return arr;
}

function normUnit(v, kind) {
  if (kind !== 'mass') return v.n;
  if (v.unit === 'mg') return round(v.n / 1000, 4);
  if (v.unit === 'ug' || v.unit === 'mcg') return round(v.n / 1e6, 6);
  return v.n;
}

function assignEnergy(vals, rows, columns) {
  const kcals = vals.filter((v) => v.unit === 'kcal');
  const kjs = vals.filter((v) => v.unit === 'kj');
  const bare = vals.filter((v) => !v.unit && !v.percent);

  const put = (key, list) => {
    if (list.length) mergeRow(rows, key, alignToColumns(list, columns, 'plain'));
  };

  put('energyKcal', kcals);
  put('energyKj', kjs);

  // "Energia 1.987 / 475" sin unidades: el grande es kJ, el pequeno kcal.
  if (!kcals.length && !kjs.length && bare.length) {
    if (bare.length >= 2) {
      const sorted = [...bare].sort((a, b) => b.n - a.n);
      if (sorted[0].n / Math.max(sorted[1].n, 1) > 3) {
        put('energyKj', [sorted[0]]);
        put('energyKcal', [sorted[1]]);
        return;
      }
    }
    if (bare.length === 1 && bare[0].n > 900) put('energyKj', bare);
    else put('energyKcal', bare);
  }
}

function reconcileEnergy(rows, warnings) {
  if (rows.energyKj) {
    rows.energyKj = rows.energyKj.map((v) => {
      if (v === null) return null;
      // "1,987 kJ" mal interpretado: en realidad son 1987.
      return v > 0 && v < 60 ? round(v * 1000, 0) : v;
    });
  }

  if (!rows.energyKcal && rows.energyKj) {
    rows.energyKcal = rows.energyKj.map((v) => (v === null ? null : Math.round(v / 4.184)));
    warnings.push('Solo habia kJ en la etiqueta: las kcal se han calculado dividiendo entre 4,184.');
    return;
  }

  if (rows.energyKcal && rows.energyKj) {
    for (let i = 0; i < rows.energyKcal.length; i++) {
      const c = rows.energyKcal[i];
      const j = rows.energyKj[i];
      if (c === null || j === null || c === 0) continue;
      const ratio = j / c;
      if (ratio < 3.4 || ratio > 5.0) {
        warnings.push('Las kcal (' + c + ') y los kJ (' + j + ') no cuadran entre si; revisa el valor.');
        break;
      }
    }
  }
}

function detectPortionInText(lines) {
  for (const line of lines) {
    const m = line.match(
      /\b(?:1\s*)?(racion|ración|porcion|porción|unidad|barrita|galleta|sobre|vaso|pieza|loncha|rebanada)\b[^\d]{0,20}(\d+(?:[.,]\d+)?)\s*(g|ml|gr)\b/i
    );
    if (m) return { grams: parseNumber(m[2]), unit: /ml/i.test(m[3]) ? 'ml' : 'g', label: cap(m[1]) };

    const m2 = line.match(/(\d+(?:[.,]\d+)?)\s*(g|ml)\s*(?:por|\/)\s*(racion|ración|unidad|porcion|porción)/i);
    if (m2) return { grams: parseNumber(m2[1]), unit: /ml/i.test(m2[2]) ? 'ml' : 'g', label: cap(m2[3]) };
  }
  return null;
}

/** Comprueba coherencia: Atwater y suma de masas. */
export function validate(v, warnings = []) {
  const res = { energyOk: true, massOk: true, computedKcal: null };
  const p = v.protein, c = v.carbs, f = v.fat, fi = v.fiber || 0;

  if (p !== null && c !== null && f !== null) {
    const computed = 4 * p + 4 * Math.max(c - fi, 0) + 9 * f + 2 * fi;
    res.computedKcal = Math.round(computed);

    if (v.energyKcal !== null && v.energyKcal !== undefined && v.energyKcal > 0) {
      const diff = Math.abs(computed - v.energyKcal) / v.energyKcal;
      if (diff > 0.25) {
        res.energyOk = false;
        warnings.push(
          'Las kcal declaradas (' + v.energyKcal + ') no cuadran con los macros (deberian rondar ' +
          res.computedKcal + '). Revisa los numeros.'
        );
      }
    } else {
      v.energyKcal = res.computedKcal;
      warnings.push('No se ha encontrado la energia: se ha calculado a partir de los macros (' + res.computedKcal + ' kcal).');
    }

    const total = p + c + f + (v.salt || 0);
    if (total > 101) {
      res.massOk = false;
      warnings.push('Los macros suman ' + Math.round(total) + ' g por 100 g, lo cual es imposible. Alguna cifra esta mal leida.');
    }
  }

  if (v.satFat !== null && v.fat !== null && v.satFat > v.fat + 0.5) {
    warnings.push('Las grasas saturadas superan a las grasas totales; puede haber un error de lectura.');
  }
  if (v.sugars !== null && v.carbs !== null && v.sugars > v.carbs + 0.5) {
    warnings.push('Los azucares superan a los hidratos de carbono; puede haber un error de lectura.');
  }

  return res;
}

function round(n, d) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

/** Numero con coma decimal, para las etiquetas que ve el usuario. */
function esNum(n) {
  return String(round(n, 2)).replace('.', ',');
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export default { parseLabel, parseNumber, extractValues, detectColumns, normalize, stripAccents, resolveColumn, validate };
