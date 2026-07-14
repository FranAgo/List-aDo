// ─── dates.js ──────────────────────────────────────────────────────────────────
// Helpers de fechas. Sin dependencias externas del proyecto.
//
// Formato interno: YYYY-MM-DD
// Formato de usuario: DD/MM/YYYY

/** Normaliza cualquier string de fecha entrante desde la API → YYYY-MM-DD, o '' si inválido. */
export function normalizeToISO(raw) {
  if (!raw) return '';
  raw = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  const isoT = raw.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (isoT) return `${isoT[1]}-${isoT[2]}-${isoT[3]}`;
  const garbled = raw.match(/^(\d{1,2})T[\d:.Z]+\/(\d{1,2})\/(\d{4})$/);
  if (garbled) return `${garbled[3]}-${garbled[2].padStart(2,'0')}-${garbled[1].padStart(2,'0')}`;
  return '';
}

/** YYYY-MM-DD → DD/MM/YYYY para mostrar al usuario */
export function isoToDisplay(iso) {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Parsea DD/MM/YYYY tipeado por el usuario → YYYY-MM-DD, o null si inválido.
 * Usa un objeto Date real para rechazar fechas imposibles (31/02, 31/04, etc.).
 */
export function parseUserDate(str) {
  str = str.trim().replace(/[^0-9\/]/g, '');
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dN = parseInt(m[1]), moN = parseInt(m[2]), yN = parseInt(m[3]);
  if (moN < 1 || moN > 12 || dN < 1 || dN > 31 || yN < 2000) return null;
  const check = new Date(yN, moN - 1, dN);
  if (check.getFullYear() !== yN || check.getMonth() !== moN - 1 || check.getDate() !== dN) return null;
  const d  = String(dN).padStart(2, '0');
  const mo = String(moN).padStart(2, '0');
  return `${yN}-${mo}-${d}`;
}

/**
 * Auto-inserta slashes mientras el usuario tipea en el campo de fecha.
 * Solo permite dígitos.
 */
export function onDueInput(inp) {
  let v = inp.value.replace(/[^0-9]/g, '');
  if (v.length > 2) v = v.slice(0,2) + '/' + v.slice(2);
  if (v.length > 5) v = v.slice(0,5) + '/' + v.slice(5);
  if (v.length > 10) v = v.slice(0,10);
  inp.value = v;
  inp.classList.remove('inp-error');
  const hint = document.getElementById('due-hint');
  if (!hint) return;
  if (!v) { hint.textContent = ''; hint.className = 'date-hint'; return; }
  const parsed = parseUserDate(v);
  if (parsed) {
    const parts  = v.split('/');
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    const mIdx   = parseInt(parts[1]) - 1;
    hint.textContent = `${parts[0]} de ${months[mIdx]||'?'} de ${parts[2]}`;
    hint.className = 'date-hint ok';
  } else if (v.length >= 8) {
    hint.textContent = 'Fecha inválida — usá DD/MM/AAAA';
    hint.className = 'date-hint err';
  } else {
    hint.textContent = '';
    hint.className = 'date-hint';
  }
}

/** Parsea YYYY-MM-DD → Date al final del día (evita el off-by-one de UTC) */
export function parseLocalDate(iso) {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3]), 23, 59, 59);
}

export function fmtDate(iso) { return isoToDisplay(iso); }

export function fmtCreatedAt(ts) {
  if (!ts || Number(ts) <= 0) return '';
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return '';
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year  = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// ─── HELPERS DE HORA Y FECHA — sección Calendario ───────────────────────────
// Agregados para schedule.js. No modifican ninguna función existente arriba.

/** "HH:MM" → minutos desde las 00:00, o null si el formato es inválido. */
function parseHHMM(hhmm) {
  if (!hhmm) return null;
  const m = String(hhmm).match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

/**
 * Normaliza un valor de hora (schedStart) que viene de la API → "HH:MM", o '' si inválido.
 *
 * RED DE SEGURIDAD, no parche de un bug de backend:
 * el Apps Script (revisado por Bob) ya formatea schedStart correctamente con
 * Utilities.formatDate(value, tz, 'HH:mm') antes de devolverlo — el síntoma
 * de la captura de Franco (ISO con fecha epoch 1899-12-30, ej.
 * "1899-12-30T23:01:48.000Z") es consistente con un deployment de Apps Script
 * desactualizado que no tiene ese fix publicado (ver Roy — redeploy).
 *
 * Esta función queda como defensa en profundidad para el caso en que, por
 * cualquier motivo (deploy viejo, columna aún sin auto-convertir, fila legacy),
 * vuelva a llegar un ISO crudo en vez de "HH:MM". Reconstruye la hora local
 * asumiendo timezone fija de Argentina (UTC-3, sin horario de verano) — si
 * algún día se usa la app desde otro huso horario esto daría una hora
 * incorrecta, así que no reemplaza el fix del lado del servidor.
 */
const AR_UTC_OFFSET_HOURS = 3; // Argentina no tiene horario de verano

export function normalizeToHHMM(raw) {
  if (!raw) return '';
  raw = String(raw).trim();
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) return raw;
  const isoMatch = raw.match(/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2}):(\d{2})/);
  if (!isoMatch) return '';
  let h  = parseInt(isoMatch[1], 10);
  let mi = parseInt(isoMatch[2], 10);
  const sec = parseInt(isoMatch[3], 10);
  if (sec >= 30) mi += 1; // redondeo del drift de punto flotante del serial de Sheets
  let totalMin = h * 60 + mi - AR_UTC_OFFSET_HOURS * 60;
  totalMin = ((totalMin % 1440) + 1440) % 1440; // wrap-around 24h
  const hh = Math.floor(totalMin / 60), mm = totalMin % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Minutos entre dos horarios "HH:MM" del mismo día. NaN si alguno es inválido. */
export function minutesBetween(startHHMM, endHHMM) {
  const s = parseHHMM(startHHMM), e = parseHHMM(endHHMM);
  if (s === null || e === null) return NaN;
  return e - s;
}

/** Suma minutos a un horario "HH:MM". Clampea a 23:59, no pasa al día siguiente. */
export function addMinutesToTime(hhmm, minutes) {
  const s = parseHHMM(hhmm);
  if (s === null) return '';
  const total = Math.min(s + Number(minutes || 0), 23 * 60 + 59);
  const h = Math.floor(total / 60), m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Date local → YYYY-MM-DD. Evita pasar por UTC (mismo motivo que parseLocalDate). */
export function toISOLocal(d) {
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** YYYY-MM-DD de hoy, en hora local. */
export function todayISO() {
  return toISOLocal(new Date());
}

/** YYYY-MM-DD + n días (n puede ser negativo) → YYYY-MM-DD */
export function addDaysISO(iso, n) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  d.setDate(d.getDate() + n);
  return toISOLocal(d);
}

/** Lunes de la semana que contiene esa fecha ISO (semana arranca lunes, igual que el mini-calendario de ui.js). */
export function startOfWeekISO(iso) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  const dow  = d.getDay(); // 0 = domingo
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return toISOLocal(d);
}
