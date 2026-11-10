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

// ---------- 코스톨라니 달걀: 금리 · 거래량(참여도) · 심리 세 축으로 지금 국면을 고른다 ----------
// 달걀은 금리 사이클을 따라 몇 달~몇 년에 걸쳐 도는 모형이라, 하루 등락으로 국면이 바뀌지 않게 만든다.
// 1) 금리 방향이 큰 틀(A 상승 쪽 / B 하락 쪽)을 정하고, 거래량·심리는 그 안에서 단계만 고른다.
// 2) 거래량·심리는 하루 값이 아니라 20일 평균으로 본다. 하루짜리 급등락은 '경고 신호'로만 따로 보여준다.
// 3) 지난 24주의 금요일마다 다시 판정해, 같은 새 국면이 3주 연속 나와야 국면을 바꾼다(상태 저장 없이 매번 같은 답).
// 각 축은 1(맞음)·0.5(일부)·0(아님)으로 채점한다. 규칙이 단순한 만큼 '가장 가까운 국면' 정도로 읽어야 한다.
// guide: 그 국면에서 코스톨라니식으로 '보통 이렇게 행동한다'는 안내 (화면 문구라 해요체)
// asset: 국내에서 널리 쓰는 '자산 이동' 해석 (예금 → 채권 → 주식 → 부동산 → 예금)
const EGG = [
  { id: "A1", name: "A1 조정", rate: "고점 → 인하 시작", volume: "적음", mood: "비관", action: "매수", asset: { label: "채권 매수", flow: "예금 → 채권", kind: "buy" },
    guide: "금리가 정점을 지나 내려가기 시작했는데 사람들은 아직 비관하고 거래도 적어요. 보통 이때 좋은 종목을 나눠서 사 모아요. 남들이 외면할 때 싸게 담는 구간이에요." },
  { id: "A2", name: "A2 동행", rate: "하락 중", volume: "증가", mood: "회복", action: "보유", asset: { label: "주식 매수", flow: "채권 → 주식", kind: "buy" },
    guide: "금리가 내려가고 투자자들이 돌아오며 가격이 따라 올라요. 보통 이미 산 주식은 그대로 들고 가요. 새로 살 때는 오른 만큼 신중하게 해요." },
  { id: "A3", name: "A3 과장", rate: "저점 부근", volume: "폭증", mood: "탐욕", action: "매도 준비", asset: { label: "주식 매도 · 부동산 매수", flow: "주식 → 부동산", kind: "sell" },
    guide: "금리는 바닥이고 거래가 폭증하며 모두가 낙관해요. 보통 새로 사지 않고, 어떤 종목을 언제 팔지 계획을 세워요. 빚을 낸 투자는 줄여요." },
  { id: "B1", name: "B1 조정", rate: "저점 → 인상 시작", volume: "감소", mood: "아직 낙관", action: "매도", asset: { label: "부동산 매도", flow: "부동산 → 예금", kind: "sell" },
    guide: "금리가 오르기 시작했는데 분위기는 아직 낙관적이에요. 보통 이때 비중을 줄이고 차익을 실현해요. 분위기보다 금리 방향을 먼저 봐요." },
  { id: "B2", name: "B2 동행", rate: "상승 중", volume: "감소", mood: "불안", action: "관망·현금", asset: { label: "예금 보유", flow: "현금·예금 유지", kind: "hold" },
    guide: "금리가 계속 오르고 거래가 줄며 불안이 커져요. 보통 새로 사기보다 현금을 늘리고 지켜봐요. 떨어진다고 서둘러 사지 않아요." },
  { id: "B3", name: "B3 과장", rate: "고점 부근", volume: "투매로 급증", mood: "공포", action: "매수 준비", asset: { label: "예금 인출 · 채권 준비", flow: "예금 → 채권 준비", kind: "buy" },
    guide: "금리가 높은 곳에서 투매와 공포가 터져 나와요. 보통 바로 다 사기보다 살 종목과 현금을 준비해 두고, 금리 인하 신호(A1으로 넘어가는 신호)가 보이면 나눠서 사기 시작해요." },
];

const EGG_CONFIRM_WEEKS = 3; // 새 국면이 이만큼 연속으로 나와야 국면을 바꿔요
const EGG_HISTORY_WEEKS = 24; // 매번 지난 24주(금요일 기준)를 다시 판정해요

// asOf(YYYY-MM-DD) 이전까지만 남긴 시계열 (미래 값을 섞지 않기)
const upTo = (series, asOf) => {
  if (!Array.isArray(series)) return [];
  let i = series.length;
  while (i > 0 && series[i - 1].date > asOf) i--;
  return series.slice(0, i);
};
const shiftDate = (ymd, days) => new Date(new Date(ymd + "T00:00:00Z").getTime() - days * 864e5).toISOString().slice(0, 10);
const valueAt = (series, ymd) => {
  for (let i = series.length - 1; i >= 0; i--) if (series[i].date <= ymd) return series[i].value;
  return null;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const finite = (v) => typeof v === "number" && Number.isFinite(v);

function marginInputs() {
  try {
    const m = require("../../data/margin-debt.json");
    if (!finite(m.latest) || !finite(m.record) || !finite(m.yearAgo) || !m.record || !m.yearAgo) return { fromRecord: null, yoy: null };
    return { fromRecord: ((m.latest - m.record) / m.record) * 100, yoy: ((m.latest - m.yearAgo) / m.yearAgo) * 100 };
  } catch {
    return { fromRecord: null, yoy: null };
  }
}

// 금리 방향이 정하는 큰 틀: 오르는 쪽이면 B, 내리는 쪽이면 A
function allowedPhases(dir, level) {
  if (dir === "up") return ["B1", "B2", "B3"];
  if (dir === "down") return ["A1", "A2", "A3"];
  if (level === "high") return ["B3", "A1"]; // 고점 부근에서 멈춤: 하락장 끝 또는 인하 직전
  if (level === "low") return ["A3", "B1"]; // 저점 부근에서 멈춤: 상승장 끝 또는 인상 직전
  return ["A1", "A2", "A3", "B1", "B2", "B3"];
}

// 한 시점(asOf)의 국면 판정. 모든 값은 asOf까지의 자료만 써요
function eggAt(data, spx, margin, asOf) {
  const ty = upTo(data.tenYear, asOf).filter((p) => finite(p.value));
  const fed = upTo(data.fedFunds, asOf).filter((p) => finite(p.value));
  const vx = upTo(data.vix, asOf).filter((p) => finite(p.value));
  const vs = upTo(spx, asOf).filter((p) => finite(p.value) && finite(p.volume) && p.volume > 0);

  // 금리: 방향은 정책금리 6개월 변화(±0.25%p), 없거나 작으면 10년물 20일 평균의 3개월 변화(±0.15%p)
  const tyVals = ty.map((p) => p.value);
  const year = tyVals.slice(-252);
  const tyNow = tyVals.length ? tyVals[tyVals.length - 1] : null;
  const ty20 = tyVals.length >= 20 ? mean(tyVals.slice(-20)) : null;
  const ty20ago = tyVals.length >= 83 ? mean(tyVals.slice(-83, -63)) : null;
  const ty3m = ty20 !== null && ty20ago !== null ? ty20 - ty20ago : null;
  const hi = year.length >= 60 ? Math.max(...year) : null;
  const lo = year.length >= 60 ? Math.min(...year) : null;
  const pos = ty20 !== null && hi !== null && hi > lo ? Math.min(100, Math.max(0, ((ty20 - lo) / (hi - lo)) * 100)) : null;
  const fedNow = fed.length ? fed[fed.length - 1].value : null;
  const fedAgo = fed.length ? valueAt(fed, shiftDate(asOf, 182)) : null;
  const fed6m = fedNow !== null && fedAgo !== null && fed[0].date <= shiftDate(asOf, 182) ? fedNow - fedAgo : null;
  const dir = fed6m !== null && Math.abs(fed6m) >= 0.25 ? (fed6m > 0 ? "up" : "down") : ty3m !== null && Math.abs(ty3m) >= 0.15 ? (ty3m > 0 ? "up" : "down") : "flat";
  const level = pos === null ? null : pos >= 65 ? "high" : pos <= 35 ? "low" : "mid";
  const offHigh = ty20 !== null && hi !== null ? hi - ty20 : null;

  // 거래량: 20일 평균 ÷ 긴 평균(최대 200일). 투매는 20일 안에 '급증+2% 이상 하락' 날이 2번 이상일 때만
  let vol20 = null, spikeDays = null, selloffDays = null;
  if (vs.length >= 80) {
    spikeDays = 0;
    selloffDays = 0;
    const base = vs.slice(-Math.min(200, vs.length - 20) - 20, -20); // 최근 20일을 뺀 긴 기준
    const baseAvg = mean(base.map((p) => p.volume));
    const recent = vs.slice(-20);
    vol20 = baseAvg ? mean(recent.map((p) => p.volume)) / baseAvg : null;
    for (let i = vs.length - 20; i < vs.length; i++) {
      const avg50 = mean(vs.slice(Math.max(0, i - 50), i).map((p) => p.volume));
      const ret = ((vs[i].value - vs[i - 1].value) / vs[i - 1].value) * 100;
      if (avg50 && vs[i].volume / avg50 >= 1.5) {
        spikeDays++;
        if (ret <= -2) selloffDays++;
      }
    }
  }
  const selloff = selloffDays >= 2;
  const volUp = vol20 !== null && vol20 >= 1.05;
  const volDown = vol20 !== null && vol20 < 0.95;
  const volBoom = !selloff && ((vol20 !== null && vol20 >= 1.2) || (margin.fromRecord !== null && margin.fromRecord >= -3 && margin.yoy >= 25));

  // 심리: VIX 20일 평균
  const vVals = vx.map((p) => p.value);
  const vix20 = vVals.length >= 20 ? mean(vVals.slice(-20)) : null;
  const vixPeak = vVals.length ? Math.max(...vVals.slice(-63)) : null;
  const fear = vix20 !== null && vix20 >= 28;
  const pessim = vix20 !== null && vix20 >= 24;
  const recovering = vix20 !== null && vixPeak >= 25 && vix20 < vixPeak * 0.8 && vix20 < 25;
  const greed = vix20 !== null && vix20 < 14;
  const optim = vix20 !== null && vix20 < 18;
  const anxious = vix20 !== null && vix20 >= 18 && vix20 < 28;
  const vixRising = vix20 !== null && vVals.length >= 40 && vix20 > mean(vVals.slice(-40, -20)) * 1.15;

  const sc = (cond1, cond05) => (cond1 ? 1 : cond05 ? 0.5 : 0);
  const fit = {
    A1: [sc(level === "high" && dir !== "up" && offHigh >= 0.2, level === "high" || dir === "down"), sc(volDown && !selloff, !volUp && !selloff), sc(pessim && !fear, fear)],
    A2: [sc(dir === "down" && level !== "high", dir === "down"), sc(volUp && !selloff, false), sc(recovering, anxious && !fear)],
    A3: [sc(level === "low" && dir !== "up", level === "low"), sc(volBoom, volUp && !selloff), sc(greed, optim)],
    B1: [sc(level !== "high" && dir === "up" && (fed6m === null || fed6m <= 0.5), dir === "up"), sc(volDown, !volUp && !selloff), sc(optim && !greed, greed)],
    B2: [sc(dir === "up" && level === "mid", dir === "up"), sc(volDown && !selloff, !volUp && !selloff), sc(anxious, fear)],
    B3: [sc(level === "high", level === "mid" && dir === "up"), sc(selloff, spikeDays >= 2), sc(fear, anxious && vixRising)],
  };
  const allowed = allowedPhases(dir, level);
  const order = EGG.map((e) => e.id);
  const ranked = EGG.map((e) => ({ id: e.id, fit: fit[e.id], score: fit[e.id].reduce((a, b) => a + b, 0), allowed: allowed.includes(e.id) }))
    // 큰 틀 안의 국면 먼저, 같은 점수면 순환 순서(A1→…→B3)로 정해 결과가 매번 같게
    .sort((a, b) => b.allowed - a.allowed || b.score - a.score || order.indexOf(a.id) - order.indexOf(b.id));
  const ok = level !== null && vix20 !== null; // 금리·심리 자료가 없으면 판정하지 않아요
  return {
    asOf, ok, best: ranked[0].id, ranked,
    st: { dir, level, selloff, spikeDays, volBoom, volUp, volDown, fear, pessim, recovering, greed, optim, hasVol: vol20 !== null || margin.fromRecord !== null },
    inputs: { tyNow, ty20, pos, ty3m, fed6m, fedNow, vol20, spikeDays, selloffDays, vix20, vixPeak },
  };
}

// 하루짜리 신호: 국면을 바꾸지 않고 '경고'로만 보여줘요
function dailyAlerts(data, spx) {
  const out = [];
  const vs = (spx || []).filter((p) => finite(p.value) && finite(p.volume) && p.volume > 0);
  if (vs.length >= 52) {
    const lastP = vs[vs.length - 1], prev = vs[vs.length - 2];
    const avg50 = mean(vs.slice(-51, -1).map((p) => p.volume));
    const ratio = avg50 ? lastP.volume / avg50 : null;
    const chg = ((lastP.value - prev.value) / prev.value) * 100;
    if (ratio !== null && ratio >= 1.5 && chg <= -2) out.push({ kind: "down", date: lastP.date, text: `S&P 500이 ${chg.toFixed(1)}% 빠지며 거래량이 평소의 ${ratio.toFixed(1)}배로 터졌어요` });
    else if (ratio !== null && ratio >= 1.5) out.push({ kind: "info", date: lastP.date, text: `S&P 500 거래량이 평소의 ${ratio.toFixed(1)}배로 늘었어요` });
  }
  const vx = (data.vix || []).filter((p) => finite(p.value));
  if (vx.length >= 2) {
    const a = vx[vx.length - 2].value, b = vx[vx.length - 1].value;
    const j = a ? ((b - a) / a) * 100 : null;
    if (j !== null && j >= 30) out.push({ kind: "down", date: vx[vx.length - 1].date, text: `VIX가 하루 만에 ${j.toFixed(0)}% 뛰었어요 (${b.toFixed(1)})` });
    else if (j !== null && j <= -20) out.push({ kind: "up", date: vx[vx.length - 1].date, text: `VIX가 하루 만에 ${Math.abs(j).toFixed(0)}% 내렸어요 (${b.toFixed(1)})` });
  }
  return out;
}

function kostolany(data, spx) {
  const r = (v, d = 2) => (finite(v) ? Number(v.toFixed(d)) : null);
  data = data || {};
  const margin = marginInputs();
  // 판정 날짜: 금리·VIX 중 늦은 쪽 마지막 날짜. 주간 판정은 그 이전 금요일에 고정해 한 주 안에서는 답이 같아요
  const lastDates = [data.tenYear, data.vix].map((s) => (Array.isArray(s) && s.length ? s[s.length - 1].date : null)).filter(Boolean);
  if (!lastDates.length) return null;
  const today = lastDates.sort().pop();
  const anchor = shiftDate(today, (new Date(today + "T00:00:00Z").getUTCDay() + 2) % 7); // 오늘 이전(포함) 금요일
  const weeks = [];
  for (let w = EGG_HISTORY_WEEKS - 1; w >= 0; w--) weeks.push(eggAt(data, spx, margin, shiftDate(anchor, w * 7)));
  const valid = weeks.filter((x) => x.ok);
  const nowEval = eggAt(data, spx, margin, today); // 화면의 지금 값·점수는 오늘 자료로
  if (!valid.length || !nowEval.ok) return null;

  // 확정 국면: 같은 새 국면이 3주 연속 나와야 바꿔요
  let phase = valid[0].best, since = valid[0].asOf, cand = null, candN = 0, candSince = null; // eslint-disable-line no-unused-vars
  for (const x of valid.slice(1)) {
    if (x.best === phase) {
      cand = null; candN = 0;
      continue;
    }
    if (x.best === cand) candN++;
    else { cand = x.best; candN = 1; candSince = x.asOf; }
    if (candN >= EGG_CONFIRM_WEEKS) {
      phase = cand; since = candSince; cand = null; candN = 0;
    }
  }
  // 기우는 쪽: 주간 판정에서 쌓이는 새 국면, 없으면 오늘 자료로 본 국면이 다를 때 (0주)
  if (!cand && nowEval.best !== phase) { cand = nowEval.best; candN = 0; }
  const leaning = cand && cand !== phase ? { id: cand, name: EGG.find((e) => e.id === cand).name, weeks: candN, need: EGG_CONFIRM_WEEKS } : null;
  const fullHistory = valid.length >= EGG_CONFIRM_WEEKS + 1;

  const best = EGG.find((e) => e.id === phase);
  const cur = nowEval.ranked.find((x) => x.id === phase);
  const second = nowEval.ranked.find((x) => x.id !== phase && x.id !== (leaning && leaning.id) && x.allowed);
  const st = nowEval.st, i = nowEval.inputs;
  const now = {
    rate:
      st.level === null ? "자료 없음" :
      `${{ high: "1년 범위 상단", mid: "1년 범위 중간", low: "1년 범위 하단" }[st.level]}, ${{ up: "인상·상승 쪽", down: "인하·하락 쪽", flat: "방향 없음" }[st.dir]}`,
    volume: !st.hasVol ? "자료 없음" : st.selloff ? "투매로 급증" : st.volBoom ? "폭증" : st.spikeDays >= 2 ? "급증" : st.volUp ? "증가" : st.volDown ? "감소" : "보통",
    mood: i.vix20 === null ? "자료 없음" : st.fear ? "공포" : st.pessim ? "비관" : st.recovering ? "회복" : st.greed ? "탐욕" : st.optim ? "낙관" : "불안",
  };
  const vixLast = (data.vix || []).length ? data.vix[data.vix.length - 1].value : null;
  return {
    phase: best.id, name: best.name, action: best.action, guide: best.guide, asset: best.asset, score: cur.score,
    since, sinceWeeks: Math.round((new Date(today) - new Date(since)) / (7 * 864e5)), confirmWeeks: EGG_CONFIRM_WEEKS, fullHistory,
    side: { up: "B", down: "A", flat: null }[st.dir],
    leaning,
    runnerUp: second && second.score >= cur.score - 0.5 ? { id: second.id, name: EGG.find((e) => e.id === second.id).name, score: second.score } : null,
    alerts: dailyAlerts(data, spx),
    now,
    inputs: {
      tenYear: r(i.tyNow), tenYear20: r(i.ty20), tenYearPos: r(i.pos, 0), tenYear3m: r(i.ty3m), fed6m: r(i.fed6m), fedNow: r(i.fedNow),
      vol20: r(i.vol20), spikeDays: i.spikeDays, selloffDays: i.selloffDays,
      marginFromRecord: r(margin.fromRecord, 1), marginYoy: r(margin.yoy, 0),
      vix: r(vixLast, 1), vix20: r(i.vix20, 1), vixPeak3m: r(i.vixPeak, 1),
    },
    history: valid.map((x) => ({ date: x.asOf, phase: x.best })),
    phases: EGG.map((e) => {
      const x = nowEval.ranked.find((y) => y.id === e.id);
      return { id: e.id, score: x.score, fit: x.fit, allowed: x.allowed };
    }),
    table: EGG,
  };
}

module.exports = { evaluateMacro, fxSummary, kostolany };
