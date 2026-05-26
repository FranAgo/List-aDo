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
    Object.assign(lgIndicator.style, { opacity: '1', transform: 'none' });
    if (lgRefraction) Object.assign(lgRefraction.style, { opacity: '1', transform: 'none' });
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
  if (lgState.currentRefrAnim) {
    lgState.currentRefrAnim.cancel();
    lgState.currentRefrAnim = null;
  }
  lgIndicator.style.transform = 'none';

  // ── Reduced motion: salto directo ─────────────────────────────────────────
  if (prefersReduced) {
    applyColor(destBg, destBorder);
    applyRect(destRect);
    if (lgRefraction) lgRefraction.style.transform = 'none';
    lgState.currentBtn = activeBtn;
    return;
  }

  // ── Leer posición visual actual ANTES de cualquier mutación ──────────────
  // getBoundingClientRect() devuelve la posición visual real en pantalla,
  // incluyendo cualquier transform activo. Esto es crítico cuando se interrumpe
  // una animación en curso: style.left apunta al destino anterior, no al visual.
  const fromBg     = readCurrentBg();
  const fromBorder = readCurrentBorder();

  const catBar     = document.getElementById('cat-bar');
  const barRect    = catBar ? catBar.getBoundingClientRect() : { left: 0, top: 0 };
  const indRect    = lgIndicator.getBoundingClientRect();

  // Posición del indicator en coordenadas relativas al cat-bar
  const fromLeft = indRect.left - barRect.left;
  const fromTop  = indRect.top  - barRect.top;
  const fromW    = indRect.width;
  const fromH    = indRect.height;

  // Vector de desplazamiento para saber si el movimiento es horizontal o vertical
  const dx = destRect.left - fromLeft;
  const dy = destRect.top  - fromTop;
  const isHorizontal = Math.abs(dx) >= Math.abs(dy);

  // Elongación: la gota se estira en la dirección del movimiento.
  // scaleX mayor si viaja horizontal, scaleY mayor si viaja vertical.
  const ELONGATION_AXIS   = 1.28;  // eje del movimiento: se estira
  const ELONGATION_CROSS  = 0.82;  // eje perpendicular: se comprime (conservación de volumen)
  const elongScaleX = isHorizontal ? ELONGATION_AXIS : ELONGATION_CROSS;
  const elongScaleY = isHorizontal ? ELONGATION_CROSS : ELONGATION_AXIS;

  // Mover el rect al destino antes de animar (técnica FLIP)
  applyRect(destRect);
  lgState.currentBtn = activeBtn;

  // ── Keyframes de las 4 fases ──────────────────────────────────────────────
  //
  //  0.00 → 0.12 : FASE 1 — Compresión. La gota se achica como al ser presionada.
  //  0.12 → 0.70 : FASE 2 — Elongación + viaje. Se estira en la dirección del vector.
  //  0.70 → 0.88 : FASE 3 — Overshoot. Llega al destino y rebota levemente.
  //  0.88 → 1.00 : FASE 4 — Asentamiento. Vuelve a escala 1 y activa los rims de lupa.
  //
  //  El truco FLIP: el indicator ya está en destRect.
  //  Empezamos con un translate(dx, dy) que lo pone visualmente en el origen,
  //  y animamos hacia translate(0,0). El scale va encima de eso.

  const DUR = 480;

  const anim = lgIndicator.animate([
    {
      // Posición visual: origen. Escala: comprimida (fase 1)
      transform: `translate(${dx}px, ${dy}px) scaleX(${fromW / destRect.width * 0.88}) scaleY(${fromH / destRect.height * 0.88})`,
      offset:    0,
      easing:    'cubic-bezier(0.4, 0, 0.2, 1)',
    },
    {
      // Compresión máxima: la gota se achica antes de salir (offset 0.10)
      transform: `translate(${dx * 0.95}px, ${dy * 0.95}px) scaleX(${fromW / destRect.width * 0.82}) scaleY(${fromH / destRect.height * 0.82})`,
      offset:    0.10,
      easing:    'cubic-bezier(0.2, 0, 0.0, 1)',
    },
    {
      // Mitad del viaje: elongada en la dirección del movimiento
      transform: `translate(${dx * 0.4}px, ${dy * 0.4}px) scaleX(${elongScaleX}) scaleY(${elongScaleY})`,
      offset:    0.45,
      easing:    'cubic-bezier(0.0, 0, 0.2, 1)',
    },
    {
      // Llegada: overshoot leve (rebote)
      transform: `translate(0px, 0px) scaleX(1.06) scaleY(0.94)`,
      offset:    0.72,
      easing:    'cubic-bezier(0.34, 1.56, 0.64, 1)',
    },
    {
      // Rebote inverso suave
      transform: `translate(0px, 0px) scaleX(0.97) scaleY(1.03)`,
      offset:    0.88,
      easing:    'cubic-bezier(0.25, 0.8, 0.25, 1)',
    },
    {
      // Asentamiento final: escala 1 exacta
      transform: `translate(0px, 0px) scale(1)`,
      offset:    1.00,
    },
  ], { duration: DUR, fill: 'none' });

  lgState.currentAnim = anim;

  // ── Interpolación de color durante el viaje ───────────────────────────────
  // Pico de blanco al cruzar la mitad → da sensación de "destello" de movimiento
  const midBg     = 'rgba(255,255,255,0.16)';
  const midBorder = 'rgba(255,255,255,0.40)';
  const t0 = performance.now();

  function colorFrame(now) {
    const playState = anim.playState;
    if (playState === 'finished' || playState === 'idle') {
      applyColor(destBg, destBorder);
      return;
    }
    const t = Math.min((now - t0) / DUR, 1);
    let bg, border;
    if (t < 0.45) {
      const p = t / 0.45;
      bg     = lerpColor(fromBg, midBg, p);
      border = lerpColor(fromBorder, midBorder, p);
    } else if (t < 0.60) {
      bg     = midBg;
      border = midBorder;
    } else {
      const p = (t - 0.60) / 0.40;
      bg     = lerpColor(midBg, destBg, p);
      border = lerpColor(midBorder, destBorder, p);
    }
    applyColor(bg, border);
    if (t < 1) requestAnimationFrame(colorFrame);
  }
  requestAnimationFrame(colorFrame);

  // ── Sincronizar lgRefraction con el mismo movimiento ─────────────────────
  // lgRefraction sigue al indicator pero con un delay mínimo para que el blur
  // no corte el contenido durante la compresión inicial.
  // Se guarda en lgState.currentRefrAnim para poder cancelarlo en clicks rápidos.
  if (lgRefraction) {
    const refrAnim = lgRefraction.animate([
      { transform: `translate(${dx}px, ${dy}px)`, offset: 0, easing: 'cubic-bezier(0.2, 0, 0.0, 1)' },
      { transform: `translate(${dx * 0.4}px, ${dy * 0.4}px)`, offset: 0.45, easing: 'cubic-bezier(0.0, 0, 0.2, 1)' },
      { transform: 'translate(0px, 0px)', offset: 0.78 },
      { transform: 'translate(0px, 0px)', offset: 1.00 },
    ], { duration: DUR, fill: 'none', delay: 40 });

    lgState.currentRefrAnim = refrAnim;

    refrAnim.onfinish = () => {
      if (lgState.currentRefrAnim === refrAnim) lgState.currentRefrAnim = null;
      lgRefraction.style.transform = 'none';
    };
    refrAnim.oncancel = () => {
      if (lgState.currentRefrAnim === refrAnim) lgState.currentRefrAnim = null;
      lgRefraction.style.transform = 'none';
    };
  }

  anim.onfinish = () => {
    if (lgState.currentAnim === anim) lgState.currentAnim = null;
    applyColor(destBg, destBorder);
    lgIndicator.style.transform = 'none';
    lgIndicator.style.width     = destRect.width  + 'px';
    lgIndicator.style.height    = destRect.height + 'px';
    if (lgRefraction) {
      lgRefraction.style.transform = 'none';
      lgRefraction.style.width     = destRect.width  + 'px';
      lgRefraction.style.height    = destRect.height + 'px';
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
