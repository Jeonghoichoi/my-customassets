// 종목 판독: 세 투자자의 공개된 원칙을 숫자 규칙으로 옮긴 것.
// 실제 인물의 의견이 아니라 "이 원칙대로 보면 어떻게 읽히는가"를 보여줍니다.
const f = (v, d = 1, unit = "") => (v === null || v === undefined || Number.isNaN(v) ? "자료 없음" : `${v.toFixed(d)}${unit}`);
const isFinancial = (s) => /financial|bank/i.test(s.sector || "");

// 3단계 채점: 좋음 1, 보통 0.5, 미달 0, 자료 없음 null
function grade(v, good, ok, lowerIsBetter = true) {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  if (lowerIsBetter) {
    if (v <= 0) return 0;
    return v <= good ? 1 : v <= ok ? 0.5 : 0;
  }
  return v >= good ? 1 : v >= ok ? 0.5 : 0;
}
const scoreOf = (checks) => {
  const graded = checks.filter((c) => c.grade !== null);
  return graded.length ? Math.round((graded.reduce((s, c) => s + c.grade, 0) / graded.length) * 100) : null;
};

// 래리 윌리엄스: 가치의 일곱 가지 척도 + 시장 타이밍
function williams(stock, stats, macro) {
  const m = stock.metrics;
  const r12 = stats.return12m;
  const momentum = r12 === null ? null : r12 > 60 ? 0.5 : r12 >= 0 ? 1 : r12 >= -10 ? 0.5 : 0;
  const checks = [
    { label: "PER", value: f(m.pe, 1, "배"), grade: grade(m.pe, 12, 20), note: "12배 이하 좋음, 20배 이하 보통" },
    { label: "PBR", value: f(m.pb, 2, "배"), grade: grade(m.pb, 1.5, 3), note: "1.5배 이하 좋음" },
    { label: "PCR (주가/영업현금흐름)", value: f(m.pcf, 1, "배"), grade: isFinancial(stock) ? null : grade(m.pcf, 8, 15), note: isFinancial(stock) ? "금융사는 현금흐름 구조가 달라 제외" : "8배 이하 좋음" },
    { label: "PSR", value: f(m.ps, 2, "배"), grade: grade(m.ps, 1.5, 3), note: "1.5배 이하 좋음" },
    { label: "배당수익률", value: f(m.divYield, 2, "%"), grade: grade(m.divYield, 3, 1.5, false), note: "3% 이상 좋음" },
    { label: "ROE", value: f(m.roe, 1, "%"), grade: grade(m.roe, 15, 10, false), note: "15% 이상 좋음" },
    { label: "최근 12개월 주가", value: f(r12, 1, "%"), grade: momentum, note: "0~60% 상승이 이상적. 크게 빠졌으면 싼 이유를, 너무 올랐으면 인기를 의심" },
  ];
  const value = scoreOf(checks);
  const timing = macro.score;
  const goodStock = value >= 65, goodTime = timing >= 15;
  const verdict =
    goodStock && goodTime ? "좋은 주식이 좋은 때를 만났어요. 책의 기준으로는 분할 매수를 검토할 조건이에요." :
    goodStock ? "좋은 주식이지만 때가 아직이에요. 시장 신호가 바닥 쪽으로 더 기울 때를 기다려요." :
    goodTime ? "때는 좋지만 가치 지표가 부족해요. 같은 시기라면 더 싼 종목을 찾아요." :
    "가치와 타이밍 모두 기준에 못 미쳐요.";
  return { key: "williams", name: "래리 윌리엄스", idea: "좋은 주식을 좋은 때에", score: value, verdict, checks };
}

// 워렌 버핏: 훌륭한 기업을 적당한 가격에, 국채와 비교한 기대수익
function buffett(stock, stats, macro) {
  const m = stock.metrics;
  const fin = isFinancial(stock);
  const spread = m.earningsYield !== null ? m.earningsYield - macro.tenYear : null;
  const checks = [
    { label: "지속적인 고수익 (ROE)", value: f(m.roe, 1, "%"), grade: grade(m.roe, 20, 15, false), note: "자기자본으로 20% 이상 버는 기업은 해자가 있을 가능성이 커요" },
    { label: "가격 결정력 (매출총이익률)", value: f(m.grossMargin, 1, "%"), grade: fin ? null : grade(m.grossMargin, 40, 25, false), note: fin ? "금융사는 제외" : "40% 이상이면 경쟁에 덜 휘둘리는 사업" },
    { label: "보수적인 부채 (부채비율)", value: f(m.debtToEquity, 2, "배"), grade: fin ? null : grade(m.debtToEquity, 0.5, 1), note: fin ? "금융사는 부채가 사업 구조라 제외" : "0.5배 이하 좋음" },
    { label: "주주 몫의 현금 (FCF 수익률)", value: f(m.fcfYield, 1, "%"), grade: fin ? null : grade(m.fcfYield, 6, 3, false), note: "시가총액 대비 잉여현금흐름. 6% 이상 좋음" },
    { label: "국채 대비 이익수익률", value: spread === null ? "자료 없음" : `${f(m.earningsYield, 1, "%")} vs 미 국채 ${macro.tenYear.toFixed(2)}%`, grade: spread === null ? null : spread >= 3 ? 1 : spread >= 0 ? 0.5 : 0, note: stock.market === "KR" ? "한국 종목이지만 지금은 미국 10년물과 비교해요. 한국 국고채 기준은 다음 단계에서 추가해요" : "이익수익률(1/PER)이 국채보다 3%p 이상 높으면 좋음" },
    { label: "미스터 마켓의 할인", value: f(stats.fromHigh, 1, "%"), grade: stats.fromHigh <= -20 ? 1 : stats.fromHigh <= -10 ? 0.5 : 0, note: "1년 고점 대비 -20% 이상 빠졌으면 시장이 할인 중" },
  ];
  const score = scoreOf(checks);
  const verdict =
    score >= 70 ? "훌륭한 기업이 적당한 가격에 나와 있어요. 오래 들고 갈 이유를 확인할 단계예요." :
    score >= 50 ? "좋은 사업이지만 가격이나 재무 중 한쪽이 아쉬워요. 더 싸질 때까지 지켜봐요." :
    "버핏의 기준에서는 사업의 질이나 가격이 충분하지 않아요.";
  return { key: "buffett", name: "워렌 버핏", idea: "훌륭한 기업을 적당한 가격에", score, verdict, checks };
}

// 찰리 멍거: 뒤집어 생각하기. 망하는 길부터 지운다
function munger(stock, stats) {
  const m = stock.metrics, g = stock.growth;
  const fin = isFinancial(stock);
  const flags = [
    { label: "과도한 부채", hit: !fin && m.debtToEquity !== null && m.debtToEquity > 2, value: f(m.debtToEquity, 2, "배"), weight: 20 },
    { label: "현금을 못 버는 사업", hit: !fin && m.fcfYield !== null && m.fcfYield <= 0, value: f(m.fcfYield, 1, "%"), weight: 20 },
    { label: "줄어드는 매출", hit: g.revenueYoY !== null && g.revenueYoY < 0, value: f(g.revenueYoY, 1, "%"), weight: 15 },
    { label: "주주 지분 희석", hit: g.sharesYoY !== null && g.sharesYoY > 2, value: f(g.sharesYoY, 1, "%"), weight: 10 },
    { label: "기대가 너무 큰 가격", hit: m.pe !== null && m.pe > 40, value: f(m.pe, 1, "배"), weight: 15 },
    { label: "낮은 자본 효율", hit: m.roic !== null && m.roic < 8, value: f(m.roic, 1, "%"), weight: 15 },
    { label: "얇은 이익", hit: m.netMargin !== null && m.netMargin < 5, value: f(m.netMargin, 1, "%"), weight: 10 },
  ];
  const bonus = m.roic !== null && m.roic >= 15 ? 10 : 0;
  const score = Math.max(0, Math.min(100, 100 - flags.filter((x) => x.hit).reduce((s, x) => s + x.weight, 0) + bonus));
  const hits = flags.filter((x) => x.hit);
  const verdict = hits.length === 0
    ? "피해야 할 이유를 찾지 못했어요. 멍거라면 이제 '얼마에 사느냐'만 남았다고 볼 거예요."
    : `피해야 할 이유 ${hits.length}가지가 보여요: ${hits.map((x) => x.label).join(", ")}. 이 문제가 일시적인지부터 확인하세요.`;
  const checks = flags.map((x) => ({ label: x.label, value: x.value, grade: x.value === "자료 없음" ? null : x.hit ? 0 : 1, note: x.hit ? "경고" : "문제 없음" }));
  if (bonus) checks.push({ label: "높은 자본 효율 (ROIC)", value: f(m.roic, 1, "%"), grade: 1, note: "15% 이상이면 가산" });
  return { key: "munger", name: "찰리 멍거", idea: "뒤집어 생각하라", score, verdict, checks };
}


// 피터 린치: 아는 회사를 성장 대비 싸게. PEG와 기업 유형 분류
function lynch(stock, stats) {
  const m = stock.metrics, g = stock.growth;
  const growth = g.epsGrowth;
  const peg = m.pe > 0 && growth > 0 ? m.pe / growth : null;
  // 배당까지 더한 린치식 보정: (성장률 + 배당률) / PER, 2 이상이면 매력적
  const yieldAdj = m.pe > 0 && growth !== null ? (growth + (m.divYield || 0)) / m.pe : null;
  const sector = stock.sector || "";
  const type =
    m.pb !== null && m.pb < 1 ? "자산주" :
    /energy|materials|basic|industrial/i.test(sector) ? "경기순환주" :
    growth === null ? "분류 보류" :
    growth >= 20 ? "고성장주" : growth >= 10 ? "대형우량주" : growth >= 0 ? "저성장주" : "회생주 후보";
  const checks = [
    { label: "PEG (PER ÷ EPS 성장률)", value: peg === null ? "계산 불가" : `${peg.toFixed(2)}`, grade: peg === null ? null : peg <= 1 ? 1 : peg <= 1.5 ? 0.5 : 0, note: `1 이하면 성장 대비 싸요. 성장률 기준: ${g.epsGrowthBasis || "자료 없음"}` },
    { label: "배당 보정 PEG", value: yieldAdj === null ? "계산 불가" : yieldAdj.toFixed(2), grade: yieldAdj === null ? null : yieldAdj >= 2 ? 1 : yieldAdj >= 1 ? 0.5 : 0, note: "(성장률+배당률)÷PER. 2 이상 매력적, 1 미만 비쌈" },
    { label: "EPS 성장률", value: f(growth, 1, "%"), grade: grade(growth, 15, 8, false), note: "린치는 20~25%를 이상적 성장으로 봤고, 너무 빠르면 지속성을 의심" },
    { label: "부채비율", value: f(m.debtToEquity, 2, "배"), grade: isFinancial(stock) ? null : grade(m.debtToEquity, 0.5, 1), note: "어려울 때 버틸 재무 체력" },
    { label: "주가 조정", value: f(stats.fromHigh, 1, "%"), grade: stats.fromHigh <= -20 ? 1 : stats.fromHigh <= -10 ? 0.5 : 0, note: "좋은 회사가 시장 전체 하락에 같이 끌려갔을 때가 기회" },
  ];
  const score = scoreOf(checks);
  const tips = { 고성장주: "성장이 꺾이는 순간을 가장 경계해요.", 대형우량주: "30~50% 오르면 차익을 보고 다른 우량주로 갈아타는 유형이에요.", 저성장주: "배당을 보고 사는 유형이라 큰 시세를 기대하지 않아요.", 경기순환주: "PER이 가장 낮아 보일 때가 오히려 고점일 수 있는 유형이에요.", 자산주: "숨은 자산 가치가 드러날 계기가 있는지가 핵심이에요.", "회생주 후보": "이익이 줄고 있어요. 회복 근거가 보이기 전엔 조심해요.", "분류 보류": "" };
  const verdict = `${type}로 분류돼요. ${score >= 65 ? "성장에 비해 싼 가격이에요." : score >= 45 ? "가격과 성장이 대체로 균형이에요." : "성장에 비해 비싸거나 성장 근거가 약해요."} ${tips[type] || ""}`.trim();
  return { key: "lynch", name: "피터 린치", idea: "성장보다 싸게 산다", score, verdict, checks };
}

// 스탠리 드러켄밀러: 유동성과 추세가 같은 방향일 때 크게
function druckenmiller(stock, stats, macro) {
  const liq = macro.liquidity || {};
  const st = (k) => macro.signals.find((x) => x.key === k)?.status;
  const checks = [
    { label: "연준 유동성 방향", value: liq.fedChange6m === undefined ? "자료 없음" : `6개월 ${liq.fedChange6m >= 0 ? "+" : ""}${liq.fedChange6m.toFixed(2)}%p`, grade: liq.fedChange6m === undefined ? null : liq.fedChange6m <= -0.25 ? 1 : liq.fedChange6m < 0.25 ? 0.5 : 0, note: "주가를 움직이는 건 이익보다 유동성. 금리를 내리는 쪽이 우호적" },
    { label: "신용시장", value: st("credit") === "on" ? "안도" : st("credit") === "off" ? "방심" : "평온", grade: st("credit") === "on" ? 1 : st("credit") === "off" ? 0 : 0.5, note: "회사채 스프레드가 좁혀지면 위험 자산에 돈이 돌아요" },
    { label: "장단기 금리차", value: liq.curve === null || liq.curve === undefined ? "자료 없음" : `${liq.curve.toFixed(2)}%p`, grade: liq.curve === null || liq.curve === undefined ? null : liq.curve > 0 && liq.curveChange6m > 0 ? 1 : liq.curve > 0 ? 0.5 : 0, note: "역전에서 벗어나 가팔라지면 경기 기대 회복" },
    (() => { const r = macro.signals.find((x) => x.key === "cuau"); return { label: "구리/금 비율 (성장 기대)", value: r ? r.value : "자료 없음", grade: !r || r.value === "자료 없음" ? null : r.status === "on" ? 1 : r.status === "off" ? 0 : 0.5, note: "드러켄밀러가 즐겨 보는 성장 대 불안의 저울. 구리가 금보다 강하면 위험 선호" }; })(),
    { label: "장기 추세 (200일선)", value: f(stats.vsMa200, 1, "%"), grade: stats.vsMa200 === null ? null : stats.vsMa200 > 0 ? 1 : stats.vsMa200 > -5 ? 0.5 : 0, note: "추세를 거스르지 않아요. 200일선 위가 우호적" },
    { label: "상대 강도 (12개월)", value: f(stats.return12m, 1, "%"), grade: stats.return12m > 15 ? 1 : stats.return12m > 0 ? 0.5 : 0, note: "시장이 이미 알아보기 시작한 종목에 실려요" },
    { label: "실적 모멘텀", value: f(stock.growth.revenueYoY, 1, "%"), grade: grade(stock.growth.revenueYoY, 10, 3, false), note: "매출이 늘고 있는가" },
  ];
  const score = scoreOf(checks);
  const macroPart = checks.slice(0, 4).filter((c) => c.grade !== null);
  const macroOk = macroPart.length && macroPart.reduce((s, c) => s + c.grade, 0) / macroPart.length >= 0.6;
  const trendOk = (checks[4].grade ?? 0) + (checks[5].grade ?? 0) >= 1.5;
  const verdict =
    macroOk && trendOk ? "유동성과 추세가 같은 방향이에요. 드러켄밀러라면 확신을 갖고 비중을 싣는 조건이에요." :
    trendOk ? "종목 추세는 좋지만 유동성이 받쳐주지 않아요. 작게 들고 유동성 전환을 기다려요." :
    macroOk ? "유동성은 우호적인데 종목 추세가 아직이에요. 추세가 돌아설 때까지 관망해요." :
    "유동성도 추세도 우호적이지 않아요. 드러켄밀러라면 이 종목에 걸지 않아요.";
  return { key: "druckenmiller", name: "스탠리 드러켄밀러", idea: "유동성과 추세에 건다", score, verdict, checks };
}

// 빌 애크먼: 단순하고 예측 가능하며 현금을 잘 버는 기업이 일시적으로 쌀 때
function ackman(stock, stats) {
  const m = stock.metrics, fin = isFinancial(stock);
  const checks = [
    { label: "현금 창출력 (FCF 수익률)", value: f(m.fcfYield, 1, "%"), grade: fin ? null : grade(m.fcfYield, 6, 4, false), note: "잉여현금흐름이 기업 가치의 핵심" },
    { label: "자본 효율 (ROIC)", value: f(m.roic, 1, "%"), grade: grade(m.roic, 15, 10, false), note: "진입장벽이 높은 사업일수록 높아요" },
    { label: "이익의 질 (순이익률)", value: f(m.netMargin, 1, "%"), grade: grade(m.netMargin, 15, 8, false), note: "예측 가능한 고마진 사업" },
    { label: "성장 지속성 (매출)", value: f(stock.growth.revenueYoY, 1, "%"), grade: grade(stock.growth.revenueYoY, 5, 0, false), note: "매출이 꾸준히 늘거나 최소한 유지" },
    { label: "감당 가능한 부채", value: f(m.debtToEquity, 2, "배"), grade: fin ? null : grade(m.debtToEquity, 1, 2), note: "적당한 부채는 괜찮지만 위기에 버틸 수준이어야" },
    { label: "일시적 할인", value: f(stats.fromHigh, 1, "%"), grade: stats.fromHigh <= -20 ? 1 : stats.fromHigh <= -10 ? 0.5 : 0, note: "좋은 기업이 일시적 악재로 빠졌을 때가 진입 시점" },
  ];
  const score = scoreOf(checks);
  const quality = scoreOf(checks.slice(0, 5));
  const verdict =
    quality >= 70 && checks[5].grade >= 0.5 ? "질 좋은 기업이 할인된 가격에 있어요. 애크먼이 집중 투자하는 전형적인 조건이에요. 악재가 일시적인지 확인하세요." :
    quality >= 70 ? "사업의 질은 훌륭하지만 할인이 크지 않아요. 시장이 기회를 줄 때까지 기다려요." :
    "애크먼이 찾는 '단순하고 예측 가능한 현금 기계'와는 거리가 있어요.";
  return { key: "ackman", name: "빌 애크먼", idea: "질 좋은 기업을 할인가에 집중", score, verdict, checks };
}

// 마이클 버리: 남들이 버린 곳에서 숫자로 싼 것을 찾고, 거품은 경계한다
function burry(stock, stats, macro) {
  const m = stock.metrics, fin = isFinancial(stock);
  const checks = [
    { label: "EV/EBITDA", value: f(m.evToEbitda, 1, "배"), grade: fin ? null : grade(m.evToEbitda, 6, 9), note: "부채까지 포함한 기업 가치가 영업이익의 몇 배인지. 6배 이하면 싸요" },
    { label: "FCF 수익률", value: f(m.fcfYield, 1, "%"), grade: fin ? null : grade(m.fcfYield, 10, 6, false), note: "시가총액 대비 현금. 10% 이상이면 숫자가 말해주는 저평가" },
    { label: "PBR", value: f(m.pb, 2, "배"), grade: grade(m.pb, 1.2, 2), note: "청산 가치에 가까울수록 안전마진" },
    { label: "외면받는 정도 (12개월)", value: f(stats.return12m, 1, "%"), grade: stats.return12m <= -15 ? 1 : stats.return12m <= 5 ? 0.5 : 0, note: "남들이 버린 종목일수록 기회. 인기 종목은 피해요" },
    { label: "생존 가능성 (부채)", value: f(m.debtToEquity, 2, "배"), grade: fin ? null : grade(m.debtToEquity, 1, 2), note: "싸도 망하면 끝. 버틸 재무인지" },
  ];
  const score = scoreOf(checks);
  const bubble = macro.signals.find((x) => x.key === "margin")?.status === "off";
  const verdict =
    (score >= 65 ? "숫자로 확인되는 저평가이고 시장이 외면하고 있어요. 버리가 좋아하는 역발상 구간이에요." :
     score >= 45 ? "일부 지표는 싸지만 충분히 외면받지는 않았어요." :
     "버리의 기준에서는 싸지 않아요. 인기가 가격에 이미 반영돼 있어요.") +
    (bubble ? " 다만 시장 전체의 빚투가 사상 최고 수준이라, 버리라면 시장 하락에 대한 대비도 함께 할 거예요." : "");
  return { key: "burry", name: "마이클 버리", idea: "버려진 곳의 숫자를 본다", score, verdict, checks };
}


// 투자자별 성향: 판독 결과를 읽을 때 "누구의 눈으로 본 것인지" 알려준다
const PROFILES = {
  williams: { type: "타이밍 전략가", horizon: "수개월~1년", risk: "공격적이나 손절 엄격", focus: "시장 주기·계절성 + 가치", question: "지금이 통계적으로 오를 확률이 높은 때인가?", blindSpot: "과거 패턴이 이번에도 반복된다는 보장이 없어요." },
  buffett: { type: "장기 가치 투자자", horizon: "10년 이상, 영구 보유 지향", risk: "매우 보수적, 부채 회피", focus: "경제적 해자와 경영진", question: "10년 뒤에도 이 사업이 더 강해져 있을까?", blindSpot: "빠르게 변하는 산업과 성장주를 늦게 받아들이는 편이에요." },
  munger: { type: "역발상 사고가", horizon: "매우 장기", risk: "보수적, 극소수 집중", focus: "망하는 길부터 지우기", question: "어떻게 하면 이 투자가 실패할까?", blindSpot: "기준이 엄격해 기회 자체를 적게 잡아요." },
  lynch: { type: "성장주 사냥꾼 (GARP)", horizon: "3~5년", risk: "중립, 폭넓게 분산", focus: "성장 대비 가격, 생활 속 발굴", question: "이 회사가 왜 좋은지 2분 안에 설명할 수 있나?", blindSpot: "경기순환주의 낮은 PER을 저평가로 오인할 수 있어요." },
  druckenmiller: { type: "거시 유동성 트레이더", horizon: "12~24개월 앞을 보고 빠르게 수정", risk: "공격적, 확신 시 크게 집중", focus: "연준 유동성과 가격 추세", question: "1~2년 뒤 돈은 어디로 흘러가 있을까?", blindSpot: "거시 판단이 틀리면 변동이 커요. 대신 틀리면 빠르게 인정해요." },
  ackman: { type: "행동주의 집중 투자자", horizon: "수년, 경영 개입", risk: "공격적, 10개 안팎 집중", focus: "단순·예측 가능한 현금 기계", question: "이 회사는 단순하고 예측 가능하게 현금을 버는가?", blindSpot: "집중 투자라 한 종목의 실패가 크게 남아요." },
  burry: { type: "딥밸류 역발상가", horizon: "수개월~수년, 비대칭 베팅", risk: "역발상, 헤지 병행", focus: "숫자로 싼 외면받은 종목, 거품 경계", question: "남들이 버린 것 중 숫자로 확실히 싼 것은?", blindSpot: "너무 일찍 맞는 경우가 많아, 맞기 전까지 오래 버텨야 해요." },
};

// 종목 단위 월가 의견과 원칙 판독을 비교
function streetView(stock, judges) {
  const st = stock.street;
  if (!st || (!st.consensus && !st.target)) return null;
  const upside = st.target && stock.price ? ((st.target - stock.price) / stock.price) * 100 : null;
  const bull = /buy|outperform|overweight/i.test(st.consensus || "") || (st.buyShare ?? 0) >= 60;
  const bear = /sell|underperform|underweight/i.test(st.consensus || "");
  const fav = judges.filter((j) => (j.score ?? 0) >= 65).length;
  let reading;
  if (bull && fav >= 4) reading = "월가와 원칙 판독이 같은 방향이에요. 의견이 모일수록 기대도 가격에 반영되니, 목표가까지 남은 여력을 함께 보세요.";
  else if (bull && fav <= 2) reading = "월가는 낙관하는데 원칙 판독은 경계해요. 윌리엄스와 버리의 눈으로 보면 모두가 좋다고 할 때 그 기대가 이미 가격에 들어가 있을 수 있어요.";
  else if (!bull && fav >= 4) reading = "월가는 미지근한데 원칙 판독은 우호적이에요. 버리가 좋아하는 '외면받은 저평가' 조건에 가까워요. 왜 외면받는지부터 확인하세요.";
  else if (bear) reading = "월가가 부정적이에요. 원칙상 좋더라도 악재가 일시적인지 먼저 확인할 구간이에요.";
  else reading = "월가 의견과 원칙 판독이 뚜렷하게 같은 방향을 가리키지 않아요.";
  if (bull && upside !== null && upside < 3) reading += " 주가가 이미 평균 목표가에 거의 도달해, 목표가 상향 없이는 추가 매수 근거가 약해져요.";
  return { ...st, upside, reading };
}

// 주가 위치와 기술적 신호: 지금 가격이 저점권인가
function technicals(stock, stats, macro) {
  const items = [];
  let pts = 0;

  if (stats.fromHigh <= -25) pts += 2; else if (stats.fromHigh <= -12) pts += 1; else if (stats.fromHigh > -3) pts -= 1;
  if (stats.vsMa200 !== null) { if (stats.vsMa200 < -10) pts += 1; else if (stats.vsMa200 > 15) pts -= 1; }

  const r = stats.rsi14;
  if (r !== null) {
    let status = "neutral", note = "30 아래면 과매도, 70 위면 과매수예요. 지금은 중간이에요.";
    if (r < 30) { pts += 2; status = "on"; note = "30 아래 과매도 구간이에요. 매도가 지나쳤다는 신호지만, 하락 추세에서는 오래 머물 수 있어요."; }
    else if (r < 40) { pts += 1; status = "on"; note = "과매도에 가까운 약세 구간이에요."; }
    else if (r > 70) { pts -= 2; status = "off"; note = "70 위 과매수 구간이에요. 단기 과열이에요."; }
    items.push({ key: "rsi", label: "RSI (14)", value: r, display: r.toFixed(0), low: 30, high: 70, status, note });
  }

  const o = stats.osc;
  if (o) {
    let status = "neutral";
    let note = `%K ${o.k.toFixed(0)}, %D ${o.d.toFixed(0)}. 20 아래 과매도, 80 위 과매수예요.`;
    if (o.k < 20) { pts += 1; status = "on"; note = `%K ${o.k.toFixed(0)}로 과매도 구간이에요.`; }
    if (o.crossUp && Math.min(o.k, o.prevK) < 30) { pts += 1; status = "on"; note += " 과매도 구간에서 %K가 %D를 위로 뚫었어요(골든크로스). 반등 시작을 확인하는 신호예요."; }
    else if (o.k < 20) note += " 아직 %K가 %D를 위로 뚫지 않아, 반등 확인 전이에요.";
    if (o.k > 80) { pts -= 1; status = "off"; note = `%K ${o.k.toFixed(0)}로 과매수 구간이에요.`; }
    if (o.crossDown && Math.max(o.k, o.prevK) > 70) { pts -= 1; status = "off"; note += " 과매수 구간에서 %K가 %D 아래로 내려왔어요(데드크로스)."; }
    if (o.approximated) note += " 고가·저가 자료가 없어 종가로 근사했어요.";
    items.push({ key: "stoch", label: "스토캐스틱 슬로우 (14, 3, 3)", value: o.k, value2: o.d, display: `${o.k.toFixed(0)} / ${o.d.toFixed(0)}`, low: 20, high: 80, status, note });

    const wr = o.williamsR;
    items.push({
      key: "wr", label: "윌리엄스 %R (14)", value: wr + 100, display: wr.toFixed(0), low: 20, high: 80,
      status: wr < -80 ? "on" : wr > -20 ? "off" : "neutral",
      note: "래리 윌리엄스가 직접 만든 지표예요. 최근 14일 범위에서 종가 위치를 보며, -80 아래면 과매도, -20 위면 과매수예요. 단독 매수 신호로 쓰기보다 시장 주기·가치 지표와 함께 확인하는 것이 책의 접근이에요.",
    });
  }

  // 유가 연동: 에너지주는 유가 방향을 따로 봐야 한다
  if (/energy/i.test(stock.sector || "")) {
    const oilSig = macro.signals.find((x) => x.key === "oil");
    if (oilSig) items.push({ key: "oil", label: "유가 영향", display: macro.oil ? `WTI $${macro.oil.toFixed(1)}` : "자료 없음", status: oilSig.status === "on" ? "off" : oilSig.status === "off" ? "on" : "neutral", note: `${oilSig.value}. 에너지 기업은 유가가 오를 때 이익이 늘어나서, 시장 전체와 반대로 읽어야 해요. 유가 하락은 시장엔 순풍이지만 이 종목엔 역풍이에요.` });
  }

  // 원자재 연동: 소재·산업재는 구리, 금광주는 금 방향을 함께 본다
  const sigOf = (k) => macro.signals.find((x) => x.key === k);
  if (/gold|precious/i.test(stock.industry || "")) {
    const g = (macro.commodities || []).find((c) => c.key === "gold");
    if (g) items.push({ key: "gold", label: "금 가격 영향", display: `$${Math.round(g.price).toLocaleString("en-US")}`, status: g.m3 > 5 ? "on" : g.m3 < -5 ? "off" : "neutral", note: `금광 기업은 금값을 그대로 따라가요. 3개월 ${g.m3 >= 0 ? "+" : ""}${g.m3.toFixed(0)}%, 1년 고점 대비 ${g.fromHigh.toFixed(0)}%.` });
  } else if (/materials|industrial/i.test(stock.sector || "")) {
    const cu = sigOf("copper");
    if (cu) items.push({ key: "copper", label: "구리 가격 영향", display: cu.value.split(" (")[0], status: cu.status, note: `${cu.value}. 소재·산업재 기업의 실적은 구리로 대표되는 실물 수요와 함께 움직여요.` });
  }

  const label = pts >= 4 ? "저점권" : pts >= 1 ? "눌림 구간" : pts <= -2 ? "과열권" : "중간 지대";
  return { points: pts, label, items };
}

function judgeStock(stock, stats, macro) {
  const judges = [williams(stock, stats, macro), buffett(stock, stats, macro), munger(stock, stats), lynch(stock, stats), druckenmiller(stock, stats, macro), ackman(stock, stats), burry(stock, stats, macro)];
  const position = technicals(stock, stats, macro);
  // 바늘 위치: 종목 가격 위치 50% + 시장 신호 30% + 세 판독 평균 20%
  const avgJudge = judges.reduce((s, j) => s + (j.score ?? 50), 0) / judges.length;
  const needle = Math.round(Math.max(-100, Math.min(100, (Math.max(-7, Math.min(7, position.points)) / 7) * 100 * 0.5 + macro.score * 0.3 + (avgJudge - 50) * 2 * 0.2)));
  judges.forEach((j) => { j.profile = PROFILES[j.key]; });
  const favorable = judges.filter((j) => (j.score ?? 0) >= 65).length;
  const consensus = { favorable, total: judges.length, names: judges.filter((j) => (j.score ?? 0) >= 65).map((j) => j.name) };
  return { judges, position, needle, consensus, street: streetView(stock, judges) };
}

module.exports = { judgeStock };
