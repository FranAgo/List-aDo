// ─── storage.js ────────────────────────────────────────────────────────────────
// Config, constants, localStorage keys, y lógica de colores de categorías.
// No depende de ningún otro módulo del proyecto.

export const API    = 'https://script.google.com/macros/s/AKfycbzpJgvkbJ2JQkKUwOHL1XPRMM5_eOh9SjfLEBxlKesIswJ3DXVj63q_LsmdMRXkWLBy/exec';
export const SECRET = '20002600!?';

// LocalStorage keys
export const LKEY       = 'listado_key';
export const TKEY       = 'listado_today';
export const CKEY       = 'listado_cat_colors';
export const LORDER_KEY = 'listado_list_order';

// Category color palette
export const CAT_PALETTE = [
  { bg: 'rgba(120,180,255,0.13)', border: 'rgba(120,180,255,0.35)', text: '#7ab4ff' },
  { bg: 'rgba(180,140,255,0.13)', border: 'rgba(180,140,255,0.35)', text: '#b48cff' },
  { bg: 'rgba(255,170,100,0.13)', border: 'rgba(255,170,100,0.35)', text: '#ffaa64' },
  { bg: 'rgba(80,210,160,0.13)',  border: 'rgba(80,210,160,0.35)',  text: '#50d2a0' },
  { bg: 'rgba(255,130,130,0.13)', border: 'rgba(255,130,130,0.35)', text: '#ff8282' },
  { bg: 'rgba(255,220,80,0.13)',  border: 'rgba(255,220,80,0.35)',  text: '#ffd040' },
  { bg: 'rgba(100,210,230,0.13)', border: 'rgba(100,210,230,0.35)', text: '#64d2e6' },
  { bg: 'rgba(240,140,200,0.13)', border: 'rgba(240,140,200,0.35)', text: '#f08cc8' },
];

// catColors: objeto mutable compartido por referencia entre módulos.
// Se exporta el objeto para que todos los importadores vean las mutaciones.
export const catColors = {};

export function loadCatColors() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CKEY) || '{}');
    Object.assign(catColors, parsed);
  } catch (e) {
    // Si el JSON está corrupto, arrancar limpio
  }
}

export function saveCatColors() {
  localStorage.setItem(CKEY, JSON.stringify(catColors));
}

export function assignCatColor(name) {
  if (catColors[name]) return catColors[name];
  const usedIndexes = Object.values(catColors).map(c => c.idx);
  let idx = 0;
  while (usedIndexes.includes(idx) && idx < CAT_PALETTE.length) idx++;
  catColors[name] = { idx, ...CAT_PALETTE[idx] };
  saveCatColors();
  return catColors[name];
}

export function getCatColor(name) {
  return catColors[name] || assignCatColor(name);
}
