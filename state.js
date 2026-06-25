// ─── state.js ──────────────────────────────────────────────────────────────────
// Estado global de la aplicación como objeto mutable único.
//
// Por qué un objeto y no exports separados:
// Con ES modules, `export let x = []` + `x = x.filter(...)` en otro módulo
// deja referencias desactualizadas en los demás importadores.
// Exportar un objeto y mutar sus propiedades (state.tasks = ...) garantiza
// que todos los módulos que importan `state` ven siempre el valor actual.

export const state = {
  tasks:           [],
  categories:      [],
  currentCat:      'today',
  editingId:       null,
  todayIds:        new Set(),
  listOrder:       [],
  searchState:     { query: '', filter: 'all' },
  listSearchQuery: '',

  // Drag state — categories
  catDragIdx:     null,
  catDragOverIdx: null,

  // Drag state — tasks
  dragSrcId: null,

  // Global search
  globalSearchOpen: false,
  _gsrActions:      [],

  // Rename modal
  renamingCat: null,

  // Undo buffer para eliminaciones
  _undoBuffer: null,
  _undoTimer:  null,

  // Toast timer
  _toastTimer: null,

  // Modal guard
  _modalMousedownOnContent: false,

  // Switch cat timer
  _switchCatTimer: null,

  // Sección Calendario — vista (mes/semana/día) y fecha de referencia visible
  scheduleView:    'month',
  scheduleRefDate: null,
};
