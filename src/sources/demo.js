// 데모 모드: API 키 없이 화면과 판독 로직을 확인하기 위한 데이터.
// 재무 지표는 2026년 10월 말 공개 데이터를 옮겨 왔고, 일별 주가·금리 곡선은 그 수치에 맞춰 만든 가상 경로입니다.
function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5;
}

// [며칠 전, 값] 기준점을 이어 일별 경로를 만든다
function path(points, noise, seed, end = new Date("2026-11-05")) {
  const rand = seeded(seed);
  const days = points[0][0];
  const out = [];
  for (let d = days; d >= 0; d--) {
    const date = new Date(end.getTime() - d * 864e5);
    const wd = date.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    let i = 0;
    while (i < points.length - 1 && points[i + 1][0] > d) i++;
    const [d0, v0] = points[i];
    const [d1, v1] = points[Math.min(i + 1, points.length - 1)];
    const t = d0 === d1 ? 0 : (d0 - d) / (d0 - d1);
    const base = v0 + (v1 - v0) * t;
    out.push({ date: date.toISOString().slice(0, 10), value: +(base + base * noise * rand()).toFixed(3) });
  }
  out[out.length - 1].value = points[points.length - 1][1];
  return out;
}

const toCandles = (s, seed) => {
  const rand = seeded(seed + 100);
  return s.map((p) => {
    const spread = p.value * (0.006 + Math.abs(rand()) * 0.012);
    return { date: p.date, close: p.value, high: +(p.value + spread * (0.5 + rand())).toFixed(3), low: +(p.value - spread * (0.5 - rand())).toFixed(3) };
  });
};

const macro = {
  tenYear: path([[400, 4.12], [300, 4.15], [200, 4.30], [120, 4.48], [60, 4.95], [32, 5.31], [20, 5.12], [8, 5.00], [0, 4.90]], 0.006, 11),
  fedFunds: path([[400, 3.63], [60, 3.63], [50, 3.88], [0, 3.88]], 0, 12),
  creditSpread: path([[400, 1.75], [200, 1.70], [90, 1.95], [25, 2.25], [0, 2.05]], 0.01, 13),
  vix: path([[400, 16], [100, 15], [40, 24], [22, 31], [10, 26], [0, 21]], 0.04, 14),
  curve: path([[400, 0.55], [200, 0.40], [60, 0.20], [0, 0.29]], 0.02, 15),
  // 2월 말 이란 공습 이후 급등, 선거 직후 급락한 흐름을 본뜬 가상 경로
  oil: path([[400, 61], [260, 63], [250, 78], [220, 112], [150, 98], [60, 104], [35, 108], [5, 99], [0, 88]], 0.015, 16),
};

// 원자재: 11월 5일 시세(구리 약 6.4달러/파운드, 금 약 4,120달러/온스)와 1년 흐름에 맞춘 가상 경로
const commodities = {
  wti: { name: "WTI 원유", unit: "$/배럴", source: "데모", series: macro.oil },
  brent: { name: "브렌트유", unit: "$/배럴", source: "데모", series: macro.oil.map((p) => ({ date: p.date, value: +(p.value + 4.2).toFixed(2) })) },
  copper: { name: "구리", unit: "$/파운드", source: "데모", series: path([[400, 4.95], [300, 5.2], [200, 5.9], [120, 6.3], [45, 6.93], [30, 6.6], [10, 6.5], [0, 6.39]], 0.01, 17) },
  gold: { name: "금", unit: "$/온스", source: "데모", series: path([[400, 3900], [365, 3977], [300, 5608], [200, 4700], [120, 4350], [60, 4150], [7, 3900], [0, 4120]], 0.008, 18) },
  natgas: { name: "천연가스", unit: "$/MMBtu", source: "데모", series: path([[400, 3.4], [250, 4.6], [150, 3.9], [60, 3.5], [0, 3.7]], 0.02, 19) },
};

const stocks = {
  VZ: {
    name: "Verizon Communications", sector: "Communication Services", marketCap: 1.797e11,
    metrics: { pe: 11.05, pb: 1.69, pcf: 4.59, ps: 1.28, divYield: 6.55, roe: 15.79, roic: 8.22, debtToEquity: 1.76, grossMargin: 59.74, netMargin: 11.78, fcfYield: 12.5, earningsYield: 9.05 , evToEbitda: 7.13 },
    growth: { revenueYoY: 1.5, sharesYoY: -0.82 , epsGrowth: 6.63, epsGrowthBasis: "애널리스트 3년 EPS 전망" },
    street: { consensus: "Buy", analysts: 25, buyShare: null, target: 50.65, actions: [{ date: "2026-04", firm: "DBS Bank", from: "Buy", to: "Hold", action: "downgrade", target: 52 }, { date: "2026-04", firm: "Erste Group", from: "Hold", to: "Buy", action: "upgrade", target: null }] },
    path: [[370, 38.8], [300, 40.5], [230, 51.68], [150, 47.5], [90, 49.0], [45, 47.3], [10, 43.0], [0, 43.25]], seed: 21,
  },
  CMCSA: {
    name: "Comcast", sector: "Communication Services", marketCap: 8.245e10,
    metrics: { pe: 7.40, pb: 0.89, pcf: 2.60, ps: 0.67, divYield: 5.69, roe: 11.43, roic: 8.18, debtToEquity: 0.94, grossMargin: 69.84, netMargin: 9.20, fcfYield: 23.84, earningsYield: 13.51 , evToEbitda: 4.84 },
    growth: { revenueYoY: -0.8, sharesYoY: -4.36 , epsGrowth: -5.15, epsGrowthBasis: "애널리스트 3년 EPS 전망" },
    street: { consensus: "Hold", analysts: 27, buyShare: null, target: 27.98, actions: [] },
    path: [[370, 28.5], [280, 32.8], [200, 27.5], [120, 25.0], [60, 22.4], [20, 23.0], [0, 23.22]], seed: 22,
  },
  EOG: {
    name: "EOG Resources", sector: "Energy", marketCap: 8.683e10,
    metrics: { pe: 12.94, pb: 2.73, pcf: 6.50, ps: 3.25, divYield: 2.47, roe: 22.51, roic: 19.75, debtToEquity: 0.26, grossMargin: 62.64, netMargin: 25.73, fcfYield: 7.62, earningsYield: 7.73 , evToEbitda: 6.22 },
    growth: { revenueYoY: 9.0, sharesYoY: -3.33 , epsGrowth: 14.57, epsGrowthBasis: "애널리스트 3년 EPS 전망" },
    street: { consensus: "Buy", analysts: 33, buyShare: null, target: 167.14, actions: [{ date: "2026-09-17", firm: "Raymond James", from: null, to: null, action: "목표가 상향", target: 186 }, { date: "2026-09-14", firm: "UBS", from: null, to: null, action: "목표가 상향", target: 183 }] },
    path: [[370, 106.0], [300, 112.0], [220, 136.0], [140, 145.0], [60, 148.0], [20, 152.0], [5, 162.0], [0, 165.54]], seed: 23,
  },
  JPM: {
    name: "JPMorgan Chase", sector: "Financial Services", marketCap: 8.95e11,
    metrics: { pe: 14.15, pb: 2.55, pcf: null, ps: 4.69, divYield: 1.96, roe: 18.01, roic: null, debtToEquity: 3.56, grossMargin: null, netMargin: 34.59, fcfYield: null, earningsYield: 7.07 , evToEbitda: null },
    growth: { revenueYoY: 6.0, sharesYoY: -3.48 , epsGrowth: 11.38, epsGrowthBasis: "애널리스트 3년 EPS 전망" },
    street: { consensus: "Buy", analysts: 26, buyShare: null, target: 373.26, actions: [{ date: "2026-08-14", firm: "Wells Fargo", from: null, to: null, action: "목표가 상향", target: 390 }, { date: "2026-08-03", firm: "UBS", from: null, to: null, action: "목표가 상향", target: 400 }] },
    path: [[370, 305.5], [260, 289.0], [160, 330.0], [80, 365.0], [40, 345.0], [0, 337.04]], seed: 24,
  },
  GOOGL: {
    name: "Alphabet", sector: "Technology", marketCap: 3.44e12,
    metrics: { pe: 14.61, pb: 5.22, pcf: 19.16, ps: 7.30, divYield: 0.31, roe: 44.29, roic: 23.79, debtToEquity: 0.22, grossMargin: 60.86, netMargin: 50.03, fcfYield: 0.57, earningsYield: 6.84 , evToEbitda: 17.93 },
    growth: { revenueYoY: 16.0, sharesYoY: 0.33 , epsGrowth: 19.09, epsGrowthBasis: "애널리스트 3년 EPS 전망" },
    street: { consensus: "Strong Buy", analysts: 58, buyShare: null, target: 406.55, actions: [] },
    path: [[370, 274.6], [300, 300.0], [200, 360.0], [150, 392.0], [80, 350.0], [30, 336.0], [8, 295.0], [0, 279.84]], seed: 25,
  },
};

function demoStock(symbol) {
  const s = stocks[symbol];
  if (!s) {
    const err = new Error(`데모 모드에서는 ${Object.keys(stocks).join(", ")}만 볼 수 있습니다. 실제 데이터는 API 키를 넣고 실행하세요.`);
    err.status = 404;
    throw err;
  }
  const history = toCandles(path(s.path, 0.012, s.seed), s.seed);
  const price = history[history.length - 1].close;
  const prev = history[history.length - 2].close;
  return {
    symbol, name: s.name, sector: s.sector, price, marketCap: s.marketCap,
    changePct: ((price - prev) / prev) * 100,
    metrics: s.metrics, growth: s.growth, history, street: s.street,
  };
}

module.exports = { demoCommodities: () => commodities, demoMacro: () => macro, demoStock, demoSymbols: Object.keys(stocks) };
