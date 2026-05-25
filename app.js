// ─── app.js ────────────────────────────────────────────────────────────────────
// Punto de entrada único. Boot, autenticación, event listeners, atajos de teclado.

import { LKEY, SECRET }                                   from './storage.js';
import { init, setupDrag, setupSwipe,
         addToday, removeToday, toggleDone,
         doDelete, editTask, openTaskModal,
         closeTaskModal, saveTask }                       from './tasks.js';
import { openCatModal, closeCatModal, saveCategory,
         deleteCompletedTasks, confirmDelCat,
         openRenameCatModal, closeRenameCatModal,
         saveRenameCategory }                             from './categories.js';
import { toggleGlobalSearch, setGsFilter,
         toggleCalendar, closeCalendar, isCalOpen,
         renderCalendar, switchCat }                     from './ui.js';
import { onDueInput }                                     from './dates.js';
import { state }                                          from './state.js';

// ─── REGISTRAR CALLBACKS GLOBALES ──────────────────────────────────────────────
// ui.js y animations.js necesitan llamar a setupDrag/setupSwipe sin importar tasks.js
// (evita dependencia circular). Se registran aquí como callbacks en window.
window._setupDrag  = setupDrag;
window._setupSwipe = setupSwipe;
window._onDueInput = onDueInput;
window._uiCalendar = { closeCalendar };

// commitPendingUndo necesita llamar a api — se registra el callback aquí.
// (ui.js no importa api.js para no crear una dependencia cruzada innecesaria)
import { api } from './api.js';
window._apiDeleteTask = (id) => api({ action: 'deleteTask', id });

// ─── AUTH ──────────────────────────────────────────────────────────────────────
function doLogin() {
  const v = document.getElementById('key-inp').value;
  if (v === SECRET) {
    localStorage.setItem(LKEY, v);
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').classList.add('visible');
    init();
  } else {
    const err = document.getElementById('login-error');
    const inp = document.getElementById('key-inp');
    err.classList.add('show');
    inp.style.borderColor = 'var(--red)';
    setTimeout(() => {
      err.classList.remove('show');
      inp.style.borderColor = '';
    }, 2500);
  }
}

function doLogout() {
  localStorage.removeItem(LKEY);
  location.reload();
}

// ─── EVENT DELEGATION ──────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  if (e.target.closest('#global-search-toggle')) { toggleGlobalSearch(); return; }

  const t = e.target.closest('[data-action], [data-cat-action], [data-gsfilter], [data-gsresult], [data-idx]');
  if (!t) return;

  if (t.dataset.catAction === 'today') { switchCat('today'); return; }
  if (t.dataset.catAction === 'new')   { openCatModal(); return; }
  if (t.dataset.idx !== undefined && !t.dataset.action) { switchCat(t.dataset.cat); return; }

  if (t.dataset.gsfilter) { setGsFilter(t.dataset.gsfilter); return; }

  if (t.dataset.gsresult !== undefined) {
    if (state._gsrActions && state._gsrActions[t.dataset.gsresult]) state._gsrActions[t.dataset.gsresult]();
    return;
  }

  const action = t.dataset.action;
  const id     = t.dataset.id;

  if (action === 'new-task')    { openTaskModal(); return; }
  if (action === 'rename-cat')  { openRenameCatModal(state.currentCat); return; }
  if (action === 'del-cat')     { confirmDelCat(state.currentCat); return; }
  if (action === 'del-done')    { deleteCompletedTasks(state.currentCat); return; }
  if (action === 'toggle-done') { toggleDone(id, t.dataset.viewcat); return; }
  if (action === 'add-today')   { addToday(id); return; }
  if (action === 'rm-today')    { removeToday(id); return; }
  if (action === 'edit')        { editTask(id); return; }
  if (action === 'del')         { doDelete(id); return; }

  if (state._modalMousedownOnContent) return;
  if (t.id === 'task-modal-bg')       { closeTaskModal(); return; }
  if (t.id === 'cat-modal-bg')        { closeCatModal(); return; }
  if (t.id === 'rename-cat-modal-bg') { closeRenameCatModal(); return; }
});

// ─── STATIC EVENT LISTENERS ────────────────────────────────────────────────────
document.getElementById('login-btn').addEventListener('click', doLogin);

document.getElementById('eye-btn').addEventListener('click', () => {
  const inp  = document.getElementById('key-inp');
  const icon = document.getElementById('eye-icon');
  const show = inp.type === 'password';
  inp.type   = show ? 'text' : 'password';
  icon.innerHTML = show
    ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
       <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
       <line x1="1" y1="1" x2="23" y2="23"/>`
    : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
       <circle cx="12" cy="12" r="3"/>`;
});

document.getElementById('logout-btn').addEventListener('click', doLogout);
document.getElementById('task-cancel-btn').addEventListener('click', closeTaskModal);
document.getElementById('task-save-btn').addEventListener('click', saveTask);
document.getElementById('cat-cancel-btn').addEventListener('click', closeCatModal);
document.getElementById('cat-save-btn').addEventListener('click', saveCategory);
document.getElementById('rename-cat-cancel-btn').addEventListener('click', closeRenameCatModal);
document.getElementById('rename-cat-save-btn').addEventListener('click', saveRenameCategory);

document.getElementById('f-due').addEventListener('input', e => onDueInput(e.target));

// Calendar toggle — capture phase para que cierre antes que otros handlers
document.addEventListener('click', e => {
  const toggleBtn = e.target.closest('#cal-toggle-btn');
  if (toggleBtn) { toggleCalendar(); return; }
  if (isCalOpen() && !e.target.closest('#cal-popup') && !e.target.closest('#cal-toggle-btn')) {
    closeCalendar();
  }
}, true);

// Enter en f-title → guardar tarea
document.getElementById('f-title').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); saveTask(); }
});

// Modal backdrop guard
['task-modal-bg', 'cat-modal-bg', 'rename-cat-modal-bg'].forEach(id => {
  const bg = document.getElementById(id);
  bg.addEventListener('mousedown', e => {
    state._modalMousedownOnContent = e.target.id !== id;
  });
});
document.addEventListener('mouseup', () => { state._modalMousedownOnContent = false; });

document.getElementById('task-modal-bg').addEventListener('click', e => {
  if (state._modalMousedownOnContent) return;
  if (e.target.id === 'task-modal-bg') closeTaskModal();
});
document.getElementById('cat-modal-bg').addEventListener('click', e => {
  if (state._modalMousedownOnContent) return;
  if (e.target.id === 'cat-modal-bg') closeCatModal();
});
document.getElementById('rename-cat-modal-bg').addEventListener('click', e => {
  if (state._modalMousedownOnContent) return;
  if (e.target.id === 'rename-cat-modal-bg') closeRenameCatModal();
});

// ─── ATAJOS DE TECLADO ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeTaskModal();
    closeCatModal();
    closeRenameCatModal();
    if (state.globalSearchOpen) toggleGlobalSearch();
    return;
  }
  if (e.ctrlKey && e.key === 'k') {
    e.preventDefault();
    toggleGlobalSearch();
    return;
  }
  const activeTag = document.activeElement?.tagName;
  if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
  if (e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    openTaskModal();
    return;
  }
  if (e.key === '/') {
    e.preventDefault();
    const searchInp = document.getElementById('search-inp');
    if (searchInp) searchInp.focus();
  }
});

document.getElementById('key-inp').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});
document.getElementById('cat-name-inp').addEventListener('keydown', e => {
  if (e.key === 'Enter') { saveCategory(); e.preventDefault(); }
});
document.getElementById('rename-cat-inp').addEventListener('keydown', e => {
  if (e.key === 'Enter') { saveRenameCategory(); e.preventDefault(); }
});

// ─── HOVER PREVIEW DEL LIQUID GLASS ───────────────────────────────────────────
import { lgShowPreview, lgHidePreview } from './animations.js';

document.getElementById('cat-bar').addEventListener('mouseenter', e => {
  const btn = e.target.closest('.cat-btn');
  if (btn) lgShowPreview(btn);
}, true);

document.getElementById('cat-bar').addEventListener('mouseleave', e => {
  const btn = e.target.closest('.cat-btn');
  if (btn) lgHidePreview();
}, true);

// ─── BOOT ──────────────────────────────────────────────────────────────────────
function bootApp() {
  const saved = localStorage.getItem(LKEY);
  if (saved === SECRET) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').classList.add('visible');
    init();
  }
}

bootApp();
