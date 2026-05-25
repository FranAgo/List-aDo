// ─── animations.js ─────────────────────────────────────────────────────────────
// Liquid glass indicator, confetti, sonido de completado.

import { catColors } from './storage.js';

// ─── LIQUID GLASS — estado ─────────────────────────────────────────────────────
// Declarados en este módulo, exportados para que app.js y otros los lean/escriban.
export const lgIndicator = document.getElementById('lg-indicator');
export const lgPreview   = document.getElementById('lg-preview');

export let lgCurrentBtn  = null;
export let lgInitDone    = false;
export let lgCurrentAnim = null;
export let lgSwitching   = false;
export let lgPreviewActive = false;

// Setters — necesarios porque ES modules no permiten asignar exports desde afuera
export function setLgCurrentBtn(v)    { lgCurrentBtn  = v; }
export function setLgInitDone(v)      { lgInitDone    = v; }
export function setLgCurrentAnim(v)   { lgCurrentAnim = v; }
export function setLgSwitching(v)     { lgSwitching   = v; }
export function setLgPreviewActive(v) { lgPreviewActive = v; }

// ─── COORDENADAS ───────────────────────────────────────────────────────────────
/**
 * Coordenadas del botón relativas a .main (ancestro con position:relative).
 * Inset de 1px en cada lado para evitar desborde subpíxel.
 */
export function lgGetBtnRect(btn) {
  const main = document.querySelector('.main');
  const rb   = btn.getBoundingClientRect();
  const rm   = main ? main.getBoundingClientRect() : { left: 0, top: 0 };
  return {
    left:   rb.left - rm.left + 1,
    top:    rb.top  - rm.top  + 1,
    width:  rb.width  - 2,
    height: rb.height - 2,
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
  lgIndicator.style.background  = bg;
  lgIndicator.style.borderColor = border;
  lgIndicator.style.boxShadow   = '0 2px 10px rgba(0,0,0,0.35)';
}

export function lgReadCurrentBg() {
  return getComputedStyle(lgIndicator).backgroundColor || 'rgba(200,240,96,0.32)';
}

export function lgReadCurrentBorder() {
  return getComputedStyle(lgIndicator).borderTopColor || 'rgba(200,240,96,0.35)';
}

// ─── MOVIMIENTO ────────────────────────────────────────────────────────────────
/**
 * Mueve el indicador al botón destino.
 * Primera vez: aparece directo sin animación.
 * Siguientes: expand → squish+travel → impact+expand → settle.
 */
export function lgMoveTo(activeBtn, destBg, destBorder) {
  if (!lgIndicator || !activeBtn) return;

  const catBar = document.getElementById('cat-bar');
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  void catBar.offsetHeight;
  const rect = lgGetBtnRect(activeBtn);

  if (!lgInitDone) {
    lgApplyColor(destBg, destBorder);
    Object.assign(lgIndicator.style, {
      left:    rect.left   + 'px',
      top:     rect.top    + 'px',
      width:   rect.width  + 'px',
      height:  rect.height + 'px',
      opacity: '1',
      transform: 'none',
    });
    catBar.classList.add('lg-active');
    lgCurrentBtn = activeBtn;
    lgInitDone   = true;
    return;
  }

  if (lgCurrentBtn === activeBtn) return;

  if (prefersReduced) {
    lgApplyColor(destBg, destBorder);
    Object.assign(lgIndicator.style, {
      left:   rect.left   + 'px',
      top:    rect.top    + 'px',
      width:  rect.width  + 'px',
      height: rect.height + 'px',
      transform: 'none',
    });
    lgCurrentBtn = activeBtn;
    return;
  }

  if (lgCurrentAnim) {
    lgCurrentAnim.cancel();
    lgCurrentAnim = null;
  }

  const fromBg     = lgReadCurrentBg();
  const fromBorder = lgReadCurrentBorder();
  const fromLeft   = parseFloat(lgIndicator.style.left) || 0;
  const fromTop    = parseFloat(lgIndicator.style.top)  || 0;

  lgCurrentBtn = activeBtn;

  const DUR        = 900;
  const fromWidth  = parseFloat(lgIndicator.style.width)  || rect.width;
  const fromHeight = parseFloat(lgIndicator.style.height) || rect.height;

  Object.assign(lgIndicator.style, {
    left: rect.left + 'px',
    top:  rect.top  + 'px',
  });

  const dLeft = rect.left - fromLeft;
  const dTop  = rect.top  - fromTop;

  const midW = (fromWidth  + rect.width)  / 2 * 0.72;
  const midH = (fromHeight + rect.height) / 2 * 0.72;

  const keyframes = [
    {
      transform: `translate(${-dLeft}px, ${-dTop}px)`,
      width:  fromWidth  + 'px',
      height: fromHeight + 'px',
      offset: 0,
      easing: 'cubic-bezier(0.4, 0, 0.6, 1)',
    },
    {
      transform: `translate(${-dLeft}px, ${-dTop}px)`,
      width:  midW + 'px',
      height: midH + 'px',
      offset: 0.18,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
    {
      transform: `translate(${-dLeft * 0.42}px, ${-dTop * 0.42}px)`,
      width:  midW + 'px',
      height: midH + 'px',
      offset: 0.42,
      easing: 'cubic-bezier(0.2, 0, 0.4, 1)',
    },
    {
      transform: `translate(0px, 0px)`,
      width:  rect.width  + 'px',
      height: rect.height + 'px',
      offset: 0.65,
      easing: 'cubic-bezier(0.34, 1.5, 0.64, 1)',
    },
    {
      transform: `translate(0px, 0px)`,
      width:  (rect.width  * 1.10) + 'px',
      height: (rect.height * 1.10) + 'px',
      offset: 0.78,
      easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
    },
    {
      transform: `translate(0px, 0px)`,
      width:  (rect.width  * 0.98) + 'px',
      height: (rect.height * 0.98) + 'px',
      offset: 0.90,
      easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
    },
    {
      transform: `translate(0px, 0px)`,
      width:  rect.width  + 'px',
      height: rect.height + 'px',
      offset: 1.00,
    },
  ];

  lgIndicator.style.zIndex = '12';

  const anim = lgIndicator.animate(keyframes, {
    duration: DUR,
    easing:   'ease-in-out',
    fill:     'none',
  });
  lgCurrentAnim = anim;

  const midBg     = 'rgba(255, 255, 255, 0.18)';
  const midBorder = 'rgba(255, 255, 255, 0.40)';
  const startTime = performance.now();

  function colorFrame(now) {
    if (anim.playState === 'finished' || anim.playState === 'idle') {
      lgApplyColor(destBg, destBorder);
      return;
    }
    const t = Math.min((now - startTime) / DUR, 1);
    let bg, border;
    if (t < 0.35) {
      const p = t / 0.35;
      bg     = lgLerpColor(fromBg,     midBg,     p);
      border = lgLerpColor(fromBorder, midBorder, p);
    } else if (t < 0.65) {
      bg     = midBg;
      border = midBorder;
    } else {
      const p = (t - 0.65) / 0.35;
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
      width:     rect.width  + 'px',
      height:    rect.height + 'px',
      zIndex:    '10',
    });
  };
  anim.oncancel = () => {
    lgIndicator.style.transform = 'none';
    lgIndicator.style.zIndex    = '10';
  };
}

// ─── SYNC CON BOTÓN ACTIVO ─────────────────────────────────────────────────────
export function lgSyncWithActiveBtn() {
  if (lgSwitching) return;
  const catBar = document.getElementById('cat-bar');
  if (!catBar) return;

  const activeBtn = catBar.querySelector('.cat-btn.active');

  if (!activeBtn) {
    lgIndicator.style.opacity = '0';
    catBar.classList.remove('lg-active');
    lgCurrentBtn = null;
    lgInitDone   = false;
    return;
  }

  let destBg, destBorder;
  const catName = activeBtn.dataset.cat;
  if (catName && catColors[catName]) {
    const raw  = catColors[catName].bg;
    destBg     = raw.replace(/([.\d]+)\)$/, (_, v) => `${Math.min(parseFloat(v) * 2.5, 0.38)})`);
    destBorder = catColors[catName].border;
  } else {
    destBg     = 'rgba(200, 240, 96, 0.32)';
    destBorder = 'rgba(200, 240, 96, 0.35)';
  }

  catBar.classList.add('lg-active');
  lgMoveTo(activeBtn, destBg, destBorder);
}

// ─── RESIZE OBSERVER ───────────────────────────────────────────────────────────
const lgResizeObserver = new ResizeObserver(() => {
  if (!lgInitDone) return;
  lgInitDone = false;
  setTimeout(lgSyncWithActiveBtn, 50);
});

export function lgStartObserving() {
  const catBar = document.getElementById('cat-bar');
  if (catBar) lgResizeObserver.observe(catBar);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      lgInitDone = false;
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
