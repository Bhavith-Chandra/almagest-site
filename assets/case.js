// Case study: real chip-index history (market.js) branching into 18 plausible worlds (worlds.js).
// The worlds' paths and chances are illustrative judgements, not forecasts. Every world is replayed on the
// same random draws, so the differences between worlds come from the worlds themselves.
(function () {
  const root = document.getElementById("case");
  if (!root || !window.Con || !window.MARKET || !window.WORLDS) return;
  const { C } = Con, W = window.WORLDS, F = window.FAMILIES;
  const $ = s => root.querySelector(s);
  const DAYS = 20, PATHS = 300, BETA = 1.6, ACCOUNT = 100000, BUDGET = 15000;
  // the next 20 US trading days after 5 Nov 2026 (26 Nov is Thanksgiving)
  const FUT = ["Nov 6", "Nov 9", "Nov 10", "Nov 11", "Nov 12", "Nov 13", "Nov 16", "Nov 17", "Nov 18", "Nov 19", "Nov 20", "Nov 23", "Nov 24", "Nov 25", "Nov 27", "Nov 30", "Dec 1", "Dec 2", "Dec 3", "Dec 4"];

  const HIST = window.MARKET.sox.map(([d, v]) => ({ d, v }));
  const TODAY = HIST[HIST.length - 1], PREV = HIST[HIST.length - 2];
  const PEAK = HIST.reduce((a, b) => (b.v > a.v ? b : a));

  const r = Con.rng(51126);
  const ZM = Array.from({ length: PATHS }, () => Array.from({ length: DAYS }, () => Con.gauss(r)));
  const ZA = Array.from({ length: PATHS }, () => Array.from({ length: DAYS }, () => Con.gauss(r)));
  const dayMoves = (w, p, d) => {
    const j = w.jumps.find(x => x.day === d);
    return [w.mkt.mu + w.mkt.vol * ZM[p][d] + (j ? j.mkt : 0), w.ai.mu + w.ai.vol * ZA[p][d] + (j ? j.ai : 0)];
  };

  // chip-index paths for every world (independent of the rule)
  const IDX = W.map(w => {
    const paths = [];
    for (let p = 0; p < PATHS; p++) {
      const a = [TODAY.v];
      for (let d = 0; d < DAYS; d++) { const [m, ai] = dayMoves(w, p, d); a.push(a[d] * (1 + BETA * m + ai)); }
      paths.push(a);
    }
    const med = [], p10 = [], p90 = [];
    for (let d = 0; d <= DAYS; d++) {
      const col = paths.map(a => a[d]).sort((x, y) => x - y);
      med.push(col[PATHS >> 1]); p10.push(col[Math.floor(0.1 * PATHS)]); p90.push(col[Math.floor(0.9 * PATHS)]);
    }
    return { paths, med, p10, p90 };
  });

  // play the rule in one world: P&L as a fraction of the account, plus an exact split of where it came from
  function run(w, s, keep) {
    const out = [], equity = keep ? [] : null;
    let aM = 0, aA = 0, aH = 0, aS = 0, stopped = 0;
    for (let p = 0; p < PATHS; p++) {
      let eq = 1, live = true, free = 1, cm = 0, ca = 0, ch = 0;
      const e = keep && [1];
      for (let d = 0; d < DAYS; d++) {
        const [m, a] = dayMoves(w, p, d);
        const pm = s.lev * BETA * m, pa = s.lev * a, ph = -s.hedge * s.lev * BETA * m, day = pm + pa + ph;
        free *= 1 + day;
        if (live) { cm += pm * eq; ca += pa * eq; ch += ph * eq; eq *= 1 + day; if (eq <= 1 - s.stop) live = false; }  // stop checked at the close
        if (keep) e.push(eq);
      }
      if (!live) stopped++;
      out.push(eq - 1); aM += cm; aA += ca; aH += ch; aS += (eq - 1) - (free - 1);
      if (keep) equity.push(e);
    }
    const sorted = out.slice().sort((x, y) => x - y), q = f => sorted[Math.floor(f * (PATHS - 1))];
    return {
      sorted, equity, median: q(0.5), p10: q(0.1), p90: q(0.9), mean: out.reduce((x, y) => x + y, 0) / PATHS,
      win: out.filter(x => x > 0).length / PATHS, stopRate: stopped / PATHS,
      attr: { market: aM / PATHS, ai: aA / PATHS, hedge: aH / PATHS, stop: aS / PATHS },
    };
  }
  function summary(s) {
    const res = W.map(w => run(w, s, false));
    const exp = res.reduce((t, x, i) => t + W[i].p * x.mean, 0);
    const pool = []; res.forEach((x, i) => x.sorted.forEach(v => pool.push([v, W[i].p / PATHS])));
    pool.sort((a, b) => a[0] - b[0]);
    let mass = 0, acc = 0; for (const [v, wt] of pool) { if (mass >= 0.1) break; const take = Math.min(wt, 0.1 - mass); acc += v * take; mass += take; }
    return { res, exp, bad: acc / 0.1 };
  }

  const usd = (f, sign = true) => { const v = Math.round(f * ACCOUNT / 100) * 100; return (sign ? (v >= 0 ? "+" : "−") : "") + "$" + Math.abs(v).toLocaleString("en-US"); };
  const pct = (f, dp = 1) => (f >= 0 ? "+" : "−") + Math.abs(f * 100).toFixed(dp) + " %";
  const num = v => Math.round(v).toLocaleString("en-US");
  const state = { lev: 1, stop: 0.15, hedge: 0 };
  let S = null, selected = W.findIndex(w => w.name === "Data-centre moratorium"), hover = null;

  // ================= the market chart =================
  const cv = $("#mkt"), tip = Con.tip(cv.parentElement);
  let G = null;

  function drawMarket() {
    const { ctx, w, h } = Con.canvas(cv);
    const L = 58, GUT = w < 640 ? 0 : 252, R = w - GUT - 8, T = 30, B = 34, Y1 = h - B;
    const xs = L + (R - L) * 0.6;
    const xh = i => L + i / (HIST.length - 1) * (xs - L), xf = d => xs + d / DAYS * (R - xs);
    let lo = Infinity, hi = -Infinity;
    for (const p of HIST) { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); }
    for (const I of IDX) for (let d = 0; d <= DAYS; d++) { lo = Math.min(lo, I.p10[d]); hi = Math.max(hi, I.p90[d]); }
    lo *= 0.97; hi *= 1.03;
    const y = v => T + (hi - v) / (hi - lo) * (Y1 - T);
    G = { L, R, xs, xh, xf, y, T, Y1, GUT, w, hoverHist: G?.hoverHist ?? null, hoverDay: G?.hoverDay ?? null };

    // future zone
    ctx.fillStyle = "#fafafa"; ctx.fillRect(xs, T - 18, R - xs, Y1 - T + 18);
    ctx.fillStyle = C.dim; ctx.textAlign = "left"; ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.fillText("IMAGINED · NEXT 20 TRADING DAYS", xs + 8, T - 8);
    ctx.fillText("REAL · DAILY CLOSE", L + 2, T - 8);
    ctx.font = "10.5px 'IBM Plex Mono', monospace";

    // grid
    ctx.textAlign = "right";
    for (const v of Con.ticks(lo, hi, 6)) {
      ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, Math.round(y(v)) + .5); ctx.lineTo(R, Math.round(y(v)) + .5); ctx.stroke();
      ctx.fillStyle = C.dim; ctx.fillText(num(v), L - 8, y(v));
    }
    ctx.textAlign = "center";
    let lastM = "";
    HIST.forEach((p, i) => {
      const m = p.d.slice(0, 7);
      if (m !== lastM) { lastM = m; const lbl = new Date(p.d + "T12:00:00Z").toLocaleString("en-US", { month: "short", timeZone: "UTC" }); ctx.fillStyle = C.dim; ctx.fillText(lbl, xh(i), Y1 + 16); ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(xh(i) + .5, Y1); ctx.lineTo(xh(i) + .5, Y1 + 5); ctx.stroke(); }
    });
    for (const d of [5, 10, 15, 20]) { ctx.fillStyle = C.dim; ctx.fillText(FUT[d - 1], xf(d), Y1 + 16); }
    ctx.strokeStyle = C.axis; ctx.beginPath(); ctx.moveTo(L, Y1 + .5); ctx.lineTo(R, Y1 + .5); ctx.stroke();

    // real history
    const grad = ctx.createLinearGradient(0, T, 0, Y1); grad.addColorStop(0, "rgba(0,0,0,0.07)"); grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.beginPath(); ctx.moveTo(xh(0), Y1); HIST.forEach((p, i) => ctx.lineTo(xh(i), y(p.v))); ctx.lineTo(xh(HIST.length - 1), Y1); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
    ctx.beginPath(); HIST.forEach((p, i) => (i ? ctx.lineTo(xh(i), y(p.v)) : ctx.moveTo(xh(i), y(p.v)))); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6; ctx.stroke();

    // peak annotation (from the data)
    const pi = HIST.indexOf(PEAK);
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(xh(pi), y(PEAK.v), 3, 0, 7); ctx.fill();
    ctx.textAlign = "left"; ctx.fillText(`${fmtDate(PEAK.d)} peak ${num(PEAK.v)}`, xh(pi) + 7, y(PEAK.v) - 2);

    // futures: faint fans, then the typical path of each world
    const active = hover ?? null;
    W.forEach((wd, k) => {
      const col = F[wd.fam].color, I = IDX[k], dim = active != null && active !== k;
      ctx.strokeStyle = hexA(col, dim ? 0.012 : active === k ? 0.12 : 0.03); ctx.lineWidth = 1;
      for (let p = 0; p < (active === k ? 40 : 6); p++) { const a = I.paths[p]; ctx.beginPath(); a.forEach((v, d) => (d ? ctx.lineTo(xf(d), y(v)) : ctx.moveTo(xf(d), y(v)))); ctx.stroke(); }
    });
    const order = W.map((_, k) => k).sort((a, b) => (a === active) - (b === active) || (a === selected) - (b === selected));
    for (const k of order) {
      const wd = W[k], col = F[wd.fam].color, I = IDX[k], on = active === k || (active == null && selected === k);
      ctx.strokeStyle = hexA(col, active != null && !on ? 0.14 : on ? 1 : 0.62);
      ctx.lineWidth = 0.9 + wd.p * 14 + (on ? 1.2 : 0);
      ctx.beginPath(); I.med.forEach((v, d) => (d ? ctx.lineTo(xf(d), y(v)) : ctx.moveTo(xf(d), y(v)))); ctx.stroke();
      if (on) { // event marker
        for (const j of wd.jumps) { const xd = xf(j.day + 1); ctx.strokeStyle = hexA(col, 0.5); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xd + .5, T); ctx.lineTo(xd + .5, Y1); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = col; ctx.textAlign = "center"; ctx.fillText(j.label, xd, Y1 - 8); }
      }
    }

    // today marker
    ctx.strokeStyle = C.ink; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(xs + .5, T - 18); ctx.lineTo(xs + .5, Y1); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(xs, y(TODAY.v), 4, 0, 7); ctx.fill();
    ctx.textAlign = "right"; ctx.font = "600 11px 'IBM Plex Mono', monospace";
    ctx.fillText(`Today ${num(TODAY.v)}`, xs - 8, y(TODAY.v) + 14);
    ctx.font = "10.5px 'IBM Plex Mono', monospace"; ctx.fillStyle = C.loss;
    ctx.fillText(`${pct(TODAY.v / PREV.v - 1)} on the day · ${pct(TODAY.v / PEAK.v - 1, 0)} from peak`, xs - 8, y(TODAY.v) + 28);

    // right-hand labels, spread so they never overlap
    if (GUT) {
      const items = W.map((wd, k) => ({ k, y0: y(IDX[k].med[DAYS]) })).sort((a, b) => a.y0 - b.y0);
      const gap = 14.5; let prev = T - 10;
      for (const it of items) { it.y = Math.max(it.y0, prev + gap); prev = it.y; }
      const over = prev - (Y1 + 4); if (over > 0) for (const it of items) it.y -= over;
      for (let i = items.length - 2; i >= 0; i--) items[i].y = Math.min(items[i].y, items[i + 1].y - gap);
      G.labels = items;
      for (const it of items) {
        const wd = W[it.k], col = F[wd.fam].color, on = active === it.k || (active == null && selected === it.k), dim = active != null && !on;
        ctx.strokeStyle = hexA(col, dim ? 0.15 : 0.5); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(R + 2, it.y0); ctx.lineTo(R + 12, it.y); ctx.lineTo(R + 16, it.y); ctx.stroke();
        ctx.fillStyle = hexA(col, dim ? 0.3 : 1); ctx.textAlign = "left";
        ctx.font = (on ? "600 " : "") + "10.5px 'IBM Plex Mono', monospace";
        const chg = IDX[it.k].med[DAYS] / TODAY.v - 1;
        ctx.fillText(`${pct(chg, 0).padStart(6)}  ${short(wd.name)}`, R + 20, it.y);
      }
      ctx.font = "10.5px 'IBM Plex Mono', monospace";
    }

    // hover readouts
    if (G.hoverHist != null) {
      const i = G.hoverHist, p = HIST[i];
      ctx.strokeStyle = C.inkA(0.3); ctx.beginPath(); ctx.moveTo(xh(i) + .5, T); ctx.lineTo(xh(i) + .5, Y1); ctx.stroke();
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(xh(i), y(p.v), 3.5, 0, 7); ctx.fill();
    }
    if (active != null && G.hoverDay != null) {
      const d = G.hoverDay, v = IDX[active].med[d];
      ctx.strokeStyle = C.inkA(0.25); ctx.beginPath(); ctx.moveTo(xf(d) + .5, T); ctx.lineTo(xf(d) + .5, Y1); ctx.stroke();
      ctx.fillStyle = F[W[active].fam].color; ctx.beginPath(); ctx.arc(xf(d), y(v), 4, 0, 7); ctx.fill();
    }
  }
  const short = n => (n.length > 30 ? n.slice(0, 29) + "…" : n);
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const fmtDate = d => new Date(d + "T12:00:00Z").toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  cv.addEventListener("mousemove", e => {
    if (!G) return;
    const rect = cv.getBoundingClientRect(), mx = e.clientX - rect.left, my = e.clientY - rect.top;
    G.hoverHist = null; G.hoverDay = null; let k = null;
    if (mx >= G.L && mx < G.xs - 2) {
      const i = Math.max(0, Math.min(HIST.length - 1, Math.round((mx - G.L) / (G.xs - G.L) * (HIST.length - 1))));
      G.hoverHist = i; hover = null; drawMarket();
      const p = HIST[i], pr = HIST[Math.max(0, i - 1)];
      tip.show(mx, my, `<b>${fmtDate(p.d)}, ${p.d.slice(0, 4)}</b> · real close<br>${num(p.v)} <span style="color:${p.v >= pr.v ? C.gain : C.loss}">${pct(p.v / pr.v - 1)}</span>`);
      return;
    }
    if (mx >= G.xs - 2 && mx <= G.R) {
      const d = Math.max(0, Math.min(DAYS, Math.round((mx - G.xs) / (G.R - G.xs) * DAYS)));
      let best = Infinity; IDX.forEach((I, j) => { const dist = Math.abs(G.y(I.med[Math.max(d, 1)]) - my); if (dist < best) { best = dist; k = j; } });
      G.hoverDay = d;
    } else if (G.labels && mx > G.R) {
      let best = Infinity; for (const it of G.labels) { const dist = Math.abs(it.y - my); if (dist < best) { best = dist; k = it.k; } }
      G.hoverDay = DAYS;
    }
    hover = k; drawMarket();
    if (k == null) { tip.hide(); cv.style.cursor = "default"; return; }
    cv.style.cursor = "pointer";
    const wd = W[k], d = G.hoverDay, v = IDX[k].med[d], R = S.res[k];
    tip.show(Math.min(mx, G.R - 40), my, `<span style="color:${F[wd.fam].color}">● ${F[wd.fam].name}</span><br><b>${wd.name}</b> · ${Math.round(wd.p * 100)} % likely<br>
      <span style="white-space:normal;display:block;max-width:300px;color:#3e3e3e;margin:4px 0">${wd.lead}</span>
      ${d === 0 ? "Today" : FUT[d - 1]}: chip index ${num(v)} (${pct(v / TODAY.v - 1)})<br>
      Your rule, typical: <b style="color:${R.median >= 0 ? C.gain : C.loss}">${usd(R.median)}</b><br><span style="color:${C.dim}">click for the full review</span>`);
  });
  cv.addEventListener("mouseleave", () => { hover = null; if (G) { G.hoverHist = null; G.hoverDay = null; } tip.hide(); drawMarket(); });
  cv.addEventListener("click", () => { if (hover != null) select(hover, true); });

  // ================= the review =================
  const fan = $("#d-fan"), ftip = Con.tip(fan.parentElement);
  let fanData = null, hoverD = null;

  function select(k, scroll) {
    selected = k; drawMarket(); drawReview(); drawTabs();
    if (scroll) document.getElementById("detail").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function drawReview() {
    const wd = W[selected], fam = F[wd.fam], R = run(wd, state, true), I = IDX[selected];
    fanData = { wd, R };
    $("#d-k").innerHTML = `<span style="color:${fam.color}">● ${fam.name}</span> &middot; world ${selected + 1} of ${W.length} &middot; ${Math.round(wd.p * 100)} % likely`;
    $("#d-name").textContent = wd.name;
    $("#d-lead").textContent = wd.lead;
    const end = I.med[DAYS], lo = I.p10[DAYS], hi = I.p90[DAYS];
    $("#d-text").innerHTML = `
      <h4>What would have to happen</h4><p>${wd.trigger}</p>
      <h4>Why it is realistic now</h4><ul>${wd.context.map(c => `<li>${c}</li>`).join("")}</ul>
      <h4>How it reaches chip stocks</h4><p class="chain">${wd.chain.map(c => `<span class="chain-node">${c}</span>`).join('<span class="chain-arrow">→</span>')}</p>
      <p class="muted-s">In this world the chip index typically ends the four weeks near <b>${num(end)}</b> (${pct(end / TODAY.v - 1)}), with most outcomes between ${num(lo)} and ${num(hi)}.</p>
      <h4>What to watch</h4><ul>${wd.watch.map(c => `<li>${c}</li>`).join("")}</ul>
      <h4>The professional view</h4><p>${wd.take}</p>
      <h4>Your rule here</h4><p>${reading(wd, R)}</p>`;
    $("#d-stats").innerHTML = [
      ["Typical result", usd(R.median), R.median >= 0 ? "g" : "l"],
      ["Range (1 in 10 either side)", `${usd(R.p10)} to ${usd(R.p90)}`, ""],
      ["Chance of a profit", Math.round(R.win * 100) + " %", ""],
      ["Automatic sell triggered", Math.round(R.stopRate * 100) + " % of futures", ""],
    ].map(([k, v, c]) => `<div><p class="reading-k">${k}</p><p class="stat ${c}">${v}</p></div>`).join("");
    drawFan(); drawWater(R);
  }

  function reading(wd, R) {
    const A = R.attr, mkt = Math.abs(A.market) > Math.abs(A.ai), gapDown = wd.jumps.some(j => j.ai < -0.03);
    const t = [`Your rule ${R.median >= 0 ? "<b>makes money</b>" : "<b>loses money</b>"} here: typically ${usd(R.median)}, with a ${Math.round(R.win * 100)} % chance of ending in profit.`];
    t.push(mkt ? "Most of the result comes from the <b>whole market</b> moving, not from chips in particular." : "Most of the result comes from <b>chip stocks themselves</b>, not from the whole market.");
    if (gapDown && R.stopRate > 0.3) t.push("The drop arrives overnight and jumps past your automatic sell, so the loss is bigger than the limit you set.");
    else if (A.stop > 0.004) t.push(`Your automatic sell helped, saving about ${usd(A.stop, false)} on average.`);
    else if (A.stop < -0.004) t.push(`Your automatic sell cost about ${usd(-A.stop, false)}: it sold during dips that later recovered.`);
    if (mkt && R.median < 0 && state.hedge < 0.5) t.push("Insuring against the whole market would remove much of this loss.");
    if (!mkt && R.median < 0) t.push("Insurance against the whole market barely helps here; the problem is specific to chips, so investing less is the defence.");
    return t.join(" ");
  }

  function drawFan() {
    const { wd, R } = fanData, { ctx, w: Wd, h } = Con.canvas(fan);
    const L = 50, Rm = 8, T = 10, B = 22, X1 = Wd - Rm, Y1 = h - B;
    const lo = 0.7, hi = 1.3, x = d => L + d / DAYS * (X1 - L), y = v => T + (hi - Math.max(lo, Math.min(hi, v))) / (hi - lo) * (Y1 - T);
    ctx.fillStyle = C.dim; ctx.textAlign = "right";
    for (const v of [0.8, 0.9, 1, 1.1, 1.2]) { ctx.strokeStyle = v === 1 ? C.zero : C.grid; ctx.beginPath(); ctx.moveTo(L, Math.round(y(v)) + .5); ctx.lineTo(X1, Math.round(y(v)) + .5); ctx.stroke(); ctx.fillText("$" + Math.round(v * 100) + "k", L - 6, y(v)); }
    for (const d of [0, 10, 20]) { ctx.textAlign = d === 0 ? "left" : d === 20 ? "right" : "center"; ctx.fillText(d === 0 ? "today" : FUT[d - 1], x(d), Y1 + 13); }
    ctx.strokeStyle = C.loss; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(L, y(1 - state.stop)); ctx.lineTo(X1, y(1 - state.stop)); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.loss; ctx.textAlign = "right"; ctx.fillText("automatic sell", X1, y(1 - state.stop) + 10);
    for (let p = 0; p < 70; p++) { const e = R.equity[p]; ctx.strokeStyle = e[DAYS] >= 1 ? "rgba(31,122,77,.15)" : "rgba(179,38,30,.13)"; ctx.beginPath(); e.forEach((v, d) => (d ? ctx.lineTo(x(d), y(v)) : ctx.moveTo(x(d), y(v)))); ctx.stroke(); }
    const med = []; for (let d = 0; d <= DAYS; d++) { const col = R.equity.map(e => e[d]).sort((a, b) => a - b); med.push(col[PATHS >> 1]); }
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); med.forEach((v, d) => (d ? ctx.lineTo(x(d), y(v)) : ctx.moveTo(x(d), y(v)))); ctx.stroke(); ctx.lineWidth = 1;
    fanData.geom = { L, X1 }; fanData.med = med;
    if (hoverD != null) {
      const d = hoverD; ctx.strokeStyle = C.inkA(0.3); ctx.beginPath(); ctx.moveTo(x(d) + .5, T); ctx.lineTo(x(d) + .5, Y1); ctx.stroke();
      const sold = R.equity.filter(e => e.slice(0, d + 1).some(v => v <= 1 - state.stop)).length / PATHS;
      ftip.show(x(d), y(med[d]), `${d === 0 ? "today" : FUT[d - 1]}<br>typical account <b>$${num(med[d] * ACCOUNT)}</b><br>already sold in ${Math.round(sold * 100)} % of futures`);
    } else ftip.hide();
  }
  fan.addEventListener("mousemove", e => { if (!fanData?.geom) return; const rect = fan.getBoundingClientRect(), { L, X1 } = fanData.geom; const d = Math.round((e.clientX - rect.left - L) / (X1 - L) * DAYS); hoverD = d >= 0 && d <= DAYS ? d : null; drawFan(); });
  fan.addEventListener("mouseleave", () => { hoverD = null; drawFan(); });

  function drawWater(R) {
    const A = R.attr, steps = [["Whole market", A.market], ["Chips themselves", A.ai], ["Your insurance", A.hedge], ["Automatic sell", A.stop]];
    const end = 1 + R.mean, rowH = 28, Wd = 340, L = 118, Rr = 70, H = (steps.length + 2) * rowH;
    let cum = 1; const vals = [1, ...steps.map(s => (cum += s[1])), end]; const lo = Math.min(...vals) - 0.02, hi = Math.max(...vals) + 0.02;
    const X = v => L + (v - lo) / (hi - lo) * (Wd - L - Rr);
    let s = `<text x="0" y="${rowH / 2 + 4}" class="w-name">You start with</text><rect x="${L}" y="${rowH / 2 - 6}" width="${X(1) - L}" height="12" fill="#d4d7dc"/><text x="${X(1) + 6}" y="${rowH / 2 + 4}" class="w-val">$100,000</text>`;
    cum = 1;
    steps.forEach(([k, v], i) => {
      const yy = (i + 1) * rowH + rowH / 2, a = X(cum), b = X(cum + v), c = v >= 0 ? C.gain : C.loss;
      s += `<line x1="${a}" x2="${a}" y1="${yy - rowH + 6}" y2="${yy - 6}" stroke="#bbb" stroke-dasharray="2 2"/><text x="0" y="${yy + 4}" class="w-name">${k}</text><rect x="${Math.min(a, b)}" y="${yy - 6}" width="${Math.max(1.5, Math.abs(b - a))}" height="12" fill="${c}"/><text x="${Math.max(a, b) + 6}" y="${yy + 4}" class="w-val" fill="${c}">${usd(v)}</text>`;
      cum += v;
    });
    const yy = (steps.length + 1) * rowH + rowH / 2;
    s += `<text x="0" y="${yy + 4}" class="w-name" font-weight="700">You end with</text><rect x="${L}" y="${yy - 6}" width="${Math.max(1, X(end) - L)}" height="12" fill="#000"/><text x="${X(end) + 6}" y="${yy + 4}" class="w-val">$${num(end * ACCOUNT)}</text>`;
    $("#d-water").innerHTML = `<svg viewBox="0 0 ${Wd} ${H}">${s}</svg>`;
  }

  // world index, grouped by family
  function drawTabs() {
    $("#world-tabs").innerHTML = Object.entries(F).map(([key, fam]) => `
      <div class="tab-fam"><p class="reading-k" style="color:${fam.color}">${fam.name}</p>
      ${W.map((wd, k) => wd.fam !== key ? "" : `<button class="wtab${k === selected ? " on" : ""}" data-k="${k}"><span class="wdot" style="background:${fam.color}"></span><span class="wname">${wd.name}</span><span class="wp">${Math.round(wd.p * 100)} %</span><span class="wr ${S.res[k].median >= 0 ? "g" : "l"}">${usd(S.res[k].median)}</span></button>`).join("")}</div>`).join("");
    $("#world-tabs").querySelectorAll(".wtab").forEach(b => b.addEventListener("click", () => select(+b.dataset.k, true)));
  }

  function drawSummary() {
    const wins = S.res.map((x, i) => [x.median >= 0, W[i].p]).filter(x => x[0]);
    const pw = wins.reduce((t, x) => t + x[1], 0);
    $("#summary").innerHTML = `Across all ${W.length} worlds, weighted by how likely each one is, your rule would be expected to end at <b class="${S.exp >= 0 ? "g" : "l"}">${usd(S.exp)}</b>. It makes money in <b>${wins.length} of ${W.length}</b> worlds, which together are ${Math.round(pw * 100)} % likely. In the worst 1 in 10 futures you would lose <b class="l">${usd(S.bad, false)}</b> on average.`;
  }

  // ================= fix the rule =================
  function findSturdier() {
    const grid = []; for (const lev of [0.25, 0.5, 0.75, 1]) for (const stop of [0.05, 0.1, 0.15, 0.2, 0.25]) for (const hedge of [0, 0.25, 0.5, 0.75, 1]) grid.push({ lev, stop, hedge });
    let i = 0, best = null, safest = null; const btn = $("#find-sturdier"); btn.disabled = true;
    const chunk = () => {
      for (let k = 0; k < 6 && i < grid.length; k++, i++) {
        const s = grid[i], R = summary(s);
        if (-R.bad * ACCOUNT <= BUDGET && (!best || R.exp > best.R.exp)) best = { s, R };
        if (!safest || R.bad > safest.R.bad) safest = { s, R };
      }
      $("#sturdy-status").textContent = `testing rule ${i} of ${grid.length} in all ${W.length} worlds…`;
      if (i < grid.length) return requestAnimationFrame(chunk);
      btn.disabled = false; show(best || safest);
    };
    chunk();
  }
  function show(b) {
    const before = S, after = b.R, s = b.s, words = [];
    if (s.hedge > state.hedge) words.push(`insure <b>${Math.round(s.hedge * 100)} %</b> against the whole market (it absorbs the rate and oil worlds)`);
    if (s.stop < state.stop) words.push(`sell sooner, after a <b>${Math.round(s.stop * 100)} %</b> loss (it cuts the slow declines early)`);
    if (s.stop > state.stop) words.push(`give it more room, selling only after a <b>${Math.round(s.stop * 100)} %</b> loss (choppy worlds stop shaking you out)`);
    if (s.lev < state.lev) words.push(`put in <b>$${(s.lev * ACCOUNT).toLocaleString("en-US")}</b> instead of $${(state.lev * ACCOUNT).toLocaleString("en-US")} (overnight shocks cannot be stopped out of)`);
    const rows = W.map((w, i) => `<tr><td><span class="wdot" style="background:${F[w.fam].color}"></span>${w.name}</td><td>${Math.round(w.p * 100)} %</td><td class="${before.res[i].median >= 0 ? "g" : "l"}">${usd(before.res[i].median)}</td><td class="${after.res[i].median >= 0 ? "g" : "l"}"><b>${usd(after.res[i].median)}</b></td></tr>`).join("");
    $("#sturdy-status").textContent = "";
    $("#sturdy-out").innerHTML = `
      <p class="sturdy-lead">The sturdier rule: ${words.length ? words.join("; ") : "your rule is already the best of the hundred"}.</p>
      <table class="cmp"><thead><tr><th>World</th><th>Chance</th><th>Your rule</th><th>Sturdier rule</th></tr></thead><tbody>${rows}
      <tr class="sum"><td>Expected, all worlds</td><td></td><td>${usd(before.exp)}</td><td>${usd(after.exp)}</td></tr>
      <tr class="sum"><td>Worst 1 in 10 futures</td><td></td><td class="l">${usd(before.bad)}</td><td class="l">${usd(after.bad)}</td></tr></tbody></table>
      <p class="caption">The sturdier rule is now applied to the sentence in section 2, the reviews and the world list.</p>`;
    Object.assign(state, s); sync(); S = after; drawSummary(); drawReview(); drawTabs();
  }

  // ================= controls =================
  function labels() {
    $("#lev-val").textContent = "$" + (state.lev * ACCOUNT).toLocaleString("en-US");
    $("#stop-val").textContent = Math.round(state.stop * 100) + " %";
    $("#hedge-val").textContent = state.hedge === 0 ? "nothing" : Math.round(state.hedge * 100) + " %";
  }
  function sync() { $("#lev").value = state.lev; $("#stop").value = state.stop * 100; $("#hedge").value = state.hedge * 100; ["#lev", "#stop", "#hedge"].forEach(i => Con.fill($(i))); labels(); }
  function update() { $("#sturdy-out").innerHTML = ""; S = summary(state); labels(); drawSummary(); drawReview(); drawTabs(); }
  $("#lev").addEventListener("input", e => { state.lev = +e.target.value; Con.fill(e.target); update(); });
  $("#stop").addEventListener("input", e => { state.stop = +e.target.value / 100; Con.fill(e.target); update(); });
  $("#hedge").addEventListener("input", e => { state.hedge = +e.target.value / 100; Con.fill(e.target); update(); });
  $("#find-sturdier").addEventListener("click", findSturdier);
  $("#discarded").textContent = window.DISCARDED;
  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { drawMarket(); drawFan(); }, 120); });

  sync(); S = summary(state); drawMarket(); drawSummary(); drawReview(); drawTabs();
})();
