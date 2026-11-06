// Scroll-driven walkthrough of a world model (case study).
// Real history comes from market.js; worlds from worlds.js. Futures and rule outcomes use the same draws and
// arithmetic as case.js, so the numbers match the case study. The state vector, its feature groups and the
// model schematic are illustrations of the method, not a trained model.
(function () {
  const sec = document.getElementById("scrolly");
  if (!sec || !window.Con || !window.MARKET || !window.WORLDS) return;
  const { C } = Con, W = window.WORLDS, F = window.FAMILIES;
  const cv = sec.querySelector("canvas"), cards = [...sec.querySelectorAll(".sc-step")], flow = [...sec.querySelectorAll(".sc-flow span")];
  const STEPS = cards.length, NAMES = ["STATE", "ENCODE", "ACT", "ROLL OUT", "AUDIT", "EXPLAIN", "LOOK INSIDE", "DECIDE"];
  const DAYS = 20, PATHS = 300, BETA = 1.6, SHOW = 12, LATENT = 32, ACCOUNT = 100000;
  const HIST = window.MARKET.sox.map(r => r[1]), DATES = window.MARKET.sox.map(r => r[0]);
  const TODAY = HIST[HIST.length - 1], PEAKI = HIST.indexOf(Math.max(...HIST));

  // ---- same draws and rule arithmetic as the case study ----
  const rr = Con.rng(51126);
  const ZM = Array.from({ length: PATHS }, () => Array.from({ length: DAYS }, () => Con.gauss(rr)));
  const ZA = Array.from({ length: PATHS }, () => Array.from({ length: DAYS }, () => Con.gauss(rr)));
  const moves = (w, p, d) => { const j = w.jumps.find(x => x.day === d); return [w.mkt.mu + w.mkt.vol * ZM[p][d] + (j ? j.mkt : 0), w.ai.mu + w.ai.vol * ZA[p][d] + (j ? j.ai : 0)]; };
  const IDX = W.map(w => {
    const paths = [];
    for (let p = 0; p < PATHS; p++) { const a = [TODAY]; for (let d = 0; d < DAYS; d++) { const [m, ai] = moves(w, p, d); a.push(a[d] * (1 + BETA * m + ai)); } paths.push(a); }
    const med = []; for (let d = 0; d <= DAYS; d++) { const c = paths.map(a => a[d]).sort((x, y) => x - y); med.push(c[PATHS >> 1]); }
    return { paths, med };
  });
  function ruleOut(w, s, p) {
    let eq = 1;
    for (let d = 0; d < DAYS; d++) { const [m, a] = moves(w, p, d); eq *= 1 + s.lev * BETA * m + s.lev * a - s.hedge * s.lev * BETA * m; if (eq <= 1 - s.stop) break; }
    return eq - 1;
  }
  function summary(s) {
    const pool = []; let exp = 0;
    W.forEach(w => { let m = 0; for (let p = 0; p < PATHS; p++) { const v = ruleOut(w, s, p); m += v; pool.push([v, w.p / PATHS]); } exp += w.p * m / PATHS; });
    pool.sort((a, b) => a[0] - b[0]);
    let mass = 0, acc = 0; for (const [v, wt] of pool) { if (mass >= 0.1) break; const k = Math.min(wt, 0.1 - mass); acc += v * k; mass += k; }
    return { exp, bad: acc / 0.1 };
  }
  const RULE = { lev: 1, stop: 0.15, hedge: 0 }, STURDY = { lev: 1, stop: 0.05, hedge: 1 };
  const SUM = [summary(RULE), summary(STURDY)];
  const DOTS = []; W.forEach((w, k) => { for (let p = 0; p < SHOW; p++) DOTS.push({ k, p, a: ruleOut(w, RULE, p), b: ruleOut(w, STURDY, p) }); });
  const FOCUS = W.findIndex(w => w.name === "Data-centre moratorium");

  // illustrative state: 4 groups of 8 numbers (momentum, volatility, drawdown, macro context)
  const GROUPS = ["MOMENTUM", "VOLATILITY", "DRAWDOWN", "MACRO"];
  const FAM_GROUPS = { rates: [3], ai: [0, 2], policy: [3, 2], geo: [3, 1], flow: [1, 2] };
  const LAT = (() => {
    const n = HIST.length, v = [];
    for (let i = 0; i < 8; i++) { const win = 2 + i * 8; v.push(HIST[n - 1] / HIST[n - 1 - win] - 1); }
    for (let i = 0; i < 8; i++) v.push(Math.abs(HIST[n - 1 - i] / HIST[n - 2 - i] - 1) * 5);
    for (let i = 0; i < 8; i++) { const win = 5 + i * 15; v.push(HIST[n - 1] / Math.max(...HIST.slice(n - 1 - win)) - 1); }
    [0.35, 0.2, -0.45, -0.3, 0.1, -0.2, 0.25, -0.1].forEach(x => v.push(x));   // rates falling, oil high, policy risk (illustrative)
    return v.map(x => Math.max(-1, Math.min(1, x * 2.5)));
  })();

  // ---- helpers ----
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const usd = f => { const v = Math.round(f * ACCOUNT / 100) * 100; return (v >= 0 ? "+" : "−") + "$" + Math.abs(v).toLocaleString("en-US"); };
  let S = 1;                                                     // current camera scale
  const font = (px, wt = 400) => `${wt} ${(px / Math.pow(S, 0.62)).toFixed(2)}px 'IBM Plex Mono', ui-monospace, monospace`;
  const LW = x => x / Math.sqrt(S);

  function layout(w, h) {
    const narrow = w < 760;
    const X0 = narrow ? 54 : Math.max(w * 0.38, 420), XH = narrow ? w - 16 : w - 250, T = narrow ? h * 0.46 : 110, B = h - 80;
    const xs = X0 + (XH - X0) * (narrow ? 0.55 : 0.5);
    let lo = Math.min(...HIST), hi = Math.max(...HIST);
    IDX.forEach(I => I.paths.slice(0, SHOW).forEach(a => a.forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); })));
    lo *= 0.97; hi *= 1.02;
    const y = v => T + (hi - v) / (hi - lo) * (B - T);
    const xh = i => X0 + i / (HIST.length - 1) * (xs - X0), xf = d => xs + d / DAYS * (XH - xs);
    const cell = narrow ? 7 : 10, gap = 2, COLS = 4, ROWS = 8, blkH = ROWS * (cell + gap), blkW = COLS * (cell + gap);
    const by0 = clamp(y(TODAY) - blkH / 2 - 70, T + 10, B - blkH), bx0 = xs - blkW - 14;
    const SY0 = B + 110, SY1 = SY0 + 190;
    return { narrow, X0, XH, T, B, xs, lo, hi, y, xh, xf, cell, gap, COLS, blkH, blkW, bx0, by0, SY0, SY1, w, h,
      cellX: i => bx0 + (i % COLS) * (cell + gap), cellY: i => by0 + Math.floor(i / COLS) * (cell + gap) };
  }

  function cameras(G) {
    const { X0, XH, T, B, xs, xf, y, bx0, by0, blkW, blkH, SY0, SY1, narrow, w } = G, mid = (T + B) / 2, z = narrow ? 0.8 : 1;
    const m = IDX[FOCUS].med, bcx = bx0 + blkW / 2, bcy = by0 + blkH / 2;
    return [
      { x: (X0 + XH) / 2, y: mid, s: 1 },
      { x: bcx - 70, y: bcy, s: 1 + 0.9 * z },
      { x: bcx - 30, y: bcy + 50, s: 1 + 0.8 * z },
      { x: (xs + XH) / 2 + 20, y: mid, s: 1 + 0.22 * z },
      { x: (xs + XH) / 2 - 30, y: mid, s: 1 + 0.32 * z },
      { x: xf(8), y: y(m[8]), s: 1 + 0.55 * z },
      { x: (X0 + XH) / 2, y: narrow ? SY0 + 150 : (SY0 + SY1) / 2 + 10, s: narrow ? 1 : 1.3 },
      { x: narrow ? (X0 + XH) / 2 : (X0 + w - 30) / 2, y: mid, s: narrow ? 1 : 0.93 },
    ];
  }

  function draw(p) {
    cv.dataset.h = cv.parentElement.clientHeight;
    const { ctx, w, h } = Con.canvas(cv);
    const G = layout(w, h), cams = cameras(G); G.hud = [];
    const cur = Math.min(STEPS - 1, Math.floor(p * STEPS)), t = clamp(p * STEPS - cur);
    const from = cams[Math.max(0, cur - 1)], to = cams[cur], k = ease(clamp(t / 0.4));
    const cam = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, s: Math.exp(Math.log(from.s) + (Math.log(to.s) - Math.log(from.s)) * k) };
    S = cam.s;
    const FX = G.narrow ? w / 2 : w * 0.66, FY = G.narrow ? h * 0.72 : h * 0.52;

    // paper grid in screen space
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    for (let gx = 16; gx < w; gx += 24) for (let gy = 16; gy < h; gy += 24) ctx.fillRect(gx, gy, 1, 1);

    ctx.save();
    ctx.translate(FX, FY); ctx.scale(S, S); ctx.translate(-cam.x, -cam.y);
    // how bright each layer is: the active step is full strength, the rest stays visible but quiet
    const A = (L, past = 0.3, ahead = 0.11) => (L === cur ? 1 : L < cur ? past : ahead);
    const K = L => (L < cur ? 1 : L === cur ? t : 1);
    layerAxes(ctx, G, Math.max(0.5, A(0, 0.6, 0.6)));
    layerHistory(ctx, G, A(0, 0.55), cur === 0 ? ease(clamp(t / 0.8)) : 1);
    layerLatent(ctx, G, A(1, cur >= 4 ? 0.85 : 0.4), K(1), cur);
    layerAction(ctx, G, A(2, 0.25), K(2));
    layerFutures(ctx, G, cur === 3 ? 1 : cur < 3 ? 0.1 : cur === 4 || cur === 5 ? 0.22 : 0.3, cur === 3 ? ease(clamp(t / 0.85)) : 1, cur === 3);
    if (cur === 4) layerAudit(ctx, G, t);
    layerExplain(ctx, G, A(5, 0.2, 0.08), K(5), cur === 5);
    if (!G.narrow || cur === 6) layerInside(ctx, G, A(6, 0.25, 0.1), K(6));
    layerDecide(ctx, G, A(7, 0.2, 0.1), cur === 7 ? t : 0, cur === 7);
    ctx.restore();

    // spotlight: keep the focus bright, let the rest of the scene recede
    const edge = cur === 0 || cur === 7 ? 0.25 : 0.62;
    const g = ctx.createRadialGradient(FX, FY, Math.min(w, h) * 0.22, FX, FY, Math.max(w, h) * 0.78);
    g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, `rgba(255,255,255,${edge})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // registration marks and readout (screen space)
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1;
    for (const [cx, cy] of [[20, 20], [w - 20, 20], [20, h - 20], [w - 20, h - 20]]) { ctx.beginPath(); ctx.moveTo(cx - 6, cy + .5); ctx.lineTo(cx + 6, cy + .5); ctx.moveTo(cx + .5, cy - 6); ctx.lineTo(cx + .5, cy + 6); ctx.stroke(); }
    if (!G.narrow) {
      ctx.font = "10.5px 'IBM Plex Mono', monospace"; ctx.fillStyle = C.dim; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText(`STEP ${cur + 1} / ${STEPS} · ${NAMES[cur]}`, w - 34, 34);
      ctx.fillText(`ZOOM ${cam.s.toFixed(2)}×`, w - 34, 50);
    }
    // pinned titles for the step in focus (screen space, always readable)
    if (G.hud.length) {
      const hx = G.narrow ? 18 : w * 0.42, hy = G.narrow ? h * 0.405 : 40;
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      G.hud.forEach(([txt, col, px, wt], i) => {
        ctx.font = `${wt} ${G.narrow ? px * 0.85 : px}px 'IBM Plex Mono', monospace`;
        ctx.fillStyle = "rgba(255,255,255,.85)"; const tw = ctx.measureText(txt).width; ctx.fillRect(hx - 4, hy + i * 20 - 9, tw + 8, 18);
        ctx.fillStyle = col; ctx.fillText(txt, hx, hy + i * 20);
      });
    }
    cards.forEach((c, i) => c.classList.toggle("on", i === cur));
    flow.forEach((d, i) => { d.classList.toggle("done", i < cur); d.classList.toggle("on", i === cur); });
  }

  // ---------------- layers ----------------
  function layerAxes(ctx, G, a) {
    const { X0, XH, B, y, lo, hi, xh, narrow } = G;
    ctx.globalAlpha = a; ctx.font = font(10.5); ctx.textAlign = "right"; ctx.textBaseline = "middle"; ctx.lineWidth = LW(1);
    for (const v of Con.ticks(lo, hi, 5)) { ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(X0, y(v)); ctx.lineTo(XH, y(v)); ctx.stroke(); ctx.fillStyle = C.dim; ctx.fillText(Math.round(v).toLocaleString("en-US"), X0 - 8, y(v)); }
    ctx.strokeStyle = C.axis; ctx.beginPath(); ctx.moveTo(X0, B); ctx.lineTo(XH, B); ctx.stroke();
    ctx.textAlign = "center"; ctx.fillStyle = C.dim;
    let lastM = ""; DATES.forEach((d, i) => { const m = d.slice(5, 7); if (m !== lastM) { lastM = m; if (narrow && +m % 2) return; ctx.fillText(new Date(d + "T12:00:00Z").toLocaleString("en-US", { month: "short", timeZone: "UTC" }), xh(i), B + 16); } });
    ctx.globalAlpha = 1;
  }

  function layerHistory(ctx, G, a, k) {
    const { T, B, xs, y, xh } = G, hn = Math.max(1, Math.floor(k * (HIST.length - 1)));
    ctx.globalAlpha = a;
    const g = ctx.createLinearGradient(0, T, 0, B); g.addColorStop(0, "rgba(0,0,0,0.08)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.beginPath(); ctx.moveTo(xh(0), B); for (let i = 0; i <= hn; i++) ctx.lineTo(xh(i), y(HIST[i])); ctx.lineTo(xh(hn), B); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); for (let i = 0; i <= hn; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, xh(i), y(HIST[i])); ctx.strokeStyle = C.ink; ctx.lineWidth = LW(1.7); ctx.stroke();
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(xh(hn), y(HIST[hn]), LW(3.5), 0, 7); ctx.fill();
    ctx.font = font(10.5); ctx.textAlign = "left";
    if (hn >= PEAKI) ctx.fillText(`peak ${Math.round(HIST[PEAKI]).toLocaleString("en-US")} · 22 Jun`, xh(PEAKI) + 8, y(HIST[PEAKI]) - 2);
    if (k >= 1) {
      ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = LW(1); ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(xs, T - 30); ctx.lineTo(xs, B); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = font(10.5, 600); ctx.fillText("TODAY · 5 NOV · 9,011", xs + 6, T - 30);
    }
    ctx.globalAlpha = 1;
  }

  function layerLatent(ctx, G, a, k, cur) {
    const { cell, blkW, blkH, bx0, by0, cellX, cellY, xs, y, xh, narrow } = G, n = HIST.length;
    ctx.globalAlpha = a;
    if (cur === 1) for (let i = 0; i < 60; i++) {            // particles stream from the last 60 days into the state
      const tt = ease(clamp((k - i / 60 * 0.55) / 0.45)); if (tt <= 0 || tt >= 1) continue;
      const sx = xh(n - 60 + i), sy = y(HIST[n - 60 + i]), ex = cellX(i % LATENT) + cell / 2, ey = cellY(i % LATENT) + cell / 2, mx = (sx + ex) / 2, my = Math.min(sy, ey) - 40;
      ctx.fillStyle = C.blueA(0.8);
      ctx.fillRect((1 - tt) ** 2 * sx + 2 * (1 - tt) * tt * mx + tt * tt * ex - 1.5, (1 - tt) ** 2 * sy + 2 * (1 - tt) * tt * my + tt * tt * ey - 1.5, 3, 3);
    }
    ctx.fillStyle = "#fff"; ctx.fillRect(bx0 - 4, by0 - 4, blkW + 6, blkH + 6);
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = LW(1); ctx.strokeRect(bx0 - 4, by0 - 4, blkW + 6, blkH + 6);
    LAT.forEach((v, i) => {
      const on = cur === 1 ? clamp((k - 0.35 - i / LATENT * 0.4) * 5) : 1; if (on <= 0) return;
      const emph = G.emph ? (G.emph.includes(Math.floor(i / 8)) ? 1 : 0.25) : 1;
      ctx.globalAlpha = a * on * emph;
      ctx.fillStyle = v >= 0 ? hexA("#1f7a4d", 0.18 + 0.75 * v) : hexA("#b3261e", 0.18 + 0.75 * -v);
      ctx.fillRect(cellX(i), cellY(i), cell, cell);
    });
    ctx.globalAlpha = a;
    // feature-group labels
    if (cur >= 4 || cur === 1) {
      ctx.font = font(9); ctx.textAlign = "right"; ctx.textBaseline = "middle";
      GROUPS.forEach((gname, gi) => {
        const yy = by0 + gi * 2 * (cell + G.gap) + cell; const hot = G.emph && G.emph.includes(gi);
        ctx.fillStyle = hot ? C.blue : C.dim; ctx.fillText(gname, bx0 - 10, yy);
      });
    }
    if (cur === 1 && !narrow && k > 0.6) {
      ctx.globalAlpha = a * clamp((k - 0.6) * 3); ctx.font = font(10.5); ctx.textAlign = "right"; ctx.fillStyle = C.ink;
      ctx.fillText("STATE  z = [" + LAT.slice(0, 3).map(v => v.toFixed(2)).join(", ") + ", …]", bx0 - 92, by0 + 4);
      ctx.fillStyle = C.dim; ctx.fillText("32 numbers, four groups", bx0 - 92, by0 + 20);
    }
    ctx.strokeStyle = "rgba(0,0,0,.3)"; ctx.globalAlpha = a; ctx.beginPath(); ctx.moveTo(bx0 + blkW + 2, by0 + blkH / 2); ctx.lineTo(xs, y(TODAY)); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function layerAction(ctx, G, a, k) {
    const { bx0, by0, blkW, blkH, narrow } = G, tt = ease(k);
    const bw = narrow ? 170 : 236, bh = 46, bx = bx0 + blkW - bw - (1 - tt) * 60, by = by0 + blkH + 30;
    ctx.globalAlpha = a * Math.max(0.2, tt);
    ctx.fillStyle = "#fff"; ctx.fillRect(bx, by, bw, bh); ctx.strokeStyle = C.blue; ctx.lineWidth = LW(1.2); ctx.strokeRect(bx, by, bw, bh);
    ctx.font = font(10, 600); ctx.fillStyle = C.blue; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText("ACTION  a", bx + 10, by + 14);
    ctx.font = font(narrow ? 9.5 : 10.5); ctx.fillStyle = C.ink; ctx.fillText(narrow ? "buy $100k · stop −15 %" : "buy $100,000 of chips · stop −15 %", bx + 10, by + 32);
    const ax = bx0 + blkW / 2; ctx.beginPath(); ctx.moveTo(ax, by); ctx.lineTo(ax, by0 + blkH + 8); ctx.stroke();
    ctx.fillStyle = C.blue; ctx.beginPath(); ctx.moveTo(ax, by0 + blkH + 2); ctx.lineTo(ax - 4, by0 + blkH + 9); ctx.lineTo(ax + 4, by0 + blkH + 9); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function pathTo(ctx, G, a, fd) {
    const { xf, y } = G; ctx.beginPath(); ctx.moveTo(xf(0), y(a[0]));
    for (let d = 1; d <= Math.floor(fd); d++) ctx.lineTo(xf(d), y(a[d]));
    const fr = fd - Math.floor(fd); if (fr > 0 && fd < DAYS) { const d = Math.floor(fd); ctx.lineTo(xf(d + fr), y(a[d] + (a[d + 1] - a[d]) * fr)); }
  }

  function layerFutures(ctx, G, a, k, active) {
    const fd = k * DAYS;
    W.forEach((wd, i) => {
      const col = F[wd.fam].color;
      ctx.globalAlpha = a;
      for (let q = 0; q < SHOW; q++) { pathTo(ctx, G, IDX[i].paths[q], fd); ctx.strokeStyle = hexA(col, 0.17); ctx.lineWidth = LW(1); ctx.stroke(); }
      pathTo(ctx, G, IDX[i].med, fd); ctx.strokeStyle = hexA(col, 0.85); ctx.lineWidth = LW(0.8 + wd.p * 12); ctx.stroke();
    });
    if (active) {
      G.hud.push([`${Math.round(k * W.length * PATHS).toLocaleString("en-US")} futures imagined`, C.ink, 14, 600]);
      G.hud.push(["18 worlds × 300 futures · next 20 trading days", C.dim, 11, 400]);
    }
    ctx.globalAlpha = 1;
  }

  // audit: scroll steps through every world, one at a time
  function layerAudit(ctx, G, t) {
    const i = Math.min(W.length - 1, Math.floor(t * W.length)), wd = W[i], col = F[wd.fam].color, I = IDX[i];
    G.emph = FAM_GROUPS[wd.fam];
    for (let q = 0; q < SHOW * 2; q++) { pathTo(ctx, G, I.paths[q], DAYS); ctx.strokeStyle = hexA(col, 0.22); ctx.lineWidth = LW(1); ctx.stroke(); }
    pathTo(ctx, G, I.med, DAYS); ctx.strokeStyle = col; ctx.lineWidth = LW(2.6); ctx.stroke();
    const { xf, y, T, xs, narrow } = G, ex = xf(DAYS), ey = y(I.med[DAYS]);
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ex, ey, LW(4), 0, 7); ctx.fill();
    // re-draw the state so the emphasised groups light up
    layerLatent(ctx, G, 1, 1, 4);
    G.hud.push([`AUDIT · WORLD ${String(i + 1).padStart(2, "0")} OF ${W.length} · ${F[wd.fam].name.toUpperCase()}`, C.dim, 10.5, 500]);
    G.hud.push([`${wd.name} · ${Math.round(wd.p * 100)} % likely · chips ${((I.med[DAYS] / TODAY - 1) * 100).toFixed(0)} % in 4 weeks`, col, 14, 600]);
    if (!narrow) G.hud.push([wd.chain.join("  →  "), C.ink, 11.5, 400]);
    G.hud.push([`depends on: ${FAM_GROUPS[wd.fam].map(g => GROUPS[g].toLowerCase()).join(" + ")}`, C.blue, 11, 500]);
    // leader from the state's emphasised groups to the world
    ctx.strokeStyle = hexA(col, 0.6); ctx.lineWidth = LW(1); ctx.setLineDash([3, 3]);
    const gy = G.by0 + G.emph[0] * 2 * (G.cell + G.gap) + G.cell;
    ctx.beginPath(); ctx.moveTo(G.bx0 + G.blkW + 4, gy); ctx.quadraticCurveTo(xf(6), gy, ex, ey); ctx.stroke(); ctx.setLineDash([]);
    G.emph = null;
  }

  function layerExplain(ctx, G, a, k, active) {
    const wd = W[FOCUS], col = F[wd.fam].color, m = IDX[FOCUS].med, { xf, y, narrow, xs, T } = G;
    if (active) {
      for (let q = 0; q < SHOW * 2; q++) { pathTo(ctx, G, IDX[FOCUS].paths[q], DAYS); ctx.strokeStyle = hexA(col, 0.2); ctx.lineWidth = LW(1); ctx.stroke(); }
      pathTo(ctx, G, m, DAYS); ctx.strokeStyle = col; ctx.lineWidth = LW(2.8); ctx.stroke();
      G.hud.push([`WORLD ${FOCUS + 1} OF ${W.length} · ${F[wd.fam].name.toUpperCase()}`, C.dim, 10.5, 500]);
      G.hud.push([`${wd.name} · ${Math.round(wd.p * 100)} % likely`, col, 14, 600]);
    }
    const nodes = [[1, wd.chain[0]], [4, wd.chain[1]], [8, wd.chain[2]], [14, wd.chain[3]]];
    ctx.font = font(narrow ? 9.5 : 10.5); ctx.textBaseline = "middle";
    nodes.forEach(([d, txt], i) => {
      if (narrow && i === 2) return;
      const tt = active ? clamp((k - 0.1 - i * 0.17) * 5) : 1; if (tt <= 0) return;
      const px = xf(d), py = y(m[d]), up = narrow ? i !== 1 : i % 2 === 0, ly = py + (up ? -1 : 1) * (narrow ? 40 : 54) * tt;
      const tw = ctx.measureText(txt).width + 14, bx = px - tw / 2;
      ctx.globalAlpha = a * tt;
      ctx.strokeStyle = col; ctx.lineWidth = LW(1); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, ly); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, LW(3.5), 0, 7); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillRect(bx, ly - 10, tw, 20); ctx.strokeRect(bx, ly - 10, tw, 20);
      ctx.fillStyle = C.ink; ctx.textAlign = "left"; ctx.fillText(txt, bx + 7, ly);
    });
    ctx.globalAlpha = 1;
  }

  // look inside: the model's parts, a probe of the state, and a blind spot found by reverse-engineering
  // phones: the same four parts as a U-shaped 2 × 2 flow, with the findings stacked underneath
  function layerInsideNarrow(ctx, G, a, k) {
    const { X0, XH, SY0 } = G, H = 50, gapX = 22, gapY = 34, bw = (XH - X0 - gapX) / 2, y0 = SY0 + 34;
    const pos = [[0, 0], [1, 0], [1, 1], [0, 1]], parts = [["ENCODER", "past → z"], ["STATE  z", "32 numbers"], ["DYNAMICS", "f(z, a) × 20"], ["DECODER", "z → prices"]];
    const box = i => [X0 + pos[i][0] * (bw + gapX), y0 + pos[i][1] * (H + gapY)];
    const arrow = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); const an = Math.atan2(y2 - y1, x2 - x1);
      ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 6 * Math.cos(an - 0.5), y2 - 6 * Math.sin(an - 0.5)); ctx.lineTo(x2 - 6 * Math.cos(an + 0.5), y2 - 6 * Math.sin(an + 0.5)); ctx.closePath(); ctx.fill(); };
    ctx.globalAlpha = a; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.font = font(9.5, 600); ctx.fillStyle = C.dim; ctx.fillText("INSIDE THE WORLD MODEL (SCHEMATIC)", X0, SY0 + 10);
    parts.forEach(([name, sub], i) => {
      const [bx, by] = box(i); ctx.globalAlpha = a * Math.max(0.35, clamp((k - i * 0.1) * 4));
      ctx.fillStyle = i === 2 ? "#fbfaff" : "#fff"; ctx.fillRect(bx, by, bw, H);
      ctx.strokeStyle = i === 2 ? C.blue : C.ink; ctx.lineWidth = LW(1.2); ctx.strokeRect(bx, by, bw, H);
      ctx.fillStyle = C.ink; ctx.font = font(10, 600); ctx.fillText(name, bx + 9, by + 17);
      ctx.fillStyle = C.dim; ctx.font = font(9.5); ctx.fillText(sub, bx + 9, by + 35);
    });
    ctx.globalAlpha = a; ctx.strokeStyle = C.ink; ctx.fillStyle = C.ink; ctx.lineWidth = LW(1);
    const [e0x, e0y] = box(0), [s0x, s0y] = box(1), [d0x, d0y] = box(2), [r0x, r0y] = box(3);
    arrow(e0x + bw + 2, e0y + H / 2, s0x - 3, s0y + H / 2);
    arrow(s0x + bw / 2, s0y + H + 2, d0x + bw / 2, d0y - 3);
    arrow(d0x - 2, d0y + H / 2, r0x + bw + 3, r0y + H / 2);
    const ny = r0y + H + 30, notes = [["PROBE", "drawdown cells track financing stress", C.gain, 0.35], ["BLIND SPOT", "smooth steps only: overnight gaps missed", C.loss, 0.6], ["FIX", "add a jump term to the dynamics", C.blue, 0.8]];
    notes.forEach(([lab, txt, col, at], i) => {
      const o = clamp((k - at) * 4); if (o <= 0) return;
      ctx.globalAlpha = a * o; ctx.font = font(9.5, 600); ctx.fillStyle = col; ctx.fillText(lab, X0, ny + i * 34);
      ctx.font = font(10); ctx.fillStyle = C.ink; ctx.fillText(txt, X0, ny + i * 34 + 15);
    });
    ctx.globalAlpha = 1;
  }

  function layerInside(ctx, G, a, k) {
    if (G.narrow) return layerInsideNarrow(ctx, G, a, k);
    const { X0, XH, SY0, narrow } = G, H = 64, yb = SY0 + 40;
    const parts = [["ENCODER", "60 days of prices → z"], ["STATE  z", "32 numbers"], ["DYNAMICS  f(z, a)", "one step = one day"], ["DECODER", "z → prices, 20 days"]];
    const gapX = 26, bw = (XH - X0 - gapX * 3) / 4;
    ctx.globalAlpha = a; ctx.textBaseline = "middle";
    ctx.font = font(10, 600); ctx.fillStyle = C.dim; ctx.textAlign = "left"; ctx.fillText("INSIDE THE WORLD MODEL (SCHEMATIC)", X0, SY0 + 8);
    if (k > 0 && k < 1) { G.hud.push(["LOOK INSIDE · REVERSE-ENGINEERING THE MODEL", C.dim, 10.5, 500]); G.hud.push([G.narrow ? "probe → blind spot → fix" : "probe each part → find blind spots → fix the architecture", C.ink, 13, 600]); }
    parts.forEach(([name, sub], i) => {
      const bx = X0 + i * (bw + gapX), on = clamp((k - i * 0.1) * 4);
      ctx.globalAlpha = a * Math.max(0.35, on);
      ctx.fillStyle = i === 2 ? "#fbfaff" : "#fff"; ctx.fillRect(bx, yb, bw, H);
      ctx.strokeStyle = i === 2 ? C.blue : C.ink; ctx.lineWidth = LW(1.2); ctx.strokeRect(bx, yb, bw, H);
      ctx.fillStyle = C.ink; ctx.font = font(narrow ? 9 : 11, 600); ctx.fillText(name, bx + 10, yb + 20);
      ctx.fillStyle = C.dim; ctx.font = font(narrow ? 8.5 : 10); ctx.fillText(sub, bx + 10, yb + 42);
      if (i < 3) {
        ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.moveTo(bx + bw + 3, yb + H / 2); ctx.lineTo(bx + bw + gapX - 4, yb + H / 2); ctx.stroke();
        ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(bx + bw + gapX - 3, yb + H / 2); ctx.lineTo(bx + bw + gapX - 9, yb + H / 2 - 4); ctx.lineTo(bx + bw + gapX - 9, yb + H / 2 + 4); ctx.closePath(); ctx.fill();
      }
    });
    // the dynamics are rolled forward 20 times
    const dx = X0 + 2 * (bw + gapX);
    ctx.strokeStyle = C.blue; ctx.lineWidth = LW(1); ctx.beginPath(); ctx.arc(dx + bw - 18, yb - 2, 12, Math.PI, 0); ctx.stroke();
    ctx.font = font(9.5); ctx.fillStyle = C.blue; ctx.textAlign = "right"; ctx.fillText("× 20", dx + bw - 34, yb - 8);
    // a probe on the state, a blind spot in the dynamics, and the fix
    const sx = X0 + bw + gapX, p1 = clamp((k - 0.35) * 4), p2 = clamp((k - 0.6) * 4), p3 = clamp((k - 0.8) * 5);
    ctx.textAlign = "left";
    if (p1 > 0) {
      ctx.globalAlpha = a * p1; ctx.strokeStyle = C.gain; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(sx + bw / 2, yb + H); ctx.lineTo(sx + bw / 2, yb + H + 34); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = font(10, 600); ctx.fillStyle = C.gain; ctx.fillText("PROBE", sx + 4, yb + H + 48);
      ctx.font = font(10); ctx.fillStyle = C.ink; ctx.fillText("drawdown cells track", sx + 4, yb + H + 64); ctx.fillText("financing stress", sx + 4, yb + H + 79);
    }
    if (p2 > 0) {
      ctx.globalAlpha = a * p2; ctx.strokeStyle = C.loss; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(dx + bw / 2, yb + H); ctx.lineTo(dx + bw / 2, yb + H + 34); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = font(10, 600); ctx.fillStyle = C.loss; ctx.fillText("BLIND SPOT", dx + 4, yb + H + 48);
      ctx.font = font(10); ctx.fillStyle = C.ink; ctx.fillText("smooth steps only:", dx + 4, yb + H + 64); ctx.fillText("overnight gaps missed", dx + 4, yb + H + 79);
    }
    if (p3 > 0) {
      ctx.globalAlpha = a * p3; ctx.font = font(10, 600); ctx.fillStyle = C.blue;
      ctx.fillText("FIX → add a jump term", dx + 4, yb + H + 100);
    }
    ctx.globalAlpha = 1;
  }

  function layerDecide(ctx, G, a, k, active) {
    if (G.narrow) {
      if (active) {
        const after = k > 0.55, Sx = SUM[after ? 1 : 0];
        G.hud.push([after ? "STURDIER RULE · insured, sells after −5 %" : "YOUR RULE · stop −15 %, no insurance", C.ink, 13, 600]);
        G.hud.push([`expected ${usd(Sx.exp)} · worst 1 in 10 ${usd(Sx.bad)}`, after ? C.gain : C.loss, 13, 600]);
      }
      return;
    }
    const { XH, T, B, xf, y, w } = G, HX = XH + 40, mid = (T + B) / 2, sc = (B - T) / 0.7, binH = 7, py = v => mid - clamp(v, -0.35, 0.35) * sc;
    const t1 = active ? ease(clamp(k / 0.5)) : 1, t2 = active ? ease(clamp((k - 0.55) / 0.4)) : 0;
    ctx.globalAlpha = a; ctx.lineWidth = LW(1); ctx.textBaseline = "middle";
    ctx.strokeStyle = C.axis; ctx.beginPath(); ctx.moveTo(HX - 6, T); ctx.lineTo(HX - 6, B); ctx.stroke();
    ctx.font = font(10); ctx.fillStyle = C.dim; ctx.textAlign = "right";
    for (const v of [-0.3, -0.15, 0, 0.15, 0.3]) { ctx.fillText(v === 0 ? "$0" : usd(v).replace(",000", "k"), HX - 10, py(v)); if (v === 0) { ctx.strokeStyle = C.zero; ctx.beginPath(); ctx.moveTo(HX - 6, py(0)); ctx.lineTo(w - 24, py(0)); ctx.stroke(); } }
    ctx.textAlign = "left"; ctx.fillStyle = C.ink; ctx.font = font(10.5, 600); ctx.fillText("RESULT AFTER 4 WEEKS", HX, T - 26);
    const binOf = v => Math.round(clamp(v, -0.34, 0.34) / (binH / sc));
    const maxCnt = Math.max(...["a", "b"].map(key => { const c = {}; DOTS.forEach(dt => { const b = binOf(dt[key]); c[b] = (c[b] || 0) + 1; }); return Math.max(...Object.values(c)); }));
    const gx = Math.min(4.5, (w - 30 - HX) / maxCnt);
    const slot = key => { const cnt = {}; return DOTS.map(dt => { const b = binOf(dt[key]); cnt[b] = (cnt[b] || 0) + 1; return [HX + (cnt[b] - 1) * gx, mid - b * binH]; }); };
    const P = slot("a"), Q = slot("b");
    DOTS.forEach((dt, i) => {
      const sx = xf(DAYS), sy = y(IDX[dt.k].paths[dt.p][DAYS]), [ax, ay] = P[i], [bx, by] = Q[i];
      const x = t2 > 0 ? ax + (bx - ax) * t2 : sx + (ax - sx) * t1, yy = t2 > 0 ? ay + (by - ay) * t2 : sy + (ay - sy) * t1, v = t2 > 0 ? dt.b : dt.a;
      ctx.fillStyle = v >= 0 ? "rgba(31,122,77,.8)" : "rgba(179,38,30,.75)"; ctx.beginPath(); ctx.arc(x, yy, 1.9, 0, 7); ctx.fill();
    });
    const after = t2 > 0.5, Sx = SUM[after ? 1 : 0];
    ctx.font = font(10.5); ctx.textAlign = "left";
    ctx.fillStyle = C.ink; ctx.fillText(after ? "STURDIER RULE" : "YOUR RULE", HX, B + 18);
    ctx.fillStyle = C.dim; ctx.fillText(`expected ${usd(Sx.exp)}`, HX, B + 34);
    ctx.fillStyle = C.loss; ctx.fillText(`worst 1 in 10 ${usd(Sx.bad)}`, HX, B + 50);
    ctx.globalAlpha = 1;
  }

  let pending = false, last = -1;
  const progress = () => { const r = sec.getBoundingClientRect(); return clamp(-r.top / (sec.offsetHeight - innerHeight)); };
  function tick() { pending = false; const p = progress(); if (Math.abs(p - last) > 1e-4) { last = p; draw(p); } }
  addEventListener("scroll", () => { if (!pending) { pending = true; requestAnimationFrame(tick); } }, { passive: true });
  addEventListener("resize", () => { last = -1; tick(); });
  tick();
})();
