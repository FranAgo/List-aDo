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

// ─── MOVIMIENTO PRINCIPAL — 4 FASES DE GOTA ──────────────────────────────────
export function lgMoveTo(activeBtn) {
  if (!lgIndicator || !activeBtn) return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { bg: destBg, border: destBorder } = resolveColor(activeBtn);
  const destRect = getBtnRect(activeBtn);
  if (!destRect.width || !destRect.height) return;

  // ── Primera vez: posicionar sin animación ─────────────────────────────────
  if (!lgState.initDone) {
    applyColor(destBg, destBorder);
    applyRect(destRect);
    lgState.fromRect = { ...destRect };
    Object.assign(lgIndicator.style, { opacity: '1', transform: 'none' });
    if (lgRefraction) Object.assign(lgRefraction.style, { opacity: '1', transform: 'none' });
    lgState.currentBtn = activeBtn;
    lgState.initDone   = true;
    return;
  }

  if (lgState.currentBtn === activeBtn) return;

  // ── Leer posición de origen desde lgState.fromRect ───────────────────────
  // lgState.fromRect se guarda al final de cada animación y en el primer render.
  // Es la única fuente confiable del origen — no depende del DOM ni de transforms.
  // Cuando hay una animación interrumpida, capturamos la posición visual real
  // ANTES de cancelar, y la guardamos como nuevo origen.
  let fromRect = lgState.fromRect
    ? { ...lgState.fromRect }
    : {
        left:   parseFloat(lgIndicator.style.left)   || destRect.left,
        top:    parseFloat(lgIndicator.style.top)    || destRect.top,
        width:  parseFloat(lgIndicator.style.width)  || destRect.width,
        height: parseFloat(lgIndicator.style.height) || destRect.height,
      };

  if (lgState.currentAnim) {
    // Animación en curso: leer posición visual real para partir desde ahí
    const catBar  = document.getElementById('cat-bar');
    const barOff  = catBar ? catBar.getBoundingClientRect() : { left: 0, top: 0 };
    const indOff  = lgIndicator.getBoundingClientRect();
    fromRect = {
      left:   indOff.left - barOff.left,
      top:    indOff.top  - barOff.top,
      width:  indOff.width,
      height: indOff.height,
    };
    lgState.currentAnim.cancel();
    lgState.currentAnim = null;
  }
  if (lgState.currentRefrAnim) {
    lgState.currentRefrAnim.cancel();
    lgState.currentRefrAnim = null;
  }

  // Limpiar transforms residuales
  lgIndicator.style.transform = 'none';
  if (lgRefraction) lgRefraction.style.transform = 'none';

  // ── Reduced motion: salto directo ─────────────────────────────────────────
  if (prefersReduced) {
    applyColor(destBg, destBorder);
    applyRect(destRect);
    lgState.fromRect   = { ...destRect };
    lgState.currentBtn = activeBtn;
    return;
  }

  const fromBg     = readCurrentBg();
  const fromBorder = readCurrentBorder();

  // Dirección del viaje para la elongación
  const dx = destRect.left - fromRect.left;
  const dy = destRect.top  - fromRect.top;
  const isHorizontal = Math.abs(dx) >= Math.abs(dy);
  const STRETCH = 1.22;
  const SQUEEZE = 0.84;
  const elongScaleX = isHorizontal ? STRETCH : SQUEEZE;
  const elongScaleY = isHorizontal ? SQUEEZE : STRETCH;

  // Guardar destino como próximo origen
  lgState.fromRect   = { ...destRect };
  lgState.currentBtn = activeBtn;

  // ── Posicionar el indicator en el origen visualmente antes de animar ──────
  // Sin FLIP: el indicator arranca en fromRect y viaja a destRect
  // animando left/top/width/height directamente.
  // El transform maneja solo la escala (compresión, elongación, rebote) —
  // siempre parte de none y vuelve a none, nunca contamina la lectura de origen.
  Object.assign(lgIndicator.style, {
    left:   fromRect.left   + 'px',
    top:    fromRect.top    + 'px',
    width:  fromRect.width  + 'px',
    height: fromRect.height + 'px',
  });
  if (lgRefraction) {
    Object.assign(lgRefraction.style, {
      left:   fromRect.left   + 'px',
      top:    fromRect.top    + 'px',
      width:  fromRect.width  + 'px',
      height: fromRect.height + 'px',
    });
  }

  const DUR = 480;
  const midL = (fromRect.left   + destRect.left)   / 2;
  const midT = (fromRect.top    + destRect.top)    / 2;
  const midW = (fromRect.width  + destRect.width)  / 2;
  const midH = (fromRect.height + destRect.height) / 2;

  const anim = lgIndicator.animate([
    {
      left: fromRect.left + 'px', top: fromRect.top + 'px',
      width: fromRect.width + 'px', height: fromRect.height + 'px',
      transform: 'scale(0.88)',
      offset: 0,
      easing: 'cubic-bezier(0.4, 0, 0.1, 1)',
    },
    {
      left: fromRect.left + 'px', top: fromRect.top + 'px',
      width: fromRect.width + 'px', height: fromRect.height + 'px',
      transform: 'scale(0.82)',
      offset: 0.08,
      easing: 'cubic-bezier(0.1, 0, 0.0, 1)',
    },
    {
      left: midL + 'px', top: midT + 'px',
      width: midW + 'px', height: midH + 'px',
      transform: `scaleX(${elongScaleX}) scaleY(${elongScaleY})`,
      offset: 0.45,
      easing: 'cubic-bezier(0.0, 0, 0.15, 1)',
    },
    {
      left: destRect.left + 'px', top: destRect.top + 'px',
      width: destRect.width + 'px', height: destRect.height + 'px',
      transform: 'scaleX(1.07) scaleY(0.93)',
      offset: 0.74,
      easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
    },
    {
      left: destRect.left + 'px', top: destRect.top + 'px',
      width: destRect.width + 'px', height: destRect.height + 'px',
      transform: 'scaleX(0.97) scaleY(1.03)',
      offset: 0.88,
      easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
    },
    {
      left: destRect.left + 'px', top: destRect.top + 'px',
      width: destRect.width + 'px', height: destRect.height + 'px',
      transform: 'scale(1)',
      offset: 1.00,
    },
  ], { duration: DUR, fill: 'none' });

  lgState.currentAnim = anim;

  // ── Interpolación de color ────────────────────────────────────────────────
  const midBg     = 'rgba(255,255,255,0.16)';
  const midBorder = 'rgba(255,255,255,0.40)';
  const t0 = performance.now();

  function colorFrame(now) {
    const ps = anim.playState;
    if (ps === 'finished' || ps === 'idle') { applyColor(destBg, destBorder); return; }
    const t = Math.min((now - t0) / DUR, 1);
    let bg, border;
    if (t < 0.45) {
      const p = t / 0.45;
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

  // ── lgRefraction: misma trayectoria de posición, sin escala ───────────────
  if (lgRefraction) {
    const refrAnim = lgRefraction.animate([
      { left: fromRect.left + 'px', top: fromRect.top + 'px', width: fromRect.width + 'px', height: fromRect.height + 'px', offset: 0,    easing: 'cubic-bezier(0.1, 0, 0.0, 1)' },
      { left: midL + 'px', top: midT + 'px', width: midW + 'px', height: midH + 'px',                                       offset: 0.45, easing: 'cubic-bezier(0.0, 0, 0.2, 1)' },
      { left: destRect.left + 'px', top: destRect.top + 'px', width: destRect.width + 'px', height: destRect.height + 'px', offset: 0.80 },
      { left: destRect.left + 'px', top: destRect.top + 'px', width: destRect.width + 'px', height: destRect.height + 'px', offset: 1.00 },
    ], { duration: DUR, fill: 'none' });

    lgState.currentRefrAnim = refrAnim;

    refrAnim.onfinish = () => {
      if (lgState.currentRefrAnim === refrAnim) lgState.currentRefrAnim = null;
      applyRect(destRect);
    };
    refrAnim.oncancel = () => {
      if (lgState.currentRefrAnim === refrAnim) lgState.currentRefrAnim = null;
    };
  }

  anim.onfinish = () => {
    if (lgState.currentAnim === anim) lgState.currentAnim = null;
    applyColor(destBg, destBorder);
    lgIndicator.style.transform = 'none';
    applyRect(destRect);
    if (lgRefraction) {
      lgRefraction.style.transform = 'none';
      applyRect(destRect);
    }
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
