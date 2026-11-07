// 국내 종목: 네이버 증권 공개 데이터 (키 불필요)
// 공식 API가 아니라서 응답 구조가 바뀔 수 있습니다. 구조가 바뀌면 /api/check/KR 로 확인해 이 파일의 파싱을 고칩니다.
const UA = {
  "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
  referer: "https://m.stock.naver.com/",
};

async function getJson(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) {
    const e = new Error(`네이버 ${res.status}`);
    // 409는 네이버가 '없는 종목'일 때 주는 응답이에요
    e.status = res.status === 404 || res.status === 409 ? 404 : 502;
    throw e;
  }
  return res.json();
}

// "12.34배", "1,234원", "3.21%", "-1.5" → 숫자
function n(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const m = String(v)
    .replace(/,/g, "")
    .match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}
// "490조 1,234억" → 원 단위
function krw(v) {
  if (!v) return null;
  const s = String(v).replace(/,/g, "");
  const jo = s.match(/(\d+(\.\d+)?)\s*조/),
    eok = s.match(/(\d+(\.\d+)?)\s*억/);
  if (!jo && !eok) return n(s);
  return (jo ? Number(jo[1]) * 1e12 : 0) + (eok ? Number(eok[1]) * 1e8 : 0);
}

// 일봉 (최근 약 300거래일): <item data="20261105|시가|고가|저가|종가|거래량" />
async function history(code) {
  const res = await fetch(`https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=day&count=300&requestType=0`, {
    headers: UA,
  });
  if (!res.ok) throw new Error(`네이버 일봉 ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/data="(\d{8})\|([\d.]+)\|([\d.]+)\|([\d.]+)\|([\d.]+)\|(\d+)"/g)].map((m) => ({
    date: `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`,
    high: Number(m[3]),
    low: Number(m[4]),
    close: Number(m[5]),
  }));
}

// ---------- 기간별 차트 (일·주·월·연봉) ----------
// 봉 하나: [날짜, 시가, 고가, 저가, 종가]
const pad2 = (v) => String(v).padStart(2, "0");
// 일봉을 주·월·연 단위로 묶어요
function aggregate(bars, tf) {
  if (tf === "day") return bars;
  const keyOf = (d) => {
    if (tf === "year") return d.slice(0, 4);
    if (tf === "month") return d.slice(0, 7);
    const t = new Date(d + "T00:00:00Z");
    t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); // 그 주 월요일
    return t.toISOString().slice(0, 10);
  };
  const out = [];
  let cur = null,
    key = null;
  for (const b of bars) {
    const k = keyOf(b[0]);
    if (k !== key) {
      if (cur) out.push(cur);
      key = k;
      cur = [b[0], b[1], b[2], b[3], b[4]];
    } else {
      cur[2] = Math.max(cur[2], b[2]);
      cur[3] = Math.min(cur[3], b[3]);
      cur[4] = b[4];
    }
  }
  if (cur) out.push(cur);
  return out;
}
const cleanBars = (bars) =>
  bars
    .filter((b) => b[4] > 0)
    .map((b) => {
      const o = b[1] > 0 ? b[1] : b[4];
      const h = Math.max(b[2] > 0 ? b[2] : b[4], o, b[4]);
      const l = Math.min(b[3] > 0 ? b[3] : b[4], o, b[4]);
      return [b[0], o, h, l, b[4]];
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));

// 국내: fchart (timeframe=day/week/month, 최근 count개)
async function krBars(code, tf, count) {
  const frame = tf === "year" ? "month" : tf;
  const res = await fetch(`https://fchart.stock.naver.com/sise.nhn?symbol=${code}&timeframe=${frame}&count=${count}&requestType=0`, { headers: UA });
  if (!res.ok) throw new Error(`네이버 차트 ${res.status}`);
  const xml = await res.text();
  const bars = [...xml.matchAll(/data="(\d{8})\|([\d.]+)\|([\d.]+)\|([\d.]+)\|([\d.]+)\|(\d+)"/g)].map((m) => [
    `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6, 8)}`,
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
  ]);
  return aggregate(cleanBars(bars), tf);
}

// 해외: api.stock.naver.com 차트. 주·월 주소가 막히면 일봉을 받아서 묶어요
async function usBars(ticker, tf, from) {
  const code = await worldCode(ticker);
  const now = new Date();
  const range = `startDateTime=${ymd(from)}0000&endDateTime=${ymd(now)}2359`;
  const parse = (rows) =>
    cleanBars(
      (Array.isArray(rows) ? rows : []).map((p) => [
        `${p.localDate.slice(0, 4)}-${p.localDate.slice(4, 6)}-${p.localDate.slice(6, 8)}`,
        n(p.openPrice) ?? 0,
        n(p.highPrice) ?? 0,
        n(p.lowPrice) ?? 0,
        n(p.closePrice) ?? 0,
      ])
    );
  const frame = tf === "year" ? "month" : tf;
  if (frame !== "day") {
    try {
      const bars = parse(await getJson(`${W}/chart/foreign/item/${code}/${frame}?${range}`));
      if (bars.length >= 2) return tf === "year" ? aggregate(bars, "year") : bars;
    } catch {}
  }
  return aggregate(parse(await getJson(`${W}/chart/foreign/item/${code}/day?${range}`)), tf);
}

// 국내 장기 자료: api.stock.naver.com 국내 차트 (fchart 월봉은 최근 10년까지만 와요)
async function krBarsLong(code, tf, from) {
  const frame = tf === "year" ? "month" : tf;
  const rows = await getJson(`${W}/chart/domestic/item/${code}/${frame}?startDateTime=${ymd(from)}0000&endDateTime=${ymd(new Date())}2359`);
  const bars = cleanBars(
    (Array.isArray(rows) ? rows : []).map((p) => [
      `${String(p.localDate).slice(0, 4)}-${String(p.localDate).slice(4, 6)}-${String(p.localDate).slice(6, 8)}`,
      n(p.openPrice) ?? 0,
      n(p.highPrice) ?? 0,
      n(p.lowPrice) ?? 0,
      n(p.closePrice) ?? 0,
    ])
  );
  return tf === "year" ? aggregate(bars, "year") : bars;
}

async function bars(market, symbol, tf, years) {
  const from = new Date(Date.now() - years * 365.25 * 864e5);
  if (market === "KR") {
    const code = symbol.slice(0, 6);
    const perYear = { day: 250, week: 53, month: 12, year: 12 }[tf];
    const a = await krBars(code, tf, Math.ceil(years * perYear) + 5).catch(() => []);
    // 5년 넘는 월·연봉은 더 긴 자료를 따로 받아서, 더 많이 온 쪽을 써요
    if (years > 5 && (tf === "month" || tf === "year")) {
      const b = await krBarsLong(code, tf, from).catch(() => []);
      if (b.length > a.length) return b.filter((x) => x[0] >= ymdDash(from));
    }
    if (!a.length) throw new Error("네이버 차트 자료가 없어요");
    return a.filter((b) => b[0] >= ymdDash(from));
  }
  return (await usBars(symbol, tf, from)).filter((b) => b[0] >= ymdDash(from));
}
const ymdDash = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// 응답 어딘가에 있는 { rowList: [...] } 를 찾는다 (재무제표 표)
function findRows(obj, depth = 0) {
  if (!obj || typeof obj !== "object" || depth > 5) return null;
  if (Array.isArray(obj.rowList)) return obj;
  for (const v of Object.values(obj)) {
    const r = findRows(v, depth + 1);
    if (r) return r;
  }
  return null;
}

// 연간 재무: 가장 최근 확정 연도와 그 이전 값들을 뽑는다
function annual(fin) {
  const table = findRows(fin);
  if (!table) return {};
  const periods = (table.trTitleList || [])
    .filter((t) => String(t.isConsensus || "N") !== "Y")
    .map((t) => t.key)
    .filter(Boolean);
  const rowOf = (re) => table.rowList.find((r) => re.test(r.title || ""));
  const series = (re) => {
    const row = rowOf(re);
    if (!row || !row.columns) return [];
    return periods.map((p) => n(row.columns[p]?.value ?? row.columns[p])).filter((v) => v !== null);
  };
  const lastOf = (arr) => (arr.length ? arr[arr.length - 1] : null);
  const prevOf = (arr) => (arr.length > 1 ? arr[arr.length - 2] : null);
  const revenue = series(/^매출액/),
    net = series(/^당기순이익/),
    eps = series(/^EPS/);
  const ocf = series(/영업활동.*현금/);
  // 연도별 주당배당금 (연도 라벨과 함께)
  const dpsRow = rowOf(/^주당배당금/);
  const dpsHistory = dpsRow
    ? periods
        .map((p) => ({ year: String(p).slice(0, 4), value: n(dpsRow.columns?.[p]?.value ?? dpsRow.columns?.[p]) }))
        .filter((x) => x.value !== null)
    : [];
  return {
    revenue: lastOf(revenue),
    revenuePrev: prevOf(revenue),
    netIncome: lastOf(net),
    roe: lastOf(series(/^ROE/)),
    debtRatio: lastOf(series(/^부채비율/)),
    netMarginRow: lastOf(series(/^순이익률/)),
    operatingCashFlow: lastOf(ocf),
    eps, // 연도순
    dpsHistory,
  };
}

function info(integration, re) {
  const list = integration?.totalInfos || [];
  const item = list.find((x) => re.test(x.key || x.code || ""));
  return item ? item.value : null;
}

async function stock(code) {
  const [basic, integ, fin, hist] = await Promise.all([
    getJson(`https://m.stock.naver.com/api/stock/${code}/basic`),
    getJson(`https://m.stock.naver.com/api/stock/${code}/integration`).catch(() => ({})),
    getJson(`https://m.stock.naver.com/api/stock/${code}/finance/annual`).catch(() => ({})),
    history(code),
  ]);
  const name = basic.stockName || integ.stockName || code;
  const price = n(basic.closePrice) ?? hist[hist.length - 1]?.close;
  const marketCap = krw(info(integ, /^(시총|시가총액)/));
  const a = annual(fin);
  const unit = 1e8; // 네이버 재무제표 금액 단위: 억원
  const pe = n(info(integ, /^PER$|^PER\b/));
  const epsSeries = a.eps || [];
  const years = epsSeries.length - 1;
  const epsGrowth =
    years >= 1 && epsSeries[0] > 0 && epsSeries[years] > 0
      ? (Math.pow(epsSeries[years] / epsSeries[0], 1 / years) - 1) * 100
      : null;
  const cons = integ.consensusInfo || {};
  const recomm = n(cons.recommMean);
  const target = n(cons.priceTargetMean);
  const exchange = basic.stockExchangeType?.name || basic.stockExchangeName || null;

  return {
    symbol: code,
    name,
    // 은행·증권·보험은 부채 구조가 달라 판독에서 따로 다룬다
    sector:
      /금융|은행|지주$|증권|보험|생명|화재|카드|캐피탈/.test(name) && !/전자|화학|중공업/.test(name)
        ? "Financial Services"
        : null,
    industry: null,
    exchange,
    price,
    changePct: n(basic.fluctuationsRatio),
    marketCap,
    metrics: {
      pe,
      pb: n(info(integ, /^PBR/)),
      pcf: marketCap && a.operatingCashFlow > 0 ? marketCap / (a.operatingCashFlow * unit) : null,
      ps: marketCap && a.revenue ? marketCap / (a.revenue * unit) : null,
      divYield: n(info(integ, /배당수익률/)),
      roe: a.roe,
      roic: null,
      debtToEquity: a.debtRatio !== null && a.debtRatio !== undefined ? a.debtRatio / 100 : null,
      grossMargin: null,
      netMargin: a.netMarginRow ?? (a.netIncome && a.revenue ? (a.netIncome / a.revenue) * 100 : null),
      fcfYield: null,
      earningsYield: pe > 0 ? 100 / pe : null,
      evToEbitda: null,
    },
    growth: {
      revenueYoY: a.revenue && a.revenuePrev ? ((a.revenue - a.revenuePrev) / Math.abs(a.revenuePrev)) * 100 : null,
      sharesYoY: null,
      epsGrowth,
      epsGrowthBasis: epsGrowth === null ? null : `최근 ${years}년 EPS 연평균`,
    },
    history: hist,
    street:
      target || recomm
        ? {
            consensus: recomm === null ? null : recomm >= 3.5 ? "매수" : recomm >= 2.5 ? "중립" : "매도",
            analysts: null,
            buyShare: null,
            target,
            actions: [],
          }
        : null,
    dividend: {
      perShare: n(info(integ, /^주당배당금/)) ?? (a.dpsHistory?.length ? a.dpsHistory[a.dpsHistory.length - 1].value : null),
      eps: n(info(integ, /^EPS$/)),
      history: a.dpsHistory || [],
    },
    source: "네이버 증권",
  };
}

// 이름·코드 자동완성 (네이버 검색)
async function search(q) {
  const json = await getJson(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock`);
  return (json.items || [])
    .filter((x) => /^\d{6}$/.test(x.code || "") && (x.nationCode || "KOR") === "KOR")
    .slice(0, 8)
    .map((x) => ({ s: x.code, n: x.name, m: x.typeName || x.typeCode || "한국" }));
}

// 연동 점검용: 각 응답의 구조를 요약
async function probe(code) {
  const out = {};
  const tryJson = async (name, url) => {
    try {
      const j = await getJson(url);
      out[name] = { ok: true, keys: Object.keys(j || {}).slice(0, 30) };
      return j;
    } catch (e) {
      out[name] = { ok: false, error: e.message };
      return null;
    }
  };
  const basic = await tryJson("basic", `https://m.stock.naver.com/api/stock/${code}/basic`);
  if (basic) out.basic.sample = { stockName: basic.stockName, closePrice: basic.closePrice, exchange: basic.stockExchangeType };
  const integ = await tryJson("integration", `https://m.stock.naver.com/api/stock/${code}/integration`);
  if (integ) {
    out.integration.totalInfos = (integ.totalInfos || []).map((x) => `${x.key || x.code}=${x.value}`);
    out.integration.consensusInfo = integ.consensusInfo || null;
  }
  const fin = await tryJson("finance", `https://m.stock.naver.com/api/stock/${code}/finance/annual`);
  if (fin) {
    const t = findRows(fin);
    out.finance.periods = (t?.trTitleList || []).map((x) => `${x.key}${x.isConsensus === "Y" ? "(추정)" : ""}`);
    out.finance.rows = (t?.rowList || []).map((r) => r.title);
  }
  try {
    const h = await history(code);
    out.history = { ok: h.length > 0, rows: h.length, last: h[h.length - 1] };
  } catch (e) {
    out.history = { ok: false, error: e.message };
  }
  try {
    out.search = { ok: true, sample: (await search("삼성")).slice(0, 3) };
  } catch (e) {
    out.search = { ok: false, error: e.message };
  }
  return out;
}

// ---------- 미국 종목: 네이버 증권 해외주식 (키 불필요, FMP 한도가 바닥났을 때 대신 써요) ----------
const W = "https://api.stock.naver.com";
// 톰슨로이터 업종 코드 앞 두 자리 → 판독에서 쓰는 영문 업종명
const SECTOR = {
  50: "Energy", 51: "Basic Materials", 52: "Industrials", 53: "Consumer Cyclical", 54: "Consumer Defensive",
  55: "Financial Services", 56: "Healthcare", 57: "Technology", 59: "Utilities", 60: "Real Estate",
};
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");

// 티커(JPM) → 네이버 코드(JPM, AAPL.O 등)
async function worldCode(ticker) {
  const t = ticker.toUpperCase();
  const json = await getJson(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(t)}&target=stock`).catch(() => ({}));
  const hit = (json.items || []).find((x) => x.nationCode === "USA" && String(x.code).toUpperCase() === t);
  if (hit?.reutersCode) return hit.reutersCode;
  const e = new Error(`${t} 종목을 찾지 못했어요.`);
  e.status = 404;
  throw e;
}

// 연간 재무 표의 한 줄을 [오래된 해 → 최근 해] 숫자 배열로
function yearly(fin, title) {
  const row = (fin.rowList || []).find((r) => r.title === title);
  if (!row) return [];
  return Object.keys(row.columns || {})
    .sort()
    .map((k) => n(row.columns[k]?.value))
    .filter((v) => v !== null);
}

function consensusOf(cons) {
  const recomm = n(cons?.recommMean);
  const target = n(cons?.priceTargetMean);
  if (!target && !recomm) return null;
  return {
    consensus: recomm === null ? null : recomm >= 3.5 ? "매수" : recomm >= 2.5 ? "중립" : "매도",
    analysts: null,
    buyShare: null,
    target,
    targetHigh: n(cons?.priceTargetHigh),
    targetLow: n(cons?.priceTargetLow),
    actions: [],
  };
}

async function worldStock(ticker) {
  const code = await worldCode(ticker);
  const now = new Date();
  const from = new Date(Date.now() - 420 * 864e5);
  const [basic, fin, integ, chart] = await Promise.all([
    getJson(`${W}/stock/${code}/basic`),
    getJson(`${W}/stock/${code}/finance/annual`).catch(() => ({})),
    getJson(`${W}/stock/${code}/integration`).catch(() => ({})),
    getJson(`${W}/chart/foreign/item/${code}/day?startDateTime=${ymd(from)}0000&endDateTime=${ymd(now)}2359`),
  ]);
  const info = Object.fromEntries((basic.stockItemTotalInfos || []).map((x) => [x.code, x.value]));
  const history = (Array.isArray(chart) ? chart : [])
    .map((p) => ({
      date: `${p.localDate.slice(0, 4)}-${p.localDate.slice(4, 6)}-${p.localDate.slice(6, 8)}`,
      close: n(p.closePrice),
      high: n(p.highPrice),
      low: n(p.lowPrice),
    }))
    .filter((p) => p.close > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const price = n(basic.closePriceRaw ?? basic.closePrice) ?? history[history.length - 1]?.close ?? null;
  const marketCap = n(basic.marketValueFullRaw);
  const pe = n(info.per);
  const eps = n(info.eps), bps = n(info.bps);
  const rev = yearly(fin, "매출액"); // 단위: USD 백만
  const ni = yearly(fin, "당기순이익");
  const last = (a) => a[a.length - 1] ?? null;
  const prev = (a) => a[a.length - 2] ?? null;
  const years = ni.length - 1;
  // 네이버 해외주식은 연도별 EPS가 없어 순이익 증가율로 대신해요
  const epsGrowth = years >= 1 && ni[0] > 0 && last(ni) > 0 ? (Math.pow(last(ni) / ni[0], 1 / years) - 1) * 100 : null;
  const industryKor = basic.industryCodeType?.industryGroupKor || null;

  return {
    symbol: basic.symbolCode || ticker.toUpperCase(),
    name: basic.stockNameEng || basic.stockName || ticker,
    sector: SECTOR[String(basic.industryCodeType?.code || "").slice(0, 2)] || null,
    industry: industryKor && /금광|귀금속/.test(industryKor) ? `Gold (${industryKor})` : industryKor,
    exchange: basic.stockExchangeType?.name || basic.stockExchangeName || null,
    price,
    changePct: n(basic.fluctuationsRatioRaw ?? basic.fluctuationsRatio),
    marketCap,
    metrics: {
      pe,
      pb: n(info.pbr),
      pcf: null,
      ps: marketCap && last(rev) ? marketCap / (last(rev) * 1e6) : null,
      divYield: n(info.dividendYieldRatio),
      roe: eps !== null && bps > 0 ? (eps / bps) * 100 : null,
      roic: null,
      debtToEquity: null,
      grossMargin: null,
      netMargin: last(ni) !== null && last(rev) ? (last(ni) / last(rev)) * 100 : null,
      fcfYield: null,
      earningsYield: pe > 0 ? 100 / pe : null,
      evToEbitda: null,
    },
    growth: {
      revenueYoY: last(rev) !== null && prev(rev) ? ((last(rev) - prev(rev)) / Math.abs(prev(rev))) * 100 : null,
      sharesYoY: null,
      epsGrowth,
      epsGrowthBasis: epsGrowth === null ? null : `최근 ${years}년 순이익 연평균 (네이버)`,
    },
    history,
    street: consensusOf(integ.consensusInfo),
    dividend: {
      perShare: n(info.dividend),
      eps,
      exDate: info.exDividendAt && /\d/.test(info.exDividendAt) ? String(info.exDividendAt).replace(/\.$/, "").replace(/\./g, "-") : null,
      payDate: info.dividendAt && /\d/.test(info.dividendAt) ? String(info.dividendAt).replace(/\.$/, "").replace(/\./g, "-") : null,
    },
    source: "네이버 증권",
  };
}

// 월가 의견만 (FMP가 막혔을 때 '불러오기' 대체)
async function worldStreet(ticker) {
  const code = await worldCode(ticker);
  const integ = await getJson(`${W}/stock/${code}/integration`);
  return consensusOf(integ.consensusInfo);
}

// 미국 종목 자동완성 (한글 이름도 돼요: 마이크로소프트 → MSFT)
async function worldSearch(q) {
  const json = await getJson(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock`);
  return (json.items || [])
    .filter((x) => x.nationCode === "USA" && x.category === "stock" && !/\s/.test(x.code || ""))
    .slice(0, 8)
    .map((x) => ({ s: x.code, n: x.name, m: x.typeName || x.typeCode || "미국" }));
}

// ---------- 시장 지표: VIX·환율·원자재 (거의 실시간, FRED보다 1~2일 빨라요) ----------
// 해외 지수 일봉 (예: .VIX)
async function indexSeries(code, days = 420) {
  const from = new Date(Date.now() - days * 864e5);
  const rows = await getJson(`${W}/chart/foreign/index/${code}/day?startDateTime=${ymd(from)}0000&endDateTime=${ymd(new Date())}2359`);
  return (Array.isArray(rows) ? rows : [])
    .map((p) => ({
      date: `${p.localDate.slice(0, 4)}-${p.localDate.slice(4, 6)}-${p.localDate.slice(6, 8)}`,
      value: n(p.closePrice),
      volume: n(p.accumulatedTradingVolume),
    }))
    .filter((p) => p.value > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// 환율·원자재 일별 종가 (한 번에 60일까지라 나눠 받아요). path 예: "exchange/FX_USDKRW", "metals/GCcv1"
async function marketIndexSeries(path, pages = 5) {
  const all = await Promise.all(
    Array.from({ length: pages }, (_, i) => getJson(`${W}/marketindex/${path}/prices?page=${i + 1}&pageSize=60`).catch(() => []))
  );
  const byDate = new Map();
  for (const p of all.flat()) {
    const date = String(p.localTradedAt || "").slice(0, 10);
    const value = n(p.closePrice);
    if (date && value > 0) byDate.set(date, { date, value });
  }
  const list = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (list.length < 60) {
    const e = new Error(`네이버 ${path} 자료 부족`);
    e.status = 502;
    throw e;
  }
  return list;
}

// ---------- 화면 맨 위 롤링용 주요 지수 (현재 값 + 등락률) ----------
const INDEX_LIST = [
  { key: "spx", name: "S&P 500", url: `${W}/index/.INX/basic` },
  { key: "ndx", name: "나스닥", url: `${W}/index/.IXIC/basic` },
  { key: "dji", name: "다우", url: `${W}/index/.DJI/basic` },
  { key: "kospi", name: "코스피", url: "https://m.stock.naver.com/api/index/KOSPI/basic" },
  { key: "kosdaq", name: "코스닥", url: "https://m.stock.naver.com/api/index/KOSDAQ/basic" },
  { key: "vix", name: "VIX", url: `${W}/index/.VIX/basic` },
];
async function indices() {
  const list = await Promise.all(
    INDEX_LIST.map(async (it) => {
      try {
        const j = await getJson(it.url);
        const value = n(j.closePrice);
        return value === null ? null : { key: it.key, name: it.name, value, changePct: n(j.fluctuationsRatio), at: j.localTradedAt || null };
      } catch {
        return null;
      }
    })
  );
  // 원·달러 환율
  try {
    const fx = await getJson(`${W}/marketindex/exchange/FX_USDKRW`);
    const e = fx.exchangeInfo || fx;
    const value = n(e.closePrice);
    if (value !== null) list.push({ key: "usdkrw", name: "원·달러", value, changePct: n(e.fluctuationsRatio), at: e.localTradedAt || null, unit: "원" });
  } catch {}
  return list.filter(Boolean);
}

module.exports = { stock, search, probe, worldStock, worldStreet, worldSearch, indexSeries, marketIndexSeries, indices, bars, aggregate };
