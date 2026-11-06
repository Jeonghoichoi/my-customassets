// Financial Modeling Prep: 시세·재무비율·주가 이력
// 응답 필드 이름은 API 버전에 따라 다를 수 있어, 후보 이름을 여러 개 두고 처음 찾은 값을 씁니다.
// 첫 실행 때 값이 비어 나오면 아래 pick(...) 후보 목록에 실제 필드명을 추가하세요.
const BASE = "https://financialmodelingprep.com/stable";

async function get(path, params, key) {
  const qs = new URLSearchParams({ ...params, apikey: key });
  const res = await fetch(`${BASE}/${path}?${qs}`);
  if (!res.ok) throw new Error(`FMP ${path} 응답 ${res.status}`);
  const json = await res.json();
  if (json && json["Error Message"]) throw new Error(`FMP: ${json["Error Message"]}`);
  return json;
}

const first = (x) => (Array.isArray(x) ? x[0] : x) || null;
const num = (v) => (v === undefined || v === null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

function pick(obj, ...names) {
  if (!obj) return null;
  for (const n of names) {
    const v = num(obj[n]);
    if (v !== null) return v;
  }
  return null;
}
// 비율(0.18)로 오는 값을 %(18)로
const pct = (v) => (v === null ? null : v * 100);

async function stock(symbol, key) {
  const from = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  const [q, prof, r, k, h, inc] = await Promise.all([
    get("quote", { symbol }, key),
    get("profile", { symbol }, key).catch(() => []),
    get("ratios-ttm", { symbol }, key).catch(() => []),
    get("key-metrics-ttm", { symbol }, key).catch(() => []),
    get("historical-price-eod/full", { symbol, from }, key).catch(() => get("historical-price-eod/light", { symbol, from }, key).catch(() => [])),
    get("income-statement", { symbol, limit: 4 }, key).catch(() => []),
  ]);
  // 애널리스트 의견: 요금제에 따라 막혀 있을 수 있어 실패해도 판독은 계속한다
  const [pt, gc, gr] = await Promise.all([
    get("price-target-consensus", { symbol }, key).catch(() => []),
    get("grades-consensus", { symbol }, key).catch(() => []),
    get("grades", { symbol, limit: 40 }, key).catch(() => []),
  ]);

  const quote = first(q);
  if (!quote) {
    const err = new Error(`${symbol} 종목을 찾지 못했습니다.`);
    err.status = 404;
    throw err;
  }
  const profile = first(prof) || {};
  const ratios = first(r) || {};
  const km = first(k) || {};
  const rows = Array.isArray(h) ? h : h.historical || [];
  const history = rows
    .map((p) => ({ date: p.date, close: num(p.close ?? p.price), high: num(p.high), low: num(p.low) }))
    .filter((p) => p.close)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const incs = Array.isArray(inc) ? inc : [];
  const [cur, prev] = incs;
  const oldest = incs[incs.length - 1];
  const growth = (a, b) => (a && b ? ((a - b) / Math.abs(b)) * 100 : null);
  const eps = (x) => num(x?.epsDiluted ?? x?.epsdiluted ?? x?.eps);
  // 피터 린치의 PEG용 EPS 연평균 성장률 (최근 연간 실적 기준, 최대 3년)
  const years = incs.length - 1;
  const epsGrowth = years >= 1 && eps(cur) > 0 && eps(oldest) > 0 ? (Math.pow(eps(cur) / eps(oldest), 1 / years) - 1) * 100 : null;

  const divFraction = pick(ratios, "dividendYieldTTM", "dividendYield");
  const divPercent = pick(ratios, "dividendYieldPercentageTTM", "dividendYielPercentageTTM");

  return {
    symbol: quote.symbol || symbol,
    name: quote.name || profile.companyName || symbol,
    sector: profile.sector || null,
    industry: profile.industry || null,
    exchange: quote.exchange || profile.exchange || null,
    price: num(quote.price),
    changePct: pick(quote, "changePercentage", "changesPercentage"),
    marketCap: num(quote.marketCap ?? profile.marketCap),
    metrics: {
      pe: pick(ratios, "priceToEarningsRatioTTM", "peRatioTTM"),
      pb: pick(ratios, "priceToBookRatioTTM", "priceBookValueRatioTTM"),
      pcf: pick(ratios, "priceToOperatingCashFlowRatioTTM", "priceCashFlowRatioTTM"),
      ps: pick(ratios, "priceToSalesRatioTTM"),
      divYield: divFraction !== null ? divFraction * 100 : divPercent,
      roe: pct(pick(km, "returnOnEquityTTM", "roeTTM") ?? pick(ratios, "returnOnEquityTTM")),
      roic: pct(pick(km, "returnOnInvestedCapitalTTM", "roicTTM")),
      debtToEquity: pick(ratios, "debtToEquityRatioTTM", "debtEquityRatioTTM"),
      grossMargin: pct(pick(ratios, "grossProfitMarginTTM")),
      netMargin: pct(pick(ratios, "netProfitMarginTTM")),
      fcfYield: pct(pick(km, "freeCashFlowYieldTTM")),
      earningsYield: pct(pick(km, "earningsYieldTTM")),
      evToEbitda: pick(km, "evToEBITDATTM", "enterpriseValueOverEBITDATTM"),
    },
    growth: {
      revenueYoY: growth(num(cur?.revenue), num(prev?.revenue)),
      sharesYoY: growth(num(cur?.weightedAverageShsOutDil), num(prev?.weightedAverageShsOutDil)),
      epsGrowth,
      epsGrowthBasis: epsGrowth === null ? null : `최근 ${years}년 EPS 연평균`,
    },
    history,
    street: street(first(pt), first(gc), Array.isArray(gr) ? gr : []),
  };
}

const MAJOR = /j\.?p\.?\s?morgan|goldman|morgan stanley|bank of america|bofa|citi|wells fargo|ubs|barclays|schwab|jefferies|deutsche/i;
function street(pt, gc, grades) {
  const counts = gc ? ["strongBuy", "buy", "hold", "sell", "strongSell"].map((k) => num(gc[k]) || 0) : null;
  const total = counts ? counts.reduce((a, b) => a + b, 0) : 0;
  const actions = grades
    .filter((g) => MAJOR.test(g.gradingCompany || g.gradingcompany || ""))
    .slice(0, 6)
    .map((g) => ({ date: String(g.date || "").slice(0, 10), firm: g.gradingCompany || g.gradingcompany, from: g.previousGrade || null, to: g.newGrade || null, action: g.action || null, target: null }));
  return {
    consensus: gc?.consensus || null,
    analysts: total || null,
    buyShare: total ? ((counts[0] + counts[1]) / total) * 100 : null,
    target: pick(pt, "targetConsensus", "targetMedian"),
    targetHigh: pick(pt, "targetHigh"),
    targetLow: pick(pt, "targetLow"),
    actions,
  };
}

module.exports = { stock };

// 첫 연동 점검용: 각 엔드포인트가 응답하는지, 어떤 필드명이 오는지 확인
async function probe(symbol, key) {
  const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const targets = {
    quote: ["quote", { symbol }], profile: ["profile", { symbol }],
    "ratios-ttm": ["ratios-ttm", { symbol }], "key-metrics-ttm": ["key-metrics-ttm", { symbol }],
    "historical-full": ["historical-price-eod/full", { symbol, from }],
    "income-statement": ["income-statement", { symbol, limit: 1 }],
    "price-target-consensus": ["price-target-consensus", { symbol }],
    "grades-consensus": ["grades-consensus", { symbol }], grades: ["grades", { symbol, limit: 2 }],
    "commodity-CLUSD": ["historical-price-eod/light", { symbol: "CLUSD", from }],
    "commodity-HGUSD": ["historical-price-eod/light", { symbol: "HGUSD", from }],
    "commodity-GCUSD": ["historical-price-eod/light", { symbol: "GCUSD", from }],
  };
  const out = {};
  for (const [name, [path, params]] of Object.entries(targets)) {
    try {
      const res = await fetch(`${BASE}/${path}?${new URLSearchParams({ ...params, apikey: key })}`);
      const text = await res.text();
      let body; try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
      const item = Array.isArray(body) ? body[0] : body;
      out[name] = { status: res.status, rows: Array.isArray(body) ? body.length : null, fields: item && typeof item === "object" ? Object.keys(item) : null, message: typeof body === "string" ? body : body?.["Error Message"] || null };
    } catch (e) { out[name] = { error: e.message }; }
  }
  return out;
}

module.exports.probe = probe;
