// ─── tasks.js ──────────────────────────────────────────────────────────────────
// Lógica de tareas: CRUD, overdue, ordenamiento, drag & drop, toggle done, undo.

import { state }                              from './state.js';
import { api }                                from './api.js';
import { parseLocalDate, parseUserDate,
         isoToDisplay, normalizeToISO,
         minutesBetween, addMinutesToTime }              from './dates.js';
import { renderCatBar, renderView, updateStats,
         showToast, showToastUndo, showToastConfirm,
         commitPendingUndo, taskHTML, esc }   from './ui.js';
import { spawnConfetti, playCompleteSound,
         lgState,
         lgIndicator, lgSyncWithActiveBtn,
         lgStartObserving,
         setLgInitDone, setLgCurrentBtn }     from './animations.js';
import { assignCatColor, loadCatColors,
         LKEY, TKEY, LORDER_KEY, SECRET }     from './storage.js';

// ─── INIT ──────────────────────────────────────────────────────────────────────
export async function init() {
  // Resetear estado del glass indicator en cada init
  // (cubre el caso de logout + login sin recargar la pestaña)
  setLgInitDone(false);
  setLgCurrentBtn(null);

  loadCatColors();
  const st = localStorage.getItem(TKEY);
  if (st) state.todayIds = new Set(JSON.parse(st));
  const lo = localStorage.getItem(LORDER_KEY);
  if (lo) {
    try { state.listOrder = JSON.parse(lo); } catch (e) { state.listOrder = []; }
  }

  document.getElementById('view-container').innerHTML =
    '<div class="loading-wrap"><div class="dot"></div><div class="dot"></div><div class="dot"></div><span class="loading-label">Cargando tareas…</span></div>';

  const result = await api({ action: 'getAll' });
  const cats   = result.categories;
  const tks    = result.tasks;

  if (Array.isArray(cats)) {
    state.categories = cats;
    state.categories.forEach(c => assignCatColor(c));
    syncListOrder();
  }

  if (Array.isArray(tks)) {
    state.tasks = tks.map(t => ({ ...t, due: normalizeToISO(t.due) }));
    state.tasks.forEach(t => { if (t.today) state.todayIds.add(t.id); });
    // Purgar IDs de tareas eliminadas del todayIds
    const existingIds = new Set(state.tasks.map(t => t.id));
    state.todayIds.forEach(id => { if (!existingIds.has(id)) state.todayIds.delete(id); });
    saveToday();
    checkOverdue();
  }

  updateStats();
  renderCatBar();
  renderView();
  lgStartObserving();
}

export function syncListOrder() {
  state.listOrder = state.listOrder.filter(c => state.categories.includes(c));
  state.categories.forEach(c => { if (!state.listOrder.includes(c)) state.listOrder.push(c); });
  localStorage.setItem(LORDER_KEY, JSON.stringify(state.listOrder));
}

// ─── OVERDUE ───────────────────────────────────────────────────────────────────
export function checkOverdue() {
  const now = new Date();
  state.tasks.forEach(t => {
    const d = parseLocalDate(t.due);
    if (d && !t.done && d < now && !state.todayIds.has(t.id)) {
      state.todayIds.add(t.id);
      t.today = true;
      api({ action: 'updateTask', task: JSON.stringify(t) });
    }
  });
  saveToday();
}

export function saveToday() {
  localStorage.setItem(TKEY, JSON.stringify([...state.todayIds]));
}

export function isOverdue(t) {
  const d = parseLocalDate(t.due);
  return !!(d && !t.done && d < new Date());
}

export function isSoonDue(t) {
  if (!t.due || t.done) return false;
  const d = parseLocalDate(t.due);
  if (!d) return false;
  const now = new Date();
  if (d < now) return false;
  const threeDaysFromNow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 23, 59, 59);
  return d <= threeDaysFromNow;
}

export function sortTasks(a, b) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.done && b.done) return (a.order || 0) - (b.order || 0);
  const aSoon = isSoonDue(a), bSoon = isSoonDue(b);
  if (aSoon !== bSoon) return aSoon ? -1 : 1;
  if (aSoon && bSoon) {
    if (a.due !== b.due) return a.due < b.due ? -1 : 1;
    return (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);
  }
  return (a.order || 0) - (b.order || 0);
}

// ─── TODAY ─────────────────────────────────────────────────────────────────────
export function addToday(id) {
  state.todayIds.add(id);
  saveToday();
  const t = state.tasks.find(x => x.id === id);
  if (t) { t.today = true; api({ action: 'updateTask', task: JSON.stringify(t) }); }
  renderCatBar();
  renderView();
  showToast('Agregada a Tareas de hoy');
}

export function removeToday(id) {
  const t = state.tasks.find(x => x.id === id);
  if (t && isOverdue(t)) { showToast('Las tareas vencidas no se pueden quitar'); return; }
  state.todayIds.delete(id);
  saveToday();
  if (t) { t.today = false; api({ action: 'updateTask', task: JSON.stringify(t) }); }
  renderCatBar();
  renderView();
  showToast('Quitada de Tareas de hoy');
}

// ─── TOGGLE DONE ───────────────────────────────────────────────────────────────
export async function toggleDone(id, viewCat) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  const card    = document.getElementById('tc-' + id);
  const titleEl = card ? card.querySelector('.task-title') : null;
  if (!t.done) {
    t.done = true;
    navigator.vibrate?.(10);
    if (card) {
      card.classList.add('anim-complete');
      spawnConfetti(card);
      playCompleteSound();
      if (titleEl) {
        titleEl.classList.remove('struck', 'unstriking');
        titleEl.classList.add('striking');
      }
      await sleep(650);
      if (titleEl) {
        titleEl.classList.remove('striking');
        titleEl.classList.add('struck');
      }
    }
    if (viewCat === 'today') { state.todayIds.delete(id); saveToday(); t.today = false; }
  } else {
    t.done = false;
    if (card) {
      if (titleEl) {
        titleEl.classList.remove('striking', 'struck');
        titleEl.classList.add('unstriking');
      }
      card.classList.add('anim-uncomplete');
      await sleep(320);
    }
    if (isOverdue(t)) { state.todayIds.add(id); saveToday(); t.today = true; }
  }
  updateStats();
  renderCatBar();
  renderView();
  api({ action: 'updateTask', task: JSON.stringify(t) });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── DRAG & DROP (tasks) ───────────────────────────────────────────────────────
export function setupDrag(listEl, cat) {
  listEl.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      if (card.dataset.soon === 'true') { e.preventDefault(); return; }
      state.dragSrcId = card.dataset.id;
      setTimeout(() => card.classList.add('dragging'), 0);
      e.dataTransfer.effectAllowed = 'move';
      if (lgState.currentAnim) { lgState.currentAnim.cancel(); lgState.currentAnim = null; }
      lgIndicator.style.transform = 'none';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      listEl.querySelectorAll('.task-card').forEach(c => c.classList.remove('drag-over'));
      requestAnimationFrame(() => requestAnimationFrame(() => {
        lgSyncWithActiveBtn();
      }));
    });
    card.addEventListener('dragover', e => {
      e.preventDefault();
      if (card.dataset.id === state.dragSrcId) return;
      if (card.dataset.soon === 'true') { e.dataTransfer.dropEffect = 'none'; return; }
      listEl.querySelectorAll('.task-card').forEach(c => c.classList.remove('drag-over'));
      card.classList.add('drag-over');
    });
    card.addEventListener('drop', e => {
      e.preventDefault();
      if (card.dataset.soon === 'true') return;
      card.classList.remove('drag-over');
      if (state.dragSrcId && card.dataset.id !== state.dragSrcId) reorder(state.dragSrcId, card.dataset.id, cat);
    });
  });
}

export function reorder(srcId, tgtId, cat) {
  let list = cat === 'today'
    ? state.tasks.filter(t => state.todayIds.has(t.id)).sort((a, b) => (a.order||0) - (b.order||0))
    : state.tasks.filter(t => t.category === cat && !state.todayIds.has(t.id)).sort((a, b) => (a.order||0) - (b.order||0));
  const si = list.findIndex(t => t.id === srcId);
  const ti = list.findIndex(t => t.id === tgtId);
  if (si === -1 || ti === -1) return;
  const [moved] = list.splice(si, 1);
  list.splice(ti, 0, moved);
  list.forEach((t, i) => { t.order = i; });
  renderCatBar();
  renderView();
  list.forEach(t => api({ action: 'updateTask', task: JSON.stringify(t) }));
}

// ─── SWIPE ─────────────────────────────────────────────────────────────────────
export function setupSwipe(listEl, viewCat) {
  if (!('ontouchstart' in window)) return;

  const THRESHOLD_START  = 8;
  const THRESHOLD_ACTION = 72;
  const RESISTANCE       = 0.45;

  listEl.querySelectorAll('.swipe-wrap').forEach(wrap => {
    const card    = wrap.querySelector('.task-card');
    const bgRight = wrap.querySelector('.swipe-bg.swipe-right');
    const bgLeft  = wrap.querySelector('.swipe-bg.swipe-left');
    if (!card) return;

    const id      = card.dataset.id;
    let startX    = 0, startY = 0, currentX = 0;
    let isSwiping = false, isLocked = false;

    card.addEventListener('touchstart', e => {
      const t = state.tasks.find(x => x.id === id);
      if (t && t.done) return;
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      currentX = 0; isSwiping = false; isLocked = false;
    }, { passive: true });

    card.addEventListener('touchmove', e => {
      if (isLocked) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!isSwiping && Math.abs(dy) > Math.abs(dx)) { isLocked = true; return; }
      if (!isSwiping && Math.abs(dx) < THRESHOLD_START) return;
      isSwiping = true;
      e.preventDefault();
      currentX = dx * RESISTANCE;
      const absDx = Math.abs(dx);
      card.classList.add('swiping');
      card.style.transform = `translateX(${currentX}px)`;
      const progress = Math.min(absDx / THRESHOLD_ACTION, 1);
      if (dx > 0) { bgRight.style.opacity = String(progress * 0.9); bgLeft.style.opacity = '0'; }
      else        { bgLeft.style.opacity  = String(progress * 0.9); bgRight.style.opacity = '0'; }
      wrap.classList.toggle('swipe-confirmed', absDx >= THRESHOLD_ACTION);
    }, { passive: false });

    card.addEventListener('touchend', () => {
      if (!isSwiping) return;
      isSwiping = false;
      const absDx    = Math.abs(currentX / RESISTANCE);
      const confirmed = absDx >= THRESHOLD_ACTION;
      const direction = currentX > 0 ? 'right' : 'left';
      card.classList.remove('swiping');
      wrap.classList.remove('swipe-confirmed');
      bgRight.style.opacity = '0'; bgLeft.style.opacity = '0';
      if (confirmed) {
        if (direction === 'right') {
          card.style.transform = `translateX(${window.innerWidth}px)`;
          card.style.transition = 'transform .28s cubic-bezier(.4,0,.2,1), opacity .28s';
          card.style.opacity = '0';
          setTimeout(() => { card.style.transform = ''; card.style.transition = ''; card.style.opacity = ''; toggleDone(id, viewCat); }, 260);
        } else {
          card.style.transform = `translateX(-${window.innerWidth}px)`;
          card.style.transition = 'transform .28s cubic-bezier(.4,0,.2,1), opacity .28s';
          card.style.opacity = '0';
          if (viewCat === 'today') {
            setTimeout(() => { card.style.transform = ''; card.style.transition = ''; card.style.opacity = ''; removeToday(id); }, 260);
          } else {
            setTimeout(() => { card.style.transform = ''; card.style.transition = ''; card.style.opacity = ''; doDelete(id, true); }, 260);
          }
        }
      } else {
        card.style.transition = 'transform .32s cubic-bezier(.34,1.56,.64,1)';
        card.style.transform  = 'translateX(0)';
        setTimeout(() => { card.style.transition = ''; card.style.transform = ''; }, 340);
      }
    });
  });
}

// ─── TASK CRUD ─────────────────────────────────────────────────────────────────
export function openTaskModal(task) {
  state.editingId = task ? task.id : null;
  document.getElementById('task-modal-title').textContent = task ? 'Editar tarea' : 'Nueva tarea';
  document.getElementById('f-title').value = task ? task.title : '';
  document.getElementById('f-desc').value  = task ? (task.desc || '') : '';
  const dueInp = document.getElementById('f-due');
  dueInp.value = task ? isoToDisplay(task.due) : '';
  dueInp.classList.remove('inp-error');
  const hint = document.getElementById('due-hint');
  if (hint) { hint.textContent = ''; hint.className = 'date-hint'; }
  const schedDateInp  = document.getElementById('f-sched-date');
  const schedStartInp = document.getElementById('f-sched-start');
  const schedEndInp   = document.getElementById('f-sched-end');
  if (schedDateInp)  schedDateInp.value  = task ? (task.schedDate || '') : '';
  if (schedStartInp) schedStartInp.value = task ? (task.schedStart || '') : '';
  if (schedEndInp)   schedEndInp.value   = (task && task.schedStart && task.schedDuration)
    ? addMinutesToTime(task.schedStart, task.schedDuration) : '';
  const schedHint = document.getElementById('sched-hint');
  if (schedHint) schedHint.textContent = '';
  const sel = document.getElementById('f-category');
  sel.innerHTML = state.categories.map(c => `<option value="${esc(c)}" ${task && task.category===c ? 'selected' : ''}>${esc(c)}</option>`).join('');
  if (!task && state.currentCat !== 'today' && state.currentCat !== 'schedule') sel.value = state.currentCat;
  document.getElementById('task-modal-bg').classList.add('open');
  setTimeout(() => document.getElementById('f-title').focus(), 220);
}

export function closeTaskModal() {
  document.getElementById('task-modal-bg').classList.remove('open');
  state.editingId = null;
  const { closeCalendar } = window._uiCalendar || {};
  if (closeCalendar) closeCalendar();
}

export async function saveTask() {
  const title = document.getElementById('f-title').value.trim();
  if (!title) { showToast('El título es obligatorio'); return; }
  const category = document.getElementById('f-category').value;
  if (!category) { showToast('Seleccioná una lista'); return; }
  const dueRaw = document.getElementById('f-due').value.trim();
  let dueISO = '';
  if (dueRaw) {
    dueISO = parseUserDate(dueRaw);
    if (dueISO === null) {
      const inp = document.getElementById('f-due');
      if (inp) inp.classList.add('inp-error');
      showToast('Fecha inválida — usá DD/MM/AAAA');
      return;
    }
  }

  const schedDate  = document.getElementById('f-sched-date')?.value.trim()  || '';
  const schedStart = document.getElementById('f-sched-start')?.value.trim() || '';
  let   schedEnd   = document.getElementById('f-sched-end')?.value.trim()   || '';
  let   schedDuration = 0;
  if (schedDate || schedStart || schedEnd) {
    if (!schedDate || !schedStart) {
      showToast('Para agendar la tarea, completá fecha y hora de inicio');
      return;
    }
    if (!schedEnd) schedEnd = addMinutesToTime(schedStart, 30); // default: 30 min
    const dur = minutesBetween(schedStart, schedEnd);
    if (!dur || dur <= 0) {
      showToast('La hora de fin tiene que ser posterior a la de inicio');
      return;
    }
    schedDuration = dur;
  }

  const saveBtn = document.getElementById('task-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Guardando…'; }

  const currentEditingId = state.editingId;
  const existing  = currentEditingId ? state.tasks.find(t => t.id === currentEditingId) : null;
  const maxOrder  = state.tasks.filter(t => t.category === category).reduce((m, t) => Math.max(m, t.order||0), -1);
  const task = {
    id:            currentEditingId || (Date.now().toString(36) + Math.random().toString(36).slice(2,5)),
    title,
    desc:          document.getElementById('f-desc').value.trim(),
    due:           dueISO,
    category,
    done:          existing ? existing.done : false,
    createdAt:     existing ? existing.createdAt : Date.now(),
    order:         existing ? existing.order : maxOrder + 1,
    today:         existing ? (existing.today || false) : false,
    schedDate:     schedDate     || '',
    schedStart:    schedStart    || '',
    schedDuration: schedDuration || 0,
  };

  const result = await api({ action: currentEditingId ? 'updateTask' : 'saveTask', task: JSON.stringify(task) });

  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Guardar'; }

  if (result && result.error) { showToast('Error al guardar. Revisá tu conexión.'); return; }

  closeTaskModal();
  if (currentEditingId) {
    state.tasks = state.tasks.map(t => t.id === currentEditingId ? task : t);
    showToast('Tarea actualizada');
  } else {
    state.tasks.unshift(task);
    showToast('Tarea creada');
  }
  checkOverdue();
  updateStats();
  renderCatBar();
  renderView();
}

export function editTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (t) openTaskModal(t);
}

export async function doDelete(id, skipAnim = false) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  navigator.vibrate?.([6, 40, 6]);
  if (!skipAnim) {
    const card = document.getElementById('tc-' + id);
    if (card) { card.classList.add('anim-out'); await sleep(220); }
  }
  state.tasks = state.tasks.filter(x => x.id !== id);
  state.todayIds.delete(id);
  saveToday();
  updateStats();
  renderCatBar();
  renderView();
  commitPendingUndo();
  api({ action: 'deleteTask', id });
  showToastUndo('Tarea eliminada', () => undoDelete());
  state._undoBuffer = { ...t };
  if (state._undoTimer) clearTimeout(state._undoTimer);
  state._undoTimer = setTimeout(() => {
    state._undoBuffer = null;
    state._undoTimer  = null;
  }, 4000);
}

export function undoDelete() {
  if (!state._undoBuffer) return;
  clearTimeout(state._undoTimer);
  const t = { ...state._undoBuffer };
  state._undoBuffer = null;
  state._undoTimer  = null;
  state.tasks.unshift(t);
  if (t.due) {
    const d = parseLocalDate(t.due);
    if (d && !t.done && d < new Date()) { state.todayIds.add(t.id); t.today = true; }
  }
  saveToday();
  updateStats();
  renderCatBar();
  renderView();
  api({ action: 'saveTask', task: JSON.stringify(t) });
  showToast('Tarea restaurada');
}
