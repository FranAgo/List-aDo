// ─── animations.js ─────────────────────────────────────────────────────────────
// Liquid glass indicator, confetti, sonido de completado.
//
// Reescritura desde cero — arquitectura de estado simplificada.
// Un único objeto `lgState` reemplaza los 6 exports separados con setters,
// eliminando la fuente principal de race conditions.

import { catColors } from './storage.js';

// ─── ELEMENTOS DOM ─────────────────────────────────────────────────────────────
export const lgRefraction = document.getElementById('lg-refraction');
export const lgIndicator  = document.getElementById('lg-indicator');
export const lgPreview    = document.getElementById('lg-preview');

// ─── ESTADO INTERNO ────────────────────────────────────────────────────────────
// Un objeto mutable compartido por referencia. No hay setters: los módulos
// que necesitan mutar el estado lo importan y escriben directamente.
export const lgState = {
  currentBtn:    null,   // botón activo actual (nodo DOM)
  initDone:      false,  // ¿ya se posicionó al menos una vez?
  currentAnim:   null,   // Animation object activo (para cancelar)
  switching:     false,  // ¿estamos en medio de un switchCat?
  previewActive: false,  // ¿hay hover preview visible?
};

// ─── COMPATIBILIDAD: EXPORTS LEGACY ───────────────────────────────────────────
// ui.js y categories.js importan los setters del archivo anterior.
// Se mantienen como wrappers para no tener que modificar esos archivos.
export function setLgCurrentBtn(v)    { lgState.currentBtn  = v; }
export function setLgInitDone(v)      { lgState.initDone    = v; }
export function setLgCurrentAnim(v)   { lgState.currentAnim = v; }
export function setLgSwitching(v)     { lgState.switching   = v; }
export function setLgPreviewActive(v) { lgState.previewActive = v; }

// Exports directos para compatibilidad con ui.js que los lee como valores
export function getLgCurrentAnim()  { return lgState.currentAnim; }
export function getLgSwitching()    { return lgState.switching; }

// ─── POSICIONAMIENTO ───────────────────────────────────────────────────────────
// offsetLeft/offsetTop son relativos al padre (#cat-bar, position:relative).
// No dependen del viewport ni del scroll — son estables post-layout.
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
  return lgIndicator?.style.background || 'rgba(200,240,96,0.18)';
}

function readCurrentBorder() {
  return lgIndicator?.style.borderColor || 'rgba(200,240,96,0.35)';
}

function resolveColor(btn) {
  const catName = btn?.dataset?.cat;
  if (catName && catColors[catName]?.bg) {
    const raw = catColors[catName].bg;
    // Amplificar la opacidad para que el tinte sea visible sobre el fondo blanco del glass
    const bg = raw.replace(/([.\d]+)\)$/, (_, v) =>
      `${Math.min(parseFloat(v) * 3.5, 0.45)})`
    );
    return { bg, border: catColors[catName].border };
  }
  // Color por defecto: acento verde de la app
  return { bg: 'rgba(200,240,96,0.30)', border: 'rgba(200,240,96,0.55)' };
}

// ─── APLICAR POSICIÓN AL DOM ───────────────────────────────────────────────────
// Ambos elementos (lgRefraction y lgIndicator) deben ocupar el mismo rect.
// lgRefraction va PRIMERO en z-index (10) — backdrop-filter sin clip.
// lgIndicator va ENCIMA (11) — tinte + borde + specular.
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

// ─── MOVIMIENTO PRINCIPAL ──────────────────────────────────────────────────────
export function lgMoveTo(activeBtn) {
  if (!lgIndicator || !activeBtn) return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { bg: destBg, border: destBorder } = resolveColor(activeBtn);
  const rect = getBtnRect(activeBtn);
  if (!rect.width || !rect.height) return;

  // ── Primera vez: posicionar sin animación ─────────────────────────────────
  if (!lgState.initDone) {
    applyColor(destBg, destBorder);
    applyRect(rect);
    Object.assign(lgIndicator.style, {
      opacity:   '1',
      transform: 'none',
    });
    if (lgRefraction) Object.assign(lgRefraction.style, {
      opacity:   '1',
      transform: 'none',
    });
    lgState.currentBtn = activeBtn;
    lgState.initDone   = true;
    return;
  }

  if (lgState.currentBtn === activeBtn) return;

  // Cancelar animación previa limpiamente
  if (lgState.currentAnim) {
    lgState.currentAnim.cancel();
    lgState.currentAnim = null;
  }
  lgIndicator.style.transform = 'none';

  // ── Reduced motion: salto directo ─────────────────────────────────────────
  if (prefersReduced) {
    applyColor(destBg, destBorder);
    applyRect(rect);
    if (lgRefraction) lgRefraction.style.transform = 'none';
    lgState.currentBtn = activeBtn;
    return;
  }

  // ── Animación FLIP: translate desde posición actual → destino ─────────────
  const fromBg     = readCurrentBg();
  const fromBorder = readCurrentBorder();
  const fromLeft   = parseFloat(lgIndicator.style.left)   || rect.left;
  const fromTop    = parseFloat(lgIndicator.style.top)    || rect.top;
  const fromW      = parseFloat(lgIndicator.style.width)  || rect.width;
  const fromH      = parseFloat(lgIndicator.style.height) || rect.height;

  const dx = fromLeft - rect.left;
  const dy = fromTop  - rect.top;

  // Mover el indicator al destino antes de animar
  applyRect(rect);
  lgState.currentBtn = activeBtn;

  const DUR = 400;

  const anim = lgIndicator.animate([
    {
      transform: `translate(${dx}px, ${dy}px) scaleX(${fromW / rect.width}) scaleY(${fromH / rect.height})`,
      offset:    0,
      easing:    'cubic-bezier(0.28, 0, 0.12, 1)',
    },
    {
      transform: 'translate(0px, 0px) scale(1.045)',
      offset:    0.80,
      easing:    'cubic-bezier(0.25, 0.8, 0.25, 1)',
    },
    {
      transform: 'translate(0px, 0px) scale(0.985)',
      offset:    0.92,
    },
    {
      transform: 'translate(0px, 0px) scale(1)',
      offset:    1.00,
    },
  ], { duration: DUR, fill: 'none' });

  lgState.currentAnim = anim;

  // Interpolación de color independiente del WAAPI
  const midBg     = 'rgba(255,255,255,0.14)';
  const midBorder = 'rgba(255,255,255,0.36)';
  const t0 = performance.now();

  function colorFrame(now) {
    const state = anim.playState;
    if (state === 'finished' || state === 'idle') {
      applyColor(destBg, destBorder);
      return;
    }
    const t = Math.min((now - t0) / DUR, 1);
    let bg, border;
    if (t < 0.4) {
      const p = t / 0.4;
      bg = lerpColor(fromBg, midBg, p);
      border = lerpColor(fromBorder, midBorder, p);
    } else if (t < 0.6) {
      bg = midBg;
      border = midBorder;
    } else {
      const p = (t - 0.6) / 0.4;
      bg = lerpColor(midBg, destBg, p);
      border = lerpColor(midBorder, destBorder, p);
    }
    applyColor(bg, border);
    if (t < 1) requestAnimationFrame(colorFrame);
  }
  requestAnimationFrame(colorFrame);

  anim.onfinish = () => {
    if (lgState.currentAnim === anim) lgState.currentAnim = null;
    applyColor(destBg, destBorder);
    lgIndicator.style.transform = 'none';
    lgIndicator.style.width     = rect.width  + 'px';
    lgIndicator.style.height    = rect.height + 'px';
    if (lgRefraction) {
      lgRefraction.style.transform = 'none';
      lgRefraction.style.width     = rect.width  + 'px';
      lgRefraction.style.height    = rect.height + 'px';
    }
  };

  anim.oncancel = () => {
    lgIndicator.style.transform  = 'none';
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
  // Reset para que lgMoveTo reposicione sin animar
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
