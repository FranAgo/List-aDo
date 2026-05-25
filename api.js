// ─── api.js ────────────────────────────────────────────────────────────────────
// Wrapper de fetch hacia el backend de Google Apps Script.
// Agrega la clave secreta a cada request.

import { API, SECRET } from './storage.js';

export async function api(params) {
  const url = new URL(API);
  params.key = SECRET;
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  try {
    return await (await fetch(url.toString())).json();
  } catch (e) {
    return { error: e.message };
  }
}
