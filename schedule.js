// ─── schedule.js ───────────────────────────────────────────────────────────────
// Sección "Calendario": agenda de tareas por mes / semana / día.
//
// Prefijo "sched" en toda función exportada, función interna y clase CSS para
// no chocar con el mini date-picker que ya vive en ui.js (openCalendar,
// closeCalendar, renderCalendar, toggleCalendar, isCalOpen) — ese widget es
// del campo de vencimiento, esto es otra cosa.
//
// Importa openTaskModal de tasks.js para poder crear una tarea directamente
// desde el calendario (botón "+ Nueva" o click en un horario vacío), con la
// fecha/hora pre-cargada. No es circular: tasks.js no importa schedule.js,
// así que esto no choca con el patrón de "evitar ciclos" que usa el resto
// del proyecto (ese patrón aplica cuando AMBOS lados se necesitan mutuamente,
// no es una regla de "nunca importar tasks.js").
//
// Para EDITAR una tarea existente (click en un chip/bloque ya agendado) se
// sigue usando data-action="edit", que ya captura el delegation global de
// app.js — ahí no hace falta ningún import nuevo.

import { state }                                          from './state.js';
import { api }                                            from './api.js';
import { esc, showToast }                                 from './ui.js';
import { getCatColor }                                    from './storage.js';
import { openTaskModal }                                  from './tasks.js';
import { isoToDisplay, addMinutesToTime, addDaysISO,
         startOfWeekISO, todayISO }                       from './dates.js';

const ROW_H     = 48; // px por hora en vista semana/día
const SNAP_MIN  = 15; // minutos de snap al soltar un bloque arrastrado
const DOW_LBL   = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];
const MONTH_LBL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ─── HELPERS DE DATOS ──────────────────────────────────────────────────────────
function scheduledTasks() {
  return state.tasks.filter(t => t.schedDate && t.schedStart);
}

function hasAnyScheduled() {
  return scheduledTasks().length > 0;
}

function hhmmToMin(hhmm) {
  const m = (hhmm || '').match(/^(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function rangesOverlap(a, b) {
  const aStart = hhmmToMin(a.schedStart), aEnd = aStart + (a.schedDuration || 0);
  const bStart = hhmmToMin(b.schedStart), bEnd = bStart + (b.schedDuration || 0);
  return aStart < bEnd && bStart < aEnd;
}

function overlapIds(dayTasks) {
  const ids = new Set();
  for (let i = 0; i < dayTasks.length; i++) {
    for (let j = i + 1; j < dayTasks.length; j++) {
      if (rangesOverlap(dayTasks[i], dayTasks[j])) { ids.add(dayTasks[i].id); ids.add(dayTasks[j].id); }
    }
  }
  return ids;
}

function groupByDate(tasks) {
  const map = {};
  tasks.forEach(t => { (map[t.schedDate] = map[t.schedDate] || []).push(t); });
  return map;
}

// ─── NAVEGACIÓN / TOOLBAR ──────────────────────────────────────────────────────
export function switchScheduleView(view) {
  state.scheduleView = view;
  renderScheduleView();
}

export function navScheduleDate(dir) {
  const ref = state.scheduleRefDate || todayISO();
  if (state.scheduleView === 'month') {
    const m = ref.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1 + dir, 1);
    state.scheduleRefDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  } else if (state.scheduleView === 'week') {
    state.scheduleRefDate = addDaysISO(ref, dir * 7);
  } else {
    state.scheduleRefDate = addDaysISO(ref, dir);
  }
  renderScheduleView();
}

export function scheduleGoToday() {
  state.scheduleRefDate = todayISO();
  renderScheduleView();
}

// ─── RENDER PRINCIPAL ──────────────────────────────────────────────────────────
export function renderScheduleView() {
  if (!state.scheduleRefDate) state.scheduleRefDate = todayISO();
  const vc = document.getElementById('view-container');
  if (!vc) return;
  const view = state.scheduleView || 'month';

  const emptyBanner = !hasAnyScheduled() ? `
    <div class="empty sched-empty">
      <div class="empty-icon">
        <svg viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="8" y="12" width="36" height="32" rx="5" stroke="currentColor" stroke-width="1.8"/>
          <line x1="8" y1="21" x2="44" y2="21" stroke="currentColor" stroke-width="1.8"/>
          <line x1="17" y1="6" x2="17" y2="15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <line x1="35" y1="6" x2="35" y2="15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M19 31l4 4 9-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <p>Todavía no agendaste ninguna tarea acá.</p>
      <span class="empty-hint">Tocá "+ Nueva", o directamente un día u horario libre en la grilla.</span>
    </div>` : '';

  vc.innerHTML = `
    <div class="view-header">
      <div class="view-title">Calendario</div>
      <div class="view-actions sched-toolbar">
        <div class="sched-nav-group">
          <button class="sched-nav-btn" data-sched-nav="-1" title="Anterior">‹</button>
          <button class="sched-today-btn" data-sched-today title="Ir a hoy">Hoy</button>
          <button class="sched-nav-btn" data-sched-nav="1" title="Siguiente">›</button>
        </div>
        <div class="sched-view-switch">
          <button class="sched-switch-btn ${view === 'month' ? 'active' : ''}" data-sched-view="month">Mes</button>
          <button class="sched-switch-btn ${view === 'week'  ? 'active' : ''}" data-sched-view="week">Semana</button>
          <button class="sched-switch-btn ${view === 'day'   ? 'active' : ''}" data-sched-view="day">Día</button>
        </div>
        <button class="new-task-btn" data-sched-new title="Nueva tarea agendada">+ Nueva</button>
      </div>
    </div>
    <div class="sched-label ${view === 'month' ? 'sched-label-headline' : ''}" id="sched-label"></div>
    ${emptyBanner}
    <div id="sched-body"></div>`;

  wireToolbar(vc);

  if (view === 'month')      renderMonth();
  else if (view === 'week')  renderWeek();
  else                       renderDay();
}

function wireToolbar(vc) {
  vc.querySelectorAll('[data-sched-nav]').forEach(btn => {
    btn.addEventListener('click', () => navScheduleDate(parseInt(btn.dataset.schedNav, 10)));
  });
  const todayBtn = vc.querySelector('[data-sched-today]');
  if (todayBtn) todayBtn.addEventListener('click', scheduleGoToday);
  vc.querySelectorAll('[data-sched-view]').forEach(btn => {
    btn.addEventListener('click', () => switchScheduleView(btn.dataset.schedView));
  });
  const newBtn = vc.querySelector('[data-sched-new]');
  if (newBtn) newBtn.addEventListener('click', () => {
    openTaskModal(null, { date: state.scheduleRefDate, start: '' });
  });
}

// ─── VISTA MES ─────────────────────────────────────────────────────────────────
function renderMonth() {
  const ref   = state.scheduleRefDate;
  const m     = ref.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const year  = parseInt(m[1], 10), month = parseInt(m[2], 10) - 1;
  document.getElementById('sched-label').textContent = `${MONTH_LBL[month]} ${year}`;

  const firstDow    = new Date(year, month, 1).getDay();
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const todayIso     = todayISO();
  const tasksByDate  = groupByDate(scheduledTasks());

  let cells = '';
  for (let i = 0; i < startOffset; i++) cells += `<div class="sched-month-cell empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const iso       = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayTasks  = (tasksByDate[iso] || []).sort((a, b) => (a.schedStart < b.schedStart ? -1 : 1));
    const isToday   = iso === todayIso;
    const overlapSet = overlapIds(dayTasks);
    const MAX_VISIBLE = 3;
    const visible   = dayTasks.slice(0, MAX_VISIBLE);
    const extra     = dayTasks.length - visible.length;
    cells += `
      <div class="sched-month-cell ${isToday ? 'today' : ''}" data-sched-day="${iso}">
        <div class="sched-month-daynum ${isToday ? 'sched-daynum-today' : ''}">${d}</div>
        <div class="sched-month-chips">
          ${visible.map(t => chipHTML(t, overlapSet.has(t.id))).join('')}
          ${extra > 0 ? `<div class="sched-more" data-sched-day="${iso}">+${extra} más</div>` : ''}
        </div>
      </div>`;
  }

  document.getElementById('sched-body').innerHTML = `
    <div class="sched-grid-month">
      ${DOW_LBL.map(d => `<div class="sched-dow">${d}</div>`).join('')}
      ${cells}
    </div>`;

  wireMonthCells();
}

function wireMonthCells() {
  document.querySelectorAll('.sched-month-cell[data-sched-day]').forEach(cell => {
    cell.addEventListener('click', e => {
      const moreEl = e.target.closest('.sched-more');
      if (moreEl) {
        state.scheduleRefDate = moreEl.dataset.schedDay;
        switchScheduleView('day');
        return;
      }
      if (e.target.closest('.sched-chip')) return;
      openTaskModal(null, { date: cell.dataset.schedDay, start: '' });
    });
  });
}

function chipHTML(t, overlapping) {
  const col = getCatColor(t.category || '');
  return `<div class="sched-chip ${overlapping ? 'overlap' : ''} ${t.done ? 'done' : ''}" data-action="edit" data-id="${t.id}"
            style="background:${col.bg};border-color:${col.border};color:${col.text};--card-glow:${col.border}">
            <span class="sched-chip-time">${esc(t.schedStart)}</span> ${esc(t.title)}
          </div>`;
}

// ─── VISTA SEMANA ──────────────────────────────────────────────────────────────
function renderWeek() {
  const startIso = startOfWeekISO(state.scheduleRefDate);
  const days     = Array.from({ length: 7 }, (_, i) => addDaysISO(startIso, i));
  const endIso   = days[6];
  document.getElementById('sched-label').textContent = `${isoToDisplay(startIso)} – ${isoToDisplay(endIso)}`;

  const todayIso = todayISO();
  const allTasks = scheduledTasks();

  const headerCells = days.map(iso => {
    const isToday = iso === todayIso;
    const dow     = new Date(iso + 'T12:00:00').getDay();
    const label   = DOW_LBL[dow === 0 ? 6 : dow - 1];
    const dayNum  = parseInt(iso.slice(8, 10), 10);
    return `<div class="sched-week-headcell ${isToday ? 'today' : ''}">${label} <span>${dayNum}</span></div>`;
  }).join('');

  const cols = days.map(iso => {
    const dayTasks   = allTasks.filter(t => t.schedDate === iso);
    const overlapSet = overlapIds(dayTasks);
    const isToday    = iso === todayIso;
    return `
      <div class="sched-week-track ${isToday ? 'today' : ''}" data-sched-track="${iso}" style="height:${24 * ROW_H}px">
        ${dayTasks.map(t => blockHTML(t, overlapSet.has(t.id))).join('')}
      </div>`;
  }).join('');

  // Encabezado de días queda fijo arriba; solo .sched-scroll se desplaza
  // verticalmente — así nunca se pierde de vista qué columna es qué día.
  document.getElementById('sched-body').innerHTML = `
    <div class="sched-grid-week">
      <div class="sched-week-headerrow">
        <div class="sched-hourcol-spacer"></div>
        ${headerCells}
      </div>
      <div class="sched-scroll">
        <div class="sched-hourcol">${hourLabelsHTML()}</div>
        <div class="sched-week-cols">${cols}</div>
      </div>
    </div>`;

  wireBlocks();
  document.querySelectorAll('.sched-week-track[data-sched-track]').forEach(wireEmptyTrackClick);
  autoscrollToHour(7);
}

// ─── VISTA DÍA ─────────────────────────────────────────────────────────────────
function renderDay() {
  const iso = state.scheduleRefDate;
  const dow = new Date(iso + 'T12:00:00').getDay();
  document.getElementById('sched-label').textContent = `${DOW_LBL[dow === 0 ? 6 : dow - 1]} ${isoToDisplay(iso)}`;

  const dayTasks   = scheduledTasks().filter(t => t.schedDate === iso);
  const overlapSet = overlapIds(dayTasks);

  document.getElementById('sched-body').innerHTML = `
    <div class="sched-grid-day">
      <div class="sched-scroll">
        <div class="sched-hourcol">${hourLabelsHTML()}</div>
        <div class="sched-day-track" data-sched-track="${iso}" style="height:${24 * ROW_H}px">
          ${dayTasks.map(t => blockHTML(t, overlapSet.has(t.id))).join('')}
        </div>
      </div>
    </div>`;

  wireBlocks();
  document.querySelectorAll('.sched-day-track[data-sched-track]').forEach(wireEmptyTrackClick);
  autoscrollToHour(7);
}

function hourLabelsHTML() {
  let h = '';
  for (let i = 0; i <= 23; i++) h += `<div class="sched-hour-lbl" style="height:${ROW_H}px">${String(i).padStart(2, '0')}:00</div>`;
  return h;
}

function blockHTML(t, overlapping) {
  const col     = getCatColor(t.category || '');
  const top     = (hhmmToMin(t.schedStart) / 60) * ROW_H;
  const hgt     = Math.max((t.schedDuration || 30) / 60 * ROW_H, 22);
  const endHHMM = addMinutesToTime(t.schedStart, t.schedDuration || 30);
  return `
    <div class="sched-block ${overlapping ? 'overlap' : ''} ${t.done ? 'done' : ''}" data-action="edit" data-id="${t.id}"
         data-sched-block-id="${t.id}"
         style="top:${top}px;height:${hgt}px;background:${col.bg};border-color:${col.border};color:${col.text};--card-glow:${col.border}">
      <div class="sched-block-time">${esc(t.schedStart)}–${esc(endHHMM)}</div>
      <div class="sched-block-title">${esc(t.title)}</div>
    </div>`;
}

function wireEmptyTrackClick(trackEl) {
  trackEl.addEventListener('click', e => {
    // Si el click cayó en un bloque (hijo del track), eso ya lo maneja
    // su propio listener / el delegation global de "edit" — no crear nada.
    if (e.target !== trackEl) return;
    const rect    = trackEl.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    let minutes   = Math.round((offsetY / ROW_H) * 60);
    minutes       = Math.max(0, Math.min(minutes, 23 * 60 + 59));
    minutes       = Math.round(minutes / SNAP_MIN) * SNAP_MIN;
    const h = Math.floor(minutes / 60), m = minutes % 60;
    const start = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    openTaskModal(null, { date: trackEl.dataset.schedTrack, start });
  });
}

function autoscrollToHour(h) {
  requestAnimationFrame(() => {
    const scrollEl = document.querySelector('.sched-scroll');
    if (scrollEl) scrollEl.scrollTop = Math.max(h * ROW_H - 12, 0);
  });
}

// ─── DRAG PARA MOVER UN BLOQUE (vistas semana/día) ─────────────────────────────
// Vista mes no soporta drag — son chips sin eje horario, no hay "horario" al
// que snapear. En mes solo se puede click-to-edit (vía data-action="edit").
function wireBlocks() {
  // Las tareas completadas no se arrastran (no tiene sentido reagendar algo
  // ya hecho) — siguen siendo clickeables para editar vía el delegation global.
  document.querySelectorAll('.sched-block[data-sched-block-id]:not(.done)').forEach(attachBlockDrag);
}

function attachBlockDrag(blockEl) {
  const id        = blockEl.dataset.schedBlockId;
  const THRESHOLD = 6;
  let startX = 0, startY = 0, dragging = false, moved = false;
  let trackEl = null, allTracks = [];

  blockEl.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startX = e.clientX; startY = e.clientY;
    dragging = false; moved = false;
    trackEl = blockEl.closest('[data-sched-track]');
    if (!trackEl) return;
    allTracks = Array.from(document.querySelectorAll('[data-sched-track]'));
    blockEl.setPointerCapture(e.pointerId);

    const onMove = mv => {
      const dx = mv.clientX - startX, dy = mv.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) > THRESHOLD) {
        dragging = true; moved = true;
        blockEl.classList.add('sched-dragging');
      }
      if (dragging) blockEl.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const onUp = up => {
      try { blockEl.releasePointerCapture(e.pointerId); } catch (err) { /* ya liberado */ }
      blockEl.removeEventListener('pointermove', onMove);
      blockEl.removeEventListener('pointerup', onUp);
      blockEl.style.transform = '';
      blockEl.classList.remove('sched-dragging');
      if (dragging) commitDrop(id, up, allTracks);
    };

    blockEl.addEventListener('pointermove', onMove);
    blockEl.addEventListener('pointerup', onUp);
  });

  // Si hubo drag real, se cancela el click que dispararía data-action="edit"
  // vía el delegation global de app.js. Este listener corre antes de que
  // el evento burbujee a document, así que stopPropagation alcanza.
  blockEl.addEventListener('click', e => {
    if (moved) { e.stopPropagation(); moved = false; }
  });
}

function commitDrop(id, pointerEvent, allTracks) {
  let destTrack = null;
  for (const tr of allTracks) {
    const r = tr.getBoundingClientRect();
    if (pointerEvent.clientX >= r.left && pointerEvent.clientX <= r.right) { destTrack = tr; break; }
  }
  if (!destTrack) return;

  const destRect = destTrack.getBoundingClientRect();
  const offsetY  = pointerEvent.clientY - destRect.top;
  let minutes    = Math.round((offsetY / ROW_H) * 60);
  minutes        = Math.max(0, Math.min(minutes, 23 * 60 + 59));
  minutes        = Math.round(minutes / SNAP_MIN) * SNAP_MIN;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  const newStart = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const newDate  = destTrack.dataset.schedTrack;

  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  t.schedDate  = newDate;
  t.schedStart = newStart;
  api({ action: 'updateTask', task: JSON.stringify(t) });
  renderScheduleView();
  showToast('Tarea reagendada');
}
