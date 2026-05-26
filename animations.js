// ─── animations.js ─────────────────────────────────────────────────────────────
// Liquid glass indicator, confetti, sonido de completado.
//
// Efecto de gota de agua — 4 fases físicas:
//   1. Compresión: la gota se achica antes de moverse (como al presionarla)
//   2. Elongación: se estira en la dirección del viaje (inercia de masa)
//   3. Rebote: overshoot al llegar al destino
//   4. Lupa: estado en reposo con bordes de distorsión activos

import { catColors } from './storage.js';

// ─── ELEMENTOS DOM ─────────────────────────────────────────────────────────────
export const lgRefraction = document.getElementById('lg-refraction');
export const lgIndicator  = document.getElementById('lg-indicator');
export const lgPreview    = document.getElementById('lg-preview');

// ─── ESTADO INTERNO ────────────────────────────────────────────────────────────
export const lgState = {
  currentBtn:      null,
  initDone:        false,
  currentAnim:     null,
  currentRefrAnim: null,  // animación de lgRefraction — referencia para poder cancelarla
  switching:       false,
  previewActive:   false,
};

// ─── COMPATIBILIDAD: EXPORTS LEGACY ───────────────────────────────────────────
export function setLgCurrentBtn(v)    { lgState.currentBtn  = v; }
export function setLgInitDone(v)      { lgState.initDone    = v; }
export function setLgCurrentAnim(v)   { lgState.currentAnim = v; }
export function setLgSwitching(v)     { lgState.switching   = v; }
export function setLgPreviewActive(v) { lgState.previewActive = v; }
export function getLgCurrentAnim()    { return lgState.currentAnim; }
export function getLgSwitching()      { return lgState.switching; }

// ─── POSICIONAMIENTO ───────────────────────────────────────────────────────────
function getBtnRect(btn) {
  if (!btn) return { left: 0, top: 0, width: 0, height: 0 };
  return {
    left:   btn.offsetLeft,
    top:    btn.offsetTop,
    width:  btn.offsetWidth,
    height: btn.offsetHeight,
  };
}

// ─── COLOR ─────────────────────────────────────────────────────────────────────
function lerpColor(from, to, t) {
  const parse = s => (s.match(/[\d.]+/g) || []).map(Number);
  const [r1=0, g1=0, b1=0, a1=0] = parse(from);
  const [r2=0, g2=0, b2=0, a2=0] = parse(to);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  const a = +(a1 + (a2 - a1) * t).toFixed(3);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function applyColor(bg, border) {
  if (!lgIndicator) return;
  lgIndicator.style.background  = bg;
  lgIndicator.style.borderColor = border;
}

function readCurrentBg() {
  return lgIndicator?.style.background || 'rgba(180,180,180,0.13)';
}

function readCurrentBorder() {
  return lgIndicator?.style.borderColor || 'rgba(200,200,200,0.30)';
}

function resolveColor(btn) {
  const catName = btn?.dataset?.cat;
  if (catName && catColors[catName]?.bg) {
    const raw = catColors[catName].bg;
    const bg = raw.replace(/([.\d]+)\)$/, (_, v) =>
      `${Math.min(parseFloat(v) * 3.5, 0.45)})`
    );
    return { bg, border: catColors[catName].border };
  }
  return { bg: 'rgba(180,180,180,0.13)', border: 'rgba(200,200,200,0.30)' };
}

// ─── APLICAR POSICIÓN AL DOM ───────────────────────────────────────────────────
function applyRect(rect) {
  const pos = {
    left:   rect.left   + 'px',
    top:    rect.top    + 'px',
    width:  rect.width  + 'px',
    height: rect.height + 'px',
  };
  if (lgRefraction) Object.assign(lgRefraction.style, pos);
  Object.assign(lgIndicator.style, pos);
}

// ─── MOVIMIENTO PRINCIPAL — TRANSFORM PURO, SIN FLIP, SIN LAYOUT ─────────────
//
// Arquitectura: el indicator vive SIEMPRE en left:0, top:0.
// La posición visual se controla 100% por transform: translate(x,y).
// El tamaño se anima también por transform: scaleX/scaleY relativo al tamaño base.
// Beneficio: transform es composited → GPU → 60fps sin jank de layout.
//
// lgState guarda la posición y tamaño actuales como valores JS.
// Al interrumpir una animación, leemos lgState (no el DOM) → siempre confiable.
//
// Para el tamaño variable entre botones (ancho distinto), usamos:
//   scaleX = targetWidth / baseWidth
//   scaleY = targetHeight / baseHeight
// donde base = tamaño del primer botón (se fija en initDone).

export function lgMoveTo(activeBtn) {
  if (!lgIndicator || !activeBtn) return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { bg: destBg, border: destBorder } = resolveColor(activeBtn);
  const destRect = getBtnRect(activeBtn);
  if (!destRect.width || !destRect.height) return;

  // ── Primera vez: fijar posición base y tamaño base ────────────────────────
  if (!lgState.initDone) {
    // El indicator se posiciona en destRect via left/top/width/height
    // (modo estático — sin transform). Guardamos como estado actual.
    applyColor(destBg, destBorder);
    applyRect(destRect);
    lgIndicator.style.transform = 'none';
    if (lgRefraction) lgRefraction.style.transform = 'none';
    Object.assign(lgIndicator.style, { opacity: '1' });
    if (lgRefraction) lgRefraction.style.opacity = '1';

    // Estado de la posición actual en coordenadas JS puras
    lgState.cur = {
      x: destRect.left, y: destRect.top,
      w: destRect.width, h: destRect.height,
    };
    lgState.currentBtn = activeBtn;
    lgState.initDone   = true;
    return;
  }

  if (lgState.currentBtn === activeBtn) return;

  // ── Capturar posición actual desde lgState.cur (siempre confiable) ────────
  // Si hay animación en curso, lgState.cur refleja la posición en el momento
  // en que empezó ese viaje — usamos eso como origen del próximo.
  // Pero si podemos leer la posición interpolada actual (animación corriendo),
  // es mejor partir desde ahí para continuidad visual.
  let fromX, fromY, fromW, fromH;

  if (lgState.currentAnim && lgState.currentAnim.playState === 'running') {
    // Leer posición visual interpolada: el indicator tiene left/top fijos en cur.x/y
    // y el transform animado. Leemos el transform computado para obtener el translate real.
    const matrix = new DOMMatrix(getComputedStyle(lgIndicator).transform);
    fromX = (lgState.cur?.x ?? destRect.left) + matrix.m41;
    fromY = (lgState.cur?.y ?? destRect.top)  + matrix.m42;
    // Para el tamaño interpolado leemos scaleX/scaleY del matrix
    const baseW = lgState.cur?.w ?? destRect.width;
    const baseH = lgState.cur?.h ?? destRect.height;
    fromW = baseW * Math.abs(matrix.m11);
    fromH = baseH * Math.abs(matrix.m22);
  } else {
    fromX = lgState.cur?.x ?? destRect.left;
    fromY = lgState.cur?.y ?? destRect.top;
    fromW = lgState.cur?.w ?? destRect.width;
    fromH = lgState.cur?.h ?? destRect.height;
  }

  // Cancelar animaciones previas
  if (lgState.currentAnim) {
    lgState.currentAnim.cancel();
    lgState.currentAnim = null;
  }
  if (lgState.currentRefrAnim) {
    lgState.currentRefrAnim.cancel();
    lgState.currentRefrAnim = null;
  }

  // Actualizar estado al nuevo destino
  lgState.cur = {
    x: destRect.left, y: destRect.top,
    w: destRect.width, h: destRect.height,
  };
  lgState.currentBtn = activeBtn;

  // ── Posicionar el indicator en el origen (sin transform) ──────────────────
  // left/top/width/height se fijan al origen. El transform hace el viaje.
  Object.assign(lgIndicator.style, {
    left:      fromX + 'px',
    top:       fromY + 'px',
    width:     fromW + 'px',
    height:    fromH + 'px',
    transform: 'none',
  });
  if (lgRefraction) {
    Object.assign(lgRefraction.style, {
      left:      fromX + 'px',
      top:       fromY + 'px',
      width:     fromW + 'px',
      height:    fromH + 'px',
      transform: 'none',
    });
  }

  // ── Reduced motion: salto directo ─────────────────────────────────────────
  if (prefersReduced) {
    applyColor(destBg, destBorder);
    applyRect(destRect);
    return;
  }

  const fromBg     = readCurrentBg();
  const fromBorder = readCurrentBorder();

  // Deltas de posición y tamaño para los keyframes
  const dx = destRect.left  - fromX;
  const dy = destRect.top   - fromY;
  const isHorizontal = Math.abs(dx) >= Math.abs(dy);

  // Ratios de tamaño destino/origen — el scaleX/Y final tiene que llegar a estos valores
  // para que el tamaño viaje junto con la posición, sin salto al finalizar.
  // Guard contra división por cero: fromW/fromH nunca deberían ser 0 en runtime normal,
  // pero si ocurre (race condition en boot) fallback a 1.
  const scaleXFinal = fromW > 0 ? destRect.width  / fromW : 1;
  const scaleYFinal = fromH > 0 ? destRect.height / fromH : 1;

  // Elongación física: escala intermedia que estira la gota en la dirección del viaje.
  // Se aplica multiplicada sobre el ratio final para que la elongación sea coherente.
  const STRETCH = 1.16;
  const SQUEEZE = 0.88;
  const elongSX = isHorizontal ? scaleXFinal * STRETCH : scaleXFinal * SQUEEZE;
  const elongSY = isHorizontal ? scaleYFinal * SQUEEZE : scaleYFinal * STRETCH;

  // Compresión inicial: se aplica uniformemente sobre el ratio de tamaño también
  const compressSX = scaleXFinal * 0.86;
  const compressSY = scaleYFinal * 0.86;

  // Rebote: leve overshoot sobre el ratio final
  const bounceSX1 = scaleXFinal * 1.055;
  const bounceSY1 = scaleYFinal * 0.945;
  const bounceSX2 = scaleXFinal * 0.975;
  const bounceSY2 = scaleYFinal * 1.025;

  // Overshoot de posición: la gota se pasa del destino en la dirección del viaje,
  // luego vuelve suavemente. El delta es proporcional a la distancia recorrida,
  // pero acotado para que no sea exagerado en viajes largos.
  const dist      = Math.sqrt(dx * dx + dy * dy);
  const overshoot = Math.min(dist * 0.08, 10); // máx 10px de pasada
  const ovX = dist > 0 ? (dx / dist) * overshoot : 0;
  const ovY = dist > 0 ? (dy / dist) * overshoot : 0;

  const DUR = 500;

  // ── Keyframes: translate(dx,dy) + scaleX/Y que incluyen el ratio de tamaño ──
  // Beneficio: el tamaño viaja en el GPU junto con la posición.
  // Al llegar, onfinish hace applyRect(destRect) + transform:none — sin salto visible
  // porque el transform ya llegó al tamaño correcto en el último keyframe.

  const anim = lgIndicator.animate([
    {
      // t=0: origen, shape comprimida uniformemente
      transform: `translate(0px, 0px) scaleX(${(scaleXFinal * 0.92).toFixed(4)}) scaleY(${(scaleYFinal * 0.92).toFixed(4)})`,
      offset: 0,
      easing: 'cubic-bezier(0.3, 0, 0.08, 1)',
    },
    {
      // t=0.08: compresión máxima — la gota se achica antes de despegar
      transform: `translate(0px, 0px) scaleX(${compressSX.toFixed(4)}) scaleY(${compressSY.toFixed(4)})`,
      offset: 0.08,
      easing: 'cubic-bezier(0.08, 0, 0.0, 1)',
    },
    {
      // t=0.44: mitad del viaje — elongada en la dirección del movimiento
      transform: `translate(${(dx * 0.5).toFixed(2)}px, ${(dy * 0.5).toFixed(2)}px) scaleX(${elongSX.toFixed(4)}) scaleY(${elongSY.toFixed(4)})`,
      offset: 0.44,
      easing: 'cubic-bezier(0.0, 0, 0.08, 1)',
    },
    {
      // t=0.74: overshoot — la gota se pasa del destino en la dirección del viaje
      transform: `translate(${(dx + ovX).toFixed(2)}px, ${(dy + ovY).toFixed(2)}px) scaleX(${bounceSX1.toFixed(4)}) scaleY(${bounceSY1.toFixed(4)})`,
      offset: 0.74,
      easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
    },
    {
      // t=0.88: rebote inverso — vuelve levemente del otro lado
      transform: `translate(${(dx - ovX * 0.3).toFixed(2)}px, ${(dy - ovY * 0.3).toFixed(2)}px) scaleX(${bounceSX2.toFixed(4)}) scaleY(${bounceSY2.toFixed(4)})`,
      offset: 0.88,
      easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
    },
    {
      // t=1: posición y tamaño finales exactos — sin salto en onfinish
      transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scaleX(${scaleXFinal.toFixed(4)}) scaleY(${scaleYFinal.toFixed(4)})`,
      offset: 1.00,
    },
  ], { duration: DUR, fill: 'none' });

  lgState.currentAnim = anim;

  // ── lgRefraction: misma trayectoria de posición + escala de tamaño ──────
  if (lgRefraction) {
    const refrAnim = lgRefraction.animate([
      { transform: `translate(0px, 0px) scaleX(${(scaleXFinal * 0.92).toFixed(4)}) scaleY(${(scaleYFinal * 0.92).toFixed(4)})`,                                          offset: 0,    easing: 'cubic-bezier(0.08, 0, 0.0, 1)' },
      { transform: `translate(${(dx * 0.5).toFixed(2)}px, ${(dy * 0.5).toFixed(2)}px) scaleX(${elongSX.toFixed(4)}) scaleY(${elongSY.toFixed(4)})`,                      offset: 0.44, easing: 'cubic-bezier(0.0, 0, 0.08, 1)' },
      { transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scaleX(${scaleXFinal.toFixed(4)}) scaleY(${scaleYFinal.toFixed(4)})`,                               offset: 0.82 },
      { transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scaleX(${scaleXFinal.toFixed(4)}) scaleY(${scaleYFinal.toFixed(4)})`,                               offset: 1.00 },
    ], { duration: DUR, fill: 'none' });

    lgState.currentRefrAnim = refrAnim;
    refrAnim.onfinish = () => {
      if (lgState.currentRefrAnim === refrAnim) lgState.currentRefrAnim = null;
      applyRect(destRect);
      lgRefraction.style.transform = 'none';
    };
    refrAnim.oncancel = () => {
      if (lgState.currentRefrAnim === refrAnim) lgState.currentRefrAnim = null;
      lgRefraction.style.transform = 'none';
    };
  }

  // ── Interpolación de color ────────────────────────────────────────────────
  const midBg     = 'rgba(255,255,255,0.16)';
  const midBorder = 'rgba(255,255,255,0.40)';
  const t0 = performance.now();

  function colorFrame(now) {
    const ps = anim.playState;
    if (ps === 'finished' || ps === 'idle') { applyColor(destBg, destBorder); return; }
    const t = Math.min((now - t0) / DUR, 1);
    let bg, border;
    if (t < 0.42) {
      const p = t / 0.42;
      bg = lerpColor(fromBg, midBg, p); border = lerpColor(fromBorder, midBorder, p);
    } else if (t < 0.60) {
      bg = midBg; border = midBorder;
    } else {
      const p = (t - 0.60) / 0.40;
      bg = lerpColor(midBg, destBg, p); border = lerpColor(midBorder, destBorder, p);
    }
    applyColor(bg, border);
    if (t < 1) requestAnimationFrame(colorFrame);
  }
  requestAnimationFrame(colorFrame);

  anim.onfinish = () => {
    if (lgState.currentAnim === anim) lgState.currentAnim = null;
    // Fijar posición final en left/top/width/height y limpiar transform
    applyColor(destBg, destBorder);
    applyRect(destRect);
    lgIndicator.style.transform = 'none';
    if (lgRefraction) lgRefraction.style.transform = 'none';
  };

  anim.oncancel = () => {
    lgIndicator.style.transform = 'none';
    if (lgRefraction) lgRefraction.style.transform = 'none';
  };
}

// ─── SYNC CON BOTÓN ACTIVO ─────────────────────────────────────────────────────
export function lgSyncWithActiveBtn() {
  if (lgState.switching) return;
  const catBar = document.getElementById('cat-bar');
  if (!catBar) return;

  const activeBtn = catBar.querySelector('.cat-btn.active');

  if (!activeBtn) {
    if (lgIndicator)  lgIndicator.style.opacity  = '0';
    if (lgRefraction) lgRefraction.style.opacity = '0';
    catBar.classList.remove('lg-active');
    lgState.currentBtn = null;
    lgState.initDone   = false;
    return;
  }

  catBar.classList.add('lg-active');
  if (lgIndicator)  lgIndicator.style.opacity  = '1';
  if (lgRefraction) lgRefraction.style.opacity = '1';
  lgMoveTo(activeBtn);
}

// ─── RESIZE OBSERVER ───────────────────────────────────────────────────────────
const lgResizeObserver = new ResizeObserver(() => {
  if (!lgState.initDone) return;
  lgState.initDone   = false;
  lgState.currentBtn = null;
  setTimeout(lgSyncWithActiveBtn, 50);
});

export function lgStartObserving() {
  const catBar = document.getElementById('cat-bar');
  if (catBar) lgResizeObserver.observe(catBar);
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      lgState.initDone   = false;
      lgState.currentBtn = null;
      setTimeout(lgSyncWithActiveBtn, 50);
    });
  }
}

// ─── HOVER PREVIEW ─────────────────────────────────────────────────────────────
export function lgShowPreview(btn) {
  if (!lgPreview || !lgState.initDone) return;
  if (btn.classList.contains('active')) return;
  const rect = getBtnRect(btn);
  Object.assign(lgPreview.style, {
    left:    rect.left   + 'px',
    top:     rect.top    + 'px',
    width:   rect.width  + 'px',
    height:  rect.height + 'px',
    opacity: '1',
  });
  lgState.previewActive = true;
}

export function lgHidePreview() {
  if (!lgPreview) return;
  lgPreview.style.opacity = '0';
  lgState.previewActive = false;
}

// ─── AUDIO ─────────────────────────────────────────────────────────────────────
export function playCompleteSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    [[523, 0, 0.14], [659, 0.09, 0.14], [784, 0.18, 0.22]].forEach(([freq, delay, dur]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + delay);
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.15, now + delay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      osc.start(now + delay);
      osc.stop(now + delay + dur + 0.05);
    });
  } catch (e) {}
}

// ─── CONFETTI ──────────────────────────────────────────────────────────────────
export function spawnConfetti(card) {
  const r      = card.getBoundingClientRect();
  const cx     = r.left + 24;
  const cy     = r.top + r.height / 2;
  const colors = ['#c8f060','#40d0a0','#f0a030','#ff8080','#7ab4ff','#ffffff'];
  const count  = 14;
  for (let i = 0; i < count; i++) {
    const d        = document.createElement('div');
    const angle    = (Math.PI * 2 / count) * i + (Math.random() - .5) * .6;
    const speed    = 28 + Math.random() * 44;
    const tx       = Math.cos(angle) * speed;
    const ty       = Math.sin(angle) * speed - 18 - Math.random() * 20;
    const rot      = (Math.random() - .5) * 540;
    const size     = 4 + Math.random() * 5;
    const isCircle = Math.random() > 0.4;
    const delay    = i * 22;
    d.style.cssText = `position:fixed;width:${size}px;height:${size}px;border-radius:${isCircle?'50%':'2px'};background:${colors[i%colors.length]};left:${cx+Math.random()*14-7}px;top:${cy}px;pointer-events:none;z-index:9999;--tx:${tx}px;--ty:${ty}px;--r:${rot}deg;animation:confettiPop .75s cubic-bezier(.2,.8,.3,1) both;animation-delay:${delay}ms;opacity:1`;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 900 + delay);
  }
  const checkBtn = card.querySelector('.check-btn');
  if (checkBtn) {
    const ripple = document.createElement('div');
    const br     = checkBtn.getBoundingClientRect();
    ripple.style.cssText = `position:fixed;left:${br.left+br.width/2}px;top:${br.top+br.height/2}px;transform:translate(-50%,-50%);width:18px;height:18px;border-radius:50%;border:2px solid var(--accent);pointer-events:none;z-index:9999;animation:rippleOut .5s ease both`;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  }
}
