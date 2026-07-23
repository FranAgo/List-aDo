# Changelog — List-aDo

Registro de cambios del proyecto. Versionado semántico: `MAJOR.MINOR.PATCH`.

- **MAJOR**: cambios que rompen compatibilidad de datos existentes o alteran un flujo ya establecido (ej: cambio de esquema en Google Sheets que invalida filas viejas).
- **MINOR**: funcionalidad nueva o mejora visible para el usuario, sin romper nada de lo anterior.
- **PATCH**: corrección de bugs, sin funcionalidad nueva.

Cada entrada se agrupa en hasta tres secciones — nunca mezcladas entre sí:

- **Mejoras entregadas**: funcionalidad nueva, aprobada por Duck.
- **Bugs corregidos**: problemas que ya existían y se resolvieron.
- **Bugs introducidos y corregidos**: errores que el propio equipo generó durante la sesión y arregló antes de entregar. Se reportan aparte, nunca mezclados con las mejoras como si fueran parte del trabajo planificado.

Si una sección no aplica en una entrega, no aparece — no se dejan secciones vacías por prolijidad.

---

## [1.3.0] - 2026-07-23

### Mejoras entregadas

- Vista Calendario (panel "Sin agendar"): selector para filtrar por lista — "Todas las listas" por defecto, y cada lista con su cantidad de tareas sin agendar entre paréntesis. El contador del botón de la toolbar sigue mostrando el total sin filtrar. Si la lista elegida se renombra o elimina, el panel vuelve solo a "Todas".

---

## [1.2.0] - 2026-07-23

### Mejoras entregadas

- Vista Calendario: nuevo panel "Sin agendar" — un botón en la toolbar (con contador) muestra u oculta la lista de tareas pendientes que todavía no tienen día y horario. Cerrado por defecto y recordado entre sesiones (`localStorage`), así la vista queda igual de despejada que antes para quien no lo usa.
- Vista Calendario (semana/día): arrastrar una tarea del panel a la grilla la agenda en ese día y horario — mismo ghost de preview y snap de 15 minutos que ya tenía el drag de bloques; duración por defecto 30 minutos.
- Vista Calendario (mes): arrastrar una tarea del panel a un día abre el modal de edición con esa fecha precargada, para elegir la hora a mano — no se inventan horarios. Cancelar el modal no cambia nada.
- Vista Calendario: click (sin arrastre) en un ítem del panel abre la edición de esa tarea, igual que los chips de la grilla.
- Vista Calendario (mobile): el panel se vuelve una bandeja horizontal arriba de la grilla — scrollea con gesto horizontal nativo y deja el gesto vertical para el drag hacia la grilla.

### Bugs introducidos y corregidos

- Panel "Sin agendar": el drag no manejaba `pointercancel` — en mobile, si el browser interpretaba el gesto como scroll horizontal de la bandeja, el clon flotante quedaba pegado en pantalla, los listeners quedaban colgados y el siguiente click sobre el ítem se perdía. Detectado por Duck en la revisión, corregido antes de entregar.

---

## [1.1.0] - 2026-07-15

### Mejoras entregadas

- Topbar: número de versión visible junto al logo (texto chico "v1.1.0" al lado de "List-aDo"), tomado de una única fuente de verdad (`APP_VERSION` en `storage.js`) para que no se pueda desincronizar del texto mostrado en distintos lugares.

---

## [1.0.0] - 2026-07-15

Primera versión registrada. Arranca desde esta fecha — no reconstruye el historial previo (la sección Calendario, el backend de Google Apps Script, etc. ya existían antes y no quedaron documentados en este log).

### Mejoras entregadas

- Vista Calendario (mes): tooltip nativo en los chips de tarea — al truncarse el título por espacio, se puede ver completo al pasar el mouse.
- Vista Calendario (mes): halo animado sutil en la celda de "hoy" (respeta `prefers-reduced-motion`).
- Vista Calendario (mes): glow de categoría más marcado al pasar el mouse sobre un chip, con leve elevación.
- Vista Calendario (mes): el indicador "+N más" ahora muestra hasta 4 puntos de color (uno por categoría) de las tareas ocultas, y los chips entran con una animación escalonada (GSAP, con fallback en CSS puro) al cambiar de mes.
- Vista Calendario (mes): sábado y domingo tienen un tinte de fondo propio para diferenciar el fin de semana de un vistazo.

### Bugs corregidos

- Vista Calendario (mes): las columnas de la grilla se distribuían de forma desigual cuando un día tenía una tarea con título largo — esa columna se ensanchaba y le robaba espacio a las demás. Causa: `grid-template-columns: repeat(7, 1fr)` sin `minmax(0, ...)`, por lo que el contenido sin wrap empujaba el ancho mínimo de la columna más allá de 1/7 del total. Mismo hardening preventivo aplicado al mini date-picker de vencimiento (`.cal-grid`), que no estaba roto pero tenía el mismo patrón de riesgo latente.

---

## Cómo se agrega una entrada nueva

1. Nueva sección `## [X.Y.Z] - AAAA-MM-DD` **arriba** de la anterior — orden descendente, la más reciente primero.
2. Bump de versión según el criterio de arriba (MAJOR / MINOR / PATCH). Ante la duda entre MINOR y PATCH: si el usuario nota algo distinto en la interfaz o gana una capacidad nueva, es MINOR.
3. Solo las secciones que apliquen. Si no hubo bugs introducidos por el equipo en la sesión, esa sección no se escribe.
4. Un bullet por cambio, nombrando qué parte de la app toca (ej: "Vista Calendario (mes): ...") — así se puede escanear el archivo sin tener que leer cada línea completa.
5. Actualizar también `APP_VERSION` en `storage.js` al mismo número — es la fuente que alimenta el tag de versión en la topbar. Si uno se bumpea y el otro no, el número que ve el usuario en la app queda mintiendo.
6. Ningún cambio entra a este log sin haber sido probado por Duck primero.
