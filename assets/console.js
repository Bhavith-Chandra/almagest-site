// Shared helpers for the console widgets: crisp canvases, run log, tooltips, ticks, seeded noise.
window.Con = (function () {
  const C = {
    bg: "#fff", grid: "#efefef", axis: "#d6d6d6", zero: "#9a9a9a", dim: "#8a8f96", text: "#212121", ink: "#000",
    blue: "#2110ae", amber: "#b26b00", gain: "#1f7a4d", loss: "#b3261e", bar: "#d4d7dc", barHot: "#8a919c",
    blueA: a => `rgba(33,16,174,${a})`, inkA: a => `rgba(0,0,0,${a})`,
  };

  // size a canvas to its CSS width at device pixel ratio; returns a context in CSS pixels
  function canvas(el) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!el.dataset.h) el.dataset.h = el.getAttribute("height");   // CSS height, read once
    const w = el.clientWidth, H = +el.dataset.h;
    el.style.height = H + "px";
    if (el.width !== Math.round(w * dpr) || el.height !== Math.round(H * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(H * dpr); }
    const ctx = el.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, H);
    ctx.font = "10.5px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.textBaseline = "middle";
    return { ctx, w, h: H };
  }

  function logger(pre, max = 7) {
    const lines = [];
    const stamp = () => { const d = new Date(); return d.toTimeString().slice(0, 8) + "." + String(d.getMilliseconds()).padStart(3, "0"); };
    return function log(msg, cls) {
      lines.push(`<span class="t">${stamp()}</span>  ${cls ? `<span class="${cls}">${msg}</span>` : msg}`);
      while (lines.length > max) lines.shift();
      pre.innerHTML = lines.join("\n");
    };
  }

  function tip(host) {
    const t = document.createElement("div"); t.className = "tip"; host.appendChild(t);
    return {
      show(x, y, html) {
        t.innerHTML = html; t.style.display = "block";
        const hw = host.clientWidth, tw = t.offsetWidth;
        t.style.left = Math.min(Math.max(4, x + 12), hw - tw - 4) + "px"; t.style.top = Math.max(0, y - 10) + "px";
      },
      hide() { t.style.display = "none"; },
    };
  }

  function fill(input) {
    const p = (input.value - input.min) / (input.max - input.min) * 100;
    input.style.setProperty("--fill", p + "%");
  }

  function ticks(lo, hi, n = 5) {
    const raw = (hi - lo) / n, p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const st = [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= raw);
    const out = []; for (let v = Math.ceil(lo / st) * st; v <= hi + 1e-9; v += st) out.push(+v.toFixed(6)); return out;
  }

  function rng(seed) {
    return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  // ease an animation from 0 to 1; a newer call with the same key cancels the older one
  const running = {};
  function animate(key, ms, frame) {
    const id = (running[key] = (running[key] || 0) + 1), t0 = performance.now();
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const step = now => {
      if (running[key] !== id) return;
      const k = reduce ? 1 : Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      frame(e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function grid(ctx, x0, x1, y0, y1) {
    ctx.strokeStyle = C.axis; ctx.lineWidth = 1; ctx.strokeRect(x0 + .5, y0 + .5, x1 - x0, y1 - y0);
  }

  return { C, canvas, logger, tip, fill, ticks, rng, gauss, animate, grid };
})();
