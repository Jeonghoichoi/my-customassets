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
    e.status = res.status === 404 ? 404 : 502;
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
  return {
    revenue: lastOf(revenue),
    revenuePrev: prevOf(revenue),
    netIncome: lastOf(net),
    roe: lastOf(series(/^ROE/)),
    debtRatio: lastOf(series(/^부채비율/)),
    netMarginRow: lastOf(series(/^순이익률/)),
    operatingCashFlow: lastOf(ocf),
    eps, // 연도순
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

module.exports = { stock, search, probe };
