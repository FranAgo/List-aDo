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
  cur:             null,  // { x, y, w, h } — posición y tamaño actuales en JS puro
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

// ─── MOVIMIENTO PRINCIPAL ──────────────────────────────────────────────────────
export function lgMoveTo(activeBtn) {
  if (!lgIndicator || !activeBtn) return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { bg: destBg, border: destBorder } = resolveColor(activeBtn);
  const destRect = getBtnRect(activeBtn);
  if (!destRect.width || !destRect.height) return;

  // ── Primera vez ───────────────────────────────────────────────────────────
  if (!lgState.initDone) {
    applyColor(destBg, destBorder);
    applyRect(destRect);
    lgIndicator.style.transform = 'none';
    if (lgRefraction) lgRefraction.style.transform = 'none';
    lgIndicator.style.opacity = '1';
    if (lgRefraction) lgRefraction.style.opacity = '1';
    lgState.cur = { x: destRect.left, y: destRect.top, w: destRect.width, h: destRect.height };
    lgState.currentBtn = activeBtn;
    lgState.initDone   = true;
    return;
  }

  if (lgState.currentBtn === activeBtn) return;

  // ── Leer origen desde lgState.cur ────────────────────────────────────────
  // Si hay animación corriendo, leer la posición visual interpolada del transform.
  // Para el tamaño usamos lgState.cur.w/h (sin distorsión de escala animada).
  let fromX = lgState.cur?.x ?? destRect.left;
  let fromY = lgState.cur?.y ?? destRect.top;
  const fromW = lgState.cur?.w ?? destRect.width;
  const fromH = lgState.cur?.h ?? destRect.height;

  if (lgState.currentAnim && lgState.currentAnim.playState === 'running') {
    const matrix = new DOMMatrix(getComputedStyle(lgIndicator).transform);
    fromX = (lgState.cur?.x ?? destRect.left) + matrix.m41;
    fromY = (lgState.cur?.y ?? destRect.top)  + matrix.m42;
    // Nota: fromW/fromH intencionalmente NO se leen del matrix.m11/m22
    // para evitar propagar distorsiones de elongación al próximo viaje.
  }

  // Cancelar animaciones previas
  if (lgState.currentAnim)     { lgState.currentAnim.cancel();     lgState.currentAnim     = null; }
  if (lgState.currentRefrAnim) { lgState.currentRefrAnim.cancel(); lgState.currentRefrAnim = null; }

  // Guardar nuevo destino como estado
  lgState.cur        = { x: destRect.left, y: destRect.top, w: destRect.width, h: destRect.height };
  lgState.currentBtn = activeBtn;

  // ── Posicionar en origen con tamaño DESTINO ───────────────────────────────
  // El cambio de tamaño ocurre aquí, cubierto por la compresión inicial (scale 0.86).
  // El usuario no lo percibe porque la gota arranca achicada de todas formas.
  // Esto elimina el salto de tamaño en onfinish.
  Object.assign(lgIndicator.style, {
    left: fromX + 'px', top: fromY + 'px',
    width: destRect.width + 'px', height: destRect.height + 'px',
    transform: 'none',
  });
  if (lgRefraction) {
    Object.assign(lgRefraction.style, {
      left: fromX + 'px', top: fromY + 'px',
      width: destRect.width + 'px', height: destRect.height + 'px',
      transform: 'none',
    });
  }

  // Reduced motion
  if (prefersReduced) {
    applyColor(destBg, destBorder);
    applyRect(destRect);
    return;
  }

  const fromBg     = readCurrentBg();
  const fromBorder = readCurrentBorder();

  const dx = destRect.left - fromX;
  const dy = destRect.top  - fromY;
  const isHorizontal = Math.abs(dx) >= Math.abs(dy);

  // Overshoot proporcional a la distancia, máx 8px
  const dist      = Math.sqrt(dx * dx + dy * dy);
  const ovAmt     = Math.min(dist * 0.07, 8);
  const ovX       = dist > 0 ? (dx / dist) * ovAmt : 0;
  const ovY       = dist > 0 ? (dy / dist) * ovAmt : 0;

  // Ancho/alto intermedios: promedio entre origen y destino.
  // El indicator ya tiene width=destW, así que el scaleX para mostrar midW es midW/destW.
  // Mismo para Y. Esto hace que en la mitad del viaje la gota tenga el tamaño
  // exactamente intermedio entre los dos botones — efecto de transición de masa real.
  const midW   = (fromW + destRect.width)  / 2;
  const midH   = (fromH + destRect.height) / 2;
  const midSX  = destRect.width  > 0 ? midW / destRect.width  : 1;
  const midSY  = destRect.height > 0 ? midH / destRect.height : 1;

  const DUR = 500;

  const anim = lgIndicator.animate([
    {
      // t=0: comprimida uniformemente — tapa el reposicionamiento inicial
      transform: 'translate(0px, 0px) scale(0.86)',
      offset: 0,
      easing: 'cubic-bezier(0.12, 0, 0.0, 1)',
    },
    {
      // t=0.46: tamaño intermedio real entre fromW y destW en la mitad del viaje
      transform: `translate(${(dx * 0.5).toFixed(2)}px, ${(dy * 0.5).toFixed(2)}px) scaleX(${midSX.toFixed(4)}) scaleY(${midSY.toFixed(4)})`,
      offset: 0.46,
      easing: 'cubic-bezier(0.0, 0, 0.08, 1)',
    },
    {
      // t=0.76: llegó — overshoot leve de expansión
      transform: `translate(${(dx + ovX).toFixed(2)}px, ${(dy + ovY).toFixed(2)}px) scaleX(1.06) scaleY(0.96)`,
      offset: 0.76,
      easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
    },
    {
      // t=1: asentada en escala 1 exacta (= tamaño destino correcto)
      transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(1)`,
      offset: 1.00,
    },
  ], { duration: DUR, fill: 'none' });

  // Elevar z-index durante el viaje para pasar siempre por encima de los botones
  lgIndicator.style.zIndex = '20';
  if (lgRefraction) lgRefraction.style.zIndex = '19';

  lgState.currentAnim = anim;

  // lgRefraction: misma trayectoria, sin rebote de escala
  if (lgRefraction) {
    const refrAnim = lgRefraction.animate([
      { transform: 'translate(0px, 0px) scale(0.86)',                                                                                                          offset: 0,    easing: 'cubic-bezier(0.12, 0, 0.0, 1)' },
      { transform: `translate(${(dx * 0.5).toFixed(2)}px, ${(dy * 0.5).toFixed(2)}px) scaleX(${midSX.toFixed(4)}) scaleY(${midSY.toFixed(4)})`,               offset: 0.46, easing: 'cubic-bezier(0.0, 0, 0.08, 1)'  },
      { transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(1)`,                                                                               offset: 1.00 },
    ], { duration: DUR, fill: 'none' });

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

  // Color interpolation
  const midBg     = 'rgba(255,255,255,0.16)';
  const midBorder = 'rgba(255,255,255,0.40)';
  const t0 = performance.now();
  function colorFrame(now) {
    const ps = anim.playState;
    if (ps === 'finished' || ps === 'idle') { applyColor(destBg, destBorder); return; }
    const t = Math.min((now - t0) / DUR, 1);
    let bg, border;
    if (t < 0.46) {
      const p = t / 0.46;
      bg = lerpColor(fromBg, midBg, p); border = lerpColor(fromBorder, midBorder, p);
    } else if (t < 0.62) {
      bg = midBg; border = midBorder;
    } else {
      const p = (t - 0.62) / 0.38;
      bg = lerpColor(midBg, destBg, p); border = lerpColor(midBorder, destBorder, p);
    }
    applyColor(bg, border);
    if (t < 1) requestAnimationFrame(colorFrame);
  }
  requestAnimationFrame(colorFrame);

  anim.onfinish = () => {
    if (lgState.currentAnim === anim) lgState.currentAnim = null;
    applyColor(destBg, destBorder);
    lgIndicator.style.left      = destRect.left + 'px';
    lgIndicator.style.top       = destRect.top  + 'px';
    lgIndicator.style.transform = 'none';
    lgIndicator.style.zIndex    = '11';
    if (lgRefraction) {
      lgRefraction.style.left      = destRect.left + 'px';
      lgRefraction.style.top       = destRect.top  + 'px';
      lgRefraction.style.transform = 'none';
      lgRefraction.style.zIndex    = '10';
    }
  };

  anim.oncancel = () => {
    lgIndicator.style.transform = 'none';
    lgIndicator.style.zIndex    = '11';
    if (lgRefraction) {
      lgRefraction.style.transform = 'none';
      lgRefraction.style.zIndex    = '10';
    }
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
