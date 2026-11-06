// 원자재 가격: FMP 선물 시세를 먼저 쓰고, 안 되면 FRED로 대체한다.
// FRED 대체는 구리가 월간(톤당 달러)이라 추세 판단용으로만 쓰고, 금은 FRED에 없어 생략된다.
const FMP = "https://financialmodelingprep.com/stable";
const FRED = "https://api.stlouisfed.org/fred/series/observations";

const ITEMS = {
  wti:    { name: "WTI 원유",  unit: "$/배럴",   fmp: "CLUSD", fred: "DCOILWTICO" },
  brent:  { name: "브렌트유",  unit: "$/배럴",   fmp: "BZUSD", fred: "DCOILBRENTEU" },
  copper: { name: "구리",      unit: "$/파운드", fmp: "HGUSD", fred: "PCOPPUSDM" },
  gold:   { name: "금",        unit: "$/온스",   fmp: "GCUSD", fred: null },
  natgas: { name: "천연가스",  unit: "$/MMBtu",  fmp: "NGUSD", fred: "DHHNGSP" },
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
