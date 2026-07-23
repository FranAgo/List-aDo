const SHEET_ID   = '1EtfIHhEMsrXuPVGaPwx9WWsuLzUw2j9iAaZqSZCUOqE';
const SHEET_NAME = 'Hoja 1';
const SECRET_KEY = '20002600!?';

function doGet(e)  { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  const params = e.parameter;
  if (params.key !== SECRET_KEY) return jsonResponse({ error: 'No autorizado' });
  const sheet  = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const action = params.action;
  if (action === 'getAll')         return jsonResponse(getAll(sheet));
  if (action === 'getTasks')       return jsonResponse(getTasks(sheet));
  if (action === 'saveTask')       return jsonResponse(saveTask(sheet, JSON.parse(params.task)));
  if (action === 'updateTask')     return jsonResponse(updateTask(sheet, JSON.parse(params.task)));
  if (action === 'deleteTask')     return jsonResponse(deleteTask(sheet, params.id));
  if (action === 'getCategories')  return jsonResponse(getCategories());
  if (action === 'saveCategory')   return jsonResponse(saveCategory(params.name));
  if (action === 'deleteCategory') return jsonResponse(deleteCategory(params.name));
  if (action === 'renameCategory') return jsonResponse(renameCategory(params.oldName, params.newName));
  return jsonResponse({ error: 'Acción desconocida' });
}

function getAll(sheet) {
  return { tasks: getTasks(sheet), categories: getCategories() };
}

/** Si Sheets auto-convirtió el string ("2026-06-26", "09:00") a un valor real
 * de fecha/hora, lo devuelve como texto plano en la zona horaria de la hoja,
 * usando Utilities.formatDate (no UTC, no offset adivinado). Si ya es texto
 * (filas viejas, o si Sheets no lo auto-convirtió), lo deja exactamente igual. */
function formatMaybeDate(value, tz, pattern) {
  if (value instanceof Date) return Utilities.formatDate(value, tz, pattern);
  return value || '';
}

function getTasks(sheet) {
  const tz   = sheet.getParent().getSpreadsheetTimeZone();
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  return data.slice(1).map(row => ({
    id:            String(row[0]),
    title:         row[1],
    desc:          row[2],
    due:           row[3],
    category:      row[4],
    done:          row[5] === true || row[5] === 'TRUE',
    createdAt:     row[6],
    order:         Number(row[7]) || 0,
    today:         row[8] === true || row[8] === 'TRUE',              // columna 9
    schedDate:     formatMaybeDate(row[9],  tz, 'yyyy-MM-dd'),         // columna 10
    schedStart:    formatMaybeDate(row[10], tz, 'HH:mm'),              // columna 11
    schedDuration: Number(row[11]) || 0                               // columna 12
  })).filter(t => t.id);
}

function saveTask(sheet, task) {
  sheet.appendRow([
    task.id,
    task.title,
    task.desc          || '',
    task.due           || '',
    task.category      || '',
    task.done          || false,
    task.createdAt,
    task.order         || 0,
    task.today         || false,   // columna 9
    task.schedDate     || '',      // columna 10
    task.schedStart    || '',      // columna 11
    task.schedDuration || 0        // columna 12
  ]);
  return { ok: true };
}

function updateTask(sheet, task) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(task.id)) {
      sheet.getRange(i + 1, 1, 1, 12).setValues([[
        task.id,
        task.title,
        task.desc          || '',
        task.due           || '',
        task.category      || '',
        task.done,
        task.createdAt,
        task.order         || 0,
        task.today         || false,   // columna 9
        task.schedDate     || '',      // columna 10
        task.schedStart    || '',      // columna 11
        task.schedDuration || 0        // columna 12
      ]]);
      return { ok: true };
    }
  }
  return { error: 'No encontrada' };
}

function deleteTask(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) { sheet.deleteRow(i + 1); return { ok: true }; }
  }
  return { error: 'No encontrada' };
}

const CAT_KEY = 'listado_categories';

function getCategories() {
  const props = PropertiesService.getScriptProperties();
  const raw   = props.getProperty(CAT_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveCategory(name) {
  const props = PropertiesService.getScriptProperties();
  const cats  = getCategories();
  if (!cats.includes(name)) { cats.push(name); props.setProperty(CAT_KEY, JSON.stringify(cats)); }
  return { ok: true };
}

function deleteCategory(name) {
  const props = PropertiesService.getScriptProperties();
  const cats  = getCategories().filter(c => c !== name);
  props.setProperty(CAT_KEY, JSON.stringify(cats));
  return { ok: true };
}

function renameCategory(oldName, newName) {
  const props = PropertiesService.getScriptProperties();
  const cats  = getCategories().map(c => c === oldName ? newName : c);
  props.setProperty(CAT_KEY, JSON.stringify(cats));
  return { ok: true };
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}