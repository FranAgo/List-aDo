// ─── categories.js ─────────────────────────────────────────────────────────────
// Lógica de categorías: crear, renombrar, eliminar, eliminar completadas.

import { state }                        from './state.js';
import { api }                          from './api.js';
import { assignCatColor, catColors,
         saveCatColors, LORDER_KEY }    from './storage.js';
import { renderCatBar, renderView,
         updateStats, showToast,
         showToastConfirm, esc }        from './ui.js';
import { setLgCurrentBtn, setLgInitDone } from './animations.js';

export function openCatModal() {
  document.getElementById('cat-name-inp').value = '';
  document.getElementById('cat-modal-bg').classList.add('open');
  setTimeout(() => document.getElementById('cat-name-inp').focus(), 220);
}

export function closeCatModal() {
  document.getElementById('cat-modal-bg').classList.remove('open');
}

export async function saveCategory() {
  const name = document.getElementById('cat-name-inp').value.trim();
  if (!name) { showToast('Poné un nombre'); return; }
  if (state.categories.includes(name)) { showToast('Ya existe esa lista'); return; }
  closeCatModal();
  state.categories.push(name);
  state.listOrder.push(name);
  localStorage.setItem(LORDER_KEY, JSON.stringify(state.listOrder));
  assignCatColor(name);
  state.currentCat = name;
  setLgCurrentBtn(null);
  setLgInitDone(false);
  renderCatBar();
  renderView();
  showToast('Lista creada');
  api({ action: 'saveCategory', name });
}

export function deleteCompletedTasks(cat) {
  const completed = state.tasks.filter(t => t.category === cat && t.done);
  if (!completed.length) return;
  showToastConfirm(
    `¿Eliminar ${completed.length} tarea${completed.length > 1 ? 's' : ''} completada${completed.length > 1 ? 's' : ''}?`,
    () => {
      const cards = completed.map(t => document.getElementById(`tc-${t.id}`)).filter(Boolean);
      const ANIM_DURATION = 280;
      cards.forEach(card => {
        card.style.animation = `taskOut ${ANIM_DURATION}ms cubic-bezier(.25,.8,.25,1) forwards`;
      });
      setTimeout(() => {
        state.tasks = state.tasks.filter(t => !(t.category === cat && t.done));
        renderView();
        completed.forEach(t => api({ action: 'deleteTask', id: t.id }));
        showToast(`${completed.length} tarea${completed.length > 1 ? 's' : ''} eliminada${completed.length > 1 ? 's' : ''}`);
      }, ANIM_DURATION);
    }
  );
}

export function confirmDelCat(cat) {
  if (state.tasks.some(t => t.category === cat && !t.done)) {
    showToast('Eliminá las tareas pendientes primero');
    return;
  }
  showToastConfirm(`¿Eliminar la lista "${cat}"?`, () => {
    const toDelete = state.tasks.filter(t => t.category === cat);
    state.tasks      = state.tasks.filter(t => t.category !== cat);
    state.categories = state.categories.filter(c => c !== cat);
    state.listOrder  = state.listOrder.filter(c => c !== cat);
    localStorage.setItem(LORDER_KEY, JSON.stringify(state.listOrder));
    state.currentCat = 'today';
    setLgCurrentBtn(null);
    setLgInitDone(false);
    renderCatBar();
    renderView();
    showToast('Lista eliminada');
    api({ action: 'deleteCategory', name: cat });
    toDelete.forEach(t => api({ action: 'deleteTask', id: t.id }));
  });
}

export function openRenameCatModal(cat) {
  state.renamingCat = cat;
  document.getElementById('rename-cat-inp').value = cat;
  document.getElementById('rename-cat-modal-bg').classList.add('open');
  setTimeout(() => document.getElementById('rename-cat-inp').focus(), 220);
}

export function closeRenameCatModal() {
  document.getElementById('rename-cat-modal-bg').classList.remove('open');
  state.renamingCat = null;
}

export async function saveRenameCategory() {
  const newName = document.getElementById('rename-cat-inp').value.trim();
  if (!newName) { showToast('Poné un nombre'); return; }
  if (newName === state.renamingCat) { closeRenameCatModal(); return; }
  if (state.categories.includes(newName)) { showToast('Ya existe una lista con ese nombre'); return; }
  const oldName = state.renamingCat;
  state.categories = state.categories.map(c => c === oldName ? newName : c);
  state.listOrder  = state.listOrder.map(c => c === oldName ? newName : c);
  localStorage.setItem(LORDER_KEY, JSON.stringify(state.listOrder));
  state.tasks.forEach(t => { if (t.category === oldName) t.category = newName; });
  if (catColors[oldName]) {
    catColors[newName] = catColors[oldName];
    delete catColors[oldName];
    saveCatColors();
  }
  if (state.currentCat === oldName) state.currentCat = newName;
  closeRenameCatModal();
  api({ action: 'renameCategory', oldName, newName });
  state.tasks.filter(t => t.category === newName).forEach(t => api({ action: 'updateTask', task: JSON.stringify(t) }));
  updateStats();
  setLgCurrentBtn(null);
  setLgInitDone(false);
  renderCatBar();
  renderView();
  showToast('Lista renombrada');
}
