# MacroFit

Diario de comidas y macronutrientes para el móvil. Se instala como una app nativa
(PWA), funciona sin conexión y lee la información nutricional de las etiquetas a
partir de una foto.

Uso personal. **Todos los datos se guardan solo en tu móvil**: no hay servidor,
ni cuentas, ni nada que salga del teléfono.

---

## Instalarla en el móvil

1. Abre la URL de GitHub Pages en **Chrome** (Android) o **Safari** (iPhone).
2. Menú `⋮` → **Añadir a pantalla de inicio** / **Instalar aplicación**.
3. Ábrela desde el icono. A partir de ahí va a pantalla completa y sin conexión.

La primera vez te pedirá tus datos (sexo, edad, altura, peso, actividad y objetivo)
y calculará tus calorías y macros diarios. Puedes cambiarlos en **Ajustes → Objetivos**.

---

## Cómo escanear una etiqueta

MacroFit hace la foto; el reconocimiento de texto lo pone Google Lens, que ya viene
en Android y acierta mucho más que cualquier OCR embebido en una web.

1. **Añadir → Escanear etiqueta** y fotografía la tabla "Información nutricional".
2. Saca el texto de la foto con una de estas dos vías:
   - **Circle to Search**: mantén pulsado el botón de inicio (o la barra de gestos)
     con la foto en pantalla, rodea la tabla y toca **Copiar texto**.
   - **Google Fotos**: abre la foto que acabas de hacer, toca el icono de **Lens**,
     selecciona la tabla y **Copiar texto**.
3. Vuelve a MacroFit y pulsa **Pegar del portapapeles**. Se analiza solo.
4. Revisa los valores (son editables), ponle nombre y guarda.

El analizador entiende las etiquetas europeas reales: coma decimal, punto de millar
(`1.987 kJ`), varias columnas (`por 100 g` / `por ración` / `%VRN`), `de las cuales
saturadas`, sodio en lugar de sal, kJ sin kcal, etiquetas multilingües y las
confusiones típicas del OCR (`1OO` → `100`). Si algo no cuadra, avisa: comprueba las
calorías contra los macros y no deja pasar una suma imposible.

Si la etiqueta trae dos columnas, un selector te deja elegir cuál usar. Los valores
se normalizan siempre a 100 g / 100 ml al guardarlos.

---

## Qué trae

- **Diario** por día y por comida (desayuno, almuerzo, comida, merienda, cena) con
  anillo de calorías y barras de macros frente a tu objetivo.
- **Objetivos** calculados con Mifflin-St Jeor + factor de actividad, con ritmo de
  pérdida o ganancia ajustable, cinco repartos de macros predefinidos, reparto
  personalizado y opción de fijar la proteína en g/kg. O mete tus cifras a mano.
- **Biblioteca de alimentos** con 86 básicos de la cocina española ya cargados,
  búsqueda sin acentos, favoritos, recientes y raciones rápidas ("1 unidad = 60 g").
- **Progreso**: medias de los últimos 7 días, calorías por día, peso corporal con
  gráfico y constancia mensual.
- **Copia de seguridad** en JSON (incluye las fotos de las etiquetas).

---

## Desarrollo

```bash
python -m http.server 8123 --directory macrofit
```

Y abre `http://localhost:8123`.

Pruebas del analizador de etiquetas (10 etiquetas reales, 79 comprobaciones):

```bash
node tests/parser.test.mjs
```

Regenerar los iconos:

```bash
python tools/make_icons.py
```

### Estructura

| Fichero | Qué hace |
| --- | --- |
| `js/parser.js` | Analiza el texto de la etiqueta. Sin dependencias, probado aparte. |
| `js/calc.js` | Metabolismo basal, gasto total, reparto de macros, fechas. |
| `js/store.js` | IndexedDB: alimentos, diario, pesos, ajustes, exportar/importar. |
| `js/seed-foods.js` | Los 86 alimentos básicos iniciales. |
| `js/app.js` | Vistas, navegación y flujos. |
| `sw.js` | Service worker: la app funciona sin conexión. |

Al publicar cambios, sube `CACHE_VERSION` en `sw.js` para que los móviles ya
instalados se actualicen.

---

## Copias de seguridad

Los datos viven en el IndexedDB del navegador. Sobreviven a cerrar la app y a
reiniciar el móvil, pero **se pierden si borras los datos de navegación o cambias
de teléfono**. En **Ajustes → Copia de seguridad → Exportar** te bajas un `.json`
con todo; **Importar** lo restaura, fusionando o reemplazando.
