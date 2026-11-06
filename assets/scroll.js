// Scroll-driven walkthrough of a world model on the home page.
// Real history comes from market.js; worlds from worlds.js. The futures and outcomes use the same
// draws and rule arithmetic as case.js, so the numbers match the case study. The "state vector" is illustrative.
(function () {
  const sec = document.getElementById("scrolly");
  if (!sec || !window.Con || !window.MARKET || !window.WORLDS) return;
  const { C } = Con, W = window.WORLDS, F = window.FAMILIES;
  const cv = sec.querySelector("canvas"), cards = [...sec.querySelectorAll(".sc-step")], rail = [...sec.querySelectorAll(".sc-rail i")];
  const DAYS = 20, PATHS = 300, BETA = 1.6, SHOW = 12, STEPS = 6, LATENT = 32, ACCOUNT = 100000;
  const HIST = window.MARKET.sox.map(r => r[1]), DATES = window.MARKET.sox.map(r => r[0]);
  const TODAY = HIST[HIST.length - 1], PEAKI = HIST.indexOf(Math.max(...HIST));

  // ---- same draws and rule arithmetic as the case study ----
  const r = Con.rng(51126);
  const ZM = Array.from({ length: PATHS }, () => Array.from({ length: DAYS }, () => Con.gauss(r)));
  const ZA = Array.from({ length: PATHS }, () => Array.from({ length: DAYS }, () => Con.gauss(r)));
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

  // an illustrative "state vector": recent returns, volatility and drawdown over a few windows
  const LAT = (() => {
    const v = []; const n = HIST.length;
    for (let i = 0; i < LATENT; i++) {
      const win = 2 + (i % 8) * 7, a = HIST[n - 1], b = HIST[n - 1 - win];
      const feat = i < 8 ? a / b - 1 : i < 16 ? Math.abs(HIST[n - 1 - (i - 8)] / HIST[n - 2 - (i - 8)] - 1) * 6 : i < 24 ? a / Math.max(...HIST.slice(n - win - 1)) - 1 : Math.sin(i * 1.7) * 0.15;
      v.push(Math.max(-1, Math.min(1, feat * 3)));
    }
    return v;
  })();

  // ---- helpers ----
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const seg = (p, i) => clamp(p * STEPS - i);                 // 0..1 progress inside step i
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const usd = f => { const v = Math.round(f * ACCOUNT / 100) * 100; return (v >= 0 ? "+" : "−") + "$" + Math.abs(v).toLocaleString("en-US"); };
  const mono = (px, wt = 400) => `${wt} ${px}px 'IBM Plex Mono', ui-monospace, monospace`;

  function draw(p) {
    cv.dataset.h = cv.parentElement.clientHeight;
    const { ctx, w, h } = Con.canvas(cv);
    const narrow = w < 760;
    const X0 = narrow ? 54 : Math.max(w * 0.36, 400), XH = narrow ? w - 16 : w - 250, T = narrow ? h * 0.42 : 96, B = h - 70;
    const xs = X0 + (XH - X0) * (narrow ? 0.55 : 0.5);
    const xh = i => X0 + i / (HIST.length - 1) * (xs - X0), xf = d => xs + d / DAYS * (XH - xs);
    let lo = Math.min(...HIST), hi = Math.max(...HIST);
    IDX.forEach(I => I.paths.slice(0, SHOW).forEach(a => a.forEach(v => { lo = Math.min(lo, v); hi = Math.max(hi, v); })));
    lo *= 0.97; hi *= 1.02;
    const y = v => T + (hi - v) / (hi - lo) * (B - T);
    const s = [0, 1, 2, 3, 4, 5].map(i => seg(p, i));

    // engineering paper: dot grid, registration marks, frame, HUD
    ctx.fillStyle = "rgba(0,0,0,0.07)";
    for (let gx = 16; gx < w; gx += 24) for (let gy = 16; gy < h; gy += 24) ctx.fillRect(gx, gy, 1, 1);
    ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1;
    for (const [cx, cy] of [[20, 20], [w - 20, 20], [20, h - 20], [w - 20, h - 20]]) { ctx.beginPath(); ctx.moveTo(cx - 6, cy + .5); ctx.lineTo(cx + 6, cy + .5); ctx.moveTo(cx + .5, cy - 6); ctx.lineTo(cx + .5, cy + 6); ctx.stroke(); }
    ctx.font = mono(10.5); ctx.fillStyle = C.dim; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    if (!narrow) {
      ctx.fillText(`^SOX DAILY CLOSE · ${DATES[0]} → 2026-11-05 · LAST ${TODAY.toLocaleString("en-US")}`, X0, 34);
      ctx.fillText(`STEP ${Math.min(STEPS, Math.floor(p * STEPS) + 1)} / ${STEPS}`, X0, 50);
    }

    // axes (fade in with step 1)
    const ax = ease(clamp(s[0] * 3));
    ctx.globalAlpha = ax;
    ctx.textAlign = "right";
    for (const v of Con.ticks(lo, hi, 5)) {
      ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(X0, Math.round(y(v)) + .5); ctx.lineTo(XH, Math.round(y(v)) + .5); ctx.stroke();
      ctx.fillStyle = C.dim; ctx.fillText(Math.round(v).toLocaleString("en-US"), X0 - 8, y(v));
    }
    ctx.strokeStyle = C.axis; ctx.beginPath(); ctx.moveTo(X0, B + .5); ctx.lineTo(XH, B + .5); ctx.stroke();
    ctx.textAlign = "center"; ctx.fillStyle = C.dim;
    let lastM = ""; DATES.forEach((d, i) => { const m = d.slice(5, 7); if (m !== lastM) { lastM = m; if (narrow && +m % 2) return; ctx.fillText(new Date(d + "T12:00:00Z").toLocaleString("en-US", { month: "short", timeZone: "UTC" }), xh(i), B + 16); } });
    ctx.globalAlpha = 1;

    // 1 · the real history draws itself
    const hn = Math.max(1, Math.floor(ease(s[0]) * (HIST.length - 1)));
    const g = ctx.createLinearGradient(0, T, 0, B); g.addColorStop(0, "rgba(0,0,0,0.07)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.beginPath(); ctx.moveTo(xh(0), B); for (let i = 0; i <= hn; i++) ctx.lineTo(xh(i), y(HIST[i])); ctx.lineTo(xh(hn), B); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); for (let i = 0; i <= hn; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, xh(i), y(HIST[i])); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(xh(hn), y(HIST[hn]), 3.5, 0, 7); ctx.fill();
    if (hn >= PEAKI && s[0] > 0.6) { ctx.globalAlpha = clamp((s[0] - 0.6) * 4); ctx.font = mono(10.5); ctx.textAlign = "left"; ctx.fillText(`peak ${Math.round(HIST[PEAKI]).toLocaleString("en-US")} · 22 Jun`, xh(PEAKI) + 8, y(HIST[PEAKI]) - 2); ctx.globalAlpha = 1; }
    if (s[0] >= 1) { // today marker
      ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(xs + .5, T - 26); ctx.lineTo(xs + .5, B); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = mono(10.5, 600); ctx.fillStyle = C.ink; ctx.textAlign = "left"; ctx.fillText("TODAY · 5 NOV", xs + 6, T - 26);
    }

    // 2 · encode: the last 60 days stream into a 32-number state
    const cell = narrow ? 7 : 10, gap = 2, COLS = 4, ROWS = LATENT / COLS, colH = ROWS * (cell + gap), blkW = COLS * (cell + gap);
    const shrink = 1 - 0.55 * ease(clamp(s[3] * 2));
    const cy0 = clamp(y(TODAY) - colH / 2 - 70, T + 10, B - colH), cx = xs - blkW - 14;
    const cellX = i => cx + (i % COLS) * (cell + gap), cellY = i => cy0 + Math.floor(i / COLS) * (cell + gap);
    if (s[1] > 0) {
      const n = HIST.length;
      for (let i = 0; i < 60; i++) {
        const t = ease(clamp((s[1] - i / 60 * 0.55) / 0.45)); if (t <= 0 || t >= 1) continue;
        const sx = xh(n - 60 + i), sy = y(HIST[n - 60 + i]), ex = cellX(i % LATENT) + cell / 2, ey = cellY(i % LATENT) + cell / 2;
        const mx = (sx + ex) / 2, my = Math.min(sy, ey) - 40;
        const bx = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * mx + t * t * ex, by = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * my + t * t * ey;
        ctx.fillStyle = C.blueA(0.75); ctx.fillRect(bx - 1.5, by - 1.5, 3, 3);
      }
      LAT.forEach((v, i) => {
        const on = clamp((s[1] - 0.35 - i / LATENT * 0.4) * 5); if (on <= 0) return;
        ctx.globalAlpha = on;
        if (i === 0) { ctx.fillStyle = "#fff"; ctx.fillRect(cx - 3, cy0 - 3, blkW + 4, colH + 4); }
        ctx.fillStyle = v >= 0 ? hexA("#1f7a4d", 0.15 + 0.75 * v) : hexA("#b3261e", 0.15 + 0.75 * -v);
        const cs = cell * shrink;
        ctx.fillRect(cellX(i), cellY(i), cs, cs);
        ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.strokeRect(cellX(i) + .5, cellY(i) + .5, cs - 1, cs - 1);
        ctx.globalAlpha = 1;
      });
      const lab = clamp((s[1] - 0.6) * 3) * (1 - clamp((s[3] - 0.15) * 4));
      if (lab > 0 && !narrow) {
        ctx.globalAlpha = lab; ctx.font = mono(10.5); ctx.fillStyle = C.ink; ctx.textAlign = "left";
        ctx.textAlign = "right"; ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.fillRect(cx - 290, cy0 - 6, 282, 34); ctx.fillStyle = C.ink;
        ctx.fillText("STATE  z = [" + LAT.slice(0, 4).map(v => v.toFixed(2)).join(", ") + ", …]", cx - 10, cy0 + 4);
        ctx.fillStyle = C.dim; ctx.fillText("32 numbers summarising the last 60 days", cx - 10, cy0 + 20);
        ctx.strokeStyle = "rgba(0,0,0,.3)"; ctx.strokeRect(cx - 3.5, cy0 - 3.5, blkW + 5, colH + 5);
        ctx.beginPath(); ctx.moveTo(cx + blkW + 2, cy0 + colH / 2); ctx.lineTo(xs - 2, y(TODAY)); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // 3 · act: an action docks into the state
    if (s[2] > 0) {
      const t = ease(s[2]), fade = 1 - clamp((s[3] - 0.2) * 3);
      const bw = narrow ? 170 : 236, bh = 46, bx = cx + blkW - bw - (1 - t) * 60, by = cy0 + colH + 26;
      ctx.globalAlpha = t * Math.max(0.25, fade);
      ctx.fillStyle = "#fff"; ctx.strokeStyle = C.blue; ctx.lineWidth = 1.2; ctx.fillRect(bx, by, bw, bh); ctx.strokeRect(bx + .5, by + .5, bw, bh);
      ctx.font = mono(10, 600); ctx.fillStyle = C.blue; ctx.textAlign = "left"; ctx.fillText("ACTION  a", bx + 10, by + 14);
      ctx.font = mono(narrow ? 9.5 : 10.5); ctx.fillStyle = C.ink; ctx.fillText(narrow ? "buy $100k · stop −15 %" : "buy $100,000 of chips · stop −15 %", bx + 10, by + 32);
      const ax0 = cx + blkW / 2; ctx.strokeStyle = C.blue; ctx.beginPath(); ctx.moveTo(ax0, by); ctx.lineTo(ax0, cy0 + colH + 6); ctx.stroke();
      ctx.fillStyle = C.blue; ctx.beginPath(); ctx.moveTo(ax0, cy0 + colH + 1); ctx.lineTo(ax0 - 4, cy0 + colH + 8); ctx.lineTo(ax0 + 4, cy0 + colH + 8); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 4 · roll out: eighteen worlds branch from the state
    if (s[3] > 0) {
      const fd = ease(s[3]) * DAYS, focus = s[4] > 0 ? ease(clamp(s[4] * 2)) : 0;
      W.forEach((wd, k) => {
        const col = F[wd.fam].color, isF = k === FOCUS, dimA = isF ? 1 : 1 - 0.85 * focus;
        for (let q = 0; q < SHOW; q++) {
          const a = IDX[k].paths[q]; ctx.beginPath(); ctx.moveTo(xf(0), y(a[0]));
          for (let d = 1; d <= Math.floor(fd); d++) ctx.lineTo(xf(d), y(a[d]));
          const fr = fd - Math.floor(fd); if (fr > 0 && fd < DAYS) { const d = Math.floor(fd); ctx.lineTo(xf(d + fr), y(a[d] + (a[d + 1] - a[d]) * fr)); }
          ctx.strokeStyle = hexA(col, 0.16 * dimA); ctx.lineWidth = 1; ctx.stroke();
        }
        const m = IDX[k].med; ctx.beginPath(); ctx.moveTo(xf(0), y(m[0]));
        for (let d = 1; d <= Math.floor(fd); d++) ctx.lineTo(xf(d), y(m[d]));
        ctx.strokeStyle = hexA(col, (isF && focus > 0 ? 1 : 0.8) * dimA); ctx.lineWidth = 0.8 + wd.p * 12 + (isF ? focus * 1.5 : 0); ctx.stroke();
      });
      if (!narrow) {
        const n = Math.round(ease(s[3]) * W.length * PATHS);
        ctx.font = mono(11, 600); ctx.fillStyle = C.ink; ctx.textAlign = "left";
        ctx.globalAlpha = 1 - focus;
        ctx.fillText(`${n.toLocaleString("en-US")} futures imagined`, xs + 6, T - 10);
        ctx.font = mono(10.5); ctx.fillStyle = C.dim; ctx.fillText(`18 worlds × 300 · next 20 trading days`, xs + 6, T + 6);
        ctx.globalAlpha = 1;
      }
    }

    // 5 · explain: one world opened up, cause by cause
    if (s[4] > 0) {
      const wd = W[FOCUS], col = F[wd.fam].color, m = IDX[FOCUS].med;
      const nodes = [[1, wd.chain[0]], [4, wd.chain[1]], [8, wd.chain[2]], [14, wd.chain[3]]];
      ctx.font = mono(narrow ? 9.5 : 10.5);
      nodes.forEach(([d, txt], i) => {
        if (narrow && i === 2) return;
        const t = clamp((s[4] - 0.15 - i * 0.17) * 5); if (t <= 0) return;
        const px = xf(d), py = y(m[d]), up = narrow ? i !== 1 : i % 2 === 0, ly = py + (up ? -1 : 1) * (narrow ? 40 : 54) * t;
        const tw = ctx.measureText(txt).width + 14;
        ctx.globalAlpha = t;
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, ly); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, 3.5, 0, 7); ctx.fill();
        const bx = clamp(px - tw / 2, 4, w - tw - 4);
        ctx.fillStyle = "#fff"; ctx.fillRect(bx, ly - 10, tw, 20); ctx.strokeStyle = col; ctx.strokeRect(bx + .5, ly - 9.5, tw, 20);
        ctx.fillStyle = C.ink; ctx.textAlign = "left"; ctx.fillText(txt, bx + 7, ly + .5);
        ctx.globalAlpha = 1;
      });
      if (!narrow) {
        ctx.globalAlpha = clamp((s[4] - 0.1) * 4) * (1 - clamp((s[5] - 0.1) * 4));
        ctx.font = mono(11, 600); ctx.fillStyle = col; ctx.textAlign = "left";
        ctx.fillText(`WORLD ${FOCUS + 1} · ${wd.name.toUpperCase()} · ${Math.round(wd.p * 100)} % LIKELY`, xs + 6, T - 10);
        ctx.globalAlpha = 1;
      }
    }

    // 6 · decide: every outcome drops into a distribution, then the rule is fixed
    if (s[5] > 0 && !narrow) {
      const HX = XH + 40, mid = (T + B) / 2, sc = (B - T) / 0.7, py = v => mid - clamp(v, -0.35, 0.35) * sc, binH = 7;
      const t1 = ease(clamp(s[5] / 0.5)), t2 = ease(clamp((s[5] - 0.55) / 0.4));
      ctx.strokeStyle = C.axis; ctx.beginPath(); ctx.moveTo(HX - 6, T); ctx.lineTo(HX - 6, B); ctx.stroke();
      ctx.font = mono(10); ctx.fillStyle = C.dim; ctx.textAlign = "right";
      for (const v of [-0.3, -0.15, 0, 0.15, 0.3]) { ctx.fillText(v === 0 ? "$0" : usd(v).replace("000", "k").replace(",", ""), HX - 10, py(v)); if (v === 0) { ctx.strokeStyle = C.zero; ctx.beginPath(); ctx.moveTo(HX - 6, py(0) + .5); ctx.lineTo(w - 24, py(0) + .5); ctx.stroke(); } }
      ctx.textAlign = "left"; ctx.fillStyle = C.ink; ctx.font = mono(10.5, 600); ctx.fillText("RESULT AFTER 4 WEEKS", HX, T - 26);
      const binOf = v => Math.round(clamp(v, -0.34, 0.34) / (binH / sc));
      const maxCnt = Math.max(...["a", "b"].map(key => { const c = {}; DOTS.forEach(dt => { const b = binOf(dt[key]); c[b] = (c[b] || 0) + 1; }); return Math.max(...Object.values(c)); }));
      const gapX = Math.min(4.5, (w - 30 - HX) / maxCnt);
      const slot = (key) => { const cnt = {}; return DOTS.map(dt => { const b = binOf(dt[key]); cnt[b] = (cnt[b] || 0) + 1; return [HX + (cnt[b] - 1) * gapX, mid - b * binH]; }); };
      const A = slot("a"), Bs = slot("b");
      DOTS.forEach((dt, i) => {
        const end = IDX[dt.k].paths[dt.p][DAYS], sx = xf(DAYS), sy = y(end);
        const [ax2, ay2] = A[i], [bx2, by2] = Bs[i];
        const x = t2 > 0 ? ax2 + (bx2 - ax2) * t2 : sx + (ax2 - sx) * t1, yy = t2 > 0 ? ay2 + (by2 - ay2) * t2 : sy + (ay2 - sy) * t1;
        const v = t2 > 0 ? dt.b : dt.a;
        ctx.fillStyle = v >= 0 ? "rgba(31,122,77,.8)" : "rgba(179,38,30,.75)"; ctx.beginPath(); ctx.arc(Math.min(x, w - 20), yy, 1.8, 0, 7); ctx.fill();
      });
      const S0 = SUM[0], S1 = SUM[1], k = t2;
      ctx.font = mono(10.5); ctx.fillStyle = C.ink; ctx.textAlign = "left";
      ctx.globalAlpha = t1;
      ctx.fillText(k > 0.5 ? "STURDIER RULE" : "YOUR RULE", HX, B + 18);
      ctx.fillStyle = C.dim; ctx.fillText(`expected ${usd(k > 0.5 ? S1.exp : S0.exp)}`, HX, B + 34);
      ctx.fillStyle = C.loss; ctx.fillText(`worst 1 in 10 ${usd(k > 0.5 ? S1.bad : S0.bad)}`, HX, B + 50);
      ctx.globalAlpha = 1;
    }

    // step cards and progress rail
    const cur = Math.min(STEPS - 1, Math.floor(p * STEPS));
    cards.forEach((c, i) => c.classList.toggle("on", i === cur));
    rail.forEach((d, i) => d.classList.toggle("on", i <= cur));
  }

  let pending = false, last = -1;
  function progress() {
    const r = sec.getBoundingClientRect(), total = sec.offsetHeight - innerHeight;
    return clamp(-r.top / total);
  }
  function tick() { pending = false; const p = progress(); if (Math.abs(p - last) > 1e-4) { last = p; draw(p); } }
  addEventListener("scroll", () => { if (!pending) { pending = true; requestAnimationFrame(tick); } }, { passive: true });
  addEventListener("resize", () => { last = -1; tick(); });
  tick();
})();
