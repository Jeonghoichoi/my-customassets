// 원자재 가격: 네이버(선물, 키 불필요)를 먼저 쓰고, 안 되면 FMP → FRED 순으로 대체한다.
// FRED 대체는 구리가 월간(톤당 달러)이라 추세 판단용으로만 쓰고, 금은 FRED에 없어 생략된다.
const FMP = "https://financialmodelingprep.com/stable";
const FRED = "https://api.stlouisfed.org/fred/series/observations";

const naver = require("./naver");

const ITEMS = {
  wti:    { name: "WTI 원유",  unit: "$/배럴",   naver: "energy/CLcv1",  fmp: "CLUSD", fred: "DCOILWTICO" },
  brent:  { name: "브렌트유",  unit: "$/배럴",   naver: "energy/LCOcv1", fmp: "BZUSD", fred: "DCOILBRENTEU" },
  copper: { name: "구리",      unit: "$/파운드", naver: "metals/HGcv1",  fmp: "HGUSD", fred: "PCOPPUSDM" },
  gold:   { name: "금",        unit: "$/온스",   naver: "metals/GCcv1",  fmp: "GCUSD", fred: null },
  natgas: { name: "천연가스",  unit: "$/MMBtu",  naver: "energy/NGcv1",  fmp: "NGUSD", fred: "DHHNGSP" },
};

async function fromFmp(symbol, key) {
  const from = new Date(Date.now() - 420 * 864e5).toISOString().slice(0, 10);
  const res = await fetch(`${FMP}/historical-price-eod/light?${new URLSearchParams({ symbol, from, apikey: key })}`);
  if (!res.ok) throw new Error(`FMP ${symbol} ${res.status}`);
  const rows = await res.json();
  const list = (Array.isArray(rows) ? rows : rows.historical || [])
    .map((p) => ({ date: p.date, value: Number(p.price ?? p.close) }))
    .filter((p) => p.value > 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (list.length < 60) throw new Error(`FMP ${symbol} 자료 부족`);
  return list;
}

async function fromFred(id, key) {
  const start = new Date(Date.now() - 800 * 864e5).toISOString().slice(0, 10);
  const res = await fetch(`${FRED}?series_id=${id}&api_key=${key}&file_type=json&observation_start=${start}`);
  if (!res.ok) throw new Error(`FRED ${id} ${res.status}`);
  const json = await res.json();
  return (json.observations || []).filter((o) => o.value !== ".").map((o) => ({ date: o.date, value: Number(o.value) }));
}

async function fetchCommodities(fmpKey, fredKey) {
  const out = {};
  await Promise.all(Object.entries(ITEMS).map(async ([k, it]) => {
    try { out[k] = { ...it, source: "네이버 증권(선물)", series: await naver.marketIndexSeries(it.naver) }; return; }
    catch { /* 다음 출처로 */ }
    try { out[k] = { ...it, source: "FMP 선물", series: await fromFmp(it.fmp, fmpKey) }; }
    catch {
      if (!it.fred) return;
      try { out[k] = { ...it, source: "FRED", series: await fromFred(it.fred, fredKey), unit: k === "copper" ? "$/톤 (월간)" : it.unit }; }
      catch { /* 이 품목은 생략 */ }
    }
  }));
  return out;
}

module.exports = { fetchCommodities, ITEMS };
