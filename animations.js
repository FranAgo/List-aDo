// ─── animations.js ─────────────────────────────────────────────────────────────
// Liquid glass indicator, confetti, sonido de completado.

import { catColors } from './storage.js';

// ─── LIQUID GLASS — estado ─────────────────────────────────────────────────────
export const lgIndicator = document.getElementById('lg-indicator');
export const lgPreview   = document.getElementById('lg-preview');

export let lgCurrentBtn    = null;
export let lgInitDone      = false;
export let lgCurrentAnim   = null;
export let lgSwitching     = false;
export let lgPreviewActive = false;

// Setters — necesarios porque ES modules no permiten asignar exports desde afuera
export function setLgCurrentBtn(v)    { lgCurrentBtn    = v; }
export function setLgInitDone(v)      { lgInitDone      = v; }
export function setLgCurrentAnim(v)   { lgCurrentAnim   = v; }
export function setLgSwitching(v)     { lgSwitching     = v; }
export function setLgPreviewActive(v) { lgPreviewActive = v; }

// ─── COORDENADAS ───────────────────────────────────────────────────────────────
/**
 * Coordenadas del botón relativas a .main (contexto de posicionamiento del indicator).
 * getBoundingClientRect garantiza precisión tras cualquier reflow/relayout.
 */
export function lgGetBtnRect(btn) {
  const main = document.querySelector('.main');
  if (!main || !btn) return { left: 0, top: 0, width: 0, height: 0 };

  const rb = btn.getBoundingClientRect();
  const rm = main.getBoundingClientRect();

  return {
    left:   rb.left - rm.left,
    top:    rb.top  - rm.top,
    width:  rb.width,
    height: rb.height,
  };
}

// ─── COLOR ─────────────────────────────────────────────────────────────────────
/** Interpola linealmente entre dos colores rgba en t (0..1) */
export function lgLerpColor(from, to, t) {
  const parse = s => (s.match(/[\d.]+/g) || []).map(Number);
  const [r1=0,g1=0,b1=0,a1=0] = parse(from);
  const [r2=0,g2=0,b2=0,a2=0] = parse(to);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  const a = +(a1 + (a2 - a1) * t).toFixed(3);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function lgApplyColor(bg, border) {
  if (!lgIndicator) return;
  lgIndicator.style.background  = bg;
  lgIndicator.style.borderColor = border;
}

export function lgReadCurrentBg() {
  if (!lgIndicator) return 'rgba(200,240,96,0.32)';
  return lgIndicator.style.background || getComputedStyle(lgIndicator).backgroundColor || 'rgba(200,240,96,0.32)';
}

export function lgReadCurrentBorder() {
  if (!lgIndicator) return 'rgba(200,240,96,0.35)';
  return lgIndicator.style.borderColor || getComputedStyle(lgIndicator).borderTopColor || 'rgba(200,240,96,0.35)';
}

// ─── RESOLUCIÓN DE COLOR DESTINO ───────────────────────────────────────────────
/**
 * Resuelve el color destino a partir del nombre de categoría del botón.
 * Se llama en el momento de ejecutar (no al schedulear) para garantizar
 * que catColors ya tenga el color asignado (listas recién creadas).
 */
function lgResolveColor(btn) {
  const catName = btn?.dataset?.cat;
  if (catName && catColors[catName]) {
    const raw = catColors[catName].bg;
    const bg  = raw.replace(/([.\d]+)\)$/, (_, v) =>
      `${Math.min(parseFloat(v) * 2.5, 0.38)})`
    );
    return { bg, border: catColors[catName].border };
  }
  // "Tareas de hoy" u otro sin color asignado
  return {
    bg:     'rgba(200, 240, 96, 0.32)',
    border: 'rgba(200, 240, 96, 0.35)',
  };
}

// ─── MOVIMIENTO ────────────────────────────────────────────────────────────────
/**
 * Mueve el indicador al botón destino.
 *
 * Diseño de la animación:
 *   - El indicator viaja con su tamaño actual usando transform translate.
 *   - Al llegar hace un bounce de escala (1 → 1.06 → 0.97 → 1) — sin
 *     modificar width/height, lo que eliminaba el "squish" del tamaño.
 *   - El color interpola suavemente durante el viaje.
 *   - Primera vez: posicionamiento directo sin animación.
 */
export function lgMoveTo(activeBtn) {
  if (!lgIndicator || !activeBtn) return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { bg: destBg, border: destBorder } = lgResolveColor(activeBtn);

  // Forzar reflow para que getBoundingClientRect sea preciso
  void lgIndicator.offsetHeight;

  const rect = lgGetBtnRect(activeBtn);
  if (!rect.width || !rect.height) return;

  // ── Primera vez: aparecer directo en posición ──────────────────────────────
  if (!lgInitDone) {
    lgApplyColor(destBg, destBorder);
    Object.assign(lgIndicator.style, {
      left:      rect.left   + 'px',
      top:       rect.top    + 'px',
      width:     rect.width  + 'px',
      height:    rect.height + 'px',
      opacity:   '1',
      transform: 'none',
    });
    lgCurrentBtn = activeBtn;
    lgInitDone   = true;
    return;
  }

  if (lgCurrentBtn === activeBtn) return;

  // ── Cancelar animación previa si la hay ────────────────────────────────────
  if (lgCurrentAnim) {
    lgCurrentAnim.cancel();
    lgCurrentAnim = null;
    // Commit estado actual al estilo inline para que la nueva animación
    // parta de donde realmente está
    lgIndicator.style.transform = 'none';
  }

  // ── Modo reducido: salto instantáneo ──────────────────────────────────────
  if (prefersReduced) {
    lgApplyColor(destBg, destBorder);
    Object.assign(lgIndicator.style, {
      left:      rect.left   + 'px',
      top:       rect.top    + 'px',
      width:     rect.width  + 'px',
      height:    rect.height + 'px',
      transform: 'none',
    });
    lgCurrentBtn = activeBtn;
    return;
  }

  // ── Animación normal ───────────────────────────────────────────────────────
  const fromBg     = lgReadCurrentBg();
  const fromBorder = lgReadCurrentBorder();

  // Posición actual del indicator (desde donde parte)
  const fromLeft = parseFloat(lgIndicator.style.left) || 0;
  const fromTop  = parseFloat(lgIndicator.style.top)  || 0;

  // Distancia a recorrer (usada para el translate inicial que "simula" estar en origen)
  const dx = fromLeft - rect.left;
  const dy = fromTop  - rect.top;

  // Mover el indicator al destino en CSS — la animación lo compensa con translate
  Object.assign(lgIndicator.style, {
    left:   rect.left   + 'px',
    top:    rect.top    + 'px',
    width:  rect.width  + 'px',
    height: rect.height + 'px',
  });

  lgCurrentBtn = activeBtn;

  const DUR = 480; // ms — más corto = más snappy, menos feo

  // Easing personalizado para el viaje: arranca rápido, llega suave + bounce
  const keyframes = [
    {
      transform: `translate(${dx}px, ${dy}px) scale(1)`,
      offset:    0,
      easing:    'cubic-bezier(0.32, 0, 0.16, 1)',
    },
    {
      // 70% del viaje completado: escala normal
      transform: `translate(${dx * 0.08}px, ${dy * 0.08}px) scale(1)`,
      offset:    0.70,
      easing:    'cubic-bezier(0.34, 1.4, 0.64, 1)',
    },
    {
      // Bounce de llegada: leve expansión
      transform: `translate(0px, 0px) scale(1.055)`,
      offset:    0.84,
      easing:    'cubic-bezier(0.25, 0.8, 0.25, 1)',
    },
    {
      // Retracción
      transform: `translate(0px, 0px) scale(0.978)`,
      offset:    0.93,
      easing:    'cubic-bezier(0.25, 0.8, 0.25, 1)',
    },
    {
      // Settle final
      transform: `translate(0px, 0px) scale(1)`,
      offset:    1.00,
    },
  ];

  const anim = lgIndicator.animate(keyframes, {
    duration: DUR,
    fill:     'none',
  });
  lgCurrentAnim = anim;

  // Interpolación de color en rAF — independiente de la animación de transform
  const midBg     = 'rgba(255, 255, 255, 0.16)';
  const midBorder = 'rgba(255, 255, 255, 0.38)';
  const startTime = performance.now();

  function colorFrame(now) {
    if (anim.playState === 'finished' || anim.playState === 'idle') {
      lgApplyColor(destBg, destBorder);
      return;
    }
    const t = Math.min((now - startTime) / DUR, 1);
    let bg, border;
    if (t < 0.40) {
      const p = t / 0.40;
      bg     = lgLerpColor(fromBg,     midBg,     p);
      border = lgLerpColor(fromBorder, midBorder, p);
    } else if (t < 0.60) {
      bg     = midBg;
      border = midBorder;
    } else {
      const p = (t - 0.60) / 0.40;
      bg     = lgLerpColor(midBg,     destBg,     p);
      border = lgLerpColor(midBorder, destBorder, p);
    }
    lgIndicator.style.background  = bg;
    lgIndicator.style.borderColor = border;
    if (t < 1) requestAnimationFrame(colorFrame);
  }
  requestAnimationFrame(colorFrame);

  anim.onfinish = () => {
    if (lgCurrentAnim === anim) lgCurrentAnim = null;
    lgApplyColor(destBg, destBorder);
    Object.assign(lgIndicator.style, {
      transform: 'none',
    });
  };

  anim.oncancel = () => {
    lgIndicator.style.transform = 'none';
  };
}

// ─── SYNC CON BOTÓN ACTIVO ─────────────────────────────────────────────────────
/**
 * Busca el botón activo en el cat-bar y mueve el indicator a él.
 * Siempre seguro de llamar aunque el layout haya cambiado.
 */
export function lgSyncWithActiveBtn() {
  if (lgSwitching) return;
  const catBar = document.getElementById('cat-bar');
  if (!catBar) return;

  const activeBtn = catBar.querySelector('.cat-btn.active');

  if (!activeBtn) {
    if (lgIndicator) lgIndicator.style.opacity = '0';
    catBar.classList.remove('lg-active');
    lgCurrentBtn = null;
    lgInitDone   = false;
    return;
  }

  catBar.classList.add('lg-active');
  if (lgIndicator) lgIndicator.style.opacity = '1';
  lgMoveTo(activeBtn);
}

// ─── RESIZE OBSERVER ───────────────────────────────────────────────────────────
const lgResizeObserver = new ResizeObserver(() => {
  if (!lgInitDone) return;
  // Forzar reposicionamiento limpio al cambiar tamaño
  lgInitDone   = false;
  lgCurrentBtn = null;
  setTimeout(lgSyncWithActiveBtn, 50);
});

export function lgStartObserving() {
  const catBar = document.getElementById('cat-bar');
  if (catBar) lgResizeObserver.observe(catBar);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      lgInitDone   = false;
      lgCurrentBtn = null;
      setTimeout(lgSyncWithActiveBtn, 50);
    });
  }
}

// ─── HOVER PREVIEW ─────────────────────────────────────────────────────────────
export function lgShowPreview(btn) {
  if (!lgPreview || !lgInitDone) return;
  if (btn.classList.contains('active')) return;
  const rect = lgGetBtnRect(btn);
  Object.assign(lgPreview.style, {
    left:    rect.left   + 'px',
    top:     rect.top    + 'px',
    width:   rect.width  + 'px',
    height:  rect.height + 'px',
    opacity: '1',
  });
  lgPreviewActive = true;
}

export function lgHidePreview() {
  if (!lgPreview) return;
  lgPreview.style.opacity = '0';
  lgPreviewActive = false;
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
