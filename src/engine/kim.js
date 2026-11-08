// 김영익 교수의 시장 판단: 명목 GDP·광의통화(M2)로 '얼마나 비싼지', 일평균 수출·경기선행지수로 '어느 방향인지'를 봐요.
// 교수는 계산식을 공개하지 않아서, data/kim-views.json에 옮겨 둔 공개 결과값과 지금 코스피만 비교해요.
function loadView() {
  try {
    return require("../../data/kim-views.json");
  } catch {
    return null;
  }
}

// 받침이 있으면 을, 없으면 를 (숫자·%로 끝나면 그대로 "를")
const eul = (w) => {
  const c = String(w).charCodeAt(String(w).length - 1);
  return w + (c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? "을" : "를");
};
const fmt = (v) => Math.round(v).toLocaleString("ko-KR");

// 한국 시장 전체에 대한 네 가지 판단 (종목과 상관없이 같아요)
function kimMarket(kospiNow, spxNow = null) {
  const v = loadView();
  if (!v) return null;
  const ratio = (r) => (r && r.value && r.avg ? r.value / r.avg : null);
  const ratioGrade = (x) => (x === null ? null : x <= 1 ? 1 : x <= 1.3 ? 0.5 : 0);
  const gdp = ratio(v.gdpRatio), m2 = ratio(v.m2Ratio);
  const fair = v.exportFair?.kospi ?? null;
  const exportGap = fair && kospiNow ? ((fair - kospiNow) / kospiNow) * 100 : null;
  const checks = [
    {
      label: "명목 GDP 대비 시가총액 (버핏 지수)",
      value: gdp === null ? "자료 없음" : `${v.gdpRatio.value}% (평균 ${v.gdpRatio.avg}%)`,
      grade: ratioGrade(gdp),
      note: "주가는 길게 보면 명목 GDP 성장을 따라가요. 평균보다 30% 넘게 높으면 비싸요",
    },
    {
      label: "광의통화(M2) 대비 시가총액",
      value: m2 === null ? "자료 없음" : `${v.m2Ratio.value}% (평균 ${v.m2Ratio.avg}%)`,
      grade: ratioGrade(m2),
      note: "시중에 풀린 돈에 비해 주식 시장이 얼마나 큰지 봐요. 평균보다 높으면 돈보다 주가가 앞서 있어요",
    },
    {
      label: "수출 기준 적정 코스피",
      value: exportGap === null ? (fair ? `적정 ${fmt(fair)} (지금 코스피 자료 없음)` : "자료 없음") : `적정 ${fmt(fair)} vs 지금 ${fmt(kospiNow)}`,
      grade: exportGap === null ? null : exportGap >= 10 ? 1 : exportGap >= 0 ? 0.5 : 0,
      note: "일평균 수출액과 코스피는 함께 움직여요(상관계수 0.87). 적정치가 지금보다 10% 넘게 높으면 좋음",
    },
    {
      label: "경기선행지수 방향",
      value: { up: "상승 국면", down: "하락 국면", flat: "방향 탐색" }[v.leading] || "자료 없음",
      grade: v.leading === "up" ? 1 : v.leading === "flat" ? 0.5 : v.leading === "down" ? 0 : null,
      note: "선행지수가 꺾인 국면에서는 코스피가 추세적으로 오르기 어렵다고 봐요",
    },
  ];
  return { view: v, checks, exportGap, kospiNow: kospiNow ?? null, us: usMarket(v.us, spxNow) };
}

// 미국 시장: 교수가 영상·인터뷰에서 밝힌 판단(status)과 S&P 500 하단 전망을 지금 지수와 비교해요
const statusGrade = (x) => (!x || !x.status ? null : x.status === "good" ? 1 : x.status === "neutral" ? 0.5 : x.status === "bad" ? 0 : null);
const statusText = (x) => (!x || !x.status ? "자료 없음" : { good: "우호", neutral: "중립", bad: "경고" }[x.status] || "자료 없음");
function usMarket(u, spxNow) {
  if (!u) return null;
  const floor = u.sp500Floor?.value ?? null;
  const floorGap = floor && spxNow ? ((floor - spxNow) / spxNow) * 100 : null;
  const checks = [
    { label: "S&P 500 밸류에이션", value: statusText(u.valuation), grade: statusGrade(u.valuation), note: `${u.valuation?.text || ""} (${u.valuation?.date || "날짜 없음"})` },
    { label: "미국 신용융자 (빚투)", value: statusText(u.margin), grade: statusGrade(u.margin), note: `${u.margin?.text || ""} (${u.margin?.date || "날짜 없음"})` },
    { label: "미국 실물 경기 (소비·성장)", value: statusText(u.economy), grade: statusGrade(u.economy), note: `${u.economy?.text || ""} (${u.economy?.date || "날짜 없음"})` },
    {
      label: "교수의 S&P 500 하단 전망",
      value: floorGap === null ? (floor ? `${fmt(floor)} (지금 지수 자료 없음)` : "자료 없음") : `${fmt(floor)} vs 지금 ${fmt(spxNow)}`,
      grade: floorGap === null ? null : floorGap >= -5 ? 1 : floorGap >= -15 ? 0.5 : 0,
      note: `${u.sp500Floor?.text || ""} 지금 지수가 하단 전망보다 15% 넘게 높으면 아직 내려갈 여지가 크다고 봐요`,
    },
  ];
  return { view: u, checks, floorGap, spxNow: spxNow ?? null };
}

// 시장 화면의 '김영익의 한마디'
function kimLens(km) {
  if (!km) return null;
  const v = km.view;
  const parts = [];
  if (v.gdpRatio?.value) parts.push(`버핏 지수 ${v.gdpRatio.value}%(평균 ${v.gdpRatio.avg}%)`);
  if (v.m2Ratio?.value) parts.push(`M2 대비 ${v.m2Ratio.value}%(평균 ${v.m2Ratio.avg}%)`);
  const pricey = km.checks.slice(0, 2).some((c) => c.grade === 0);
  let text = parts.length ? `${parts.join(", ")}로 ${pricey ? "경제 규모와 돈의 양보다 주가가 앞서 있어요" : "경제 규모에 비해 비싸지 않아요"}. ` : "";
  if (v.leading === "down") text += "경기선행지수는 하락 국면이에요. ";
  else if (v.leading === "up") text += "경기선행지수는 상승 국면이에요. ";
  if (km.exportGap !== null)
    text += `수출 기준 적정 코스피는 ${fmt(v.exportFair.kospi)}로 지금보다 ${km.exportGap >= 0 ? `${km.exportGap.toFixed(0)}% 높아 단기 반등 여지는 있어요` : `${Math.abs(km.exportGap).toFixed(0)}% 낮아 수출보다 주가가 앞서 있어요`}. `;
  if (v.equityWeight) text += `주식 비중은 ${eul(v.equityWeight)} 권했어요. `;
  if (v.kospiView?.text) text += `${v.kospiView.text}. `;
  text += `(${v.asOf} 지표 기준)`;
  return { who: "김영익의 한마디", text: text.trim(), source: v.source || null };
}

// 시장 화면의 '김영익의 미국 한마디'
function kimUsLens(km) {
  const u = km?.us?.view;
  if (!u) return null;
  const parts = [u.valuation?.text, u.margin?.text, u.aiBubble?.text, u.sp500Floor?.text].filter(Boolean);
  if (!parts.length) return null;
  let text = parts.join(". ") + ".";
  if (km.us.floorGap !== null) text += ` 지금 S&P 500은 그 전망보다 ${Math.abs(km.us.floorGap).toFixed(0)}% ${km.us.floorGap < 0 ? "높아요" : "낮아요"}.`;
  if (u.advice) text += ` 교수는 ${eul(u.advice)} 권했어요.`;
  text += ` (${u.asOf} 기준)`;
  const src = [u.sp500Floor, u.valuation].find((x) => x && x.url);
  return { who: "김영익의 미국 한마디", text, source: src ? { title: "김영익 교수 인터뷰", url: src.url } : null };
}

module.exports = { kimMarket, kimLens, kimUsLens, eul };
