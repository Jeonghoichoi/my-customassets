// 시장 바닥 판독: 래리 윌리엄스 『좋은 주식은 때가 있다』의 주기 + 4가지 보조 신호
const { avg, last, valueDaysAgo } = require("./indicators");

// status: "on"(바닥 쪽 신호) / "neutral" / "off"(과열·역풍)
const sig = (key, title, points, status, value, detail) => ({ key, title, points, status, value, detail });

function cycleSignals(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const out = [];

  // 4년 주기: 미국 중간선거 해(4로 나눈 나머지 2) 하반기에 저점이 반복되는 경향
  const phase = y % 4;
  if (phase === 2 && m >= 8) out.push(sig("cycle4", "4년 주기", 2, "on", "중간선거 해 하반기", "역사적으로 4년 주기 저점이 자주 나온 구간이에요. 이후 12개월이 통계적으로 강했어요."));
  else if (phase === 3) out.push(sig("cycle4", "4년 주기", 1, "on", "중간선거 다음 해", "4년 주기 저점 이후 회복 구간에 해당해요."));
  else if (phase === 1) out.push(sig("cycle4", "4년 주기", -1, "off", "대선 다음 해", "4년 주기상 저점을 향해 가는 경우가 많았던 구간이에요."));
  else out.push(sig("cycle4", "4년 주기", 0, "neutral", phase === 0 ? "대선 해" : "중간선거 해 상반기", "4년 주기상 뚜렷한 우위가 없는 구간이에요."));

  // 계절성: 10월~이듬해 4월 강세, 5~9월 약세 경향(10월 효과)
  if (m >= 10 || m <= 4) out.push(sig("season", "계절성", 1, "on", `${m}월`, "10월부터 이듬해 봄까지는 계절적으로 강했던 구간이에요."));
  else out.push(sig("season", "계절성", -1, "off", `${m}월`, "5~9월은 계절적으로 약했던 구간이에요. 10월 전후 저점을 기다리는 시기예요."));

  // 10년 패턴: 책에서 강조한 끝자리 5·7·8년
  const d = y % 10;
  if ([5, 7, 8].includes(d)) out.push(sig("decade", "10년 패턴", 1, "on", `끝자리 ${d}년`, "10년 패턴에서 강했던 해예요."));
  else out.push(sig("decade", "10년 패턴", 0, "neutral", `끝자리 ${d}년`, "10년 패턴상 특별한 우위가 없는 해예요."));
  return out;
}

function bondSignal(series) {
  const vals = series.map((p) => p.value);
  const now = last(vals);
  const high = Math.max(...vals.slice(-252));
  const ma50 = avg(vals.slice(-50));
  const offHigh = high - now;
  const value = `${now.toFixed(2)}% (1년 고점 ${high.toFixed(2)}%)`;
  if (offHigh >= 0.25 && now < ma50)
    return sig("bond", "채권 금리", 2, "on", value, `금리가 고점에서 ${(offHigh * 100).toFixed(0)}bp 내려와 50일 평균 아래에 있어요. 정점 후 하락 전환으로, 주식 바닥에 앞서는 신호예요. 다시 고점 근처로 오르면 신호를 무효로 보세요.`);
  if (offHigh <= 0.05)
    return sig("bond", "채권 금리", -1, "off", value, "금리가 1년 고점 근처에서 오르는 중이에요. 주식에 역풍이에요.");
  return sig("bond", "채권 금리", 0, "neutral", value, "금리가 고점과 저점 사이에서 방향을 찾는 중이에요.");
}

function fedSignal(series) {
  const now = last(series).value;
  const before = series.find((p) => p.date >= new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10))?.value ?? series[0].value;
  const diff = now - before;
  const value = `${now.toFixed(2)}% (6개월 전 ${before.toFixed(2)}%)`;
  if (diff <= -0.25) return sig("fed", "통화정책", 2, "on", value, "연준이 금리를 내리는 중이에요. 완화 국면은 주가 바닥을 받치는 신호예요.");
  if (diff >= 0.25) return sig("fed", "통화정책", -2, "off", value, "최근 6개월 사이 금리를 올렸어요. 연준이 인상을 멈추고 인하를 시사할 때까지는 역풍이에요.");
  return sig("fed", "통화정책", 0, "neutral", value, "정책금리가 동결 상태예요. 다음 방향 전환을 지켜볼 구간이에요.");
}

function creditSignal(series) {
  const vals = series.map((p) => p.value);
  const now = last(vals);
  const peak = Math.max(...vals.slice(-252));
  const ma50 = avg(vals.slice(-50));
  const value = `${now.toFixed(2)}%p (1년 최고 ${peak.toFixed(2)}%p)`;
  if (peak - now >= 0.2 && now < ma50 && peak >= 2.0)
    return sig("credit", "신용 스프레드", 1, "on", value, "회사채 위험 프리미엄이 정점에서 좁혀지는 중이에요. 공포가 진정되며 위험 선호가 돌아오는 신호예요.");
  if (now < 1.6)
    return sig("credit", "신용 스프레드", -1, "off", value, "회사채 위험 프리미엄이 매우 낮아요. 시장이 위험을 거의 의식하지 않는 상태예요.");
  return sig("credit", "신용 스프레드", 0, "neutral", value, "뚜렷한 공포나 안도 신호가 없어요.");
}

function sentimentSignal(series) {
  const vals = series.map((p) => p.value);
  const now = last(vals);
  const peak = Math.max(...vals.slice(-60));
  const value = `VIX ${now.toFixed(1)} (최근 3개월 최고 ${peak.toFixed(1)})`;
  if (now >= 30) return sig("sentiment", "투자 심리", 2, "on", value, "공포가 극단적이에요. 윌리엄스식 역발상에서는 대중이 가장 비관할 때가 바닥 근처예요. 악재에도 더 빠지지 않는지 함께 보세요.");
  if (peak >= 28 && now < peak * 0.85) return sig("sentiment", "투자 심리", 1, "on", value, "최근 공포가 극에 달했다가 진정되는 중이에요. 바닥을 지나는 전형적인 모습이에요.");
  if (now < 14) return sig("sentiment", "투자 심리", -1, "off", value, "시장이 지나치게 안심하고 있어요. 고점 쪽 신호예요.");
  return sig("sentiment", "투자 심리", 0, "neutral", value, "심리가 극단에 있지 않아요.");
}

// 유가: 급등은 물가와 금리를 밀어 올려 주식에 역풍, 급등 후 하락 전환은 순풍
function oilSignal(series) {
  if (!series || series.length < 60) return sig("oil", "유가", 0, "neutral", "자료 없음", "유가 자료를 불러오지 못했어요.");
  const vals = series.map((p) => p.value);
  const now = last(vals);
  const year = vals.slice(-252);
  const high = Math.max(...year);
  const yearAgo = year[0];
  const ma50 = avg(vals.slice(-50));
  const fromHigh = ((now - high) / high) * 100;
  const yoy = ((now - yearAgo) / yearAgo) * 100;
  const value = `WTI $${now.toFixed(1)} (1년 고점 대비 ${fromHigh.toFixed(0)}%)`;
  const ctx = ` 1년 전보다 ${yoy >= 0 ? "+" : ""}${yoy.toFixed(0)}%, 50일 평균 $${ma50.toFixed(1)}.`;
  if (fromHigh <= -15 && now < ma50)
    return sig("oil", "유가", 1, "on", value, "유가가 고점에서 꺾여 내려오는 중이에요. 물가와 금리 부담이 줄어드는 방향이라 주식 바닥을 돕는 신호예요. 에너지주에는 반대로 역풍이에요." + ctx);
  if (fromHigh > -10 && now > ma50 && yoy > 25)
    return sig("oil", "유가", -1, "off", value, "유가가 1년 고점 근처에서 오르는 중이에요. 물가를 다시 자극해 금리 인하를 늦추는 압력이에요." + ctx);
  return sig("oil", "유가", 0, "neutral", value, "유가가 뚜렷한 방향 없이 움직이는 중이에요." + ctx);
}

// 기간 수익률 (일 기준)
function change(series, days) {
  if (!series?.length) return null;
  const then = valueDaysAgo(series, days);
  const now = last(series).value;
  return then ? ((now - then) / then) * 100 : null;
}

// 구리: 실물 경기의 체온계 ("닥터 코퍼")
function copperSignal(c) {
  const sr = c?.copper?.series;
  if (!sr || sr.length < 60) return sig("copper", "구리", 0, "neutral", "자료 없음", "구리 가격을 불러오지 못했어요.");
  const vals = sr.map((p) => p.value);
  const now = last(vals);
  const ma = avg(vals.slice(-Math.min(200, vals.length)));
  const c3 = change(sr, 90), c12 = change(sr, 365);
  const value = `${now.toFixed(2)} ${c.copper.unit} (3개월 ${c3 >= 0 ? "+" : ""}${c3.toFixed(0)}%)`;
  const ctx = ` 1년 ${c12 >= 0 ? "+" : ""}${c12.toFixed(0)}%, 장기 평균 대비 ${(((now - ma) / ma) * 100).toFixed(0)}%.`;
  if (now > ma && c3 > 0) return sig("copper", "구리", 1, "on", value, "구리가 장기 평균 위에서 오르고 있어요. 공장·건설·전력망 수요가 살아 있다는 뜻으로, 경기 확장 기대를 받쳐요." + ctx);
  if (now < ma && c3 < -8) return sig("copper", "구리", -1, "off", value, "구리가 장기 평균 아래로 빠지고 있어요. 실물 수요 둔화를 먼저 알리는 경우가 많아요." + ctx);
  return sig("copper", "구리", 0, "neutral", value, "구리가 장기 평균 근처에서 숨 고르기 중이에요. 경기 방향을 단정하기 일러요." + ctx);
}

// 구리/금 비율: 성장 기대(구리) 대 불안(금). 10년물 금리와 함께 움직이는 경향
function ratioSignal(c, tenYear) {
  const cu = c?.copper?.series, au = c?.gold?.series;
  if (!cu?.length || !au?.length || c.copper.source !== c.gold.source) return sig("cuau", "구리/금 비율", 0, "neutral", "자료 없음", "구리와 금 일별 가격이 모두 있어야 계산해요.");
  const goldBy = new Map(au.map((p) => [p.date, p.value]));
  const ratio = cu.filter((p) => goldBy.has(p.date)).map((p) => ({ date: p.date, value: (p.value / goldBy.get(p.date)) * 1000 }));
  if (ratio.length < 60) return sig("cuau", "구리/금 비율", 0, "neutral", "자료 부족", "겹치는 날짜가 부족해요.");
  const r3 = change(ratio, 90), r12 = change(ratio, 365);
  const y3 = tenYear ? last(tenYear).value - valueDaysAgo(tenYear, 90) : null;
  const value = `${last(ratio).value.toFixed(2)} (3개월 ${r3 >= 0 ? "+" : ""}${r3.toFixed(0)}%)`;
  let extra = ` 1년 ${r12 >= 0 ? "+" : ""}${r12.toFixed(0)}%.`;
  if (r3 < -3 && y3 !== null && y3 > 0) extra += " 비율은 내려가는데 금리는 올라 있어, 시장이 성장보다 물가를 걱정하는 국면이에요. 이런 괴리는 금리 하락으로 풀리는 경우가 많아요.";
  if (r3 > 5) return sig("cuau", "구리/금 비율", 1, "on", value, "구리가 금보다 강해요. 시장이 불안보다 성장에 베팅하는 위험 선호 국면이에요." + extra);
  if (r3 < -5) return sig("cuau", "구리/금 비율", -1, "off", value, "금이 구리보다 강해요. 성장 기대가 식고 안전자산으로 돈이 옮겨가는 신호예요." + extra);
  return sig("cuau", "구리/금 비율", 0, "neutral", value, "성장 기대와 불안이 팽팽해요." + extra);
}

// 원자재 대시보드용 요약
const MEANING = {
  wti: "물가와 금리를 움직이는 1번 변수. 급등은 주식에 역풍, 급락은 순풍(에너지주는 반대)",
  brent: "국제 유가 기준. WTI와 벌어지면 중동·유럽 공급 불안을 반영",
  copper: "실물 경기의 체온계. 제조·건설·전력망 수요를 먼저 반영",
  gold: "불안과 달러 약세의 피난처. 급등은 위험 회피, 급락은 위험 선호",
  natgas: "난방·발전 비용. 겨울철 급등 시 유럽·아시아 물가 압력",
};
function commoditySummary(c) {
  if (!c) return [];
  return Object.entries(c).filter(([, v]) => v?.series?.length).map(([k, v]) => {
    const sr = v.series;
    const step = Math.max(1, Math.floor(sr.length / 60));
    return {
      key: k, name: v.name, unit: v.unit, source: v.source, price: last(sr).value, date: last(sr).date,
      m1: change(sr, 30), m3: change(sr, 90), y1: change(sr, 365),
      fromHigh: ((last(sr).value - Math.max(...sr.slice(-252).map((p) => p.value))) / Math.max(...sr.slice(-252).map((p) => p.value))) * 100,
      spark: sr.filter((_, i) => i % step === 0 || i === sr.length - 1).map((p) => p.value),
      meaning: MEANING[k],
    };
  });
}

function marginSignal() {
  let m;
  // require로 읽어야 Vercel 배포 때 이 파일이 함께 묶입니다
  try { m = require("../../data/margin-debt.json"); }
  catch { return sig("margin", "신용잔고", 0, "neutral", "자료 없음", "data/margin-debt.json에 FINRA 마진 부채를 입력하세요."); }
  const yoy = ((m.latest - m.yearAgo) / m.yearAgo) * 100;
  const fromRecord = ((m.latest - m.record) / m.record) * 100;
  const value = `${(m.latest / 1000).toFixed(2)}조 달러 (최고치 대비 ${fromRecord.toFixed(1)}%)`;
  const ctx = ` (FINRA ${m.asOf} 기준, 1년 전보다 ${yoy >= 0 ? "+" : ""}${yoy.toFixed(0)}%)`;
  if (fromRecord <= -15)
    return sig("margin", "신용잔고", 2, "on", value, "빚투가 최고치에서 크게 정리됐어요. 더 팔 사람이 줄어든, 윌리엄스가 말한 바닥의 조건에 가까워요." + ctx);
  if (fromRecord >= -5 || yoy >= 30)
    return sig("margin", "신용잔고", -2, "off", value, "빚투가 사상 최고 수준 근처예요. 연료가 아직 가득 차 있어 하락 시 반대매매가 하락을 키울 수 있어요." + ctx);
  return sig("margin", "신용잔고", 0, "neutral", value, "빚투가 정리되는 중이에요. 최고치 대비 -15% 이상 줄면 바닥 조건으로 봐요." + ctx);
}

function evaluateMacro(data, commodities) {
  const signals = [
    ...cycleSignals(),
    bondSignal(data.tenYear),
    fedSignal(data.fedFunds),
    creditSignal(data.creditSpread),
    sentimentSignal(data.vix),
    oilSignal(data.oil),
    copperSignal(commodities),
    ratioSignal(commodities, data.tenYear),
    marginSignal(),
  ];
  const maxPoints = 2 + 1 + 1 + 2 + 2 + 1 + 2 + 1 + 1 + 1 + 2; // 각 신호의 최대 가산점 합
  const total = signals.reduce((s, x) => s + x.points, 0);
  const score = Math.round(Math.max(-100, Math.min(100, (total / maxPoints) * 100)));
  const stance =
    score >= 45 ? "바닥 신호가 여럿 겹친 구간" :
    score >= 15 ? "바닥 쪽으로 기우는 구간" :
    score > -15 ? "방향이 엇갈리는 구간" :
    score > -45 ? "과열 쪽으로 기우는 구간" : "과열 신호가 여럿 겹친 구간";
  const tenYear = last(data.tenYear).value;
  const oil = data.oil?.length ? last(data.oil).value : null;
  // 드러켄밀러식 유동성 판단에 쓰는 보조 수치
  const liquidity = {
    fedChange6m: last(data.fedFunds).value - valueDaysAgo(data.fedFunds, 180),
    curve: data.curve?.length ? last(data.curve).value : null,
    curveChange6m: data.curve?.length ? last(data.curve).value - valueDaysAgo(data.curve, 180) : null,
  };
  const result = { score, stance, signals, tenYear, oil, liquidity, commodities: commoditySummary(commodities), asOf: last(data.tenYear).date };
  result.view = interpret(result);
  return result;
}

// 최상단 해석 문구: 켜진 신호와 꺼진 신호를 묶어 관점별로 읽는다
function interpret(m) {
  const on = m.signals.filter((x) => x.status === "on");
  const off = m.signals.filter((x) => x.status === "off");
  const names = (arr) => arr.map((x) => x.title).join("·");
  // 한국어 조사: 마지막 글자 받침 여부로 은/는, 이/가 선택
  const josa = (word, withB, without) => {
    const c = word.charCodeAt(word.length - 1);
    const has = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
    return word + (has ? withB : without);
  };
  const st = (k) => m.signals.find((x) => x.key === k)?.status;

  let headline;
  if (on.length && off.length) headline = `${josa(names(on), "은", "는")} 바닥 쪽을, ${josa(names(off), "은", "는")} 과열 쪽을 가리켜요. 신호가 엇갈리는 장이에요.`;
  else if (on.length) headline = `${josa(names(on), "이", "가")} 함께 바닥 쪽을 가리켜요.`;
  else if (off.length) headline = `${josa(names(off), "이", "가")} 과열 쪽을 가리켜요. 서두를 이유가 없는 장이에요.`;
  else headline = "뚜렷한 방향 신호가 없는 장이에요.";

  const lenses = [];
  const timing = ["cycle4", "season", "decade"].filter((k) => st(k) === "on").length;
  lenses.push({ who: "윌리엄스의 시간", text: timing >= 2 ? "주기상으로는 매수 창이 열린 시기예요. 남은 건 바닥 확인 신호가 따라오는지예요." : "주기상 우위가 크지 않아요. 가치 지표로 종목을 먼저 고르고 기다려요." });

  const liq = st("fed") === "on" ? "연준이 돈을 풀고 있어" : st("fed") === "off" ? "연준이 아직 조이고 있어" : "연준이 멈춰 있어";
  const credit = st("credit") === "on" ? "신용시장은 안도하는 중이에요" : st("credit") === "off" ? "신용시장이 위험을 너무 가볍게 봐요" : "신용시장은 평온해요";
  lenses.push({ who: "드러켄밀러의 유동성", text: `${liq} 유동성 방향은 ${st("fed") === "on" ? "우호적" : st("fed") === "off" ? "역풍" : "중립"}이고, ${credit}. 유동성이 돌아서기 전엔 크게 걸지 않아요.` });

  const bubble = [st("margin") === "off" && "빚투가 사상 최고 근처", st("sentiment") === "off" && "시장이 지나치게 안심"].filter(Boolean);
  lenses.push({ who: "버리의 경계", text: bubble.length ? `${bubble.join(", ")} 상태예요. 오를 때보다 빠질 때를 먼저 계산할 구간이에요.` : "과열의 흔적이 두드러지지 않아요. 오히려 남들이 버린 종목에서 기회를 찾을 때예요." });

  const cu = st("copper"), ratio = st("cuau");
  const realText =
    cu === "on" && ratio !== "off" ? "구리가 오르며 실물 수요가 살아 있어요. 경기민감주와 산업재에 우호적인 배경이에요." :
    cu === "off" || ratio === "off" ? "구리와 성장 기대가 식고 있어요. 실물 경기 둔화가 이익 전망보다 먼저 나타날 수 있어요." :
    "원자재는 경기 방향을 아직 정하지 못했어요. 유가와 구리가 같은 쪽으로 움직이는지 지켜볼 구간이에요.";
  lenses.push({ who: "원자재가 말하는 실물 경기", text: realText });

  lenses.push({ who: "버핏의 기준선", text: `미국 10년 국채가 ${m.tenYear.toFixed(2)}%를 줘요. 주식의 이익수익률이 이보다 확실히 높지 않다면 위험을 질 이유가 약해요.` });

  const action =
    m.score >= 45 ? "여러 신호가 겹쳤어요. 원칙에 맞는 종목을 분할로 담기 시작할 조건이에요." :
    m.score >= 15 ? "바닥 쪽으로 기울지만 확인이 덜 됐어요. 분할로 나눠 1차만 들어가고, 꺼진 신호가 켜질 때 늘리는 방식이 원칙에 맞아요." :
    m.score > -15 ? "방향이 엇갈려요. 새로 사기보다 보유 종목을 점검하고 현금을 남겨두는 구간이에요." :
    "과열 쪽이에요. 비중을 줄이거나 기다리는 쪽이 원칙에 맞아요.";
  const watch = off.map((x) => ({ fed: "연준의 인상 중단·인하 시사", margin: "FINRA 마진 부채 감소", oil: "유가 하락 전환", copper: "구리 반등", cuau: "구리/금 비율 반등", bond: "10년물 금리 하락 전환", sentiment: "공포 지수 상승", credit: "신용 스프레드 정상화", season: "10월 이후 계절 구간", cycle4: "중간선거 해 진입" }[x.key])).filter(Boolean);
  return { headline, lenses, action, watch };
}

// 원·달러 환율 요약: 저점 판단과 직접 관계가 약해 점수에는 넣지 않는 참고 정보예요
function fxSummary(series) {
  if (!series || series.length < 60) return null;
  const now = last(series);
  const year = series.slice(-252).map((p) => p.value);
  const high = Math.max(...year), low = Math.min(...year);
  const pos = high > low ? ((now.value - low) / (high - low)) * 100 : 50;
  const zone = pos >= 80 ? "1년 범위 상단" : pos <= 20 ? "1년 범위 하단" : "1년 범위 중간";
  const note =
    pos >= 80 ? "달러가 1년 중 비싼 편이에요. 원화로 미국 주식을 사면 환율 부담이 크고, 이후 환율이 내리면 환차손이 날 수 있어요." :
    pos <= 20 ? "달러가 1년 중 싼 편이에요. 원화로 미국 주식을 사기에 환율 부담이 작은 구간이에요." :
    "달러가 1년 범위 중간쯤이에요. 원화로 미국 주식을 살 때 환율 부담은 보통 수준이에요.";
  const step = Math.max(1, Math.floor(series.length / 60));
  return {
    name: "원·달러 환율", unit: "원", price: now.value, date: now.date,
    m1: change(series, 30), y1: change(series, 365), high, low, pos, zone, note,
    spark: series.filter((_, i) => i % step === 0 || i === series.length - 1).map((p) => p.value),
  };
}

module.exports = { evaluateMacro, fxSummary };
