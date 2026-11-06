// Counterfactual playground: an illustrative toy market (not a trading tool, not our research model).
// One world, many imagined futures. The same random market noise is replayed with and without
// your order, so every difference you see is caused by your action.
(function () {
  const root = document.getElementById("playground");
  if (!root) return;

  const REGIMES = {
    calm:     { label: "calm",     vol: 1.0, depth: 1.0 },
    choppy:   { label: "choppy",   vol: 1.7, depth: 0.65 },
    stressed: { label: "stressed", vol: 2.8, depth: 0.3 },
  };
  const PATHS = 400, TAIL = 0.95, SLICE_EVERY = 5, AFTER = 30, MAX_SLICES = 20;
  const MAX_T = MAX_SLICES * SLICE_EVERY + AFTER;
  const REFERENCE = { size: 1, regime: "calm", slices: 8 };   // the "ordinary trade" we explain against

  // fixed noise so every scenario shares the same world
  function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const rand = rng(20261105);
  const gauss = () => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const Z = Array.from({ length: PATHS }, () => Float32Array.from({ length: MAX_T }, gauss));
  const MODEL_DOUBT = Float32Array.from({ length: PATHS }, () => Math.exp(0.45 * gauss()));

  const familiar = s => s.size <= 8 && s.regime !== "stressed";

  // simulate one scenario; returns paths with and without the order, and per-path cost in bps
  // s.vol / s.depth override the regime (used to split liquidity from volatility when explaining)
  function simulate(s, keepPaths, ood = !familiar(s)) {
    const R = REGIMES[s.regime], vol = s.vol ?? R.vol, depth = s.depth ?? R.depth;
    const q = s.size / s.slices, T = s.slices * SLICE_EVERY + AFTER;
    const volMin = 0.8 * vol, temp = 6 * vol * Math.sqrt(q / depth), perm = 1.5 * vol * q / depth;
    const costs = new Float64Array(PATHS), act = [], base = [];
    for (let p = 0; p < PATHS; p++) {
      const doubt = ood ? MODEL_DOUBT[p] : 1;
      let noise = 0, impact = 0, paid = 0;
      const a = keepPaths ? new Float32Array(T + 1) : null, b = keepPaths ? new Float32Array(T + 1) : null;
      for (let t = 0; t <= T; t++) {
        if (t % SLICE_EVERY === 0 && t / SLICE_EVERY < s.slices) {
          paid += noise + impact + temp * doubt;
          impact += perm * doubt;
        }
        if (keepPaths) { a[t] = noise + impact; b[t] = noise; }
        if (t < T) noise += volMin * Z[p][t];
      }
      costs[p] = paid / s.slices;
      if (keepPaths) { act.push(a); base.push(b); }
    }
    const sorted = Float64Array.from(costs).sort();
    const mean = costs.reduce((x, y) => x + y, 0) / PATHS;
    const k = Math.floor(TAIL * PATHS), tail = sorted.slice(k).reduce((x, y) => x + y, 0) / (PATHS - k);
    return { costs, sorted, mean, tail, act, base, T };
  }

  // exact Shapley attribution of the bad-day cost over four causes, against an ordinary trade
  const FACTORS = ["Order size", "Market liquidity", "Volatility", "Trading pace"];
  function explain(s) {
    const R = REGIMES[s.regime], R0 = REGIMES[REFERENCE.regime], memo = new Map();
    const value = mask => {
      if (!memo.has(mask)) {
        const c = {
          regime: s.regime,
          size: mask & 1 ? s.size : REFERENCE.size,
          depth: mask & 2 ? R.depth : R0.depth,
          vol: mask & 4 ? R.vol : R0.vol,
          slices: mask & 8 ? s.slices : REFERENCE.slices,
        };
        const ood = c.size > 8 || (s.regime === "stressed" && (mask & 6) !== 0);
        memo.set(mask, simulate(c, false, ood).tail);
      }
      return memo.get(mask);
    };
    const fact = [1, 1, 2, 6, 24], parts = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) for (let m = 0; m < 16; m++) {
      if (m & (1 << i)) continue;
      let k = 0; for (let j = 0; j < 4; j++) if (m & (1 << j)) k++;
      parts[i] += fact[k] * fact[3 - k] / fact[4] * (value(m | (1 << i)) - value(m));
    }
    return { parts, ref: value(0), total: value(15) };
  }

  // ---------- UI ----------
  const state = { size: 4, regime: "calm", slices: 4 };
  let safer = null;
  const $ = sel => root.querySelector(sel);

  function render() {
    const sim = simulate(state, true);
    drawPaths(sim);
    drawHist(sim, safer ? simulate(safer, false) : null);
    drawExplain(explain(state));
    $("#pg-size-val").textContent = state.size.toFixed(1) + " % of daily volume";
    $("#pg-slices-val").textContent = state.slices === 1 ? "all at once" : `${state.slices} slices over ${state.slices * SLICE_EVERY} min`;
    $("#pg-mean").textContent = sim.mean.toFixed(1);
    $("#pg-tail").textContent = sim.tail.toFixed(1);
    const ood = !familiar(state);
    $("#pg-badge").className = "pg-badge " + (ood ? "warn" : "ok");
    $("#pg-badge").textContent = ood
      ? "Outside the model’s experience: its imagined futures disagree. Trust it less, keep a margin."
      : "Within the model’s experience: imagined futures agree with each other.";
    if (safer) {
      const s2 = simulate(safer, false);
      $("#pg-advice").innerHTML = `Safer plan: <b>${safer.slices === 1 ? "all at once" : safer.slices + " slices"}</b>. Bad-day cost ${s2.tail.toFixed(1)} bps instead of ${sim.tail.toFixed(1)} bps; average ${s2.mean.toFixed(1)} instead of ${sim.mean.toFixed(1)}.` +
        (safer.slices === state.slices ? " Your plan is already the safest pace." : ` <button class="btn btn-sm" id="pg-apply">Use it <span class="arrow">&#8599;</span></button>`);
      const ap = $("#pg-apply"); if (ap) ap.onclick = () => { state.slices = safer.slices; $("#pg-slices").value = safer.slices; safer = null; render(); };
    } else $("#pg-advice").textContent = "";
  }

  // ----- charts -----
  const NS = "http://www.w3.org/2000/svg";
  function drawPaths(sim) {
    const W = 760, H = 260, L = 44, B = 26, Tp = 10, Rr = 10;
    const all = sim.act.slice(0, 60).concat(sim.base.slice(0, 60));
    let lo = 0, hi = 0;
    for (const a of all) for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
    lo = Math.min(lo, -10); hi = Math.max(hi, 10);
    const x = t => L + t / MAX_T * (W - L - Rr), y = v => Tp + (hi - v) / (hi - lo) * (H - Tp - B);
    const line = (a, n) => { let d = ""; for (let t = 0; t <= n; t++) d += (t ? "L" : "M") + x(t).toFixed(1) + "," + y(a[t]).toFixed(1); return d; };
    const med = arr => { const n = sim.T, m = new Float32Array(n + 1); const col = new Float32Array(arr.length); for (let t = 0; t <= n; t++) { for (let p = 0; p < arr.length; p++) col[p] = arr[p][t]; col.sort(); m[t] = col[col.length >> 1]; } return m; };
    const mA = med(sim.act), mB = med(sim.base);
    let s = "";
    for (const v of niceTicks(lo, hi)) s += `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 0 ? "#bbb" : "#f0f0f0"}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v > 0 ? "+" : ""}${v}</text>`;
    for (let t = 0; t <= MAX_T; t += 30) s += `<text x="${x(t)}" y="${H - 6}" text-anchor="middle">${t}m</text>`;
    for (let k = 0; k < state.slices; k++) s += `<line x1="${x(k * SLICE_EVERY)}" x2="${x(k * SLICE_EVERY)}" y1="${H - B}" y2="${H - B - 6}" stroke="var(--accent)" stroke-width="2"/>`;
    for (let p = 0; p < 40; p++) s += `<path d="${line(sim.act[p], sim.T)}" fill="none" stroke="#000" stroke-opacity=".07"/>`;
    let area = line(mA, sim.T); for (let t = sim.T; t >= 0; t--) area += "L" + x(t).toFixed(1) + "," + y(mB[t]).toFixed(1);
    s += `<path d="${area}Z" fill="var(--accent)" fill-opacity=".10"/>`;
    s += `<path d="${line(mB, sim.T)}" fill="none" stroke="#777" stroke-dasharray="4 3" stroke-width="1.5"/>`;
    s += `<path d="${line(mA, sim.T)}" fill="none" stroke="#000" stroke-width="2"/>`;
    s += `<text x="${x(sim.T) - 4}" y="${y(mA[sim.T]) - 8}" text-anchor="end" class="name">with your order</text>`;
    s += `<text x="${x(sim.T) - 4}" y="${y(mB[sim.T]) + 16}" text-anchor="end">same world, no order</text>`;
    s += `<text x="${L + 4}" y="${Tp + 10}">price vs arrival, bps</text>`;
    $("#pg-paths").innerHTML = `<svg viewBox="0 0 ${W} ${H}">${s}</svg>`;
  }

  function drawHist(sim, alt) {
    const W = 360, H = 200, L = 10, B = 26, Tp = 18, Rr = 10, BINS = 28;
    const src = alt ? [sim.sorted, alt.sorted] : [sim.sorted];
    let lo = Infinity, hi = -Infinity; for (const a of src) { lo = Math.min(lo, a[0]); hi = Math.max(hi, a[a.length - 1]); }
    const w = (hi - lo) / BINS || 1, x = v => L + (v - lo) / (hi - lo || 1) * (W - L - Rr);
    const hist = a => { const h = new Array(BINS).fill(0); for (const v of a) h[Math.min(BINS - 1, Math.floor((v - lo) / w))]++; return h; };
    const hA = hist(sim.sorted), hB = alt ? hist(alt.sorted) : null, top = Math.max(...hA, ...(hB || [0]));
    const y = c => H - B - c / top * (H - B - Tp);
    let s = "";
    hA.forEach((c, i) => { const v0 = lo + i * w; s += `<rect x="${x(v0) + 0.5}" y="${y(c)}" width="${Math.max(1, x(v0 + w) - x(v0) - 1)}" height="${H - B - y(c)}" fill="${v0 >= sim.sorted[Math.floor(TAIL * PATHS)] ? "var(--accent)" : "#cfcfcf"}"/>`; });
    if (hB) { let d = ""; hB.forEach((c, i) => { const v0 = lo + i * w; d += `${i ? "L" : "M"}${x(v0)},${y(c)}L${x(v0 + w)},${y(c)}`; }); s += `<path d="${d}" fill="none" stroke="#000" stroke-width="1.5"/>`; }
    s += `<line x1="${x(sim.mean)}" x2="${x(sim.mean)}" y1="${Tp - 6}" y2="${H - B}" stroke="#000" stroke-dasharray="2 2"/><text x="${x(sim.mean)}" y="${Tp - 8}" text-anchor="middle">average</text>`;
    for (const v of niceTicks(lo, hi, 5)) s += `<text x="${x(v)}" y="${H - 8}" text-anchor="middle">${v}</text>`;
    $("#pg-hist").innerHTML = `<svg viewBox="0 0 ${W} ${H}">${s}</svg>`;
  }

  function drawExplain(e) {
    const W = 360, rowH = 34, L = 130, R = 40, H = FACTORS.length * rowH + 28;
    const m = Math.max(1, ...e.parts.map(Math.abs)), x0 = L + (W - L - R) / 2, sc = (W - L - R) / 2 / m;
    let s = `<line x1="${x0}" x2="${x0}" y1="0" y2="${H - 24}" stroke="#bbb"/>`;
    FACTORS.forEach((name, i) => {
      const v = e.parts[i], y = i * rowH + 8, w = Math.abs(v) * sc;
      s += `<text class="name" x="0" y="${y + 13}">${name}</text>` +
        `<rect x="${v >= 0 ? x0 : x0 - w}" y="${y}" width="${Math.max(1, w)}" height="18" fill="${v >= 0 ? "var(--accent)" : "#9a9a9a"}"/>` +
        `<text x="${v >= 0 ? x0 + w + 4 : x0 - w - 4}" y="${y + 13}" text-anchor="${v >= 0 ? "start" : "end"}">${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}</text>`;
    });
    s += `<text x="${x0}" y="${H - 6}" text-anchor="middle">bps added (+) or saved (−) vs an ordinary trade</text>`;
    $("#pg-explain").innerHTML = `<svg viewBox="0 0 ${W} ${H}">${s}</svg>`;
    $("#pg-explain-sum").textContent = `An ordinary trade (1 % of volume, calm market, 8 slices) has a bad-day cost of ${e.ref.toFixed(1)} bps. Yours is ${e.total.toFixed(1)} bps. The bars split the difference fairly between the four causes.`;
  }

  function niceTicks(lo, hi, n = 6) {
    const raw = (hi - lo) / n, p = Math.pow(10, Math.floor(Math.log10(raw))), st = [1, 2, 5, 10].map(m => m * p).find(m => m >= raw);
    const out = []; for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) out.push(Math.round(v)); return out;
  }

  // controls
  $("#pg-size").addEventListener("input", e => { state.size = +e.target.value; safer = null; render(); });
  $("#pg-slices").addEventListener("input", e => { state.slices = +e.target.value; safer = null; render(); });
  root.querySelectorAll(".pg-regime").forEach(b => b.addEventListener("click", () => {
    state.regime = b.dataset.regime; safer = null;
    root.querySelectorAll(".pg-regime").forEach(o => o.classList.toggle("active", o === b));
    render();
  }));
  $("#pg-safer").addEventListener("click", () => {
    let best = null;
    for (let n = 1; n <= MAX_SLICES; n++) { const r = simulate({ ...state, slices: n }, false); if (!best || r.tail < best.tail) best = { n, tail: r.tail }; }
    safer = { ...state, slices: best.n }; render();
  });
  render();
})();
