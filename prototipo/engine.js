/* ===== Motor de valoración — réplica de la lógica del Excel ===== */
(function (G) {
  const DAY = 864e5;
  const toN = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY;
  const toS = n => new Date(Math.round(n) * DAY).toISOString().slice(0, 10);
  const ymd = n => { const d = new Date(Math.round(n) * DAY); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; };
  const wd = n => new Date(Math.round(n) * DAY).getUTCDay(); // 0 dom … 6 sáb
  function edate(n, m) {
    const [y, mo, d] = ymd(n); const t = mo + m;
    const yy = y + Math.floor(t / 12), mm = ((t % 12) + 12) % 12;
    const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    return Date.UTC(yy, mm, Math.min(d, last)) / DAY;
  }
  function feb29In(a, b) { // fechas 29-feb en (a, b]
    let c = 0; const [y1] = ymd(a), [y2] = ymd(b);
    for (let y = y1; y <= y2; y++) {
      if ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) { const f = Date.UTC(y, 1, 29) / DAY; if (f > a && f <= b) c++; }
    }
    return c;
  }
  function days(a, b, basis) {
    if (basis === '30/360') { // DAYS360 europeo
      let [y1, m1, d1] = ymd(a), [y2, m2, d2] = ymd(b);
      d1 = Math.min(d1, 30); d2 = Math.min(d2, 30);
      return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1);
    }
    let r = b - a; if (basis === '365/365') r -= feb29In(a, b); return r;
  }
  const den = b => (b === '30/360' || b === 'Real/360') ? 360 : 365;
  const FREQ = { Mensual: { p: 12, m: 1, col: 2 }, Bimestral: { p: 6, m: 2, col: 2 }, Trimestral: { p: 4, m: 3, col: 3 }, Semestral: { p: 2, m: 6, col: 4 }, Anual: { p: 1, m: 12, col: 5 } };
  const trunc3 = x => Math.trunc(x * 1000 + 1e-9) / 1000;
  const r3 = x => Math.round(x * 1000) / 1000;

  /* ---------- Series de mercado ---------- */
  let M = null;
  function lastLE(arr, n, key = 0) { // arr ordenado asc por fecha (string en key)
    let lo = 0, hi = arr.length - 1, ans = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (arr[mid]._n <= n) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  }
  function addBizDays(n, k) { let d = n; while (k > 0) { d++; const w = wd(d); if (w !== 0 && w !== 6) k--; } return d; }
  function load(D) {
    M = D;
    const prep = a => a.forEach(r => (r._n = toN(r[0])));
    ['ibr', 'uvr', 'frac', 'exp', 'ipc'].forEach(k => prep(D[k]));
    // IPC: variación anual y fecha de vigencia (5.º día hábil del mes siguiente + 1)
    D.ipc.forEach((r, i) => {
      r.annual = i >= 12 ? r[1] / D.ipc[i - 12][1] - 1 : null;
      r.vig = addBizDays(r._n, 5) + 1;
    });
    D.ipcV = D.ipc.filter(r => r.annual != null);
    D.zero.sort((a, b) => a[0] - b[0]);
  }
  function ipcVigente(n) { // IPC 12m vigente en la fecha n
    const a = M.ipcV; let k = -1;
    for (let i = 0; i < a.length; i++) if (a[i].vig <= n) k = i;
    if (k < 0) k = 0; return { v: a[k].annual, mes: a[k][0] };
  }
  function expect(n) { const i = lastLE(M.exp, n); return M.exp[Math.max(0, i)][1]; }
  function uvrAt(n) {
    const a = M.uvr, i = lastLE(a, n);
    if (i < 0) return { v: a[0][1], f: a[0][0], extrap: true };
    if (i === a.length - 1 && n > a[i]._n) { // extrapola con IPC vigente
      const inf = ipcVigente(n).v; return { v: a[i][1] * Math.pow(1 + inf, (n - a[i]._n) / 365), f: a[i][0], extrap: true };
    }
    return { v: a[i][1], f: a[i][0], extrap: false };
  }
  function ibrPub(n, col) { // último IBR publicado antes de n (día hábil anterior)
    const a = M.ibr, i = lastLE(a, n - 1);
    const k = Math.max(0, i); return { v: a[k][col] / 100, f: a[k][0] };
  }
  function frac(n) { const i = lastLE(M.frac, n); return M.frac[Math.max(0, i)][1]; }
  function spot(t) { // curva cero cupón TES, interpolación lineal, plana fuera de rango
    const z = M.zero; if (t <= z[0][0]) return z[0][1]; if (t >= z[z.length - 1][0]) return z[z.length - 1][1];
    for (let i = 1; i < z.length; i++) if (t <= z[i][0]) { const [t0, r0] = z[i - 1], [t1, r1] = z[i]; return r0 + (r1 - r0) * (t - t0) / (t1 - t0); }
  }

  /* ---------- Utilidades financieras ---------- */
  function pvAt(fl, y) { let s = 0; for (const f of fl) s += f.cf / Math.pow(1 + y, f.t); return s; }
  function solveYield(fl, price, guess = 0.1) {
    let r = guess;
    for (let k = 0; k < 60; k++) {
      let f = -price, d = 0;
      for (const x of fl) { const v = x.cf / Math.pow(1 + r, x.t); f += v; d += -x.t * v / (1 + r); }
      const nr = r - f / d; if (!isFinite(nr)) break; if (Math.abs(nr - r) < 1e-12) { r = nr; break; } r = nr;
    }
    return r;
  }
  function xirr(cfs) { // [{n, cf}] — base Real/365 como XIRR de Excel
    const n0 = cfs[0].n; const fl = cfs.slice(1).map(c => ({ t: (c.n - n0) / 365, cf: c.cf }));
    return solveYield(fl, -cfs[0].cf, 0.1);
  }
  function riskFrom(fl, y, dirty, nominal, fx = 1) {
    let s = 0, st = 0, stt = 0;
    for (const f of fl) { const v = f.cf / Math.pow(1 + y, f.t); s += v; st += f.t * v; stt += f.t * (f.t + 1) * v; }
    const mac = st / s, mod = r3(mac) / (1 + y);
    return { mac, macDays: mac * 365, mod, durPesos: r3(mod) * dirty / 100, durPos: r3(mod) * dirty / 100 * nominal / 100 * fx, dv01: r3(mod) * dirty / 100 * nominal * 1e-4 * fx, conv: stt / (s * Math.pow(1 + y, 2)) };
  }
  function sensitivity(fl, y, dirty, mod, conv, nominal, fx = 1) {
    return [-300, -200, -150, -100, -50, -25, 0, 25, 50, 100, 150, 200, 300].map(bp => {
      const r = y + bp / 1e4, real = pvAt(fl, r), dy = bp / 1e4;
      const eD = dirty * (1 - mod * dy), eDC = dirty * (1 - mod * dy + 0.5 * conv * dy * dy);
      return { bp, r, real, eD, eDC, errD: eD - real, errDC: eDC - real, dVal: (real - dirty) / 100 * nominal * fx };
    });
  }

  /* ---------- Cronograma base ---------- */
  function baseSchedule(b) {
    const em = toN(b.emision), mat = toN(b.vencimiento), val = toN(b.valoracion), F = FREQ[b.frecuencia];
    const rows = [];
    for (let i = 1; i < 600; i++) {
      if (edate(em, (i - 1) * F.m) >= mat) break;
      const pay = Math.min(edate(em, i * F.m), mat), start = i === 1 ? em : rows[i - 2].pay;
      const D = days(start, pay, b.base), N = pay <= val ? 0 : days(val, pay, b.base);
      rows.push({ i, start, pay, D, N, t: N / den(b.base), estado: pay <= val ? 'Pagado' : (start <= val ? 'Vigente' : 'Futuro'), last: pay === mat });
    }
    const idx = Math.min(rows.length, rows.filter(r => r.pay <= val).length + 1) - 1;
    const cur = rows[Math.max(0, idx)];
    const dc = days(cur.start, val, b.base);
    return { em, mat, val, F, rows, cur, dc, B: den(b.base), diasVto: mat > val ? days(val, mat, b.base) : 0 };
  }
  function validate(b) {
    if (!b.emision || !b.vencimiento || !b.valoracion) return 'Completa las fechas';
    const em = toN(b.emision), mat = toN(b.vencimiento), val = toN(b.valoracion);
    if (mat <= em) return 'El vencimiento debe ser posterior a la emisión';
    if (val < em) return '⚠ Valoración antes de la emisión';
    if (val >= mat) return '⚠ El título ya venció';
    return null;
  }
  function condicion(clean) { return Math.abs(clean - 100) < 5e-5 ? 'A la par' : clean > 100 ? 'Con prima' : 'Con descuento'; }
  function finish(o, b, S, fx) {
    o.cupones = S.rows.length; o.pendientes = S.rows.filter(r => r.N > 0).length;
    o.plazo = S.diasVto / S.B; o.diasVto = S.diasVto;
    o.ultimo = toS(S.cur.start); o.proximo = toS(S.cur.pay); o.diasCorridos = S.dc; o.diasPeriodo = S.cur.D;
    o.cond = condicion(o.clean); o.condV = condicion(o.cleanV);
    o.giro = o.dirty / 100 * b.nominal * fx; o.giroV = o.dirtyV / 100 * b.nominal * fx;
    o.corridoCOP = o.accrued / 100 * b.nominal * fx; o.limpioCOP = o.clean / 100 * b.nominal * fx;
    o.difGiro = o.giroV - o.giro;
    Object.assign(o, riskFrom(o.flows, o.irr, o.dirty, b.nominal, fx));
    o.sens = sensitivity(o.flows, o.irr, o.dirty, o.mod, o.conv, b.nominal, fx);
    o.fx = fx;
    // flujos en pesos con fecha (para portafolio y escalera)
    o.cashCOP = o.cashCOP || S.rows.filter(r => r.N > 0).map(r => ({ n: r.pay, cop: r.L / 100 * b.nominal * fx }));
    // TIR en pesos comparable (para portafolio)
    o.yieldCOP = o.yieldCOP != null ? o.yieldCOP : o.irr;
    return o;
  }

  /* ---------- Tasa fija ---------- */
  function priceTF(b) {
    const S = baseSchedule(b), c = b.cupon;
    S.rows.forEach(r => { r.saldo = 100; r.tasa = c; r.J = Math.pow(1 + c, r.D / S.B) - 1; r.K = 100 * r.J; r.amort = r.last ? 100 : 0; r.L = r.K + r.amort; r.COP = r.L / 100 * b.nominal; });
    const fl = S.rows.filter(r => r.N > 0).map(r => ({ t: r.t, cf: r.L, n: r.pay }));
    const pv = y => pvAt(fl, y);
    const dirty = trunc3(pv(b.tasaCompra)), dirtyV = trunc3(pv(b.tasaVenta));
    const accrued = b.corrido === 'Lineal' ? S.cur.K * S.dc / S.cur.D : 100 * (Math.pow(1 + c, S.dc / S.B) - 1);
    S.rows.forEach(r => { r.vp = r.N > 0 ? r.L / Math.pow(1 + b.tasaCompra, r.t) : 0; r.vpV = r.N > 0 ? r.L / Math.pow(1 + b.tasaVenta, r.t) : 0; r.z = r.N > 0 ? spot(r.t) : 0; r.vpZ = r.N > 0 ? r.L / Math.pow(1 + r.z, r.t) : 0; });
    const pCurve = S.rows.reduce((s, r) => s + r.vpZ, 0), irrCurve = solveYield(fl, pCurve, b.tasaCompra);
    const p = S.F.p;
    const o = {
      tipo: 'TF', rows: S.rows, flows: fl, dirty, dirtyV, accrued, clean: dirty - accrued, cleanV: dirtyV - accrued,
      irr: b.tasaCompra, irrV: b.tasaVenta, nom: p * (Math.pow(1 + b.tasaCompra, 1 / p) - 1), nomV: p * (Math.pow(1 + b.tasaVenta, 1 / p) - 1),
      rendCorriente: c * 100 / (dirty - accrued), pCurve, irrCurve, spreadCurve: (b.tasaCompra - irrCurve) * 1e4,
      notas: [['Tasa cupón facial', c, 'pct']]
    };
    return finish(o, b, S, 1);
  }

  /* ---------- IPC ---------- */
  function priceIPC(b) {
    const S = baseSchedule(b), vig = ipcVigente(S.val);
    S.rows.forEach(r => {
      r.ref = b.modalidad === 'Inicio (Previo)' ? r.start : r.pay;
      r.H = r.ref <= S.val ? ipcVigente(r.ref).v : (b.proyeccion === 'IPC vigente' ? vig.v : expect(r.ref));
      r.fuente = r.ref <= S.val ? 'Publicado' : (b.proyeccion === 'IPC vigente' ? 'IPC vigente' : 'Expectativa');
      r.saldo = 100; r.tasa = (1 + r.H) * (1 + b.spread) - 1; r.K = 100 * (Math.pow(1 + r.tasa, r.D / S.B) - 1); r.amort = r.last ? 100 : 0; r.L = r.K + r.amort; r.COP = r.L / 100 * b.nominal;
    });
    const disc = (spr) => { let R = 0, first = true, tot = 0; S.rows.forEach(r => { if (r.N <= 0) { r['_' + spr] = 0; return; } const q = (1 + (b.proyeccion === 'IPC vigente' ? vig.v : r.H)) * (1 + spr) - 1; R = first ? Math.pow(1 + q, -r.t) : R * Math.pow(1 + q, -r.D / S.B); first = false; tot += r.L * R; r['_' + spr] = r.L * R; }); return tot; };
    const dirty = trunc3(disc(b.spreadCompra)), dirtyV = trunc3(disc(b.spreadVenta));
    S.rows.forEach(r => { r.vp = r['_' + b.spreadCompra] || 0; r.vpV = r['_' + b.spreadVenta] || 0; });
    const fl = S.rows.filter(r => r.N > 0).map(r => ({ t: r.t, cf: r.L, n: r.pay }));
    const irr = solveYield(fl, dirty, (1 + vig.v) * (1 + b.spreadCompra) - 1), irrV = solveYield(fl, dirtyV, (1 + vig.v) * (1 + b.spreadVenta) - 1);
    const accrued = b.corrido === 'Lineal' ? S.cur.K * S.dc / S.cur.D : 100 * (Math.pow(1 + S.cur.tasa, S.dc / S.B) - 1);
    const p = S.F.p;
    const o = {
      tipo: 'IPC', rows: S.rows, flows: fl, dirty, dirtyV, accrued, clean: dirty - accrued, cleanV: dirtyV - accrued, irr, irrV,
      nom: p * (Math.pow(1 + irr, 1 / p) - 1), nomV: p * (Math.pow(1 + irrV, 1 / p) - 1),
      tasaNeg: (1 + vig.v) * (1 + b.spreadCompra) - 1, tasaNegV: (1 + vig.v) * (1 + b.spreadVenta) - 1,
      ipcVig: vig.v, ipcMes: vig.mes, tirReal: (1 + irr) / (1 + vig.v) - 1, tirRealV: (1 + irrV) / (1 + vig.v) - 1,
      tasaCupVig: S.cur.tasa, notas: [['IPC vigente (' + vig.mes.slice(0, 7) + ')', vig.v, 'pct']]
    };
    return finish(o, b, S, 1);
  }

  /* ---------- UVR ---------- */
  function priceUVR(b) {
    const S = baseSchedule(b), c = b.cupon, u0 = uvrAt(S.val), vig = ipcVigente(S.val);
    S.rows.forEach(r => { r.saldo = 100; r.tasa = c; r.J = Math.pow(1 + c, r.D / S.B) - 1; r.K = 100 * r.J; r.amort = r.last ? 100 : 0; r.L = r.K + r.amort; r.COP = r.L / 100 * b.nominal; });
    const fl = S.rows.filter(r => r.N > 0).map(r => ({ t: r.t, cf: r.L, n: r.pay }));
    const dirty = trunc3(pvAt(fl, b.tasaCompra)), dirtyV = trunc3(pvAt(fl, b.tasaVenta));
    const accrued = b.corrido === 'Lineal' ? S.cur.K * S.dc / S.cur.D : 100 * (Math.pow(1 + c, S.dc / S.B) - 1);
    // UVR proyectada y flujos en pesos
    let prev = null; const cash = [];
    S.rows.forEach(r => {
      r.vp = r.N > 0 ? r.L / Math.pow(1 + b.tasaCompra, r.t) : 0; r.vpV = r.N > 0 ? r.L / Math.pow(1 + b.tasaVenta, r.t) : 0;
      if (r.N <= 0) { r.uvrP = 0; r.cop = 0; return; }
      r.infl = b.proyeccion === 'IPC vigente' ? vig.v : expect(r.pay);
      r.uvrP = prev == null ? u0.v * Math.pow(1 + r.infl, (r.pay - S.val) / 365) : prev * Math.pow(1 + r.infl, (r.pay - r.start) / 365);
      prev = r.uvrP; r.cop = r.L / 100 * b.nominal * r.uvrP; cash.push({ n: r.pay, cop: r.cop });
    });
    const giroCOP = dirty / 100 * b.nominal * u0.v;
    const tirPesos = xirr([{ n: S.val, cf: -giroCOP }, ...cash.map(c => ({ n: c.n, cf: c.cop }))]);
    const p = S.F.p, z = spot(0);
    const o = {
      tipo: 'UVR', rows: S.rows, flows: fl, dirty, dirtyV, accrued, clean: dirty - accrued, cleanV: dirtyV - accrued,
      irr: b.tasaCompra, irrV: b.tasaVenta, nom: p * (Math.pow(1 + b.tasaCompra, 1 / p) - 1), nomV: p * (Math.pow(1 + b.tasaVenta, 1 / p) - 1),
      uvr: u0.v, uvrFecha: u0.f, uvrExtrap: u0.extrap, ipcVig: vig.v, tirPesos, fisher: (1 + b.tasaCompra) * (1 + vig.v) - 1,
      rendCorriente: c * 100 / (dirty - accrued), nominalCOP: b.nominal * u0.v, cashCOP: cash, yieldCOP: tirPesos,
      notas: [['UVR a la valoración', u0.v, 'num4']]
    };
    finish(o, b, S, u0.v);
    o.tesDur = spot(o.mac); o.spreadUVR = (o.irr - o.tesDur) * 1e4; o.spreadPesos = (tirPesos - o.tesDur) * 1e4;
    return o;
  }

  /* ---------- IBR ---------- */
  function priceIBR(b) {
    const S = baseSchedule(b), col = S.F.col, lastIBR = M.ibr[M.ibr.length - 1], lastN = lastIBR._n;
    const vig = ibrPub(S.val, col);
    const vigStale = S.val - 1 > lastN;
    S.rows.forEach(r => {
      if (r.start <= S.val) { r.H = ibrPub(r.start, col).v; r.fuente = 'Publicado'; }
      else if (b.metodologia === 'IBR vigente') { r.H = vig.v; r.fuente = 'IBR vigente'; }
      else { r.H = frac(r.start); r.fuente = 'FRAC'; }
      r.saldo = 100; r.tasa = r.H + b.spread; r.K = 100 * r.tasa * r.D / S.B; r.amort = r.last ? 100 : 0; r.L = r.K + r.amort; r.COP = r.L / 100 * b.nominal;
    });
    const fut = S.rows.filter(r => r.N > 0), p = S.F.p;
    const ibrAvg = b.metodologia === 'IBR vigente' ? vig.v : fut.reduce((s, r) => s + r.H, 0) / fut.length;
    const tirProm = spr => Math.pow(1 + (ibrAvg + spr) / p, p) - 1;
    const disc = spr => {
      let R = 0, first = true, tot = 0;
      S.rows.forEach(r => {
        r['_' + spr] = 0; if (r.N <= 0) return;
        if (b.descuento === 'TIR con IBR promedio') R = Math.pow(1 + tirProm(spr), -(r.pay - S.val) / 365);
        else { const q = (b.metodologia === 'IBR vigente' ? vig.v : r.H) + spr; R = first ? Math.pow(1 + q * r.D / S.B, -r.N / r.D) : R / (1 + q * r.D / S.B); }
        first = false; tot += r.L * R; r['_' + spr] = r.L * R;
      });
      return tot;
    };
    const calc = trunc3(disc(b.spreadCompra)), dirtyV = trunc3(disc(b.spreadVenta));
    const dirty = (b.precioDado && b.precioDado > 0) ? b.precioDado : calc;
    S.rows.forEach(r => { r.vp = r['_' + b.spreadCompra] || 0; r.vpV = r['_' + b.spreadVenta] || 0; });
    const fl = fut.map(r => ({ t: r.t, cf: r.L, n: r.pay }));
    const irr = (b.precioDado > 0 || b.descuento !== 'TIR con IBR promedio') ? solveYield(fl, dirty, tirProm(b.spreadCompra)) : tirProm(b.spreadCompra);
    const irrV = b.descuento === 'TIR con IBR promedio' ? tirProm(b.spreadVenta) : solveYield(fl, dirtyV, tirProm(b.spreadVenta));
    const accrued = S.cur.K * S.dc / S.cur.D;
    const fracStart = M.frac[0][0];
    const o = {
      tipo: 'IBR', rows: S.rows, flows: fl, dirty, dirtyV, accrued, clean: dirty - accrued, cleanV: dirtyV - accrued, irr, irrV,
      nom: p * (Math.pow(1 + irr, 1 / p) - 1), nomV: p * (Math.pow(1 + irrV, 1 / p) - 1),
      ibrVig: vig.v, ibrFecha: vig.f, ibrStale: vigStale, ibrAvg, plazoIBR: ['', '', 'IBR 1 mes', 'IBR 3 meses', 'IBR 6 meses', 'IBR 12 meses'][col],
      tasaNeg: vig.v + b.spreadCompra, tasaNegV: vig.v + b.spreadVenta,
      tasaNegEA: Math.pow(1 + (vig.v + b.spreadCompra) / p, p) - 1, tasaNegEAV: Math.pow(1 + (vig.v + b.spreadVenta) / p, p) - 1,
      fracStart, fracStale: b.metodologia === 'Curva FRAC' && Math.abs(S.val - toN(fracStart)) > 10,
      notas: [[vig.v ? 'IBR vigente (' + vig.f + ')' : 'IBR', vig.v, 'pct']]
    };
    return finish(o, b, S, 1);
  }

  function price(b) {
    const err = validate(b); if (err && !err.startsWith('⚠ Valoración')) return { error: err };
    const fn = { TF: priceTF, IPC: priceIPC, UVR: priceUVR, IBR: priceIBR }[b.tipo];
    try { const o = fn(b); o.aviso = err; return o; } catch (e) { return { error: 'No se pudo valorar: ' + e.message }; }
  }

  /* ---------- Rentabilidad con venta anticipada ---------- */
  function holding(b, o, ventaS, tasaVenta) {
    const val = toN(b.valoracion), sv = toN(ventaS);
    if (!(sv > val)) return { error: 'La fecha de venta debe ser posterior a la compra' };
    const mat = toN(b.vencimiento); if (sv >= mat) return { error: 'La venta debe ser antes del vencimiento' };
    const B = den(b.base), fx = o.fx || 1;
    const rec = o.rows.filter(r => r.pay > val && r.pay <= sv), rest = o.rows.filter(r => r.pay > sv);
    const pv = rest.reduce((s, r) => s + r.L / Math.pow(1 + tasaVenta, days(sv, r.pay, b.base) / B), 0);
    const pVenta = trunc3(pv);
    const cfs = [{ n: val, cf: -o.dirty }, ...rec.map(r => ({ n: r.pay, cf: r.L })), { n: sv, cf: pVenta }];
    const merged = []; cfs.forEach(c => { const m = merged.find(x => x.n === c.n); if (m && c !== cfs[0]) m.cf += c.cf; else merged.push({ ...c }); });
    const tir = xirr(merged);
    const cup = rec.reduce((s, r) => s + r.L, 0);
    const gan = (pVenta + cup - o.dirty) / 100 * b.nominal * fx;
    return { pVenta, cupones: cup, ncup: rec.length, tir, gan, dias: sv - val, retorno: (pVenta + cup) / o.dirty - 1 };
  }

  G.BondEngine = { load, price, holding, spot, ipcVigente, uvrAt, ibrPub, expect, toN, toS, edate, days, pvAt, solveYield, FREQ };
})(typeof window !== 'undefined' ? window : globalThis);
