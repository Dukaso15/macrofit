/**
 * MacroFit — aplicacion principal.
 * Vistas, navegacion y flujos de usuario.
 */

import { foods, entries, weights, meta, exportAll, importAll, wipe, usage } from './store.js';
import { parseLabel, resolveColumn } from './parser.js';
import { seedFoods } from './seed-foods.js';
import {
  ACTIVITY, GOALS, MACRO_PRESETS, MEALS, KCAL_PER_G,
  computeTargets, normalizeSplit, splitFromMacros,
  scaleFood, sumEntries, groupByMeal, pct,
  dayKey, addDays, humanDate, fmt, round,
} from './calc.js';

/* ================================================================== */
/* Estado                                                              */
/* ================================================================== */

const DEFAULT_PROFILE = {
  mode: 'auto',
  sex: 'm',
  age: 30,
  heightCm: 175,
  weightKg: 75,
  activity: 'moderate',
  goal: 'maintain',
  rateKgWeek: 0,
  preset: 'balanced',
  split: { protein: 30, carbs: 40, fat: 30 },
  proteinPerKg: null,
  manual: { kcal: 2200, protein: 165, carbs: 220, fat: 73 },
  onboarded: false,
};

const state = {
  tab: 'diary',
  date: dayKey(),
  profile: { ...DEFAULT_PROFILE },
  targets: null,
  theme: 'system',
};

const app = document.getElementById('app');

/* ================================================================== */
/* Utilidades de DOM                                                   */
/* ================================================================== */

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Lee un numero escrito con coma o punto. */
function num(v, fallback = null) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number.parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

const ICONS = {
  diary:    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  foods:    '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  plus:     '<path d="M12 5v14M5 12h14"/>',
  chart:    '<path d="M18 20V10M12 20V4M6 20v-6"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  left:     '<path d="M15 18l-6-6 6-6"/>',
  right:    '<path d="M9 18l6-6-6-6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  camera:   '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  trash:    '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  star:     '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  edit:     '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  check:    '<path d="M20 6L9 17l-5-5"/>',
  close:    '<path d="M18 6L6 18M6 6l12 12"/>',
  paste:    '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload:   '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  alert:    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  info:     '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  copy:     '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  scale:    '<path d="M12 3v18M5 8h14l3 9a5 5 0 0 1-10 0zM5 8L2 17a5 5 0 0 0 10 0z"/>',
};

function icon(name, size) {
  const s = size ? ` width="${size}" height="${size}"` : '';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round"${s} aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

let toastTimer = null;
function toast(msg) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  el.setAttribute('role', 'status');
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2800);
}

/* --- Capas modales ------------------------------------------------- */

/**
 * Cierra la capa mas alta: la ultima del DOM, sea hoja o pantalla.
 * Cada capa guarda su propia funcion de cierre en __close para que se
 * ejecuten tambien sus callbacks (por ejemplo el "cancelar" de un confirm).
 */
function closeTop() {
  const layers = [...document.querySelectorAll('.screen, .sheet')];
  const top = layers[layers.length - 1];
  if (!top) return false;
  if (typeof top.__close === 'function') top.__close();
  else top.remove();
  return true;
}

/** Hoja inferior. `build` recibe el nodo del cuerpo y una funcion para cerrar. */
function openSheet({ title, body, foot, onClose }) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';

  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.innerHTML = `
    <div class="sheet-grip"></div>
    <div class="sheet-head">
      <h2 class="grow truncate">${esc(title)}</h2>
      <button class="icon-btn" data-close aria-label="Cerrar">${icon('close')}</button>
    </div>
    <div class="sheet-body"></div>
    ${foot ? '<div class="sheet-foot"></div>' : ''}
  `;

  const close = () => {
    sheet.remove();
    scrim.remove();
    if (onClose) onClose();
  };

  sheet.querySelector('.sheet-body').innerHTML = body || '';
  if (foot) sheet.querySelector('.sheet-foot').innerHTML = foot;
  sheet.querySelector('[data-close]').addEventListener('click', close);
  scrim.addEventListener('click', close);
  sheet.__close = close;

  document.body.append(scrim, sheet);
  return { sheet, close, body: sheet.querySelector('.sheet-body'), foot: sheet.querySelector('.sheet-foot') };
}

/** Pantalla completa. */
function openScreen({ title, body, foot, right }) {
  const screen = document.createElement('div');
  screen.className = 'screen';
  screen.innerHTML = `
    <div class="appbar">
      <button class="icon-btn" data-back aria-label="Volver">${icon('left')}</button>
      <h1 class="grow truncate">${esc(title)}</h1>
      ${right || '<div style="width:38px"></div>'}
    </div>
    <div class="screen-body"></div>
    ${foot ? '<div class="screen-foot"></div>' : ''}
  `;
  screen.querySelector('.screen-body').innerHTML = body || '';
  if (foot) screen.querySelector('.screen-foot').innerHTML = foot;

  const close = () => screen.remove();
  screen.querySelector('[data-back]').addEventListener('click', close);
  screen.__close = close;

  document.body.appendChild(screen);
  return { screen, close, body: screen.querySelector('.screen-body'), foot: screen.querySelector('.screen-foot') };
}

function confirmSheet(title, message, confirmLabel = 'Confirmar', danger = true) {
  return new Promise((resolve) => {
    let done = false;
    const s = openSheet({
      title,
      body: `<p style="margin:0 0 4px">${esc(message)}</p>`,
      foot: `<div class="row" style="gap:10px">
        <button class="btn btn-ghost grow" data-no>Cancelar</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} grow" data-yes>${esc(confirmLabel)}</button>
      </div>`,
      onClose: () => { if (!done) resolve(false); },
    });
    s.foot.querySelector('[data-no]').addEventListener('click', () => { done = true; s.close(); resolve(false); });
    s.foot.querySelector('[data-yes]').addEventListener('click', () => { done = true; s.close(); resolve(true); });
  });
}

/* ================================================================== */
/* Componentes reutilizables                                           */
/* ================================================================== */

const RING_R = 58;
const RING_C = 2 * Math.PI * RING_R;

function ringHtml(consumed, target) {
  const ratio = target ? consumed / target : 0;
  const offset = RING_C * (1 - Math.min(ratio, 1));
  const left = Math.round((target || 0) - consumed);
  const over = left < 0;
  return `
    <div class="ring ${over ? 'over' : ''}">
      <svg viewBox="0 0 132 132" width="132" height="132">
        <circle class="track" cx="66" cy="66" r="${RING_R}" fill="none" stroke-width="12"/>
        <circle class="fill" cx="66" cy="66" r="${RING_R}" fill="none" stroke-width="12"
          stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/>
      </svg>
      <div class="ring-center">
        <div class="big">${Math.abs(left)}</div>
        <div class="lbl">${over ? 'de más' : 'restantes'}</div>
      </div>
    </div>`;
}

function macroRowsHtml(totals, targets) {
  const rows = [
    { cls: 'p', name: 'Proteínas', v: totals.protein, t: targets.protein },
    { cls: 'c', name: 'Carbohidratos', v: totals.carbs, t: targets.carbs },
    { cls: 'f', name: 'Grasas', v: totals.fat, t: targets.fat },
  ];
  return rows.map((r) => {
    const p = pct(r.v, r.t);
    const over = r.v > r.t;
    return `<div class="macro ${r.cls}">
      <span class="name">${r.name}</span>
      <span class="vals">${fmt(r.v, 0)} / ${r.t} g</span>
      <span class="bar"><i class="${over ? 'over' : ''}" style="width:${Math.min(p, 100)}%"></i></span>
    </div>`;
  }).join('');
}

function macroMiniHtml(n) {
  return `<span class="macro-mini">
    <span class="p">P <b>${fmt(n.protein, 0)}</b></span>
    <span class="c">C <b>${fmt(n.carbs, 0)}</b></span>
    <span class="f">G <b>${fmt(n.fat, 0)}</b></span>
  </span>`;
}

function noteHtml(kind, text) {
  return `<div class="note ${kind}">${icon(kind === 'warn' ? 'alert' : 'info')}<span>${esc(text)}</span></div>`;
}

/* ================================================================== */
/* Vista: Diario                                                       */
/* ================================================================== */

async function renderDiary() {
  const rows = await entries.byDate(state.date);
  const totals = sumEntries(rows);
  const t = state.targets;
  const byMeal = groupByMeal(rows, MEALS);

  const mealsHtml = MEALS.map((m) => {
    const items = byMeal[m.id] || [];
    const kcal = sumEntries(items).kcal;
    return `
      <div class="meal ${items.length ? 'has-items' : ''}">
        <div class="meal-head">
          <span class="emoji">${m.icon}</span>
          <div class="grow">
            <div style="font-weight:650;font-size:14.5px">${m.label}</div>
            <div class="tiny faint">${items.length ? items.length + (items.length === 1 ? ' alimento' : ' alimentos') : 'Sin registrar'}</div>
          </div>
          <span class="kcal muted">${kcal ? fmt(kcal, 0) + ' kcal' : ''}</span>
          <button class="add" data-add-meal="${m.id}" aria-label="Añadir a ${m.label}">${icon('plus')}</button>
        </div>
        ${items.length ? `<div class="meal-items">${items.map(entryHtml).join('')}</div>` : ''}
      </div>`;
  }).join('');

  app.innerHTML = `
    <div class="appbar">
      <button class="icon-btn" data-day="-1" aria-label="Día anterior">${icon('left')}</button>
      <h1 class="grow">${esc(humanDate(state.date))}</h1>
      <button class="icon-btn" data-today aria-label="Elegir fecha">${icon('calendar')}</button>
    </div>
    <main>
      <div class="card">
        <div class="ring-wrap">
          ${ringHtml(totals.kcal, t.kcal)}
          <div class="macro-list">${macroRowsHtml(totals, t)}</div>
        </div>
        <div class="spread small muted" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
          <span>Objetivo <b style="color:var(--text)">${t.kcal}</b> kcal</span>
          <span>Consumido <b style="color:var(--text)">${fmt(totals.kcal, 0)}</b> kcal</span>
        </div>
      </div>

      ${mealsHtml}

      <div class="row" style="gap:10px;margin-top:14px">
        ${rows.length === 0
          ? `<button class="btn btn-ghost grow btn-sm" data-copy-prev>${icon('copy')} Copiar día anterior</button>`
          : `<button class="btn btn-ghost grow btn-sm" data-day-detail>${icon('info')} Detalle del día</button>`}
      </div>
    </main>
    ${tabbarHtml()}
  `;

  app.querySelector('[data-day="-1"]').addEventListener('click', () => { state.date = addDays(state.date, -1); render(); });
  app.querySelector('[data-today]').addEventListener('click', pickDate);

  app.querySelectorAll('[data-add-meal]').forEach((b) =>
    b.addEventListener('click', () => openSearchScreen(b.dataset.addMeal))
  );
  app.querySelectorAll('[data-entry]').forEach((b) =>
    b.addEventListener('click', () => openEntrySheet(rows.find((r) => r.id === b.dataset.entry)))
  );

  const copyPrev = app.querySelector('[data-copy-prev]');
  if (copyPrev) copyPrev.addEventListener('click', copyPreviousDay);
  const detail = app.querySelector('[data-day-detail]');
  if (detail) detail.addEventListener('click', () => openDayDetail(totals));

  // Barra superior: flecha de dia siguiente sobre el titulo.
  const bar = app.querySelector('.appbar');
  const next = document.createElement('button');
  next.className = 'icon-btn';
  next.setAttribute('aria-label', 'Día siguiente');
  next.innerHTML = icon('right');
  next.addEventListener('click', () => { state.date = addDays(state.date, 1); render(); });
  bar.insertBefore(next, bar.lastElementChild);

  wireTabbar();
}

function entryHtml(e) {
  return `<button class="entry" data-entry="${esc(e.id)}">
    <div class="grow" style="text-align:left;min-width:0">
      <div class="name truncate">${esc(e.name)}</div>
      <div class="qty">${fmt(e.grams, 1)} ${esc(e.unit || 'g')}${e.portionLabel ? ' · ' + esc(e.portionLabel) : ''}</div>
    </div>
    ${macroMiniHtml(e.nutrients)}
    <span class="kcal">${fmt(e.nutrients.kcal, 0)}</span>
  </button>`;
}

function pickDate() {
  const s = openSheet({
    title: 'Ir a una fecha',
    body: `
      <div class="field">
        <label for="dpick">Fecha</label>
        <input class="input" type="date" id="dpick" value="${esc(state.date)}" max="${addDays(dayKey(), 365)}">
      </div>
      <div class="chip-row">
        <button class="chip" data-jump="0">Hoy</button>
        <button class="chip" data-jump="-1">Ayer</button>
        <button class="chip" data-jump="-7">Hace una semana</button>
      </div>`,
  });
  s.body.querySelector('#dpick').addEventListener('change', (ev) => {
    if (ev.target.value) { state.date = ev.target.value; s.close(); render(); }
  });
  s.body.querySelectorAll('[data-jump]').forEach((b) =>
    b.addEventListener('click', () => {
      state.date = addDays(dayKey(), Number(b.dataset.jump));
      s.close();
      render();
    })
  );
}

async function copyPreviousDay() {
  const prev = addDays(state.date, -1);
  const n = await entries.copyDay(prev, state.date);
  if (n) { toast(`${n} alimento${n === 1 ? '' : 's'} copiado${n === 1 ? '' : 's'}`); render(); }
  else toast('El día anterior también está vacío');
}

async function openDayDetail(totals) {
  const t = state.targets;
  const extra = [
    ['Fibra', totals.fiber, 'g'],
    ['Azúcares', totals.sugars, 'g'],
    ['Grasas saturadas', totals.satFat, 'g'],
    ['Sal', totals.salt, 'g'],
  ];
  openSheet({
    title: 'Detalle de ' + humanDate(state.date).toLowerCase(),
    body: `
      <div class="stat-grid" style="margin-bottom:16px">
        <div class="stat"><div class="v">${fmt(totals.kcal, 0)}</div><div class="k">kcal</div></div>
        <div class="stat"><div class="v" style="color:var(--prot)">${fmt(totals.protein, 0)}</div><div class="k">Proteína</div></div>
        <div class="stat"><div class="v" style="color:var(--carb)">${fmt(totals.carbs, 0)}</div><div class="k">Carbos</div></div>
        <div class="stat"><div class="v" style="color:var(--fat)">${fmt(totals.fat, 0)}</div><div class="k">Grasa</div></div>
      </div>
      <div class="section-title" style="margin-top:0">Otros nutrientes</div>
      <table class="parse-table">
        ${extra.map(([k, v, u]) => `<tr><td>${k}</td><td>${fmt(v, 1)} ${u}</td></tr>`).join('')}
      </table>
      <div class="section-title">Frente al objetivo</div>
      <table class="parse-table">
        <tr><td>Calorías</td><td>${fmt(totals.kcal - t.kcal, 0)} kcal</td></tr>
        <tr><td>Proteínas</td><td>${fmt(totals.protein - t.protein, 0)} g</td></tr>
        <tr><td>Carbohidratos</td><td>${fmt(totals.carbs - t.carbs, 0)} g</td></tr>
        <tr><td>Grasas</td><td>${fmt(totals.fat - t.fat, 0)} g</td></tr>
      </table>`,
  });
}

async function openEntrySheet(entry) {
  if (!entry) return;
  const s = openSheet({
    title: entry.name,
    body: `
      <div class="stat-grid" style="margin-bottom:16px">
        <div class="stat"><div class="v">${fmt(entry.nutrients.kcal, 0)}</div><div class="k">kcal</div></div>
        <div class="stat"><div class="v" style="color:var(--prot)">${fmt(entry.nutrients.protein, 1)}</div><div class="k">Proteína</div></div>
        <div class="stat"><div class="v" style="color:var(--carb)">${fmt(entry.nutrients.carbs, 1)}</div><div class="k">Carbos</div></div>
        <div class="stat"><div class="v" style="color:var(--fat)">${fmt(entry.nutrients.fat, 1)}</div><div class="k">Grasa</div></div>
      </div>
      <div class="field">
        <label for="qty">Cantidad (${esc(entry.unit || 'g')})</label>
        <input class="input" id="qty" type="text" inputmode="decimal" value="${fmt(entry.grams, 1)}">
      </div>
      <div class="field">
        <label for="mealsel">Comida</label>
        <select class="input" id="mealsel">
          ${MEALS.map((m) => `<option value="${m.id}" ${m.id === entry.meal ? 'selected' : ''}>${m.label}</option>`).join('')}
        </select>
      </div>`,
    foot: `<div class="row" style="gap:10px">
      <button class="btn btn-danger" data-del>${icon('trash')}</button>
      <button class="btn btn-primary grow" data-save>Guardar cambios</button>
    </div>`,
  });

  s.foot.querySelector('[data-save]').addEventListener('click', async () => {
    const grams = num(s.body.querySelector('#qty').value, entry.grams);
    const meal = s.body.querySelector('#mealsel').value;
    const food = entry.foodId ? await foods.get(entry.foodId) : null;
    const base = food || entry.snapshot;
    const nutrients = base ? scaleFood(base, grams) : entry.nutrients;
    await entries.save({ ...entry, grams, meal, nutrients });
    s.close();
    render();
    toast('Registro actualizado');
  });

  s.foot.querySelector('[data-del]').addEventListener('click', async () => {
    if (!(await confirmSheet('Eliminar registro', `¿Quitar "${entry.name}" del diario?`, 'Eliminar'))) return;
    await entries.remove(entry.id);
    s.close();
    render();
    toast('Eliminado');
  });
}

/* ================================================================== */
/* Vista: Mis alimentos                                                */
/* ================================================================== */

let foodFilter = 'all';
let foodQuery = '';

async function renderFoods() {
  app.innerHTML = `
    <div class="appbar"><h1 class="grow">Mis alimentos</h1></div>
    <main>
      <div class="field" style="margin-bottom:10px">
        <input class="input" id="fsearch" type="search" placeholder="Buscar alimento…"
          value="${esc(foodQuery)}" autocomplete="off">
      </div>
      <div class="chip-row" style="margin-bottom:12px">
        <button class="chip" data-filter="all"    aria-pressed="${foodFilter === 'all'}">Todos</button>
        <button class="chip" data-filter="recent" aria-pressed="${foodFilter === 'recent'}">Recientes</button>
        <button class="chip" data-filter="fav"    aria-pressed="${foodFilter === 'fav'}">Favoritos</button>
        <button class="chip" data-filter="scan"   aria-pressed="${foodFilter === 'scan'}">Escaneados</button>
      </div>

      <div id="flist"></div>

      <div class="row" style="gap:10px;margin-top:14px">
        <button class="btn btn-ghost grow btn-sm" data-new>${icon('plus')} Crear alimento</button>
        <button class="btn btn-ghost grow btn-sm" data-scan>${icon('camera')} Escanear etiqueta</button>
      </div>
      <p class="tiny faint center" style="margin-top:14px" id="fcount"></p>
    </main>
    ${tabbarHtml()}
  `;

  /** Repinta solo la lista, para no perder el foco ni el cursor al teclear. */
  const drawList = async () => {
    const found = await foods.search(foodQuery, 300);
    const shown = found.filter((f) => {
      if (foodFilter === 'fav') return f.favorite;
      if (foodFilter === 'scan') return f.source === 'scan';
      if (foodFilter === 'recent') return f.lastUsed;
      return true;
    });
    if (foodFilter === 'recent') shown.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    const page = shown.slice(0, 150);

    app.querySelector('#flist').innerHTML = page.length
      ? `<div class="card flush"><div class="list">${page.map(foodRowHtml).join('')}</div></div>`
      : `<div class="empty"><div class="ico">🔍</div>${foodQuery ? 'Ningún alimento coincide' : 'Todavía no hay alimentos aquí'}</div>`;

    app.querySelector('#fcount').textContent =
      `${found.length} alimento${found.length === 1 ? '' : 's'} en tu biblioteca`;

    app.querySelectorAll('[data-food]').forEach((b) =>
      b.addEventListener('click', () => openFoodSheet(b.dataset.food))
    );
  };

  const search = app.querySelector('#fsearch');
  search.addEventListener('input', debounce(() => { foodQuery = search.value; drawList(); }, 200));

  app.querySelectorAll('[data-filter]').forEach((b) =>
    b.addEventListener('click', () => {
      foodFilter = b.dataset.filter;
      app.querySelectorAll('[data-filter]').forEach((x) =>
        x.setAttribute('aria-pressed', String(x.dataset.filter === foodFilter)));
      drawList();
    })
  );
  app.querySelector('[data-new]').addEventListener('click', () => openFoodEditor(null));
  app.querySelector('[data-scan]').addEventListener('click', () => openScanScreen());

  await drawList();
  wireTabbar();
}

function foodRowHtml(f) {
  return `<button class="list-row" data-food="${esc(f.id)}">
    <span class="thumb">${f.photo ? '' : '🍽'}</span>
    <span class="grow" style="min-width:0">
      <span class="truncate" style="display:block;font-weight:600;font-size:14.5px">${esc(f.name)}${f.favorite ? ' ⭐' : ''}</span>
      <span class="tiny faint">${f.brand ? esc(f.brand) + ' · ' : ''}${fmt(f.kcal, 0)} kcal /100 ${esc(f.unit)}</span>
    </span>
    ${macroMiniHtml(f)}
  </button>`;
}

async function openFoodSheet(id) {
  const f = await foods.get(id);
  if (!f) return;

  const s = openSheet({
    title: f.name,
    body: `
      ${f.brand ? `<p class="small muted" style="margin:-4px 0 12px">${esc(f.brand)}</p>` : ''}
      <div class="section-title" style="margin-top:0">Por 100 ${esc(f.unit)}</div>
      <div class="stat-grid" style="margin-bottom:14px">
        <div class="stat"><div class="v">${fmt(f.kcal, 0)}</div><div class="k">kcal</div></div>
        <div class="stat"><div class="v" style="color:var(--prot)">${fmt(f.protein, 1)}</div><div class="k">Proteína</div></div>
        <div class="stat"><div class="v" style="color:var(--carb)">${fmt(f.carbs, 1)}</div><div class="k">Carbos</div></div>
        <div class="stat"><div class="v" style="color:var(--fat)">${fmt(f.fat, 1)}</div><div class="k">Grasa</div></div>
      </div>
      <table class="parse-table">
        <tr><td>Grasas saturadas</td><td>${f.satFat === null || f.satFat === undefined ? '–' : fmt(f.satFat, 1) + ' g'}</td></tr>
        <tr><td>Azúcares</td><td>${f.sugars === null || f.sugars === undefined ? '–' : fmt(f.sugars, 1) + ' g'}</td></tr>
        <tr><td>Fibra</td><td>${f.fiber === null || f.fiber === undefined ? '–' : fmt(f.fiber, 1) + ' g'}</td></tr>
        <tr><td>Sal</td><td>${f.salt === null || f.salt === undefined ? '–' : fmt(f.salt, 2) + ' g'}</td></tr>
      </table>
      ${f.photo ? '<div class="section-title">Etiqueta</div><div class="photo-frame" id="photoBox"></div>' : ''}
      <div class="row" style="gap:10px;margin-top:16px">
        <button class="btn btn-ghost btn-sm grow" data-fav>${icon('star')} ${f.favorite ? 'Quitar favorito' : 'Favorito'}</button>
        <button class="btn btn-ghost btn-sm grow" data-edit>${icon('edit')} Editar</button>
        <button class="btn btn-danger btn-sm" data-del>${icon('trash')}</button>
      </div>`,
    foot: `<button class="btn btn-primary btn-block" data-add>${icon('plus')} Añadir al diario</button>`,
  });

  if (f.photo) {
    const box = s.body.querySelector('#photoBox');
    const img = document.createElement('img');
    img.src = URL.createObjectURL(f.photo);
    img.alt = 'Etiqueta de ' + f.name;
    img.addEventListener('load', () => URL.revokeObjectURL(img.src), { once: true });
    box.appendChild(img);
  }

  s.foot.querySelector('[data-add]').addEventListener('click', () => { s.close(); openQuantitySheet(f); });
  s.body.querySelector('[data-fav]').addEventListener('click', async () => {
    await foods.save({ ...f, favorite: f.favorite ? 0 : 1 });
    s.close();
    render();
  });
  s.body.querySelector('[data-edit]').addEventListener('click', () => { s.close(); openFoodEditor(f); });
  s.body.querySelector('[data-del]').addEventListener('click', async () => {
    if (!(await confirmSheet('Eliminar alimento', `"${f.name}" se borrará de tu biblioteca. Los registros ya guardados en el diario se mantienen.`, 'Eliminar'))) return;
    await foods.remove(f.id);
    s.close();
    render();
    toast('Alimento eliminado');
  });
}

/* ================================================================== */
/* Editor de alimento                                                  */
/* ================================================================== */

function openFoodEditor(food, onSaved) {
  const f = food || { name: '', brand: '', unit: 'g', kcal: null, protein: null, carbs: null, fat: null, satFat: null, sugars: null, fiber: null, salt: null, portions: [] };
  const isNew = !food;

  const numField = (id, label, value, step = 'any') => `
    <div class="field">
      <label for="${id}">${label}</label>
      <div class="input-suffix">
        <input class="input" id="${id}" type="text" inputmode="decimal"
          value="${value === null || value === undefined ? '' : fmt(value, 2)}" placeholder="0">
        <span class="suffix">${id === 'kcal' ? 'kcal' : 'g'}</span>
      </div>
    </div>`;

  const s = openScreen({
    title: isNew ? 'Nuevo alimento' : 'Editar alimento',
    body: `
      <div class="card">
        <div class="field">
          <label for="fname">Nombre</label>
          <input class="input" id="fname" value="${esc(f.name)}" placeholder="Ej. Yogur griego natural" autocomplete="off">
        </div>
        <div class="field">
          <label for="fbrand">Marca <span class="faint">(opcional)</span></label>
          <input class="input" id="fbrand" value="${esc(f.brand || '')}" placeholder="Ej. Hacendado" autocomplete="off">
        </div>
        <div class="field">
          <label>Los valores se refieren a</label>
          <div class="segmented">
            <button data-unit="g"  aria-pressed="${f.unit !== 'ml'}">100 gramos</button>
            <button data-unit="ml" aria-pressed="${f.unit === 'ml'}">100 mililitros</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="section-title" style="margin-top:0">Macronutrientes</div>
        ${numField('kcal', 'Calorías', f.kcal)}
        <div class="grid-3">
          ${numField('protein', 'Proteínas', f.protein)}
          ${numField('carbs', 'Carbos', f.carbs)}
          ${numField('fat', 'Grasas', f.fat)}
        </div>
        <div id="atwater" class="note" style="margin-top:2px"></div>
      </div>

      <div class="card">
        <div class="section-title" style="margin-top:0">Opcionales</div>
        <div class="grid-2">
          ${numField('satFat', 'Saturadas', f.satFat)}
          ${numField('sugars', 'Azúcares', f.sugars)}
          ${numField('fiber', 'Fibra', f.fiber)}
          ${numField('salt', 'Sal', f.salt)}
        </div>
      </div>

      <div class="card">
        <div class="section-title" style="margin-top:0">Raciones rápidas</div>
        <p class="tiny faint" style="margin:-4px 0 10px">Atajos como "1 unidad = 60 g" para no pesar cada vez.</p>
        <div id="portions"></div>
        <button class="btn btn-ghost btn-sm btn-block" data-add-portion style="margin-top:8px">${icon('plus')} Añadir ración</button>
      </div>`,
    foot: `<button class="btn btn-primary btn-block" data-save>${isNew ? 'Crear alimento' : 'Guardar cambios'}</button>`,
  });

  let unit = f.unit || 'g';
  let portions = [...(f.portions || [])];

  const drawPortions = () => {
    const box = s.body.querySelector('#portions');
    box.innerHTML = portions.length
      ? portions.map((p, i) => `
        <div class="row" style="margin-bottom:8px">
          <input class="input grow" data-pl="${i}" value="${esc(p.label)}" placeholder="Unidad">
          <div class="input-suffix" style="width:110px">
            <input class="input" data-pg="${i}" type="text" inputmode="decimal" value="${esc(p.grams)}">
            <span class="suffix">${unit}</span>
          </div>
          <button class="icon-btn" data-pdel="${i}" aria-label="Quitar">${icon('close')}</button>
        </div>`).join('')
      : '<p class="tiny faint" style="margin:0">Ninguna todavía.</p>';

    box.querySelectorAll('[data-pdel]').forEach((b) =>
      b.addEventListener('click', () => { portions.splice(Number(b.dataset.pdel), 1); drawPortions(); })
    );
    box.querySelectorAll('[data-pl]').forEach((inp) =>
      inp.addEventListener('input', () => { portions[Number(inp.dataset.pl)].label = inp.value; })
    );
    box.querySelectorAll('[data-pg]').forEach((inp) =>
      inp.addEventListener('input', () => { portions[Number(inp.dataset.pg)].grams = num(inp.value, 0); })
    );
  };
  drawPortions();

  s.body.querySelector('[data-add-portion]').addEventListener('click', () => {
    portions.push({ label: 'Unidad', grams: 100 });
    drawPortions();
  });

  s.body.querySelectorAll('[data-unit]').forEach((b) =>
    b.addEventListener('click', () => {
      unit = b.dataset.unit;
      s.body.querySelectorAll('[data-unit]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.unit === unit)));
      drawPortions();
    })
  );

  // Comprobacion en vivo de coherencia entre kcal y macros.
  const checkAtwater = () => {
    const box = s.body.querySelector('#atwater');
    const kcal = num(s.body.querySelector('#kcal').value);
    const p = num(s.body.querySelector('#protein').value);
    const c = num(s.body.querySelector('#carbs').value);
    const g = num(s.body.querySelector('#fat').value);
    if (p === null || c === null || g === null) { box.className = 'note'; box.innerHTML = `${icon('info')}<span>Rellena los tres macros y comprobaré que cuadran con las calorías.</span>`; return; }
    const computed = Math.round(4 * p + 4 * c + 9 * g);
    if (kcal === null) {
      box.className = 'note';
      box.innerHTML = `${icon('info')}<span>Según los macros serían <b>${computed} kcal</b>. <button class="btn btn-sm" data-use-kcal style="padding:2px 8px;margin-left:4px">Usar</button></span>`;
      const btn = box.querySelector('[data-use-kcal]');
      if (btn) btn.addEventListener('click', () => { s.body.querySelector('#kcal').value = computed; checkAtwater(); });
      return;
    }
    const diff = Math.abs(computed - kcal) / Math.max(kcal, 1);
    if (diff > 0.25) {
      box.className = 'note warn';
      box.innerHTML = `${icon('alert')}<span>Las calorías no cuadran con los macros (saldrían ~${computed} kcal). Revísalo.</span>`;
    } else {
      box.className = 'note ok';
      box.innerHTML = `${icon('check')}<span>Los valores son coherentes.</span>`;
    }
  };
  ['kcal', 'protein', 'carbs', 'fat'].forEach((id) =>
    s.body.querySelector('#' + id).addEventListener('input', checkAtwater)
  );
  checkAtwater();

  s.foot.querySelector('[data-save]').addEventListener('click', async () => {
    const name = s.body.querySelector('#fname').value.trim();
    if (!name) { toast('Ponle un nombre al alimento'); s.body.querySelector('#fname').focus(); return; }

    const get = (id) => num(s.body.querySelector('#' + id).value);
    const record = {
      ...f,
      name,
      brand: s.body.querySelector('#fbrand').value.trim() || null,
      unit,
      kcal: get('kcal') ?? 0,
      protein: get('protein') ?? 0,
      carbs: get('carbs') ?? 0,
      fat: get('fat') ?? 0,
      satFat: get('satFat'),
      sugars: get('sugars'),
      fiber: get('fiber'),
      salt: get('salt'),
      portions: portions.filter((p) => p.label && p.grams > 0),
      source: f.source || 'manual',
    };

    const saved = await foods.save(record);
    s.close();
    toast(isNew ? 'Alimento creado' : 'Cambios guardados');
    if (onSaved) onSaved(saved);
    else render();
  });
}

/* ================================================================== */
/* Buscar y anadir al diario                                           */
/* ================================================================== */

function suggestMeal() {
  const h = new Date().getHours();
  if (h < 11) return 'desayuno';
  if (h < 13) return 'almuerzo';
  if (h < 16.5) return 'comida';
  if (h < 19.5) return 'merienda';
  return 'cena';
}

async function openSearchScreen(meal) {
  const targetMeal = meal || suggestMeal();

  const s = openScreen({
    title: 'Añadir a ' + (MEALS.find((m) => m.id === targetMeal) || MEALS[0]).label.toLowerCase(),
    body: `
      <button class="btn btn-primary btn-block" data-scan style="margin-bottom:12px">
        ${icon('camera')} Escanear etiqueta
      </button>
      <div class="field" style="margin-bottom:10px">
        <input class="input" id="q" type="search" placeholder="Buscar en mis alimentos…" autocomplete="off">
      </div>
      <div id="results"></div>`,
    foot: `<button class="btn btn-ghost btn-block" data-new>${icon('plus')} Crear alimento nuevo</button>`,
  });

  const results = s.body.querySelector('#results');
  const input = s.body.querySelector('#q');

  const draw = async () => {
    const list = await foods.search(input.value, 60);
    if (!list.length) {
      results.innerHTML = `<div class="empty"><div class="ico">🍳</div>
        ${input.value ? 'Nada coincide. Créalo o escanea su etiqueta.' : 'Tu biblioteca está vacía.'}</div>`;
      return;
    }
    const heading = input.value ? 'Resultados' : 'Recientes y favoritos';
    results.innerHTML = `<div class="section-title" style="margin-top:4px">${heading}</div>
      <div class="card flush"><div class="list">${list.map(foodRowHtml).join('')}</div></div>`;
    results.querySelectorAll('[data-food]').forEach((b) =>
      b.addEventListener('click', async () => {
        const f = await foods.get(b.dataset.food);
        openQuantitySheet(f, targetMeal, () => s.close());
      })
    );
  };

  input.addEventListener('input', debounce(draw, 200));
  s.body.querySelector('[data-scan]').addEventListener('click', () => openScanScreen(targetMeal, () => s.close()));
  s.foot.querySelector('[data-new]').addEventListener('click', () =>
    openFoodEditor(null, (saved) => openQuantitySheet(saved, targetMeal, () => s.close()))
  );

  draw();
}

/** Hoja de cantidad: elige gramos o raciones y anade al diario. */
function openQuantitySheet(food, meal, onDone) {
  if (!food) return;
  const targetMeal = meal || suggestMeal();
  const portions = food.portions || [];

  let grams = portions.length ? portions[0].grams : 100;
  let portionLabel = portions.length ? portions[0].label : null;

  const s = openSheet({
    title: food.name,
    body: `
      ${food.brand ? `<p class="small muted" style="margin:-4px 0 12px">${esc(food.brand)}</p>` : ''}
      ${portions.length ? `<div class="chip-row" style="margin-bottom:12px" id="pchips">
        ${portions.map((p, i) => `<button class="chip" data-p="${i}">${esc(p.label)} · ${fmt(p.grams, 1)} ${esc(food.unit)}</button>`).join('')}
        <button class="chip" data-p="-1">Otra cantidad</button>
      </div>` : ''}
      <div class="field">
        <label for="qty">Cantidad</label>
        <div class="input-suffix">
          <input class="input" id="qty" type="text" inputmode="decimal" value="${esc(grams)}">
          <span class="suffix">${esc(food.unit)}</span>
        </div>
      </div>
      <div class="field">
        <label>Comida</label>
        <div class="chip-row" id="mchips">
          ${MEALS.map((m) => `<button class="chip" data-m="${m.id}" aria-pressed="${m.id === targetMeal}">${m.icon} ${m.label}</button>`).join('')}
        </div>
      </div>
      <div class="section-title">Aporta</div>
      <div class="stat-grid" id="preview"></div>`,
    foot: `<button class="btn btn-primary btn-block" data-add>Añadir al diario</button>`,
  });

  let chosenMeal = targetMeal;
  const qty = s.body.querySelector('#qty');

  const preview = () => {
    const n = scaleFood(food, num(qty.value, 0));
    s.body.querySelector('#preview').innerHTML = `
      <div class="stat"><div class="v">${fmt(n.kcal, 0)}</div><div class="k">kcal</div></div>
      <div class="stat"><div class="v" style="color:var(--prot)">${fmt(n.protein, 1)}</div><div class="k">Proteína</div></div>
      <div class="stat"><div class="v" style="color:var(--carb)">${fmt(n.carbs, 1)}</div><div class="k">Carbos</div></div>
      <div class="stat"><div class="v" style="color:var(--fat)">${fmt(n.fat, 1)}</div><div class="k">Grasa</div></div>`;
  };

  qty.addEventListener('input', () => { portionLabel = null; preview(); });

  const chips = s.body.querySelector('#pchips');
  if (chips) {
    const markChips = () => chips.querySelectorAll('[data-p]').forEach((b) => {
      const i = Number(b.dataset.p);
      b.setAttribute('aria-pressed', String(i >= 0 && portions[i] && portions[i].label === portionLabel));
    });
    chips.querySelectorAll('[data-p]').forEach((b) =>
      b.addEventListener('click', () => {
        const i = Number(b.dataset.p);
        if (i < 0) { portionLabel = null; qty.focus(); qty.select(); }
        else { grams = portions[i].grams; portionLabel = portions[i].label; qty.value = grams; }
        markChips();
        preview();
      })
    );
    markChips();
  }

  s.body.querySelectorAll('[data-m]').forEach((b) =>
    b.addEventListener('click', () => {
      chosenMeal = b.dataset.m;
      s.body.querySelectorAll('[data-m]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.m === chosenMeal)));
    })
  );

  preview();

  s.foot.querySelector('[data-add]').addEventListener('click', async () => {
    const g = num(qty.value, 0);
    if (!g || g <= 0) { toast('Indica una cantidad'); return; }
    await entries.save({
      date: state.date,
      meal: chosenMeal,
      foodId: food.id,
      name: food.name,
      brand: food.brand || null,
      grams: g,
      unit: food.unit || 'g',
      portionLabel,
      nutrients: scaleFood(food, g),
      snapshot: {
        kcal: food.kcal, protein: food.protein, carbs: food.carbs, fat: food.fat,
        satFat: food.satFat, sugars: food.sugars, fiber: food.fiber, salt: food.salt,
      },
    });
    if (food.id) await foods.touch(food.id);
    s.close();
    if (onDone) onDone();
    state.tab = 'diary';
    render();
    toast('Añadido al diario');
  });
}

/* ================================================================== */
/* Escaneo de etiquetas                                                */
/* ================================================================== */

const SCAN_HELP = `Haz la foto y luego copia el texto de la etiqueta con Google Lens:
mantén pulsado el botón de inicio (Circle to Search) sobre la foto, o abre la foto
en Google Fotos y toca el icono de Lens. Selecciona la tabla nutricional, copia y
vuelve aquí.`;

function openScanScreen(meal, onDone) {
  let photoBlob = null;
  let parsed = null;

  const s = openScreen({
    title: 'Escanear etiqueta',
    body: `
      <div class="steps">
        <div class="step" id="step1">
          <div class="grow">
            <h3>Fotografía la etiqueta</h3>
            <p class="tiny faint" style="margin:0 0 10px">Encuadra la tabla "Información nutricional" lo más recta y cerca que puedas.</p>
            <div class="photo-frame" id="frame">
              <div class="center" style="pointer-events:none">
                ${icon('camera', 30)}
                <div class="tiny" style="margin-top:6px">Toca para abrir la cámara</div>
              </div>
            </div>
            <input type="file" accept="image/*" capture="environment" id="camera" class="sr-only">
          </div>
        </div>

        <div class="step" id="step2">
          <div class="grow">
            <h3>Copia el texto con Google Lens</h3>
            <p class="tiny faint" style="margin:0 0 10px">${esc(SCAN_HELP)}</p>
            <button class="btn btn-ghost btn-block btn-sm" data-paste style="margin-bottom:10px">
              ${icon('paste')} Pegar del portapapeles
            </button>
            <textarea class="input" id="raw" placeholder="…o pega aquí el texto de la etiqueta"></textarea>
            <button class="btn btn-primary btn-block" data-parse style="margin-top:10px">
              ${icon('check')} Analizar texto
            </button>
          </div>
        </div>

        <div class="step hidden" id="step3">
          <div class="grow">
            <h3>Revisa y guarda</h3>
            <div id="result"></div>
          </div>
        </div>
      </div>`,
  });

  /* --- Paso 1: camara ---------------------------------------------- */
  const frame = s.body.querySelector('#frame');
  const camera = s.body.querySelector('#camera');
  frame.addEventListener('click', () => camera.click());

  camera.addEventListener('change', async () => {
    const file = camera.files && camera.files[0];
    if (!file) return;
    try {
      photoBlob = await compressImage(file, 1100, 0.72);
      const url = URL.createObjectURL(photoBlob);
      frame.innerHTML = `<img src="${url}" alt="Etiqueta fotografiada">
        <span class="retake">${icon('camera', 14)} Repetir</span>`;
      frame.querySelector('img').addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
      s.body.querySelector('#step1').classList.add('done');
      s.body.querySelector('#raw').focus();
    } catch (err) {
      toast('No se ha podido procesar la foto');
    }
  });

  /* --- Paso 2: texto ----------------------------------------------- */
  s.body.querySelector('[data-paste]').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) { toast('El portapapeles está vacío'); return; }
      s.body.querySelector('#raw').value = text;
      doParse();
    } catch {
      toast('Pega el texto manualmente en el cuadro');
      s.body.querySelector('#raw').focus();
    }
  });

  s.body.querySelector('[data-parse]').addEventListener('click', doParse);

  function doParse() {
    const raw = s.body.querySelector('#raw').value;
    if (!raw.trim()) { toast('Pega primero el texto de la etiqueta'); return; }
    parsed = parseLabel(raw);
    s.body.querySelector('#step2').classList.add('done');
    s.body.querySelector('#step3').classList.remove('hidden');
    drawResult();
    s.body.querySelector('#step3').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* --- Paso 3: revision -------------------------------------------- */
  function drawResult() {
    const box = s.body.querySelector('#result');
    const v = parsed.values;
    const conf = parsed.confidence;
    const level = conf >= 0.85 ? 'high' : conf >= 0.5 ? 'mid' : 'low';
    const levelText = conf >= 0.85 ? 'Lectura fiable' : conf >= 0.5 ? 'Revisa los valores' : 'Lectura dudosa';

    const dataCols = parsed.columns.filter((c) => c.type !== 'percent');

    const field = (key, label, unit = 'g') => `
      <tr>
        <td>${label}</td>
        <td><input data-v="${key}" type="text" inputmode="decimal"
          value="${v[key] === null || v[key] === undefined ? '' : fmt(v[key], 2)}" placeholder="–">
          <span class="tiny faint" style="margin-left:4px">${unit}</span></td>
      </tr>`;

    box.innerHTML = `
      <div class="confidence ${level}" style="margin-bottom:10px">
        <span class="dot"></span><span>${levelText} · ${Math.round(conf * 100)}%</span>
      </div>

      ${dataCols.length > 1 ? `
        <div class="field">
          <label>Los valores mostrados son</label>
          <div class="segmented" id="colsel">
            ${dataCols.map((c) => {
              const idx = parsed.columns.indexOf(c);
              return `<button data-col="${idx}" aria-pressed="${idx === parsed.chosen}">${esc(c.label)}</button>`;
            }).join('')}
          </div>
        </div>` : ''}

      <div class="field">
        <label for="sname">Nombre del alimento</label>
        <input class="input" id="sname" value="${esc(parsed.name || '')}" placeholder="Ej. Galletas de avena" autocomplete="off">
      </div>
      <div class="field">
        <label for="sbrand">Marca <span class="faint">(opcional)</span></label>
        <input class="input" id="sbrand" placeholder="Ej. Hacendado" autocomplete="off">
      </div>

      <div class="section-title" style="margin-top:6px">Valores por ${parsed.per.amount} ${parsed.per.unit}</div>
      <table class="parse-table">
        ${field('energyKcal', 'Calorías', 'kcal')}
        ${field('protein', 'Proteínas')}
        ${field('carbs', 'Hidratos de carbono')}
        ${field('sugars', 'de los cuales azúcares')}
        ${field('fat', 'Grasas')}
        ${field('satFat', 'de las cuales saturadas')}
        ${field('fiber', 'Fibra')}
        ${field('salt', 'Sal')}
      </table>

      ${parsed.portion ? `<div class="note" style="margin-top:12px">${icon('info')}<span>Se ha detectado una ración de
        <b>${fmt(parsed.portion.grams, 1)} ${esc(parsed.portion.unit)}</b>; se guardará como atajo.</span></div>` : ''}

      ${parsed.warnings.length ? parsed.warnings.map((w) => noteHtml('warn', w)).join('') : ''}

      <details style="margin-top:12px">
        <summary class="tiny faint" style="cursor:pointer">Ver el texto reconocido</summary>
        <pre class="tiny faint" style="white-space:pre-wrap;margin-top:8px">${esc(parsed.lines.join('\n'))}</pre>
      </details>

      <button class="btn btn-primary btn-block" data-save style="margin-top:16px">
        ${icon('check')} Guardar y añadir al diario
      </button>
      <button class="btn btn-ghost btn-block btn-sm" data-saveonly style="margin-top:8px">
        Guardar solo en mi biblioteca
      </button>`;

    const colsel = box.querySelector('#colsel');
    if (colsel) {
      colsel.querySelectorAll('[data-col]').forEach((b) =>
        b.addEventListener('click', () => {
          parsed.chosen = Number(b.dataset.col);
          parsed.values = resolveColumn(parsed.rows, parsed.chosen);
          const col = parsed.columns[parsed.chosen];
          parsed.per = { amount: col.amount || 100, unit: col.unit || 'g' };
          drawResult();
        })
      );
    }

    box.querySelector('[data-save]').addEventListener('click', () => save(true));
    box.querySelector('[data-saveonly]').addEventListener('click', () => save(false));
  }

  async function save(alsoAdd) {
    const box = s.body.querySelector('#result');
    const name = box.querySelector('#sname').value.trim();
    if (!name) { toast('Ponle un nombre al alimento'); box.querySelector('#sname').focus(); return; }

    const get = (k) => {
      const el = box.querySelector(`[data-v="${k}"]`);
      return el ? num(el.value) : null;
    };

    // La etiqueta puede venir por racion; normalizamos siempre a 100 g/ml.
    const basis = parsed.per.amount || 100;
    const k = 100 / basis;
    const scale = (x) => (x === null ? null : round(x * k, 2));

    const record = {
      name,
      brand: box.querySelector('#sbrand').value.trim() || null,
      unit: parsed.per.unit === 'ml' ? 'ml' : 'g',
      kcal: scale(get('energyKcal')) ?? 0,
      protein: scale(get('protein')) ?? 0,
      carbs: scale(get('carbs')) ?? 0,
      fat: scale(get('fat')) ?? 0,
      satFat: scale(get('satFat')),
      sugars: scale(get('sugars')),
      fiber: scale(get('fiber')),
      salt: scale(get('salt')),
      portions: parsed.portion ? [{ label: parsed.portion.label || 'Ración', grams: parsed.portion.grams }] : [],
      photo: photoBlob,
      source: 'scan',
    };

    const saved = await foods.save(record);
    s.close();
    if (onDone) onDone();
    if (alsoAdd) openQuantitySheet(saved, meal);
    else { render(); toast('Guardado en tu biblioteca'); }
  }
}

/** Reduce y recomprime la foto para que ocupe poco en el movil. */
function compressImage(file, maxSide = 1100, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('sin blob'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagen ilegible')); };
    img.src = url;
  });
}

/* ================================================================== */
/* Vista: Progreso                                                     */
/* ================================================================== */

async function renderProgress() {
  const today = dayKey();
  const from = addDays(today, -29);
  const rows = await entries.range(from, today);
  const w = await weights.all();

  const byDay = {};
  for (const r of rows) (byDay[r.date] = byDay[r.date] || []).push(r);

  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    last7.push({ date: d, totals: sumEntries(byDay[d] || []), logged: !!byDay[d] });
  }
  const loggedDays = last7.filter((d) => d.logged).length;
  const avg = (key) => {
    const vals = last7.filter((d) => d.logged).map((d) => d.totals[key]);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  const t = state.targets;
  const daysLoggedMonth = Object.keys(byDay).length;

  app.innerHTML = `
    <div class="appbar"><h1 class="grow">Progreso</h1></div>
    <main>
      <div class="card">
        <div class="section-title" style="margin-top:0">Últimos 7 días</div>
        <div class="stat-grid">
          <div class="stat"><div class="v">${Math.round(avg('kcal'))}</div><div class="k">kcal / día</div></div>
          <div class="stat"><div class="v" style="color:var(--prot)">${Math.round(avg('protein'))}</div><div class="k">Proteína</div></div>
          <div class="stat"><div class="v" style="color:var(--carb)">${Math.round(avg('carbs'))}</div><div class="k">Carbos</div></div>
          <div class="stat"><div class="v" style="color:var(--fat)">${Math.round(avg('fat'))}</div><div class="k">Grasa</div></div>
        </div>
        <p class="tiny faint center" style="margin:12px 0 0">
          ${loggedDays} de 7 días registrados · objetivo ${t.kcal} kcal
        </p>
      </div>

      <div class="card">
        <div class="section-title" style="margin-top:0">Calorías por día</div>
        ${barsHtml(last7, t.kcal)}
      </div>

      <div class="card">
        <div class="spread" style="margin-bottom:10px">
          <div class="section-title" style="margin:0">Peso corporal</div>
          <button class="btn btn-sm btn-ghost" data-addw>${icon('plus')} Anotar</button>
        </div>
        ${w.length >= 2 ? weightChartHtml(w) : `<p class="tiny faint center" style="padding:20px 0;margin:0">
          Anota tu peso un par de veces y aquí verás la tendencia.</p>`}
        ${w.length ? `<div class="spread small" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
          <span class="muted">Último: <b style="color:var(--text)">${fmt(w[w.length - 1].kg, 1)} kg</b></span>
          ${w.length >= 2 ? `<span class="muted">Cambio: <b style="color:${w[w.length - 1].kg <= w[0].kg ? 'var(--brand)' : 'var(--carb)'}">${w[w.length - 1].kg > w[0].kg ? '+' : ''}${fmt(w[w.length - 1].kg - w[0].kg, 1)} kg</b></span>` : ''}
        </div>` : ''}
      </div>

      <div class="card">
        <div class="section-title" style="margin-top:0">Constancia</div>
        <div class="stat-grid">
          <div class="stat"><div class="v">${daysLoggedMonth}</div><div class="k">días este mes</div></div>
          <div class="stat"><div class="v">${Math.round((daysLoggedMonth / 30) * 100)}%</div><div class="k">adherencia</div></div>
          <div class="stat"><div class="v">${rows.length}</div><div class="k">registros</div></div>
        </div>
      </div>
    </main>
    ${tabbarHtml()}
  `;

  app.querySelector('[data-addw]').addEventListener('click', addWeightSheet);
  wireTabbar();
}

function barsHtml(days, target) {
  const max = Math.max(target * 1.25, ...days.map((d) => d.totals.kcal), 1);
  const names = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
  return `<div style="display:flex;align-items:flex-end;gap:6px;height:112px;padding-top:6px">
    ${days.map((d) => {
      const h = Math.max(2, (d.totals.kcal / max) * 100);
      const over = d.totals.kcal > target;
      const dow = new Date(d.date + 'T12:00:00').getDay();
      return `<div class="grow col" style="align-items:center;gap:5px;height:100%;justify-content:flex-end">
        <span class="tiny faint" style="font-size:9.5px">${d.logged ? Math.round(d.totals.kcal) : ''}</span>
        <span style="width:100%;height:${h}%;border-radius:5px 5px 2px 2px;background:${over ? 'var(--danger)' : d.logged ? 'var(--brand)' : 'var(--surface-3)'};opacity:${d.logged ? 1 : .5}"></span>
        <span class="tiny faint">${names[dow]}</span>
      </div>`;
    }).join('')}
  </div>
  <div class="tiny faint center" style="margin-top:6px">Línea de objetivo: ${target} kcal</div>`;
}

function weightChartHtml(all) {
  const data = all.slice(-30);
  const W = 320, H = 150, PAD = 22;
  const kgs = data.map((d) => d.kg);
  const min = Math.min(...kgs), max = Math.max(...kgs);
  const span = Math.max(max - min, 1);
  const lo = min - span * 0.18, hi = max + span * 0.18;

  const x = (i) => PAD + (i / Math.max(data.length - 1, 1)) * (W - PAD * 2);
  const y = (v) => PAD + (1 - (v - lo) / (hi - lo)) * (H - PAD * 2);

  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.kg).toFixed(1)}`);
  const line = 'M' + pts.join(' L');
  const area = `${line} L${x(data.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
      aria-label="Evolución del peso corporal">
    <line class="grid-line" x1="${PAD}" y1="${PAD}" x2="${W - PAD}" y2="${PAD}"/>
    <line class="grid-line" x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}"/>
    <path class="area" d="${area}"/>
    <path class="line" d="${line}"/>
    ${data.map((d, i) => `<circle class="pt" cx="${x(i).toFixed(1)}" cy="${y(d.kg).toFixed(1)}" r="3"/>`).join('')}
    <text class="lbl" x="2" y="${PAD + 4}">${fmt(hi, 1)}</text>
    <text class="lbl" x="2" y="${H - PAD + 4}">${fmt(lo, 1)}</text>
  </svg>`;
}

function addWeightSheet() {
  const s = openSheet({
    title: 'Anotar peso',
    body: `
      <div class="field">
        <label for="wkg">Peso</label>
        <div class="input-suffix">
          <input class="input" id="wkg" type="text" inputmode="decimal" value="${esc(state.profile.weightKg)}">
          <span class="suffix">kg</span>
        </div>
      </div>
      <div class="field">
        <label for="wdate">Fecha</label>
        <input class="input" id="wdate" type="date" value="${dayKey()}">
      </div>
      <label class="row small" style="gap:8px">
        <input type="checkbox" id="wsync" checked>
        <span>Actualizar también mi perfil y recalcular objetivos</span>
      </label>`,
    foot: `<button class="btn btn-primary btn-block" data-save>Guardar</button>`,
  });

  s.foot.querySelector('[data-save]').addEventListener('click', async () => {
    const kg = num(s.body.querySelector('#wkg').value);
    if (!kg || kg < 20 || kg > 400) { toast('Introduce un peso válido'); return; }
    await weights.save(s.body.querySelector('#wdate').value, kg);
    if (s.body.querySelector('#wsync').checked) {
      state.profile.weightKg = kg;
      await saveProfile();
    }
    s.close();
    render();
    toast('Peso guardado');
  });
}

/* ================================================================== */
/* Vista: Objetivos                                                    */
/* ================================================================== */

function renderGoalsScreen(isOnboarding) {
  const p = { ...state.profile };

  const s = openScreen({
    title: isOnboarding ? 'Configura tus objetivos' : 'Objetivos',
    body: '<div id="goals"></div>',
    foot: `<button class="btn btn-primary btn-block" data-save>${isOnboarding ? 'Empezar a usar MacroFit' : 'Guardar objetivos'}</button>`,
  });

  const box = s.body.querySelector('#goals');

  const draw = () => {
    const t = computeTargets(p);
    const split = p.mode === 'manual'
      ? splitFromMacros({ protein: p.manual.protein, carbs: p.manual.carbs, fat: p.manual.fat })
      : normalizeSplit(p.preset === 'custom' ? p.split : (MACRO_PRESETS.find((x) => x.id === p.preset) || MACRO_PRESETS[0]).split);

    box.innerHTML = `
      ${isOnboarding ? `<div class="note ok" style="margin-bottom:12px">${icon('info')}
        <span>Rellena tus datos y calcularé tus calorías y macros diarios. Podrás cambiarlo cuando quieras.</span></div>` : ''}

      <div class="card">
        <div class="segmented" id="modesel">
          <button data-mode="auto"   aria-pressed="${p.mode === 'auto'}">Calcular por mí</button>
          <button data-mode="manual" aria-pressed="${p.mode === 'manual'}">Poner mis cifras</button>
        </div>
      </div>

      ${p.mode === 'auto' ? autoBlock(p) : manualBlock(p)}

      <div class="card" style="background:var(--brand-soft);border-color:transparent">
        <div class="section-title" style="margin-top:0;color:var(--brand-dark)">Tu objetivo diario</div>
        <div class="stat-grid" id="targetStats" style="margin-bottom:10px">
          <div class="stat" style="background:var(--surface)"><div class="v">${t.kcal}</div><div class="k">kcal</div></div>
          <div class="stat" style="background:var(--surface)"><div class="v" style="color:var(--prot)">${t.protein}</div><div class="k">Proteína g</div></div>
          <div class="stat" style="background:var(--surface)"><div class="v" style="color:var(--carb)">${t.carbs}</div><div class="k">Carbos g</div></div>
          <div class="stat" style="background:var(--surface)"><div class="v" style="color:var(--fat)">${t.fat}</div><div class="k">Grasa g</div></div>
        </div>
        <p class="tiny center" style="margin:0;color:var(--brand-dark)">
          Reparto ${split.protein} / ${split.carbs} / ${split.fat} %
          ${t.maintenance ? ` · mantenimiento ${t.maintenance} kcal · basal ${t.bmr} kcal` : ''}
        </p>
      </div>`;

    wire();
  };

  const autoBlock = (p) => `
    <div class="card">
      <div class="section-title" style="margin-top:0">Tus datos</div>
      <div class="field">
        <label>Sexo</label>
        <div class="segmented">
          <button data-sex="m" aria-pressed="${p.sex === 'm'}">Hombre</button>
          <button data-sex="f" aria-pressed="${p.sex === 'f'}">Mujer</button>
        </div>
      </div>
      <div class="grid-3">
        <div class="field"><label for="age">Edad</label>
          <input class="input" id="age" type="text" inputmode="numeric" value="${esc(p.age)}"></div>
        <div class="field"><label for="height">Altura cm</label>
          <input class="input" id="height" type="text" inputmode="numeric" value="${esc(p.heightCm)}"></div>
        <div class="field"><label for="weight">Peso kg</label>
          <input class="input" id="weight" type="text" inputmode="decimal" value="${esc(p.weightKg)}"></div>
      </div>
      <div class="field" style="margin-bottom:0">
        <label for="activity">Nivel de actividad</label>
        <select class="input" id="activity">
          ${ACTIVITY.map((a) => `<option value="${a.id}" ${a.id === p.activity ? 'selected' : ''}>${a.label} — ${a.hint}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="card">
      <div class="section-title" style="margin-top:0">Qué quieres conseguir</div>
      <div class="segmented" style="margin-bottom:14px">
        ${GOALS.map((g) => `<button data-goal="${g.id}" aria-pressed="${p.goal === g.id}">${g.label}</button>`).join('')}
      </div>
      ${p.goal !== 'maintain' ? `
        <div class="field" style="margin-bottom:0">
          <label for="rate">Ritmo: <b style="color:var(--text)">${fmt(Math.abs(p.rateKgWeek), 2)} kg por semana</b></label>
          <input type="range" id="rate" min="0.1" max="1" step="0.05" value="${Math.abs(p.rateKgWeek) || 0.5}">
          <p class="tiny faint" style="margin:4px 0 0">
            ${p.goal === 'lose' ? 'Entre 0,25 y 0,75 kg/semana es lo sostenible sin perder músculo.'
                                : 'Entre 0,15 y 0,35 kg/semana limita la ganancia de grasa.'}
          </p>
        </div>` : ''}
    </div>

    <div class="card">
      <div class="section-title" style="margin-top:0">Reparto de macros</div>
      <div class="chip-row" style="margin-bottom:12px">
        ${MACRO_PRESETS.map((m) => `<button class="chip" data-preset="${m.id}" aria-pressed="${p.preset === m.id}">${m.label}</button>`).join('')}
      </div>
      ${p.preset === 'custom' ? `
        <div class="grid-3">
          <div class="field"><label>Proteína %</label>
            <input class="input" id="sp" type="text" inputmode="numeric" value="${esc(p.split.protein)}"></div>
          <div class="field"><label>Carbos %</label>
            <input class="input" id="sc" type="text" inputmode="numeric" value="${esc(p.split.carbs)}"></div>
          <div class="field"><label>Grasa %</label>
            <input class="input" id="sf" type="text" inputmode="numeric" value="${esc(p.split.fat)}"></div>
        </div>`
      : `<p class="tiny faint" style="margin:0">${esc((MACRO_PRESETS.find((m) => m.id === p.preset) || MACRO_PRESETS[0]).hint)}</p>`}
      <label class="row small" style="gap:8px;margin-top:12px">
        <input type="checkbox" id="ppk" ${p.proteinPerKg ? 'checked' : ''}>
        <span>Fijar proteína por kg de peso</span>
      </label>
      ${p.proteinPerKg ? `
        <div class="field" style="margin:10px 0 0">
          <label for="ppkv">Gramos por kg: <b style="color:var(--text)">${fmt(p.proteinPerKg, 1)} g/kg</b>
            → ${Math.round(p.proteinPerKg * p.weightKg)} g al día</label>
          <input type="range" id="ppkv" min="1.2" max="2.6" step="0.1" value="${esc(p.proteinPerKg)}">
        </div>` : ''}
    </div>`;

  const manualBlock = (p) => `
    <div class="card">
      <div class="section-title" style="margin-top:0">Tus cifras</div>
      <div class="field">
        <label for="mkcal">Calorías diarias</label>
        <div class="input-suffix">
          <input class="input" id="mkcal" type="text" inputmode="numeric" value="${esc(p.manual.kcal)}">
          <span class="suffix">kcal</span>
        </div>
      </div>
      <div class="grid-3">
        <div class="field"><label>Proteína g</label>
          <input class="input" id="mp" type="text" inputmode="numeric" value="${esc(p.manual.protein)}"></div>
        <div class="field"><label>Carbos g</label>
          <input class="input" id="mc" type="text" inputmode="numeric" value="${esc(p.manual.carbs)}"></div>
        <div class="field"><label>Grasa g</label>
          <input class="input" id="mf" type="text" inputmode="numeric" value="${esc(p.manual.fat)}"></div>
      </div>
      <div id="mcheck" class="note"></div>
    </div>`;

  function wire() {
    box.querySelectorAll('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => { p.mode = b.dataset.mode; draw(); })
    );
    box.querySelectorAll('[data-sex]').forEach((b) =>
      b.addEventListener('click', () => { p.sex = b.dataset.sex; draw(); })
    );
    box.querySelectorAll('[data-goal]').forEach((b) =>
      b.addEventListener('click', () => {
        p.goal = b.dataset.goal;
        const g = GOALS.find((x) => x.id === p.goal);
        p.rateKgWeek = g.defaultRate;
        draw();
      })
    );
    box.querySelectorAll('[data-preset]').forEach((b) =>
      b.addEventListener('click', () => { p.preset = b.dataset.preset; draw(); })
    );

    const bind = (id, fn, ev = 'input') => {
      const el = box.querySelector('#' + id);
      if (el) el.addEventListener(ev, () => fn(el));
    };

    bind('age', (el) => { p.age = num(el.value, p.age); refreshTargets(); });
    bind('height', (el) => { p.heightCm = num(el.value, p.heightCm); refreshTargets(); });
    bind('weight', (el) => { p.weightKg = num(el.value, p.weightKg); refreshTargets(); });
    bind('activity', (el) => { p.activity = el.value; refreshTargets(); }, 'change');
    bind('rate', (el) => {
      const v = num(el.value, 0.5);
      p.rateKgWeek = p.goal === 'lose' ? -v : v;
      draw();
    }, 'change');
    bind('sp', (el) => { p.split.protein = num(el.value, 30); refreshTargets(); });
    bind('sc', (el) => { p.split.carbs = num(el.value, 40); refreshTargets(); });
    bind('sf', (el) => { p.split.fat = num(el.value, 30); refreshTargets(); });
    bind('ppk', (el) => { p.proteinPerKg = el.checked ? 1.8 : null; draw(); }, 'change');
    bind('ppkv', (el) => { p.proteinPerKg = num(el.value, 1.8); draw(); }, 'change');

    bind('mkcal', (el) => { p.manual.kcal = num(el.value, 0); checkManual(); });
    bind('mp', (el) => { p.manual.protein = num(el.value, 0); checkManual(); });
    bind('mc', (el) => { p.manual.carbs = num(el.value, 0); checkManual(); });
    bind('mf', (el) => { p.manual.fat = num(el.value, 0); checkManual(); });

    if (p.mode === 'manual') checkManual();
  }

  /** Actualiza solo la tarjeta de resultado, sin perder el foco del teclado. */
  function refreshTargets() {
    const t = computeTargets(p);
    const card = box.querySelector('#targetStats');
    if (!card) return;
    const vals = card.querySelectorAll('.stat .v');
    if (vals.length === 4) {
      vals[0].textContent = t.kcal;
      vals[1].textContent = t.protein;
      vals[2].textContent = t.carbs;
      vals[3].textContent = t.fat;
    }
  }

  function checkManual() {
    const el = box.querySelector('#mcheck');
    if (!el) return;
    const m = p.manual;
    const computed = Math.round(m.protein * KCAL_PER_G.protein + m.carbs * KCAL_PER_G.carbs + m.fat * KCAL_PER_G.fat);
    const diff = Math.abs(computed - m.kcal);
    if (diff <= Math.max(40, m.kcal * 0.04)) {
      el.className = 'note ok';
      el.innerHTML = `${icon('check')}<span>Los macros cuadran con las calorías.</span>`;
    } else {
      el.className = 'note warn';
      el.innerHTML = `${icon('alert')}<span>Tus macros suman <b>${computed} kcal</b>, no ${m.kcal}.
        <button class="btn btn-sm" data-fix style="padding:2px 8px;margin-left:4px">Ajustar</button></span>`;
      el.querySelector('[data-fix]').addEventListener('click', () => {
        p.manual.kcal = computed;
        draw();
      });
    }
    refreshTargets();
  }

  s.foot.querySelector('[data-save]').addEventListener('click', async () => {
    p.onboarded = true;
    state.profile = p;
    await saveProfile();
    s.close();
    render();
    toast('Objetivos actualizados');
  });

  draw();
}

/* ================================================================== */
/* Vista: Ajustes                                                      */
/* ================================================================== */

async function renderSettings() {
  const t = state.targets;
  const u = await usage();
  const all = await foods.all();

  app.innerHTML = `
    <div class="appbar"><h1 class="grow">Ajustes</h1></div>
    <main>
      <button class="card list-row" data-goals style="width:100%;border-radius:var(--r-lg)">
        <span class="thumb">🎯</span>
        <span class="grow" style="text-align:left">
          <span style="display:block;font-weight:650">Objetivos y perfil</span>
          <span class="tiny faint">${t.kcal} kcal · ${t.protein}P / ${t.carbs}C / ${t.fat}G</span>
        </span>
        ${icon('right')}
      </button>

      <div class="card">
        <div class="section-title" style="margin-top:0">Apariencia</div>
        <div class="segmented" id="themesel">
          <button data-theme="light"  aria-pressed="${state.theme === 'light'}">Claro</button>
          <button data-theme="system" aria-pressed="${state.theme === 'system'}">Sistema</button>
          <button data-theme="dark"   aria-pressed="${state.theme === 'dark'}">Oscuro</button>
        </div>
      </div>

      <div class="card">
        <div class="section-title" style="margin-top:0">Copia de seguridad</div>
        <p class="tiny faint" style="margin:-4px 0 12px">
          Todo se guarda solo en este móvil. Exporta de vez en cuando para no perder el historial
          si borras los datos del navegador o cambias de teléfono.
        </p>
        <div class="row" style="gap:10px">
          <button class="btn btn-ghost btn-sm grow" data-export>${icon('download')} Exportar</button>
          <button class="btn btn-ghost btn-sm grow" data-import>${icon('upload')} Importar</button>
        </div>
        <input type="file" accept="application/json,.json" id="importFile" class="sr-only">
      </div>

      <div class="card">
        <div class="section-title" style="margin-top:0">Datos</div>
        <table class="parse-table">
          <tr><td>Alimentos guardados</td><td>${all.length}</td></tr>
          <tr><td>Espacio usado</td><td>${u ? fmt(u.used / 1048576, 1) + ' MB' : '–'}</td></tr>
        </table>
        <button class="btn btn-ghost btn-sm btn-block" data-reseed style="margin-top:12px">
          Restaurar alimentos básicos
        </button>
        <button class="btn btn-danger btn-sm btn-block" data-wipe style="margin-top:8px">
          ${icon('trash')} Borrar todos mis datos
        </button>
      </div>

      <p class="tiny faint center" style="margin-top:18px">
        MacroFit · versión 1.0<br>
        Hecho para uso personal. Los datos nunca salen de tu móvil.
      </p>
    </main>
    ${tabbarHtml()}
  `;

  app.querySelector('[data-goals]').addEventListener('click', () => renderGoalsScreen(false));

  app.querySelectorAll('[data-theme]').forEach((b) =>
    b.addEventListener('click', () => { setTheme(b.dataset.theme); renderSettings(); })
  );

  app.querySelector('[data-export]').addEventListener('click', doExport);
  app.querySelector('[data-import]').addEventListener('click', () => app.querySelector('#importFile').click());
  app.querySelector('#importFile').addEventListener('change', doImport);

  app.querySelector('[data-reseed]').addEventListener('click', async () => {
    if (!(await confirmSheet('Restaurar básicos', 'Se volverán a añadir los alimentos básicos que falten. No se toca nada de lo que hayas creado tú.', 'Restaurar', false))) return;
    const existing = new Set((await foods.all()).map((f) => f.name.toLowerCase()));
    let n = 0;
    for (const f of seedFoods()) {
      if (!existing.has(f.name.toLowerCase())) { await foods.save(f); n++; }
    }
    toast(n ? `${n} alimentos restaurados` : 'Ya estaban todos');
    renderSettings();
  });

  app.querySelector('[data-wipe]').addEventListener('click', async () => {
    if (!(await confirmSheet('Borrar todo', 'Se borrarán tus alimentos, el diario completo, los pesos y tus objetivos. Esto no se puede deshacer.', 'Borrar todo'))) return;
    if (!(await confirmSheet('¿Seguro?', 'Última oportunidad. ¿Exportaste una copia de seguridad?', 'Sí, borrar todo'))) return;
    await wipe();
    state.profile = { ...DEFAULT_PROFILE };
    await boot(true);
    toast('Todo borrado');
  });

  wireTabbar();
}

async function doExport() {
  const data = await exportAll({ includePhotos: true });
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `macrofit-${dayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Copia descargada');
}

async function doImport(ev) {
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast('El fichero no es un JSON válido');
    return;
  }
  const replace = await confirmSheet(
    'Importar copia',
    `El fichero trae ${(data.foods || []).length} alimentos y ${(data.entries || []).length} registros. ` +
    '¿Reemplazar todo lo que tienes ahora, o fusionarlo con lo actual?',
    'Reemplazar todo'
  );
  try {
    const res = await importAll(data, replace ? 'replace' : 'merge');
    await boot(true);
    const d = res.descartados || {};
    const tirados = (d.foods || 0) + (d.entries || 0) + (d.weights || 0) + (d.meta || 0);
    toast(
      `Importados ${res.foods} alimentos y ${res.entries} registros` +
      (tirados ? ` · ${tirados} entrada${tirados === 1 ? '' : 's'} con datos inválidos descartada${tirados === 1 ? '' : 's'}` : '')
    );
  } catch (err) {
    toast(err.message || 'No se ha podido importar');
  }
}

/* ================================================================== */
/* Navegacion                                                          */
/* ================================================================== */

const TABS = [
  { id: 'diary', label: 'Diario', icon: 'diary' },
  { id: 'foods', label: 'Alimentos', icon: 'foods' },
  { id: 'add', label: 'Añadir', icon: 'plus' },
  { id: 'progress', label: 'Progreso', icon: 'chart' },
  { id: 'settings', label: 'Ajustes', icon: 'settings' },
];

function tabbarHtml() {
  return `<nav class="tabbar">
    ${TABS.map((t) => t.id === 'add'
      ? `<button class="tab-add" data-tab="add" aria-label="Añadir comida">
           <span class="fab">${icon('plus')}</span><span>Añadir</span>
         </button>`
      : `<button data-tab="${t.id}" ${state.tab === t.id ? 'aria-current="page"' : ''}>
           ${icon(t.icon)}<span>${t.label}</span>
         </button>`
    ).join('')}
  </nav>`;
}

function wireTabbar() {
  app.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.tab;
      if (id === 'add') { openSearchScreen(); return; }
      state.tab = id;
      render();
      window.scrollTo(0, 0);
    })
  );
}

function render() {
  if (state.tab === 'diary') return renderDiary();
  if (state.tab === 'foods') return renderFoods();
  if (state.tab === 'progress') return renderProgress();
  if (state.tab === 'settings') return renderSettings();
  return renderDiary();
}

/* ================================================================== */
/* Tema                                                                */
/* ================================================================== */

function setTheme(mode) {
  state.theme = mode;
  try { localStorage.setItem('macrofit.theme', mode); } catch {}
  if (mode === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  meta.set('theme', mode);
}

/* ================================================================== */
/* Arranque                                                            */
/* ================================================================== */

async function saveProfile() {
  state.targets = computeTargets(state.profile);
  await meta.set('profile', state.profile);
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function boot(skipSeed) {
  const savedProfile = await meta.get('profile');
  state.profile = { ...DEFAULT_PROFILE, ...(savedProfile || {}) };
  state.profile.split = { ...DEFAULT_PROFILE.split, ...(state.profile.split || {}) };
  state.profile.manual = { ...DEFAULT_PROFILE.manual, ...(state.profile.manual || {}) };
  state.targets = computeTargets(state.profile);

  const theme = (await meta.get('theme')) || 'system';
  setTheme(theme);

  if (!skipSeed) {
    const existing = await foods.all();
    if (existing.length === 0) {
      for (const f of seedFoods()) await foods.save(f);
    }
  }

  await render();

  if (!state.profile.onboarded) {
    renderGoalsScreen(true);
    return;
  }

  // Accesos directos del icono de la app.
  const action = new URLSearchParams(location.search).get('action');
  if (action === 'scan') openScanScreen();
  else if (action === 'add') openSearchScreen();
  if (action) history.replaceState(null, '', location.pathname);
}

/**
 * El boton "atras" de Android cierra la capa superior en vez de salir de la app.
 * Se apila una entrada de historial por cada capa abierta y se consume al volver.
 */
history.replaceState({ mf: 0 }, '');
let layerDepth = 0;

const layerObserver = new MutationObserver(() => {
  const open = document.querySelectorAll('.screen, .sheet').length;
  while (layerDepth < open) history.pushState({ mf: ++layerDepth }, '');
  if (open === 0) layerDepth = 0;
});
layerObserver.observe(document.body, { childList: true });

window.addEventListener('popstate', () => {
  if (document.querySelector('.screen, .sheet')) {
    closeTop();
    layerDepth = Math.max(0, layerDepth - 1);
  } else {
    layerDepth = 0;
  }
});

/* Service worker: hace que la app funcione sin conexion. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

/** Pantalla de arranque fallido, con salida: siempre se puede reintentar. */
function bootFailed(err) {
  console.error(err);
  app.innerHTML = `<div class="empty" style="padding-top:26vh">
    <div class="ico">😕</div>
    <p style="margin:0 0 6px">No se ha podido iniciar MacroFit.</p>
    <p class="tiny" style="max-width:30ch;margin:0 auto 18px">${esc(err && err.message ? err.message : err)}</p>
    <button class="btn btn-primary" data-retry>Reintentar</button>
    <p class="tiny faint" style="margin-top:18px;max-width:32ch;margin-left:auto;margin-right:auto">
      Tus datos siguen guardados. Si el problema no se va, cierra las demás pestañas de MacroFit y vuelve a abrirla.
    </p>
  </div>`;
  app.querySelector('[data-retry]').addEventListener('click', () => {
    app.innerHTML = '<div class="empty" style="padding-top:38vh"><div class="ico">🍳</div><div>Cargando…</div></div>';
    boot().catch(bootFailed);
  });
}

boot().catch(bootFailed);
