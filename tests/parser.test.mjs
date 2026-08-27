/**
 * Pruebas del parser de etiquetas.  Ejecutar con:  node tests/parser.test.mjs
 * Cada caso es texto tal cual lo devuelve Google Lens sobre una etiqueta real.
 */
import { parseLabel, parseNumber, fixOcrDigits } from '../js/parser.js';

let pass = 0, fail = 0;
const problems = [];

function check(name, actual, expected, tol = 0.001) {
  const ok =
    expected === null || expected === undefined
      ? actual === null || actual === undefined
      : typeof expected === 'number'
      ? actual !== null && Math.abs(actual - expected) <= tol
      : actual === expected;
  if (ok) { pass++; }
  else { fail++; problems.push(`  ${name}: esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(actual)}`); }
}

function suite(title, fn) {
  console.log(`\n\x1b[1m${title}\x1b[0m`);
  const before = fail;
  fn();
  const added = problems.splice(0);
  if (fail === before) console.log('  \x1b[32mOK\x1b[0m');
  else added.forEach((p) => console.log(`\x1b[31m${p}\x1b[0m`));
}

/* ================================================================== */

suite('parseNumber: formatos numericos europeos', () => {
  check('3,2', parseNumber('3,2'), 3.2);
  check('1.987 (millar)', parseNumber('1.987'), 1987);
  check('0.500 (decimal)', parseNumber('0.500'), 0.5);
  check('1.234,5', parseNumber('1.234,5'), 1234.5);
  check('12.5 (decimal ingles)', parseNumber('12.5'), 12.5);
  check('<0,5', parseNumber('<0,5'), 0.5);
  check('trazas', parseNumber('trazas'), 0);
  check('24', parseNumber('24'), 24);
  check('texto', parseNumber('abc'), null);
});

suite('fixOcrDigits: no destroza palabras', () => {
  check('1OO -> 100', fixOcrDigits('1OO'), '100');
  check('O,75 -> 0,75', fixOcrDigits('O,75'), '0,75');
  check('1.S9O -> 1.590', fixOcrDigits('1.S9O'), '1.590');
  check('Sal intacto', fixOcrDigits('Sal 1,25 g'), 'Sal 1,25 g');
  check('Proteinas intacto', fixOcrDigits('Proteinas'), 'Proteinas');
  check('kcal intacto', fixOcrDigits('475 kcal'), '475 kcal');
});

/* ================================================================== */

suite('Caso 1: etiqueta clasica de una sola columna', () => {
  const r = parseLabel(`Informacion nutricional
Valores medios por 100 g
Valor energetico 1.987 kJ / 475 kcal
Grasas 24 g
de las cuales saturadas 3,2 g
Hidratos de carbono 54 g
de los cuales azucares 2,1 g
Fibra alimentaria 5,4 g
Proteinas 8,6 g
Sal 1,25 g`);

  check('ok', r.ok, true);
  check('kcal', r.values.energyKcal, 475);
  check('kJ', r.values.energyKj, 1987);
  check('grasas', r.values.fat, 24);
  check('saturadas', r.values.satFat, 3.2);
  check('hidratos', r.values.carbs, 54);
  check('azucares', r.values.sugars, 2.1);
  check('fibra', r.values.fiber, 5.4);
  check('proteinas', r.values.protein, 8.6);
  check('sal', r.values.salt, 1.25);
  check('base', r.per.unit, 'g');
  check('columnas', r.columns.length, 1);
});

suite('Caso 2: dos columnas (100 g + racion)', () => {
  const r = parseLabel(`INFORMACION NUTRICIONAL
por 100 g    por racion (30 g)
Energia   1.590 kJ / 380 kcal    477 kJ / 114 kcal
Grasas   12 g   3,6 g
de las cuales saturadas   1,8 g   0,5 g
Hidratos de carbono   58 g   17,4 g
de los cuales azucares   21 g   6,3 g
Proteinas   9,5 g   2,9 g
Sal   0,75 g   0,23 g`);

  check('columnas detectadas', r.columns.length, 2);
  check('columna elegida', r.chosen, 0);
  check('kcal/100g', r.values.energyKcal, 380);
  check('grasas/100g', r.values.fat, 12);
  check('saturadas/100g', r.values.satFat, 1.8);
  check('hidratos/100g', r.values.carbs, 58);
  check('proteinas/100g', r.values.protein, 9.5);
  check('sal/100g', r.values.salt, 0.75);
  check('racion detectada', r.portion && r.portion.grams, 30);
  check('kcal por racion', r.rows.energyKcal[1], 114);
  check('grasas por racion', r.rows.fat[1], 3.6);
});

suite('Caso 3: liquido en 100 ml y solo kJ', () => {
  const r = parseLabel(`Informacion nutricional por 100 ml
Valor energetico 188 kJ
Grasas 1,5 g
de las cuales saturadas 1,0 g
Hidratos de carbono 4,8 g
de los cuales azucares 4,8 g
Proteinas 3,1 g
Sal 0,13 g`);

  check('base ml', r.per.unit, 'ml');
  check('kJ', r.values.energyKj, 188);
  check('kcal derivadas', r.values.energyKcal, 45, 1);
  check('grasas', r.values.fat, 1.5);
  check('proteinas', r.values.protein, 3.1);
  check('aviso de conversion', r.warnings.some((w) => /kJ/.test(w)), true);
});

suite('Caso 4: columna de %VRN que debe ignorarse', () => {
  const r = parseLabel(`Informacion nutricional
Por 100 g    %VRN*
Valor energetico  1.987 kJ / 475 kcal   24%
Grasas  24 g   34%
de las cuales saturadas  3,2 g   16%
Hidratos de carbono  54 g   21%
de los cuales azucares  2,1 g   2%
Proteinas  8,6 g   17%
Sal  1,25 g   21%`);

  check('kcal', r.values.energyKcal, 475);
  check('grasas', r.values.fat, 24);
  check('saturadas', r.values.satFat, 3.2);
  check('hidratos', r.values.carbs, 54);
  check('proteinas', r.values.protein, 8.6);
  check('sal', r.values.salt, 1.25);
});

suite('Caso 5: sodio en vez de sal, decimales con punto', () => {
  const r = parseLabel(`Informacion Nutricional
Por 100 g
Energia: 350 kcal
Proteinas: 12.5 g
Hidratos de carbono: 45.0 g
Azucares: 3.2 g
Grasas: 12.0 g
Saturadas: 2.1 g
Fibra: 6.8 g
Sodio: 0.4 g`);

  check('kcal', r.values.energyKcal, 350);
  check('proteinas', r.values.protein, 12.5);
  check('hidratos', r.values.carbs, 45);
  check('azucares', r.values.sugars, 3.2);
  check('grasas', r.values.fat, 12);
  check('saturadas', r.values.satFat, 2.1);
  check('fibra', r.values.fiber, 6.8);
  check('sal desde sodio', r.values.salt, 1.0);
  check('aviso de sodio', r.warnings.some((w) => /sodio/i.test(w)), true);
});

suite('Caso 6: OCR sucio (ceros como O, cincos como S)', () => {
  const r = parseLabel(`INFORMACION NUTRICIONAL
Valores medios por 1OO g
Valor energetico 1.S9O kJ/38O kcal
Grasas 12 g
de las cuales saturadas 1,8 g
Hidratos de carbono S8 g
de los cuales azucares 21 g
Proteinas 9,S g
Sal O,75 g`);

  check('kcal', r.values.energyKcal, 380);
  check('kJ', r.values.energyKj, 1590);
  check('hidratos', r.values.carbs, 58);
  check('proteinas', r.values.protein, 9.5);
  check('sal', r.values.salt, 0.75);
});

suite('Caso 7: etiqueta multilingue ES/EN', () => {
  const r = parseLabel(`Nutrition information / Informacion nutricional
per 100 g / por 100 g
Energy / Valor energetico 2.104 kJ / 503 kcal
Fat / Grasas 29 g
of which saturates / de las cuales saturadas 18 g
Carbohydrate / Hidratos de carbono 55 g
of which sugars / de los cuales azucares 50 g
Protein / Proteinas 5,4 g
Salt / Sal 0,25 g`);

  check('kcal', r.values.energyKcal, 503);
  check('grasas', r.values.fat, 29);
  check('saturadas', r.values.satFat, 18);
  check('hidratos', r.values.carbs, 55);
  check('azucares', r.values.sugars, 50);
  check('proteinas', r.values.protein, 5.4);
});

suite('Caso 8: sin cabecera y con nombre de producto', () => {
  const r = parseLabel(`Yogur griego natural
Valor energetico 97 kcal
Grasas 5,0 g
Hidratos de carbono 3,6 g
Proteinas 9,0 g
Sal 0,10 g`);

  check('nombre', r.name, 'Yogur griego natural');
  check('kcal', r.values.energyKcal, 97);
  check('proteinas', r.values.protein, 9);
  check('columna asumida', r.columns.length, 1);
});

suite('Caso 9: incoherencia detectada (numero mal leido)', () => {
  const r = parseLabel(`Por 100 g
Valor energetico 400 kcal
Grasas 5 g
Hidratos de carbono 5 g
Proteinas 5 g`);

  // 4*5 + 4*5 + 9*5 = 85 kcal, muy lejos de las 400 declaradas
  check('marca energia incoherente', r.check.energyOk, false);
  check('confianza baja', r.confidence < 0.7, true);
  check('genera aviso', r.warnings.length > 0, true);
});

suite('Caso 10: falta la energia, se calcula sola', () => {
  const r = parseLabel(`Por 100 g
Grasas 10 g
Hidratos de carbono 20 g
Proteinas 30 g`);

  // 4*30 + 4*20 + 9*10 = 290
  check('kcal calculadas', r.values.energyKcal, 290);
  check('avisa del calculo', r.warnings.some((w) => /calculad/i.test(w)), true);
});

suite('Caso 11: el nombre lleva una palabra de nutriente', () => {
  const r = parseLabel(`Bebida de soja sin azucares
Informacion nutricional por 100 ml
Valor energetico 138 kJ
Grasas 1,8 g
de las cuales saturadas 0,3 g
Hidratos de carbono 0,5 g
de los cuales azucares 0,3 g
Fibra alimentaria 0,6 g
Proteinas 3,3 g
Sodio 0,04 g`);

  check('nombre', r.name, 'Bebida de soja sin azucares');
  check('base ml', r.per.unit, 'ml');
  check('kcal desde kJ', r.values.energyKcal, 33, 1);
  check('grasas', r.values.fat, 1.8);
  check('azucares', r.values.sugars, 0.3);
  check('proteinas', r.values.protein, 3.3);
  check('sal desde sodio', r.values.salt, 0.1);
});

suite('Caso 12: nombres comerciales que suenan a nutriente', () => {
  const mk = (name) => parseLabel(`${name}
Por 100 g
Valor energetico 380 kcal
Grasas 8 g
Hidratos de carbono 30 g
Proteinas 45 g`).name;

  check('Batido de proteinas', mk('Batido de proteinas chocolate'), 'Batido de proteinas chocolate');
  check('Yogur alto en proteina', mk('Yogur alto en proteina'), 'Yogur alto en proteina');
  check('Pan con fibra', mk('Pan de molde con fibra'), 'Pan de molde con fibra');
  check('Sin azucar anadido', mk('Mermelada sin azucar anadido'), 'Mermelada sin azucar anadido');
});

/* ================================================================== */

console.log(`\n${'-'.repeat(52)}`);
if (fail === 0) console.log(`\x1b[32m\x1b[1m${pass} comprobaciones OK\x1b[0m`);
else console.log(`\x1b[31m\x1b[1m${fail} fallos\x1b[0m de ${pass + fail} comprobaciones`);
process.exit(fail === 0 ? 0 : 1);
