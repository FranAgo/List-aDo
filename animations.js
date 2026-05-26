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

export function setLgCurrentBtn(v)    { lgCurrentBtn    = v; }
export function setLgInitDone(v)      { lgInitDone      = v; }
export function setLgCurrentAnim(v)   { lgCurrentAnim   = v; }
export function setLgSwitching(v)     { lgSwitching     = v; }
export function setLgPreviewActive(v) { lgPreviewActive = v; }

// ─── COORDENADAS ───────────────────────────────────────────────────────────────
// El indicator vive dentro de #cat-bar (position:relative).
// offsetLeft/offsetTop dan la posición relativa al padre sin depender
// del viewport, del scroll ni de ningún ancestro externo.
export function lgGetBtnRect(btn) {
  if (!btn) return { left: 0, top: 0, width: 0, height: 0 };
  return {
    left:   btn.offsetLeft,
    top:    btn.offsetTop,
    width:  btn.offsetWidth,
    height: btn.offsetHeight,
  };
}

// ─── COLOR ─────────────────────────────────────────────────────────────────────
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
  return lgIndicator.style.background || 'rgba(200,240,96,0.32)';
}

export function lgReadCurrentBorder() {
  if (!lgIndicator) return 'rgba(200,240,96,0.35)';
  return lgIndicator.style.borderColor || 'rgba(200,240,96,0.35)';
}

// ─── COLOR DESTINO ─────────────────────────────────────────────────────────────
function lgResolveColor(btn) {
  const catName = btn?.dataset?.cat;
  if (catName && catColors[catName]) {
    const raw = catColors[catName].bg;
    const bg  = raw.replace(/([.\d]+)\)$/, (_, v) =>
      `${Math.min(parseFloat(v) * 2.5, 0.38)})`
    );
    return { bg, border: catColors[catName].border };
  }
  return { bg: 'rgba(200,240,96,0.32)', border: 'rgba(200,240,96,0.35)' };
}

// ─── MOVIMIENTO ────────────────────────────────────────────────────────────────
export function lgMoveTo(activeBtn) {
  if (!lgIndicator || !activeBtn) return;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const { bg: destBg, border: destBorder } = lgResolveColor(activeBtn);
  const rect = lgGetBtnRect(activeBtn);
  if (!rect.width || !rect.height) return;

  // ── Primera vez / reset: posicionar directo ────────────────────────────────
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

  // Cancelar animación previa
  if (lgCurrentAnim) {
    lgCurrentAnim.cancel();
    lgCurrentAnim = null;
  }
  lgIndicator.style.transform = 'none';

  // ── Reduced motion: salto directo ─────────────────────────────────────────
  if (prefersReduced) {
    lgApplyColor(destBg, destBorder);
    Object.assign(lgIndicator.style, {
      left:   rect.left   + 'px',
      top:    rect.top    + 'px',
      width:  rect.width  + 'px',
      height: rect.height + 'px',
    });
    lgCurrentBtn = activeBtn;
    return;
  }

  // ── Animación: translate desde posición actual → destino ──────────────────
  const fromBg     = lgReadCurrentBg();
  const fromBorder = lgReadCurrentBorder();
  const fromLeft   = parseFloat(lgIndicator.style.left)   || rect.left;
  const fromTop    = parseFloat(lgIndicator.style.top)    || rect.top;
  const fromW      = parseFloat(lgIndicator.style.width)  || rect.width;
  const fromH      = parseFloat(lgIndicator.style.height) || rect.height;

  const dx = fromLeft - rect.left;
  const dy = fromTop  - rect.top;

  // Mover indicator al destino — la animación compensa con translate
  Object.assign(lgIndicator.style, {
    left:   rect.left   + 'px',
    top:    rect.top    + 'px',
    width:  rect.width  + 'px',
    height: rect.height + 'px',
  });
  lgCurrentBtn = activeBtn;

  const DUR = 420;

  const anim = lgIndicator.animate([
    {
      transform: `translate(${dx}px, ${dy}px) scale(1)`,
      width:  fromW + 'px',
      height: fromH + 'px',
      offset: 0,
      easing: 'cubic-bezier(0.28, 0, 0.12, 1)',
    },
    {
      transform: `translate(0px, 0px) scale(1.048)`,
      width:  rect.width  + 'px',
      height: rect.height + 'px',
      offset: 0.82,
      easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
    },
    {
      transform: `translate(0px, 0px) scale(0.982)`,
      width:  rect.width  + 'px',
      height: rect.height + 'px',
      offset: 0.93,
    },
    {
      transform: `translate(0px, 0px) scale(1)`,
      width:  rect.width  + 'px',
      height: rect.height + 'px',
      offset: 1.00,
    },
  ], { duration: DUR, fill: 'none' });

  lgCurrentAnim = anim;

  // Interpolación de color independiente
  const midBg     = 'rgba(255,255,255,0.16)';
  const midBorder = 'rgba(255,255,255,0.38)';
  const t0 = performance.now();

  function colorFrame(now) {
    if (anim.playState === 'finished' || anim.playState === 'idle') {
      lgApplyColor(destBg, destBorder);
      return;
    }
    const t = Math.min((now - t0) / DUR, 1);
    let bg, border;
    if (t < 0.4) {
      const p = t / 0.4;
      bg = lgLerpColor(fromBg, midBg, p); border = lgLerpColor(fromBorder, midBorder, p);
    } else if (t < 0.6) {
      bg = midBg; border = midBorder;
    } else {
      const p = (t - 0.6) / 0.4;
      bg = lgLerpColor(midBg, destBg, p); border = lgLerpColor(midBorder, destBorder, p);
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
      width:  rect.width  + 'px',
      height: rect.height + 'px',
    });
  };
  anim.oncancel = () => { lgIndicator.style.transform = 'none'; };
}

// ─── SYNC CON BOTÓN ACTIVO ─────────────────────────────────────────────────────
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
