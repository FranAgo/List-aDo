// ─── storage.js ────────────────────────────────────────────────────────────────
// Config, constants, localStorage keys, y lógica de colores de categorías.
// No depende de ningún otro módulo del proyecto.

export const API    = 'https://script.google.com/macros/s/AKfycbzpJgvkbJ2JQkKUwOHL1XPRMM5_eOh9SjfLEBxlKesIswJ3DXVj63q_LsmdMRXkWLBy/exec';
export const SECRET = '20002600!?';

// Versión mostrada en la topbar (ver .topbar-version en styles.css).
// Única fuente de verdad — no hardcodear el número en ningún otro lado.
// Al bumpear: actualizar también CHANGELOG.md con la entrada correspondiente.
export const APP_VERSION = '1.1.0';

// LocalStorage keys
export const LKEY       = 'listado_key';
export const TKEY       = 'listado_today';
export const CKEY       = 'listado_cat_colors';
export const LORDER_KEY = 'listado_list_order';

// Category color palette — 20 colores perceptualmente distintos.
// Agrupados por región del espectro para maximizar la distancia entre consecutivos.
export const CAT_PALETTE = [
  // Azul cielo
  { bg: 'rgba(120,180,255,0.13)', border: 'rgba(120,180,255,0.35)', text: '#7ab4ff' },
  // Violeta
  { bg: 'rgba(180,140,255,0.13)', border: 'rgba(180,140,255,0.35)', text: '#b48cff' },
  // Naranja
  { bg: 'rgba(255,170,100,0.13)', border: 'rgba(255,170,100,0.35)', text: '#ffaa64' },
  // Verde menta
  { bg: 'rgba(80,210,160,0.13)',  border: 'rgba(80,210,160,0.35)',  text: '#50d2a0' },
  // Rojo coral
  { bg: 'rgba(255,130,130,0.13)', border: 'rgba(255,130,130,0.35)', text: '#ff8282' },
  // Amarillo
  { bg: 'rgba(255,220,80,0.13)',  border: 'rgba(255,220,80,0.35)',  text: '#ffd040' },
  // Cian
  { bg: 'rgba(100,210,230,0.13)', border: 'rgba(100,210,230,0.35)', text: '#64d2e6' },
  // Rosa
  { bg: 'rgba(240,140,200,0.13)', border: 'rgba(240,140,200,0.35)', text: '#f08cc8' },
  // Verde lima
  { bg: 'rgba(160,230,80,0.13)',  border: 'rgba(160,230,80,0.35)',  text: '#a0e650' },
  // Índigo
  { bg: 'rgba(100,120,255,0.13)', border: 'rgba(100,120,255,0.35)', text: '#6478ff' },
  // Durazno
  { bg: 'rgba(255,190,140,0.13)', border: 'rgba(255,190,140,0.35)', text: '#ffbe8c' },
  // Turquesa
  { bg: 'rgba(60,200,190,0.13)',  border: 'rgba(60,200,190,0.35)',  text: '#3cc8be' },
  // Magenta
  { bg: 'rgba(230,90,180,0.13)',  border: 'rgba(230,90,180,0.35)',  text: '#e65ab4' },
  // Amarillo verdoso
  { bg: 'rgba(200,220,60,0.13)',  border: 'rgba(200,220,60,0.35)',  text: '#c8dc3c' },
  // Azul marino claro
  { bg: 'rgba(80,160,220,0.13)',  border: 'rgba(80,160,220,0.35)',  text: '#50a0dc' },
  // Salmón
  { bg: 'rgba(255,150,120,0.13)', border: 'rgba(255,150,120,0.35)', text: '#ff9678' },
  // Verde bosque
  { bg: 'rgba(80,190,120,0.13)',  border: 'rgba(80,190,120,0.35)',  text: '#50be78' },
  // Lavanda
  { bg: 'rgba(200,170,255,0.13)', border: 'rgba(200,170,255,0.35)', text: '#c8aaff' },
  // Ámbar
  { bg: 'rgba(255,200,60,0.13)',  border: 'rgba(255,200,60,0.35)',  text: '#ffc83c' },
  // Celeste pastel
  { bg: 'rgba(140,220,255,0.13)', border: 'rgba(140,220,255,0.35)', text: '#8cdcff' },
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
  // Buscar el primer índice libre; si la paleta está completa, wrap-around por módulo
  let idx = 0;
  while (usedIndexes.includes(idx) && idx < CAT_PALETTE.length) idx++;
  if (idx >= CAT_PALETTE.length) idx = Object.keys(catColors).length % CAT_PALETTE.length;
  catColors[name] = { idx, ...CAT_PALETTE[idx] };
  saveCatColors();
  return catColors[name];
}

export function getCatColor(name) {
  return catColors[name] || assignCatColor(name);
}
