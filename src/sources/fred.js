// FRED(미 연준 경제데이터): 금리·정책금리·신용스프레드·변동성
const BASE = "https://api.stlouisfed.org/fred/series/observations";

const SERIES = {
  tenYear: "DGS10",      // 미국 10년물 국채 금리 (채권 신호)
  fedFunds: "DFF",       // 실효 연방기금금리 (통화정책 신호)
  creditSpread: "BAA10Y",// BAA 회사채 - 10년물 국채 스프레드 (위험 선호)
  vix: "VIXCLS",         // VIX 변동성 지수 (투자 심리)
  curve: "T10Y2Y",       // 10년-2년 금리차 (경기 기대)
  oil: "DCOILWTICO",     // WTI 유가 (물가·금리 압력)
};

async function series(id, key, days = 420) {
  const start = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const url = `${BASE}?series_id=${id}&api_key=${key}&file_type=json&observation_start=${start}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED ${id} 응답 ${res.status}`);
  const json = await res.json();
  return (json.observations || [])
    .filter((o) => o.value !== ".")
    .map((o) => ({ date: o.date, value: Number(o.value) }));
}

async function macroSeries(key) {
  const out = {};
  await Promise.all(
    Object.entries(SERIES).map(async ([name, id]) => {
      out[name] = await series(id, key);
    })
  );
  return out;
}

module.exports = { macroSeries };
