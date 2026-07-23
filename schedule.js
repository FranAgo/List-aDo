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
import { getCatColor, SPANEL_KEY }                        from './storage.js';
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

/** Tareas pendientes que todavía no tienen fecha + hora en el calendario.
 * Orden: mismo orden de listas que la cat-bar (listOrder) y, dentro de cada
 * lista, el orden manual de las tareas — así el panel se lee igual que la app. */
function unscheduledTasks() {
  const orderIdx = c => { const i = state.listOrder.indexOf(c); return i === -1 ? state.listOrder.length : i; };
  return state.tasks
    .filter(t => !t.done && !(t.schedDate && t.schedStart))
    .sort((a, b) => (orderIdx(a.category) - orderIdx(b.category)) || ((a.order || 0) - (b.order || 0)));
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

/** Sube la opacidad del fondo SOLO para chips/bloques del calendario, sin
 * tocar CAT_PALETTE — esa paleta la usa también la cat-bar y los chips del
 * resto de la app, y ahí la sutileza es intencional. Acá, el bloque ES el
 * contenido principal de la vista, necesita pararse más. */
function vividBg(col, opacity) {
  return col.bg.replace(/[\d.]+\)$/, `${opacity})`);
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
  if (state.schedPanelOpen === null) state.schedPanelOpen = localStorage.getItem(SPANEL_KEY) === '1';
  const vc = document.getElementById('view-container');
  if (!vc) return;
  const view = state.scheduleView || 'month';
  const unsched = unscheduledTasks();

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
        <button class="sched-panel-btn ${state.schedPanelOpen ? 'active' : ''}" data-sched-panel title="Mostrar/ocultar tareas sin agendar">Sin agendar <span class="sched-panel-count">${unsched.length}</span></button>
        <button class="new-task-btn" data-sched-new title="Nueva tarea agendada">+ Nueva</button>
      </div>
    </div>
    <div class="sched-label" id="sched-label"></div>
    ${emptyBanner}
    <div class="sched-layout">
      ${state.schedPanelOpen ? schedPanelHTML(unsched) : ''}
      <div id="sched-body"></div>
    </div>`;

  wireToolbar(vc);

  if (view === 'month')      renderMonth();
  else if (view === 'week')  renderWeek();
  else                       renderDay();

  // Después de renderizar la grilla: los ítems del panel necesitan que las
  // pistas/celdas destino ya existan en el DOM para poder soltarse sobre ellas.
  wirePanelItems();
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
  const panelBtn = vc.querySelector('[data-sched-panel]');
  if (panelBtn) panelBtn.addEventListener('click', () => {
    state.schedPanelOpen = !state.schedPanelOpen;
    localStorage.setItem(SPANEL_KEY, state.schedPanelOpen ? '1' : '0');
    renderScheduleView();
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
    const hidden    = dayTasks.slice(MAX_VISIBLE);
    const extra     = hidden.length;
    cells += `
      <div class="sched-month-cell ${isToday ? 'today' : ''}" data-sched-day="${iso}">
        <div class="sched-month-daynum ${isToday ? 'sched-daynum-today' : ''}">${d}</div>
        <div class="sched-month-chips">
          ${visible.map(t => chipHTML(t, overlapSet.has(t.id))).join('')}
          ${extra > 0 ? `<div class="sched-more" data-sched-day="${iso}">${overflowDotsHTML(hidden)}+${extra} más</div>` : ''}
        </div>
      </div>`;
  }

  document.getElementById('sched-body').innerHTML = `
    <div class="sched-grid-month">
      ${DOW_LBL.map(d => `<div class="sched-dow">${d}</div>`).join('')}
      ${cells}
    </div>`;

  wireMonthCells();
  animateMonthChipsIn();
}

/**
 * Cluster de hasta 4 puntos de color, uno por categoría distinta entre las
 * tareas ocultas detrás de "+N más" — deja ver de un vistazo qué tipo de
 * tareas hay sin tener que entrar al día. Tope de 4: pasado eso, más puntos
 * dejan de aportar información legible a ese tamaño.
 */
function overflowDotsHTML(hiddenTasks) {
  const seen = new Set();
  const dots = [];
  for (const t of hiddenTasks) {
    const cat = t.category || '';
    if (seen.has(cat)) continue;
    seen.add(cat);
    dots.push(getCatColor(cat).text);
    if (dots.length >= 4) break;
  }
  if (!dots.length) return '';
  return `<span class="sched-more-dots">${dots.map(c => `<span class="sched-more-dot" style="background:${c}"></span>`).join('')}</span>`;
}

/**
 * Stagger de entrada para los chips al (re)renderizar la vista mes: cambio de
 * mes, "Hoy", o primer ingreso a Calendario. Usa GSAP si ya está cargado
 * (index.html lo carga async, puede no estar listo todavía) y cae a un
 * fallback en CSS puro si no. `stagger.amount` en vez de `stagger.each`
 * a propósito: un mes cargado puede tener ~90 chips, y con un delay fijo
 * por ítem la última fila tardaría más de un segundo en aparecer. `amount`
 * reparte un tiempo total fijo entre todos, así que la animación no se
 * alarga con la cantidad de tareas — mismo criterio en el fallback (delay
 * tope de 260ms en vez de crecer sin límite).
 */
function animateMonthChipsIn() {
  const chips = document.querySelectorAll('#sched-body .sched-chip');
  if (!chips.length) return;
  if (typeof gsap !== 'undefined') {
    gsap.fromTo(chips,
      { opacity: 0, y: 6, scale: 0.96 },
      {
        opacity: 1, y: 0, scale: 1,
        duration: 0.3,
        ease: 'back.out(1.5)',
        stagger: { amount: 0.3, from: 'start' },
        clearProps: 'transform,opacity'
      }
    );
  } else {
    chips.forEach((c, i) => {
      c.classList.add('anim-in');
      c.style.animationDelay = Math.min(i * 8, 260) + 'ms';
    });
  }
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
            title="${esc(t.schedStart)} — ${esc(t.title)}"
            style="background:${vividBg(col, 0.24)};border-color:${col.border};border-left-color:${col.text};color:${col.text};--card-glow:${col.text}">
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
         style="top:${top}px;height:${hgt}px;background:${vividBg(col, 0.30)};border-color:${col.border};border-left-color:${col.text};color:${col.text};--card-glow:${col.text}">
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

/** Única fuente de verdad para "a qué día/horario corresponde esta posición
 * del puntero". La usan tanto el ghost de preview (en vivo, durante el drag)
 * como commitDrop (al soltar) — así el preview nunca puede mostrar algo
 * distinto de lo que termina guardándose. */
function computeDropTarget(clientX, clientY, allTracks) {
  let destTrack = null;
  for (const tr of allTracks) {
    const r = tr.getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right) { destTrack = tr; break; }
  }
  if (!destTrack) return null;
  const rect    = destTrack.getBoundingClientRect();
  const offsetY = clientY - rect.top;
  let minutes   = Math.round((offsetY / ROW_H) * 60);
  minutes       = Math.max(0, Math.min(minutes, 23 * 60 + 59));
  minutes       = Math.round(minutes / SNAP_MIN) * SNAP_MIN;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  const newStart = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return { destTrack, newStart, newDate: destTrack.dataset.schedTrack };
}

function buildGhost() {
  const el = document.createElement('div');
  el.className = 'sched-ghost';
  el.innerHTML = `<span class="sched-ghost-time"></span>`;
  el.style.display = 'none';
  return el;
}

function updateGhost(ghostEl, durationMin, clientX, clientY, allTracks) {
  const target = computeDropTarget(clientX, clientY, allTracks);
  if (!target) { ghostEl.style.display = 'none'; return; }
  if (ghostEl.parentElement !== target.destTrack) target.destTrack.appendChild(ghostEl);
  const startMin = hhmmToMin(target.newStart);
  const endHHMM  = addMinutesToTime(target.newStart, durationMin);
  ghostEl.style.display = 'flex';
  ghostEl.style.top     = `${(startMin / 60) * ROW_H}px`;
  ghostEl.style.height  = `${Math.max(durationMin / 60 * ROW_H, 22)}px`;
  ghostEl.querySelector('.sched-ghost-time').textContent = `${target.newStart}–${endHHMM}`;
}

function attachBlockDrag(blockEl) {
  const id        = blockEl.dataset.schedBlockId;
  const THRESHOLD = 6;
  let startX = 0, startY = 0, dragging = false, moved = false;
  let allTracks = [];
  let ghostEl   = null;
  let durationMin = 30;

  blockEl.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startX = e.clientX; startY = e.clientY;
    dragging = false; moved = false;
    const trackEl = blockEl.closest('[data-sched-track]');
    if (!trackEl) return;
    allTracks = Array.from(document.querySelectorAll('[data-sched-track]'));
    // La duración sale de la tarea real (state), no del alto en píxeles del
    // bloque — el alto se clampea a un mínimo visual de 22px para tareas muy
    // cortas, así que medir el DOM daría una duración incorrecta.
    const t0 = state.tasks.find(x => x.id === id);
    durationMin = t0 ? (t0.schedDuration || 30) : 30;
    blockEl.setPointerCapture(e.pointerId);

    const onMove = mv => {
      const dx = mv.clientX - startX, dy = mv.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) > THRESHOLD) {
        dragging = true; moved = true;
        blockEl.classList.add('sched-dragging');
        ghostEl = buildGhost();
      }
      if (dragging) {
        blockEl.style.transform = `translate(${dx}px, ${dy}px)`;
        updateGhost(ghostEl, durationMin, mv.clientX, mv.clientY, allTracks);
      }
    };

    const onUp = up => {
      try { blockEl.releasePointerCapture(e.pointerId); } catch (err) { /* ya liberado */ }
      blockEl.removeEventListener('pointermove', onMove);
      blockEl.removeEventListener('pointerup', onUp);
      blockEl.style.transform = '';
      blockEl.classList.remove('sched-dragging');
      if (ghostEl) { ghostEl.remove(); ghostEl = null; }
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
  const target = computeDropTarget(pointerEvent.clientX, pointerEvent.clientY, allTracks);
  if (!target) return; // se soltó fuera de cualquier pista — no se mueve nada

  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  t.schedDate  = target.newDate;
  t.schedStart = target.newStart;
  api({ action: 'updateTask', task: JSON.stringify(t) });
  renderScheduleView();
  showToast('Tarea reagendada');
}

// ─── PANEL "SIN AGENDAR" ───────────────────────────────────────────────────────
// Lista lateral (desktop) / bandeja horizontal (mobile) con las tareas
// pendientes que aún no tienen fecha+hora. Se arrastran a la grilla para
// agendarlas. Cerrado por defecto y persistido en localStorage: si no se usa,
// la vista Calendario queda exactamente igual que sin esta feature.

function schedPanelHTML(unsched) {
  const items = unsched.map(t => {
    const col = getCatColor(t.category || '');
    const due = t.due ? `<span class="sched-panel-due">${isoToDisplay(t.due)}</span>` : '';
    return `
      <div class="sched-panel-item" data-sched-unsched="${t.id}" data-action="edit" data-id="${t.id}"
           title="${esc(t.title)}"
           style="border-left-color:${col.text};--card-glow:${col.text}">
        <div class="sched-panel-item-title">${esc(t.title)}</div>
        <div class="sched-panel-item-sub"><span style="color:${col.text}">${esc(t.category || '')}</span>${due}</div>
      </div>`;
  }).join('');
  return `
    <aside class="sched-panel" id="sched-panel">
      <div class="sched-panel-head">Sin agendar</div>
      <div class="sched-panel-list">${items || `<div class="sched-panel-empty">No queda nada por agendar.</div>`}</div>
      <div class="sched-panel-hint">Arrastrá una tarea a la grilla para darle día y horario.</div>
    </aside>`;
}

function wirePanelItems() {
  document.querySelectorAll('.sched-panel-item[data-sched-unsched]').forEach(attachPanelItemDrag);
}

/** ¿El puntero está sobre el área visible de la grilla horaria (semana/día)?
 * computeDropTarget solo chequea el eje X de las pistas; acá se suma el eje Y
 * y el recorte del contenedor con scroll, porque un ítem del panel puede
 * soltarse desde cualquier parte de la pantalla (un bloque ya agendado, en
 * cambio, vive adentro de la grilla y no necesitaba este chequeo). */
function pointerInGrid(clientX, clientY, allTracks) {
  const scrollEl = document.querySelector('.sched-scroll');
  if (scrollEl) {
    const s = scrollEl.getBoundingClientRect();
    if (clientY < s.top || clientY > s.bottom) return false;
  }
  return allTracks.some(tr => {
    const r = tr.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  });
}

/** Celda de la vista mes bajo el puntero, o null. */
function monthCellAt(clientX, clientY, monthCells) {
  for (const cell of monthCells) {
    const r = cell.getBoundingClientRect();
    if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return cell;
  }
  return null;
}

/** Clon flotante del ítem que sigue al puntero. El panel tiene overflow con
 * scroll: transformar el ítem en el lugar (como hace el drag de bloques) lo
 * clipearía al salir del panel — por eso un clon position:fixed en el body. */
function buildDragProxy(itemEl) {
  const r  = itemEl.getBoundingClientRect();
  const el = itemEl.cloneNode(true);
  el.classList.remove('sched-panel-dragging');
  el.classList.add('sched-drag-proxy');
  el.style.left  = `${r.left}px`;
  el.style.top   = `${r.top}px`;
  el.style.width = `${r.width}px`;
  document.body.appendChild(el);
  return el;
}

function attachPanelItemDrag(itemEl) {
  const id        = itemEl.dataset.schedUnsched;
  const THRESHOLD = 6;
  let startX = 0, startY = 0, dragging = false, moved = false;
  let allTracks = [], monthCells = [];
  let ghostEl = null, proxyEl = null, hoverCell = null;
  let durationMin = 30;

  itemEl.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startX = e.clientX; startY = e.clientY;
    dragging = false; moved = false;
    allTracks  = Array.from(document.querySelectorAll('[data-sched-track]'));
    monthCells = Array.from(document.querySelectorAll('.sched-month-cell[data-sched-day]'));
    const t0 = state.tasks.find(x => x.id === id);
    durationMin = (t0 && t0.schedDuration) || 30;
    itemEl.setPointerCapture(e.pointerId);

    const onMove = mv => {
      const dx = mv.clientX - startX, dy = mv.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) > THRESHOLD) {
        dragging = true; moved = true;
        proxyEl = buildDragProxy(itemEl);
        ghostEl = buildGhost();
        itemEl.classList.add('sched-panel-dragging');
      }
      if (dragging) {
        proxyEl.style.transform = `translate(${dx}px, ${dy}px)`;
        if (pointerInGrid(mv.clientX, mv.clientY, allTracks)) {
          updateGhost(ghostEl, durationMin, mv.clientX, mv.clientY, allTracks);
        } else {
          ghostEl.style.display = 'none';
        }
        const cell = monthCellAt(mv.clientX, mv.clientY, monthCells);
        if (cell !== hoverCell) {
          if (hoverCell) hoverCell.classList.remove('sched-dropover');
          if (cell) cell.classList.add('sched-dropover');
          hoverCell = cell;
        }
      }
    };

    const cleanup = () => {
      try { itemEl.releasePointerCapture(e.pointerId); } catch (err) { /* ya liberado */ }
      itemEl.removeEventListener('pointermove', onMove);
      itemEl.removeEventListener('pointerup', onUp);
      itemEl.removeEventListener('pointercancel', onCancel);
      itemEl.classList.remove('sched-panel-dragging');
      if (proxyEl) { proxyEl.remove(); proxyEl = null; }
      if (ghostEl) { ghostEl.remove(); ghostEl = null; }
      if (hoverCell) { hoverCell.classList.remove('sched-dropover'); hoverCell = null; }
    };

    const onUp = up => {
      cleanup();
      if (dragging) commitPanelDrop(id, up, allTracks, monthCells, durationMin);
    };

    // touch-action: pan-x — si el browser decide que el gesto es un pan
    // horizontal nativo (scroll de la bandeja en mobile), dispara pointercancel
    // y onUp nunca corre: hay que limpiar proxy/ghost/listeners igual, sin
    // commitear nada, y resetear moved para no comerse el próximo click.
    const onCancel = () => {
      cleanup();
      dragging = false;
      moved    = false;
    };

    itemEl.addEventListener('pointermove', onMove);
    itemEl.addEventListener('pointerup', onUp);
    itemEl.addEventListener('pointercancel', onCancel);
  });

  // Igual que en attachBlockDrag: si hubo drag real se cancela el click que
  // dispararía data-action="edit" vía el delegation global de app.js.
  itemEl.addEventListener('click', e => {
    if (moved) { e.stopPropagation(); moved = false; }
  });
}

function commitPanelDrop(id, pointerEvent, allTracks, monthCells, durationMin) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;

  // Semana/día: el drop trae día + horario exactos → se agenda directo.
  if (pointerInGrid(pointerEvent.clientX, pointerEvent.clientY, allTracks)) {
    const target = computeDropTarget(pointerEvent.clientX, pointerEvent.clientY, allTracks);
    if (target) {
      t.schedDate     = target.newDate;
      t.schedStart    = target.newStart;
      t.schedDuration = durationMin;
      api({ action: 'updateTask', task: JSON.stringify(t) });
      renderScheduleView();
      showToast(`Agendada el ${isoToDisplay(target.newDate)} a las ${target.newStart}`);
      return;
    }
  }

  // Mes: la celda solo define el día — la hora la elige el usuario en el
  // modal (no se inventa un horario). Si cancela, no cambia nada.
  const cell = monthCellAt(pointerEvent.clientX, pointerEvent.clientY, monthCells);
  if (cell) openTaskModal(t, { date: cell.dataset.schedDay });
  // Soltar fuera de la grilla: no pasa nada.
}
