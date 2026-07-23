// ─── ui.js ─────────────────────────────────────────────────────────────────────
// Renderizado del DOM. Modales, toast, búsqueda global, calendario.

import { state }                        from './state.js';
import { getCatColor, catColors }       from './storage.js';
import { isoToDisplay, fmtDate, fmtCreatedAt, parseUserDate } from './dates.js';
import { lgSyncWithActiveBtn, lgIndicator, lgState,
         setLgCurrentAnim, setLgInitDone, setLgCurrentBtn,
         setLgSwitching }              from './animations.js';

// ─── UTILIDADES ────────────────────────────────────────────────────────────────
export function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── STATS ─────────────────────────────────────────────────────────────────────
export function updateStats() {
  const active = state.tasks.filter(t => !t.done);
  document.getElementById('s-total').textContent = active.length;
  document.getElementById('s-pend').textContent  = active.filter(t => !isOverdueUI(t)).length;
  document.getElementById('s-soon').textContent  = active.filter(t => isSoonDueUI(t)).length;
  document.getElementById('s-over').textContent  = active.filter(t => isOverdueUI(t)).length;
}

// Helpers locales de fecha para UI — usan parseLocalDate inline para evitar circular
function parseLocalDateUI(iso) {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3]), 23, 59, 59);
}

function isOverdueUI(t) {
  const d = parseLocalDateUI(t.due);
  return !!(d && !t.done && d < new Date());
}

function isSoonDueUI(t) {
  if (!t.due || t.done) return false;
  const d = parseLocalDateUI(t.due);
  if (!d) return false;
  const now = new Date();
  if (d < now) return false;
  const threeDaysFromNow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 23, 59, 59);
  return d <= threeDaysFromNow;
}

// ─── CATEGORY BAR ──────────────────────────────────────────────────────────────
export function renderCatBar() {
  // syncListOrder inline (importar tasks.js crearía ciclo)
  state.listOrder = state.listOrder.filter(c => state.categories.includes(c));
  state.categories.forEach(c => { if (!state.listOrder.includes(c)) state.listOrder.push(c); });
  const { LORDER_KEY } = window._storage || {};
  localStorage.setItem('listado_list_order', JSON.stringify(state.listOrder));

  const todayCount = state.tasks.filter(t => state.todayIds.has(t.id) && !t.done).length;
  let h = `<button class="cat-btn ${state.currentCat==='today'?'active':''}" data-cat-action="today">Tareas de hoy <span class="cat-count">${todayCount}</span></button>`;
  // Celeste pastel fijo (mismo tono que el último color de CAT_PALETTE) —
  // hardcodeado a propósito: no pasa por assignCatColor para no consumirle
  // un slot de la paleta a las listas reales.
  h += `<button class="cat-btn ${state.currentCat==='schedule'?'active':''}" style="border-color:rgba(140,220,255,0.35);color:#8cdcff;" data-cat-action="schedule">Calendario</button>`;

  state.listOrder.forEach((c, i) => {
    const n      = state.tasks.filter(t => t.category===c && !t.done && !state.todayIds.has(t.id)).length;
    const col    = getCatColor(c);
    const isActive = state.currentCat === c;
    const style  = `border-color:${col.border};color:${col.text};`;
    const dragOver = state.catDragOverIdx === i ? 'border-left:3px solid var(--accent);' : '';
    h += `<button class="cat-btn ${isActive ? 'active' : ''}" style="${style}${dragOver}" draggable="true" data-cat="${esc(c)}" data-idx="${i}">${esc(c)} <span class="cat-count">${n}</span></button>`;
  });
  h += `<button class="new-cat-btn" data-cat-action="new">+ Lista</button>`;
  h += `<button class="global-search-btn" id="global-search-toggle" title="Búsqueda global">⌕</button>`;
  // Preservar indicator y preview antes de reescribir innerHTML
  // (son hijos del cat-bar y se pierden con innerHTML =)
  const catBarEl   = document.getElementById('cat-bar');
  const lgInd      = document.getElementById('lg-indicator');
  const lgPrev     = document.getElementById('lg-preview');
  catBarEl.innerHTML = h;
  // Reinsertar al principio para que queden debajo de los botones (z-index)
  if (lgInd)  catBarEl.insertBefore(lgInd,  catBarEl.firstChild);
  if (lgPrev) catBarEl.insertBefore(lgPrev, catBarEl.firstChild);

  // Drag events para reordenar categorías
  document.querySelectorAll('#cat-bar .cat-btn[data-idx]').forEach(btn => {
    btn.addEventListener('dragstart', e => {
      state.catDragIdx = parseInt(btn.dataset.idx);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', state.catDragIdx);
      btn.style.opacity = '0.4';
      if (lgState.currentAnim) { lgState.currentAnim.cancel(); setLgCurrentAnim(null); }
      lgIndicator.style.transform = 'none';
      setLgInitDone(false);
      setLgCurrentBtn(null);
    });
    btn.addEventListener('dragend', () => {
      btn.style.opacity = '';
      state.catDragIdx     = null;
      state.catDragOverIdx = null;
      renderCatBar();
    });
    btn.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const targetIdx = parseInt(btn.dataset.idx);
      if (state.catDragIdx !== null && targetIdx !== state.catDragIdx && state.catDragOverIdx !== targetIdx) {
        state.catDragOverIdx = targetIdx;
        _renderCatBarIndicator();
      }
    });
    btn.addEventListener('dragleave', e => {
      if (!e.relatedTarget || !e.relatedTarget.closest('#cat-bar')) {
        state.catDragOverIdx = null;
        _renderCatBarIndicator();
      }
    });
    btn.addEventListener('drop', e => {
      e.preventDefault();
      const srcIdx = parseInt(e.dataTransfer.getData('text/plain'));
      const tgtIdx = parseInt(btn.dataset.idx);
      if (!isNaN(srcIdx) && !isNaN(tgtIdx) && srcIdx !== tgtIdx) {
        const [moved] = state.listOrder.splice(srcIdx, 1);
        state.listOrder.splice(tgtIdx, 0, moved);
        localStorage.setItem('listado_list_order', JSON.stringify(state.listOrder));
      }
      state.catDragIdx     = null;
      state.catDragOverIdx = null;
      renderCatBar();
    });
  });

  setTimeout(lgSyncWithActiveBtn, 50);
}

function _renderCatBarIndicator() {
  document.querySelectorAll('#cat-bar .cat-btn[data-idx]').forEach(btn => {
    const i = parseInt(btn.dataset.idx);
    btn.style.borderLeft = state.catDragOverIdx === i ? '3px solid var(--accent)' : '';
  });
}

// ─── SWITCH CATEGORÍA ──────────────────────────────────────────────────────────
export function switchCat(c) {
  state.currentCat      = c;
  state.listSearchQuery = '';
  // Resetear lgCurrentBtn para que lgMoveTo no compare contra un nodo muerto
  // (los botones se re-renderizan en renderCatBar). lgInitDone se mantiene para
  // preservar la animación de viaje entre listas existentes.
  setLgCurrentBtn(null);
  setLgSwitching(true);
  if (lgState.currentAnim) { lgState.currentAnim.cancel(); setLgCurrentAnim(null); }
  lgIndicator.style.transform = 'none';
  renderCatBar();
  const vc = document.getElementById('view-container');
  if (!vc) { setLgSwitching(false); renderView(); return; }
  if (state._switchCatTimer) { clearTimeout(state._switchCatTimer); state._switchCatTimer = null; }
  vc.classList.add('view-leaving');
  state._switchCatTimer = setTimeout(() => {
    state._switchCatTimer = null;
    vc.classList.remove('view-leaving');
    renderView();
    setLgSwitching(false);
    setTimeout(lgSyncWithActiveBtn, 50);
  }, 130);
}

// ─── VIEW ──────────────────────────────────────────────────────────────────────
export function renderView() {
  const vc = document.getElementById('view-container');
  // La sección Calendario vive en schedule.js. ui.js no la importa directo
  // para no crear un ciclo (mismo motivo por el que tasks.js no se importa
  // acá) — se llama vía callback registrado en window por app.js.
  if (state.currentCat === 'schedule') {
    if (typeof window._renderScheduleView === 'function') window._renderScheduleView();
    return;
  }
  let list;
  if (state.currentCat === 'today') {
    list = state.tasks
      .filter(t => state.todayIds.has(t.id))
      .sort(sortTasksUI);
    vc.innerHTML = `
      <div class="view-header">
        <div class="view-title today-title">Tareas de hoy</div>
        <div class="view-actions">
          <div class="search-wrap">
            <span class="search-icon">⌕</span>
            <input class="search-inp" type="text" id="search-inp" placeholder="Buscar... (/)" title="Buscar en esta lista (/)" value="${esc(state.listSearchQuery)}" />
          </div>
        </div>
      </div>
      <div class="tasks-list" id="tasks-list"></div>`;
  } else {
    list = state.tasks
      .filter(t => t.category === state.currentCat && !state.todayIds.has(t.id))
      .sort(sortTasksUI);
    const hasPending = state.tasks.some(t => t.category === state.currentCat && !t.done);
    vc.innerHTML = `
      <div class="view-header">
        <div class="view-title">${esc(state.currentCat)}</div>
        <div class="view-actions">
          <div class="search-wrap">
            <span class="search-icon">⌕</span>
            <input class="search-inp" type="text" id="search-inp" placeholder="Buscar... (/)" title="Buscar en esta lista (/)" value="${esc(state.listSearchQuery)}" />
          </div>
          <button class="icon-btn" data-action="rename-cat" title="Renombrar lista" style="opacity:1;color:var(--text3);font-size:0.875rem;padding:6px 8px;">✎</button>
          <button class="new-task-btn" data-action="new-task" title="Nueva tarea (N)">+ Nueva</button>
        </div>
      </div>
      <div class="tasks-list" id="tasks-list"></div>
      <div class="del-cat-zone">
        ${state.tasks.some(t => t.category === state.currentCat && t.done) && !state.listSearchQuery.trim()
          ? `<button class="del-done-btn" data-action="del-done">Eliminar tareas completadas</button>`
          : ''}
        <button class="del-cat-btn" data-action="del-cat" ${hasPending ? 'disabled' : ''}>Eliminar lista "${esc(state.currentCat)}"</button>
        ${hasPending ? '<p class="del-cat-note">Eliminá todas las tareas pendientes para poder borrar esta lista.</p>' : ''}
      </div>`;
  }
  const inp = document.getElementById('search-inp');
  if (inp) {
    inp.addEventListener('input', e => { state.listSearchQuery = e.target.value; applyListSearch(); });
  }
  applyListSearch(list);
}

export function applyListSearch(baseList) {
  const listEl = document.getElementById('tasks-list');
  if (!listEl) return;
  if (!baseList) {
    baseList = state.currentCat === 'today'
      ? state.tasks.filter(t => state.todayIds.has(t.id)).sort(sortTasksUI)
      : state.tasks.filter(t => t.category === state.currentCat && !state.todayIds.has(t.id)).sort(sortTasksUI);
  }
  const q        = state.listSearchQuery.toLowerCase().trim();
  const filtered = q
    ? baseList.filter(t => t.title.toLowerCase().includes(q) || (t.desc||'').toLowerCase().includes(q))
    : baseList;
  if (q && !filtered.length) {
    listEl.innerHTML = `<div class="empty"><div class="empty-icon">⌕</div><p>No se encontraron tareas para "<strong>${esc(state.listSearchQuery)}</strong>".</p></div>`;
    return;
  }
  populateList(filtered, state.currentCat);
}

function sortTasksUI(a, b) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.done && b.done) return (a.order || 0) - (b.order || 0);
  const aSoon = isSoonDueUI(a), bSoon = isSoonDueUI(b);
  if (aSoon !== bSoon) return aSoon ? -1 : 1;
  if (aSoon && bSoon) {
    if (a.due !== b.due) return a.due < b.due ? -1 : 1;
    return (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);
  }
  return (a.order || 0) - (b.order || 0);
}

export function populateList(list, viewCat) {
  const el = document.getElementById('tasks-list');
  if (!el) return;
  if (!list.length) {
    if (viewCat === 'today') {
      el.innerHTML = `<div class="empty">
        <div class="empty-icon"><svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle cx="26" cy="26" r="9" stroke="currentColor" stroke-width="1.8" fill="none"/>
<line x1="26" y1="8" x2="26" y2="13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
<line x1="26" y1="39" x2="26" y2="44" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
<line x1="8" y1="26" x2="13" y2="26" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
<line x1="39" y1="26" x2="44" y2="26" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
<line x1="14.5" y1="14.5" x2="18.1" y2="18.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
<line x1="33.9" y1="33.9" x2="37.5" y2="37.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
<line x1="37.5" y1="14.5" x2="33.9" y2="18.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
<line x1="18.1" y1="33.9" x2="14.5" y2="37.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
</svg></div>
        <p>Todo libre por hoy.</p>
        <span class="empty-hint">Agregá tareas desde cada lista con ☀</span>
      </div>`;
    } else {
      el.innerHTML = `<div class="empty">
        <div class="empty-icon"><svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect x="8" y="14" width="36" height="28" rx="4" stroke="currentColor" stroke-width="1.8" fill="none"/>
<line x1="8" y1="22" x2="44" y2="22" stroke="currentColor" stroke-width="1.8"/>
<line x1="16" y1="30" x2="28" y2="30" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
<line x1="16" y1="35" x2="24" y2="35" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
<circle cx="38" cy="14" r="7" fill="var(--bg)" stroke="currentColor" stroke-width="1.6"/>
<path d="M35 14l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg></div>
        <p>Esta lista está vacía.</p>
        <span class="empty-hint">Usá + Nueva para agregar una tarea</span>
      </div>`;
    }
    return;
  }
  el.innerHTML = list.map(t => taskHTML(t, viewCat)).join('');
  requestAnimationFrame(() => {
    const cards = el.querySelectorAll('.task-card');
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(cards,
        { opacity: 0, y: 16, scale: 0.97 },
        {
          opacity: 1, y: 0, scale: 1,
          duration: 0.42,
          ease: 'back.out(1.4)',
          stagger: { each: 0.048, ease: 'power2.out' },
          clearProps: 'transform,opacity'
        }
      );
    } else {
      cards.forEach((c, i) => {
        c.classList.add('anim-in');
        c.style.animationDelay = (i * 18) + 'ms';
      });
    }
    // setupDrag y setupSwipe se importan desde tasks.js vía app.js
    // y se llaman aquí a través de callbacks registrados en boot
    if (typeof window._setupDrag === 'function') window._setupDrag(el, viewCat);
    if (typeof window._setupSwipe === 'function') window._setupSwipe(el, viewCat);
  });
}

export function taskHTML(t, viewCat) {
  const over   = isOverdueUI(t);
  const soon   = !over && viewCat !== 'today' && isSoonDueUI(t);
  const locked = over && state.todayIds.has(t.id);
  const catCol = getCatColor(t.category || '');
  let meta = '';
  if (viewCat === 'today') meta += `<span class="task-cat-badge" style="background:${catCol.bg};border-color:${catCol.border};color:${catCol.text}">${esc(t.category||'')}</span>`;
  if (t.due) meta += `<span class="date-chip ${over?'overdue':''}">${over?'⚠ ':''}${fmtDate(t.due)}</span>`;
  if (!over && isSoonDueUI(t)) meta += `<span class="soon-chip">por vencer</span>`;
  if (t.createdAt) meta += `<span class="created-chip" title="Creada el ${fmtCreatedAt(t.createdAt)}">+ ${fmtCreatedAt(t.createdAt)}</span>`;
  let actions = '';
  if (viewCat === 'today') {
    actions += locked
      ? `<span class="overdue-lock" title="Tarea vencida">vencida</span>`
      : `<button class="icon-btn rm-today" data-action="rm-today" data-id="${t.id}" title="Quitar de hoy">↩</button>`;
  } else {
    if (!state.todayIds.has(t.id)) actions += `<button class="icon-btn add-today" data-action="add-today" data-id="${t.id}" title="Agregar a Tareas de hoy">☀</button>`;
  }
  actions += `<button class="icon-btn" data-action="edit" data-id="${t.id}" title="Editar">✎</button>`;
  actions += `<button class="icon-btn del" data-action="del" data-id="${t.id}" title="Eliminar">✕</button>`;
  return `
    <div class="swipe-wrap" id="sw-${t.id}">
      <div class="swipe-bg swipe-right"><span class="swipe-bg-icon">✓</span></div>
      <div class="swipe-bg swipe-left"><span class="swipe-bg-icon">✕</span></div>
      <div class="task-card ${t.done?'done-card':''}" id="tc-${t.id}" data-id="${t.id}" data-viewcat="${viewCat}" data-overdue="${over}" data-soon="${soon}" draggable="${soon ? 'false' : 'true'}" style="--card-glow:${catCol.border};">
        <div class="drag-handle">⠿</div>
        <div class="check-wrap">
          <button class="check-btn ${t.done?'checked':''}" data-action="toggle-done" data-id="${t.id}" data-viewcat="${viewCat}">
            <svg viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div class="task-body">
          <div class="task-title${t.done?' struck':''}">${esc(t.title)}</div>
          ${t.desc ? `<div class="task-desc">${esc(t.desc)}</div>` : ''}
          <div class="task-meta">${meta}</div>
        </div>
        <div class="task-actions">${actions}</div>
      </div>
    </div>`;
}

// ─── TOAST ─────────────────────────────────────────────────────────────────────
export function commitPendingUndo() {
  if (state._undoBuffer) {
    clearTimeout(state._undoTimer);
    // api se llama desde app.js — aquí usamos el callback registrado en boot
    if (typeof window._apiDeleteTask === 'function') window._apiDeleteTask(state._undoBuffer.id);
    state._undoBuffer = null;
    state._undoTimer  = null;
  }
}

export function showToast(msg) {
  commitPendingUndo();
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${esc(msg)}</span>`;
  el.classList.add('show');
  if (state._toastTimer) clearTimeout(state._toastTimer);
  state._toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

export function showToastUndo(msg, onUndo) {
  commitPendingUndo();
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${esc(msg)}</span><button class="toast-undo-btn" id="toast-undo-btn">Deshacer</button>`;
  el.classList.add('show');
  if (state._toastTimer) clearTimeout(state._toastTimer);
  document.getElementById('toast-undo-btn').addEventListener('click', () => {
    el.classList.remove('show');
    clearTimeout(state._toastTimer);
    onUndo();
  });
  state._toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

export function showToastConfirm(msg, onConfirm) {
  commitPendingUndo();
  const el = document.getElementById('toast');
  el.innerHTML = `<span>${esc(msg)}</span><button class="toast-confirm-btn" id="toast-confirm-btn">Confirmar</button>`;
  el.classList.add('show');
  if (state._toastTimer) clearTimeout(state._toastTimer);
  document.getElementById('toast-confirm-btn').addEventListener('click', () => {
    el.classList.remove('show');
    clearTimeout(state._toastTimer);
    onConfirm();
  });
  state._toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

// ─── GLOBAL SEARCH ─────────────────────────────────────────────────────────────
export function toggleGlobalSearch() {
  state.globalSearchOpen = !state.globalSearchOpen;
  const btn = document.getElementById('global-search-toggle');
  if (btn) btn.classList.toggle('active', state.globalSearchOpen);
  renderGlobalSearchPanel();
}

export function renderGlobalSearchPanel() {
  let panel = document.getElementById('global-search-panel');
  if (!state.globalSearchOpen) { if (panel) panel.remove(); return; }
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'global-search-panel';
    panel.className = 'global-search-panel';
    const catBar = document.getElementById('cat-bar');
    catBar.parentNode.insertBefore(panel, catBar.nextSibling);
  }
  const filters = [
    { id: 'all',   label: 'Todo' },
    { id: 'lists', label: 'Listas' },
    { id: 'tasks', label: 'Tareas' },
    { id: 'desc',  label: 'Descripciones' },
  ];
  panel.innerHTML = `
    <div class="global-search-row">
      <input class="global-search-inp" type="text" id="gs-inp" placeholder="Buscar en todo..." autocomplete="off" value="${esc(state.searchState.query)}" />
    </div>
    <div class="global-search-filters">
      ${filters.map(f => `<button class="gsf-btn ${state.searchState.filter===f.id?'active':''}" data-gsfilter="${f.id}">${f.label}</button>`).join('')}
    </div>
    <div class="global-search-results" id="gs-results" style="margin-top:.75rem"></div>`;
  const inp = document.getElementById('gs-inp');
  if (inp) {
    inp.addEventListener('input', e => { state.searchState.query = e.target.value; renderGsResults(); });
    requestAnimationFrame(() => inp.focus());
  }
  renderGsResults();
}

export function setGsFilter(f) {
  state.searchState.filter = f;
  renderGlobalSearchPanel();
}

function highlightMatch(text, q) {
  if (!q) return esc(text);
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return esc(text);
  return esc(text.slice(0, idx))
    + '<mark>' + esc(text.slice(idx, idx + q.length)) + '</mark>'
    + esc(text.slice(idx + q.length));
}

export function renderGsResults() {
  const el = document.getElementById('gs-results');
  if (!el) return;
  const q  = state.searchState.query.trim();
  if (!q) { el.innerHTML = `<div class="gsr-empty">Escribí algo para buscar...</div>`; return; }
  const ql = q.toLowerCase();
  const f  = state.searchState.filter;
  let results = [];
  if (f === 'all' || f === 'lists') {
    state.listOrder.forEach(c => {
      if (c.toLowerCase().includes(ql)) {
        const n = state.tasks.filter(t => t.category === c && !t.done).length;
        results.push({
          type: 'Lista', name: c,
          sub: `${n} tarea${n!==1?'s':''} pendiente${n!==1?'s':''}`,
          action: () => { switchCat(c); toggleGlobalSearch(); },
          matchIn: 'name',
        });
      }
    });
  }
  if (f === 'all' || f === 'tasks') {
    state.tasks.forEach(t => {
      if (t.title.toLowerCase().includes(ql)) {
        results.push({
          type: 'Tarea', name: t.title,
          sub: t.category + (t.desc ? ' · ' + t.desc.slice(0,60) + (t.desc.length > 60 ? '…' : '') : ''),
          action: () => { switchCat(t.category); toggleGlobalSearch(); },
          matchIn: 'name',
        });
      }
    });
  }
  if (f === 'all' || f === 'desc') {
    state.tasks.forEach(t => {
      if (!t.desc) return;
      if ((f === 'all' || f === 'tasks') && t.title.toLowerCase().includes(ql)) return;
      if (t.desc.toLowerCase().includes(ql)) {
        results.push({
          type: 'Descripción', name: t.title, sub: t.desc,
          action: () => { switchCat(t.category); toggleGlobalSearch(); },
          matchIn: 'sub',
        });
      }
    });
  }
  if (!results.length) {
    el.innerHTML = `<div class="gsr-empty">Sin resultados para "<strong>${esc(q)}</strong>".</div>`;
    return;
  }
  el.innerHTML = results.map((r, i) => `
    <div class="gsr-item" data-gsresult="${i}">
      <div class="gsr-type">${esc(r.type)}</div>
      <div class="gsr-name">${r.matchIn === 'name' ? highlightMatch(r.name, q) : esc(r.name)}</div>
      ${r.sub ? `<div class="gsr-sub">${r.matchIn === 'sub' ? highlightMatch(r.sub, q) : esc(r.sub)}</div>` : ''}
    </div>`).join('');
  state._gsrActions = results.map(r => r.action);
}

// ─── MINI CALENDARIO ───────────────────────────────────────────────────────────
const CAL_MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const CAL_DOWS   = ['Lu','Ma','Mi','Ju','Vi','Sa','Do'];

let calOpen      = false;
let calViewYear  = null;
let calViewMonth = null;

export function openCalendar() {
  calOpen = true;
  const btn = document.getElementById('cal-toggle-btn');
  if (btn) btn.classList.add('active');
  const raw    = document.getElementById('f-due')?.value || '';
  const parsed = parseUserDate(raw);
  const seed   = parsed ? new Date(parsed + 'T12:00:00') : new Date();
  calViewYear  = seed.getFullYear();
  calViewMonth = seed.getMonth();
  renderCalendar();
}

export function closeCalendar() {
  calOpen = false;
  const btn = document.getElementById('cal-toggle-btn');
  if (btn) btn.classList.remove('active');
  const wrap = document.getElementById('cal-popup-wrap');
  if (wrap) wrap.innerHTML = '';
}

export function toggleCalendar() {
  calOpen ? closeCalendar() : openCalendar();
}

export function isCalOpen() { return calOpen; }

export function renderCalendar() {
  const wrap = document.getElementById('cal-popup-wrap');
  if (!wrap || !calOpen) return;
  const today  = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();
  const raw    = document.getElementById('f-due')?.value || '';
  const parsed = parseUserDate(raw);
  let selY = null, selM = null, selD = null;
  if (parsed) {
    const selDate = new Date(parsed + 'T12:00:00');
    selY = selDate.getFullYear(); selM = selDate.getMonth(); selD = selDate.getDate();
  }
  const firstDow    = new Date(calViewYear, calViewMonth, 1).getDay();
  const startOffset = (firstDow === 0) ? 6 : firstDow - 1;
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
  let dayCells = '';
  for (let i = 0; i < startOffset; i++) dayCells += `<div class="cal-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday    = d === todayD && calViewMonth === todayM && calViewYear === todayY;
    const isSelected = d === selD   && calViewMonth === selM   && calViewYear === selY;
    const isPast     = new Date(calViewYear, calViewMonth, d) < new Date(todayY, todayM, todayD);
    let cls = 'cal-day';
    if (isToday)    cls += ' today-marker';
    if (isSelected) cls += ' selected';
    if (isPast)     cls += ' past';
    dayCells += `<div class="${cls}" data-cal-day="${d}">${d}</div>`;
  }
  wrap.innerHTML = `
    <div class="cal-popup" id="cal-popup">
      <div class="cal-nav">
        <button class="cal-nav-btn" id="cal-prev">‹</button>
        <span class="cal-month-label">${CAL_MONTHS[calViewMonth]} ${calViewYear}</span>
        <button class="cal-nav-btn" id="cal-next">›</button>
      </div>
      <div class="cal-grid">
        ${CAL_DOWS.map(d => `<div class="cal-dow">${d}</div>`).join('')}
        ${dayCells}
      </div>
    </div>`;
  document.getElementById('cal-prev').addEventListener('click', e => {
    e.stopPropagation();
    calViewMonth--;
    if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
    renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', e => {
    e.stopPropagation();
    calViewMonth++;
    if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
    renderCalendar();
  });
  wrap.querySelectorAll('.cal-day[data-cal-day]').forEach(cell => {
    cell.addEventListener('click', e => {
      e.stopPropagation();
      const d  = parseInt(cell.dataset.calDay);
      const mo = String(calViewMonth + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      const displayVal = `${dd}/${mo}/${calViewYear}`;
      const inp = document.getElementById('f-due');
      if (inp) { inp.value = displayVal; window._onDueInput && window._onDueInput(inp); }
      closeCalendar();
    });
  });
}
