/**
 * Alimentos basicos de la cocina espanola, para que la app sirva desde el minuto uno.
 * Valores por 100 g (o 100 ml en liquidos), redondeados a partir de tablas BEDCA/USDA.
 * Se cargan una unica vez, la primera vez que se abre la app.
 *
 * Formato compacto: [nombre, kcal, prot, carbs, grasa, fibra, sal, unidad, raciones]
 */

const RAW = [
  // --- Carnes y huevos -------------------------------------------------
  ['Pechuga de pollo', 110, 23, 0, 1.9, 0, 0.1, 'g', [['Filete', 120]]],
  ['Pechuga de pavo', 104, 24, 0.5, 1, 0, 0.1, 'g', [['Filete', 100]]],
  ['Ternera magra', 131, 21.5, 0, 4.8, 0, 0.1, 'g', [['Filete', 150]]],
  ['Lomo de cerdo', 143, 21, 0, 6.3, 0, 0.1, 'g', [['Filete', 120]]],
  ['Huevo entero', 143, 12.6, 0.7, 9.9, 0, 0.34, 'g', [['Unidad M', 60], ['Unidad L', 70]]],
  ['Clara de huevo', 52, 11, 0.7, 0.2, 0, 0.17, 'g', [['Clara', 33]]],
  ['Jamon serrano', 241, 31, 0.5, 13, 0, 4.5, 'g', [['Loncha', 20]]],
  ['Jamon cocido / pavo', 108, 18, 1.5, 3.5, 0, 2.2, 'g', [['Loncha', 25]]],
  ['Chorizo', 455, 24, 2, 38, 0, 3.5, 'g', [['Rodaja', 10]]],
  ['Salchichas Frankfurt', 275, 11, 2.5, 24, 0, 2.1, 'g', [['Unidad', 30]]],

  // --- Pescados y mariscos ---------------------------------------------
  ['Atun al natural (lata)', 116, 25.5, 0, 1, 0, 0.9, 'g', [['Lata escurrida', 52]]],
  ['Atun en aceite (lata)', 186, 25, 0, 9, 0, 0.9, 'g', [['Lata escurrida', 52]]],
  ['Salmon', 208, 20, 0, 13, 0, 0.1, 'g', [['Lomo', 150]]],
  ['Merluza', 71, 15.9, 0, 0.8, 0, 0.2, 'g', [['Lomo', 150]]],
  ['Gambas peladas', 85, 18, 0.9, 1, 0, 0.4, 'g', null],
  ['Sardinas en aceite', 208, 24, 0, 12, 0, 1, 'g', [['Lata escurrida', 60]]],

  // --- Lacteos ----------------------------------------------------------
  ['Leche entera', 63, 3.2, 4.6, 3.6, 0, 0.1, 'ml', [['Vaso', 250]]],
  ['Leche semidesnatada', 46, 3.2, 4.7, 1.6, 0, 0.1, 'ml', [['Vaso', 250]]],
  ['Leche desnatada', 34, 3.4, 4.9, 0.2, 0, 0.1, 'ml', [['Vaso', 250]]],
  ['Bebida de avena', 45, 0.8, 7.5, 1.3, 0.8, 0.1, 'ml', [['Vaso', 250]]],
  ['Yogur natural', 61, 3.5, 4.7, 3.3, 0, 0.1, 'g', [['Unidad', 125]]],
  ['Yogur griego natural', 97, 9, 3.6, 5, 0, 0.1, 'g', [['Unidad', 150]]],
  ['Yogur desnatado', 45, 4.5, 6, 0.2, 0, 0.1, 'g', [['Unidad', 125]]],
  ['Queso fresco batido 0%', 47, 8, 4, 0.2, 0, 0.1, 'g', [['Tarrina', 250]]],
  ['Queso curado', 390, 25, 1.4, 32, 0, 1.8, 'g', [['Cuna', 30]]],
  ['Queso fresco de Burgos', 174, 12, 3, 12, 0, 0.5, 'g', [['Tarrina', 125]]],
  ['Requeson', 96, 11, 3.4, 4.3, 0, 0.4, 'g', null],
  ['Mozzarella', 280, 18, 2.2, 22, 0, 1.4, 'g', [['Bola', 125]]],

  // --- Cereales y tuberculos -------------------------------------------
  ['Arroz blanco crudo', 354, 7, 77, 1, 1.3, 0, 'g', [['Racion', 70]]],
  ['Arroz blanco cocido', 130, 2.7, 28, 0.3, 0.4, 0, 'g', [['Racion', 200]]],
  ['Pasta cruda', 359, 12, 71, 1.5, 3, 0, 'g', [['Racion', 80]]],
  ['Pasta cocida', 158, 5.8, 30, 0.9, 1.8, 0, 'g', [['Racion', 220]]],
  ['Pan blanco', 261, 8.5, 49, 1.6, 2.7, 1.2, 'g', [['Rebanada', 30]]],
  ['Pan integral', 247, 9, 41, 3.3, 6.5, 1.1, 'g', [['Rebanada', 35]]],
  ['Pan de molde', 265, 8, 47, 4, 2.5, 1.1, 'g', [['Rebanada', 28]]],
  ['Copos de avena', 375, 13, 58, 7, 10, 0, 'g', [['Racion', 50]]],
  ['Cereales de desayuno', 380, 7, 80, 3, 4, 0.6, 'g', [['Bol', 40]]],
  ['Patata cruda', 77, 2, 17, 0.1, 2.2, 0, 'g', [['Unidad mediana', 150]]],
  ['Patata cocida', 87, 1.9, 20, 0.1, 1.8, 0, 'g', null],
  ['Boniato', 86, 1.6, 20, 0.1, 3, 0.1, 'g', [['Unidad', 150]]],
  ['Quinoa cocida', 120, 4.4, 21, 1.9, 2.8, 0, 'g', [['Racion', 180]]],

  // --- Legumbres --------------------------------------------------------
  ['Lentejas crudas', 336, 24, 52, 1.7, 11, 0, 'g', [['Racion', 80]]],
  ['Lentejas cocidas', 116, 9, 20, 0.4, 8, 0.3, 'g', [['Racion', 200]]],
  ['Garbanzos cocidos', 139, 7.5, 21, 2.6, 6, 0.3, 'g', [['Racion', 200]]],
  ['Alubias cocidas', 106, 6.9, 17, 0.5, 6, 0.3, 'g', [['Racion', 200]]],
  ['Tofu firme', 76, 8, 1.9, 4.8, 0.9, 0.1, 'g', [['Racion', 120]]],
  ['Hummus', 237, 7.4, 14, 17, 6, 1.1, 'g', [['Cucharada', 30]]],

  // --- Verduras ---------------------------------------------------------
  ['Tomate', 18, 0.9, 3.9, 0.2, 1.2, 0, 'g', [['Unidad', 120]]],
  ['Lechuga', 15, 1.4, 1.5, 0.2, 1.3, 0, 'g', [['Bol', 80]]],
  ['Cebolla', 40, 1.1, 9.3, 0.1, 1.7, 0, 'g', [['Unidad', 130]]],
  ['Pimiento', 27, 1, 6, 0.2, 1.7, 0, 'g', [['Unidad', 150]]],
  ['Brocoli', 34, 2.8, 6.6, 0.4, 2.6, 0, 'g', [['Racion', 200]]],
  ['Calabacin', 17, 1.2, 3.1, 0.3, 1, 0, 'g', [['Unidad', 200]]],
  ['Zanahoria', 41, 0.9, 9.6, 0.2, 2.8, 0.1, 'g', [['Unidad', 80]]],
  ['Espinacas', 23, 2.9, 3.6, 0.4, 2.2, 0.1, 'g', [['Racion', 150]]],
  ['Judias verdes', 31, 1.8, 7, 0.1, 3.4, 0, 'g', [['Racion', 200]]],
  ['Champinones', 22, 3.1, 3.3, 0.3, 1, 0, 'g', [['Racion', 150]]],
  ['Berenjena', 25, 1, 5.9, 0.2, 3, 0, 'g', [['Unidad', 250]]],

  // --- Frutas -----------------------------------------------------------
  ['Manzana', 52, 0.3, 14, 0.2, 2.4, 0, 'g', [['Unidad', 180]]],
  ['Platano', 89, 1.1, 23, 0.3, 2.6, 0, 'g', [['Unidad', 120]]],
  ['Naranja', 47, 0.9, 12, 0.1, 2.4, 0, 'g', [['Unidad', 200]]],
  ['Fresas', 32, 0.7, 7.7, 0.3, 2, 0, 'g', [['Bol', 150]]],
  ['Kiwi', 61, 1.1, 15, 0.5, 3, 0, 'g', [['Unidad', 75]]],
  ['Uvas', 69, 0.7, 18, 0.2, 0.9, 0, 'g', [['Racimo pequeno', 150]]],
  ['Sandia', 30, 0.6, 7.6, 0.2, 0.4, 0, 'g', [['Rodaja', 250]]],
  ['Aguacate', 160, 2, 8.5, 15, 6.7, 0, 'g', [['Unidad', 200], ['Mitad', 100]]],
  ['Melon', 34, 0.8, 8.2, 0.2, 0.9, 0, 'g', [['Rodaja', 200]]],

  // --- Frutos secos y grasas -------------------------------------------
  ['Almendras', 579, 21, 22, 50, 12.5, 0, 'g', [['Punado', 25]]],
  ['Nueces', 654, 15, 14, 65, 6.7, 0, 'g', [['Punado', 25]]],
  ['Cacahuetes', 567, 26, 16, 49, 8.5, 0, 'g', [['Punado', 25]]],
  ['Crema de cacahuete', 588, 25, 20, 50, 6, 0.4, 'g', [['Cucharada', 15]]],
  ['Aceite de oliva virgen extra', 884, 0, 0, 100, 0, 0, 'ml', [['Cucharada', 10], ['Chorrito', 5]]],
  ['Mantequilla', 717, 0.9, 0.1, 81, 0, 1.1, 'g', [['Porcion', 10]]],

  // --- Dulces y snacks --------------------------------------------------
  ['Azucar', 400, 0, 100, 0, 0, 0, 'g', [['Cucharadita', 5]]],
  ['Miel', 304, 0.3, 82, 0, 0, 0, 'g', [['Cucharada', 20]]],
  ['Chocolate negro 70%', 546, 7.8, 46, 31, 11, 0, 'g', [['Onza', 10]]],
  ['Chocolate con leche', 535, 7.6, 59, 30, 2.4, 0.2, 'g', [['Onza', 10]]],
  ['Galletas Maria', 450, 7, 74, 13, 2.5, 0.7, 'g', [['Unidad', 8]]],
  ['Patatas fritas de bolsa', 536, 6.6, 53, 34, 4.4, 1.3, 'g', [['Bolsa pequena', 40]]],

  // --- Bebidas ----------------------------------------------------------
  ['Cerveza', 43, 0.5, 3.6, 0, 0, 0, 'ml', [['Tercio', 330], ['Cana', 200]]],
  ['Vino tinto', 85, 0.1, 2.6, 0, 0, 0, 'ml', [['Copa', 150]]],
  ['Refresco de cola', 42, 0, 10.6, 0, 0, 0, 'ml', [['Lata', 330]]],
  ['Refresco de cola zero', 0.3, 0, 0, 0, 0, 0, 'ml', [['Lata', 330]]],
  ['Zumo de naranja', 45, 0.7, 10.4, 0.2, 0.2, 0, 'ml', [['Vaso', 200]]],
  ['Cafe solo', 2, 0.1, 0, 0, 0, 0, 'ml', [['Taza', 50]]],

  // --- Suplementos ------------------------------------------------------
  ['Proteina whey en polvo', 380, 78, 6, 5, 0, 0.5, 'g', [['Cazo', 30]]],
];

/** Convierte el formato compacto en registros listos para IndexedDB. */
export function seedFoods() {
  return RAW.map(([name, kcal, protein, carbs, fat, fiber, salt, unit, portions]) => ({
    name,
    brand: null,
    unit: unit || 'g',
    kcal,
    protein,
    carbs,
    fat,
    fiber,
    salt,
    satFat: null,
    sugars: null,
    portions: (portions || []).map(([label, grams]) => ({ label, grams })),
    photo: null,
    favorite: 0,
    timesUsed: 0,
    lastUsed: 0,
    source: 'seed',
  }));
}

export const SEED_COUNT = RAW.length;
