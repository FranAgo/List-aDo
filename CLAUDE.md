# List-aDo

PWA personal de gestión de tareas. Frontend vanilla JS (ES modules) en GitHub Pages
(`https://FranAgo.github.io/List-aDo`), backend en Google Apps Script Web App,
base de datos en Google Sheets. Prioridad: pulido visual, interacciones intuitivas,
simplicidad. Principio de diseño core: toda tarea pertenece a una categoría con
nombre (no hay tareas huérfanas).

## Estructura

- `index.html` — HTML puro, sin CSS/JS inline. Modales, topbar, cat-bar, toast.
- `styles.css` — todo el CSS: tokens, reset, login, topbar, cat bar, task cards,
  modales, toast, liquid glass, búsqueda global, calendario, animaciones, responsive.
- `state.js` — estado global mutable único (`state`). No importa otros módulos.
- `storage.js` — config (API URL, SECRET, keys de localStorage), CAT_PALETTE,
  lógica de catColors. No importa otros módulos.
- `api.js` — wrapper de fetch al backend de Apps Script. Exporta `api(params)`.
  Agrega la clave secreta automáticamente.
- `dates.js` — helpers de fecha. Interno: `YYYY-MM-DD`. Usuario: `DD/MM/AAAA`.
  No importa otros módulos.
- `animations.js` — liquid glass indicator, confetti, sonido Web Audio API.
- `ui.js` — todo lo que toca el DOM: renderCatBar, switchCat, renderView,
  populateList, taskHTML, toast, búsqueda global, calendario mini, drag & drop
  del cat-bar. `setupDrag`/`setupSwipe` se invocan vía callbacks en `window`
  registrados por `app.js` para evitar dependencia circular con `tasks.js`.
- `tasks.js` — CRUD de tareas, toggleDone, checkOverdue, sortTasks, addToday,
  removeToday, reorder drag & drop, setupDrag, setupSwipe.
- `categories.js` — crear, renombrar, eliminar lista, borrar completadas.
- `app.js` — único entry point. Login/logout, event delegation global,
  listeners de modales, atajos de teclado (N, /, Ctrl+K, Esc), boot de la app.
- `gas/` — espejo local del backend de Apps Script, gestionado con `clasp`.
  Ver sección Backend / clasp más abajo.
- `CHANGELOG.md` — versionado semántico (MAJOR.MINOR.PATCH), root del repo.

## Protocolo de equipo (no negociable)

Trabajo con un equipo de personas técnicas, cada una definida como Skill en
`.claude/skills/`. Cada ingeniero que participe en la conversación se identifica
al hablar, formato: `Nombre-rol: {diálogo}`.

- **Paul** — Product Manager. Scopea requerimientos antes de implementar
  cualquier feature nueva. Decisiones que afectan la experiencia de Franco no
  se cierran sin consultarlo primero.
- **Jay** — Frontend.
- **Bob** — Backend / Apps Script.
- **Roy** — DevOps / deploy (git, GitHub Pages, clasp).
- **Duck** — QA. Ningún cambio se entrega sin su aprobación explícita.

Especialistas de consulta (no forman parte del loop obligatorio de cada
entrega, se suman cuando el tema los toca):
- **Julia** — AppSec. Se la convoca ante cambios que tocan la clave secreta
  de `api.js`, el flujo de login/logout de `app.js`, o cualquier exposición
  de datos en el Web App de Apps Script.
- **Gary** — DBA. Se lo convoca ante cambios al modelo de datos en Google
  Sheets (columnas, tipos, migraciones de estructura).

Orden de trabajo: Paul scopea → Jay/Bob implementan (sumando a Julia/Gary si
el cambio lo amerita) → Duck revisa → se corrigen los hallazgos de Duck →
recién ahí se commitea/pushea.

Simple > feature nueva: mejoras simples y no complejas se prefieren por sobre
agregar funcionalidad.

## Changelog y versionado

Cada entrega de cambios agrega una entrada a `CHANGELOG.md`, categorizada en
`Mejoras entregadas` / `Bugs corregidos` / `Bugs introducidos y corregidos`
(secciones nunca mezcladas). `APP_VERSION` en `storage.js` se bumpea junto con
cada entrada de changelog.

- MAJOR: cambios que rompen datos existentes.
- MINOR: features nuevas visibles.
- PATCH: fixes de bugs únicamente.

## Gotchas ya conocidos (no volver a redescubrir esto)

- **CSS Grid**: `repeat(7, 1fr)` necesita `minmax(0, 1fr)` o los chips con
  `white-space: nowrap` inflan columnas de forma dispareja.
- **Apps Script serializa fechas**: Sheets convierte strings de hora a Date.
  El backend debe usar `Utilities.formatDate()` con `getSpreadsheetTimeZone()`
  antes de devolver JSON. El frontend tiene una capa defensiva:
  `normalizeToHHMM()` en `dates.js`, aplicada a `schedStart`.
- **Deploys de Apps Script**: publicar una nueva versión sobre el MISMO
  deployment ID preserva la URL del Web App. Crear un deployment nuevo cambia
  la URL y rompe `api.js`. Con clasp: `clasp version` + `clasp deploy
  --deploymentId <id_existente>`, nunca `clasp deploy` sin `--deploymentId`.
- **Caché de GitHub Pages**: verificar con hard refresh (Ctrl+Shift+R) antes
  de juzgar resultado visual post-deploy.
- **ES modules**: todos los `import` van al principio del archivo. Imports en
  medio del archivo generan `SyntaxError` silencioso que bloquea toda la
  ejecución.
- **Liquid glass**: `#lg-refraction` debe ser hermano de `#lg-indicator`, no
  hijo — `overflow: hidden` en el padre clipea `backdrop-filter`. Ambos deben
  vivir fuera de `#cat-bar` (o guardarse/reinsertarse) porque `renderCatBar()`
  reemplaza vía `innerHTML`.
- **Interrupción de animaciones**: usar `getComputedStyle` para leer el
  color/posición real en el momento de `killTweensOf`, no variables stale.
- **Variables globales implícitas**: en ES modules, acceder a un `let` de
  otro scope crea un global implícito silencioso en vez de tirar error —
  trazar scope explícitamente antes de aprobar cualquier acceso a estado
  compartido.
- **`todayIds` / localStorage**: purgar IDs contra la lista viva de la API
  antes de que corra `checkOverdue()`, para que tareas borradas no reaparezcan.

## Backend / clasp

El proyecto de Apps Script vive espejado en `gas/`, gestionado con `clasp`.

- Script ID y deployment de producción confirmados: el deployment que usa
  `api.js` (vía la URL en `storage.js`) es
  `AKfycbzpJgvkbJ2JQkKUwOHL1XPRMM5_eOh9SjfLEBxlKesIswJ3DXVj63q_LsmdMRXkWLBy`.
  Este es el ÚNICO deployment que se actualiza. Los otros dos que devuelve
  `clasp deployments` (`@HEAD` y `@1 - API List-aDo`) no se tocan.
- `gas/.clasp.json` tiene el `scriptId` y `rootDir`. Se commitea (no es secreto).
- Las credenciales de `clasp login` van a `~/.clasprc.json` (home del usuario),
  fuera del repo — nunca deben terminar versionadas.
- Flujo para deployar un cambio de backend:

```powershell
clasp push
clasp version "descripción del cambio"
clasp deploy --deploymentId AKfycbzpJgvkbJ2JQkKUwOHL1XPRMM5_eOh9SjfLEBxlKesIswJ3DXVj63q_LsmdMRXkWLBy --versionNumber N
```

  Nunca `clasp deploy` sin `--deploymentId`.
- Antes de cualquier `clasp push`, confirmar que nadie tocó código directo en
  script.google.com sin pasar por local — si pasó, `clasp pull` primero o se
  pisa ese cambio.

## Delivery

A diferencia del chat de claude.ai, acá los cambios se editan directo sobre
los archivos del repo y se versionan con git — no hace falta regenerar
archivos completos por entrega. Igual, ningún commit se hace sin que Duck
haya validado el cambio.
