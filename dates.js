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
