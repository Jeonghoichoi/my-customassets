// API 처리: 로컬 서버(src/server.js)와 Vercel 함수(api/router.js)가 함께 씁니다
const { macroSeries } = require("./sources/fred");
const { stock: fmpStock, probe, search: fmpSearch, streetData } = require("./sources/fmp");
const naver = require("./sources/naver");
const { demoMacro, demoStock, demoSymbols, demoCommodities } = require("./sources/demo");
const { fetchCommodities } = require("./sources/commodities");
const { evaluateMacro } = require("./engine/macro");
const { priceStats } = require("./engine/indicators");
const { judgeStock, streetReading } = require("./engine/judges");
const { resolve, marketLabel } = require("./sources/symbols");

const env = () => ({
  demo: process.env.DEMO === "1" || !process.env.FRED_API_KEY || !process.env.FMP_API_KEY,
  ai: Boolean(process.env.ANTHROPIC_API_KEY),
  code: process.env.ACCESS_CODE || "",
});

// 캐시 시간: FMP 무료 한도(하루 약 250번)를 아끼려고 길게 잡아요
const TTL = { macro: 6 * 3600, stock: 4 * 3600, street: 12 * 3600, search: 24 * 3600 };

// 무료 API 한도를 아끼는 메모리 캐시 (서버리스에서는 인스턴스가 살아 있는 동안만 유지)
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function getMacro() {
  const { demo } = env();
  return cached("macro", TTL.macro * 1e3, async () => {
    const [data, commodities] = demo
      ? [demoMacro(), demoCommodities()]
      : await Promise.all([
          macroSeries(process.env.FRED_API_KEY),
          fetchCommodities(process.env.FMP_API_KEY, process.env.FRED_API_KEY),
        ]);
    const m = evaluateMacro(data, commodities);
    m.houseViews = houseViews(m);
    return m;
  });
}

// 대형 증권사 시각 요약 + 판독기 신호와의 비교
function houseViews(m) {
  let hv;
  try {
    hv = require("../data/house-views.json");
  } catch {
    return null;
  }
  const level = hv.index.level;
  const withTarget = hv.firms.filter((f) => f.target);
  const avg = withTarget.reduce((s, f) => s + f.target, 0) / withTarget.length;
  const bulls = hv.firms.filter((f) => /강세/.test(f.stance)).length;
  const cautious = hv.firms.filter((f) => f.stance === "신중").map((f) => f.name);
  const firms = hv.firms.map((f) => ({ ...f, upside: f.target ? ((f.target - level) / level) * 100 : null }));
  const upside = ((avg - level) / level) * 100;
  let compare;
  if (bulls >= Math.ceil(hv.firms.length / 2) && m.score < 15)
    compare = `월가 다수는 '이익이 시장을 끈다'에 모여 있지만, 판독기 신호는 ${m.score}점으로 확신하기 이르다고 봐요. 차이는 연준과 빚투에 있어요. 은행들은 이익을 보고, 판독기는 돈의 흐름과 과열을 봐요.`;
  else if (bulls >= Math.ceil(hv.firms.length / 2))
    compare =
      "월가 다수와 판독기 신호가 같은 방향이에요. 다만 모두가 같은 쪽을 볼 때는 기대가 가격에 빨리 반영된다는 점을 기억하세요.";
  else compare = "월가가 신중한 쪽으로 기울어 있어요. 판독기 신호가 바닥 쪽이라면 역발상 기회가 될 수 있어요.";
  return {
    asOf: hv.asOf,
    index: hv.index,
    firms,
    summary: `주요 ${hv.firms.length}곳 중 ${bulls}곳이 강세예요. 목표치 평균은 ${Math.round(avg).toLocaleString(
      "en-US"
    )}이고, 현재보다 ${upside >= 0 ? "+" : ""}${upside.toFixed(1)}% 여력을 봐요.${
      cautious.length ? ` ${cautious.join("·")}은 쏠림과 과열을 경계해요.` : ""
    }`,
    compare,
    caution:
      "증권사의 연간 목표치는 자주 틀리고 시장을 뒤따라 수정되는 경향이 있어요. 방향보다 '무엇을 근거로 보는지'를 참고하세요.",
  };
}

// 한국 종목은 코스피(.KS)로 먼저 찾고 없으면 코스닥(.KQ)으로
async function fetchStock(target, demo) {
  if (demo) {
    if (target.market === "KR") {
      const err = new Error("데모 모드에는 한국 종목 데이터가 없어요. FMP 키를 넣으면 한국 종목도 조회해요.");
      err.status = 404;
      throw err;
    }
    return demoStock(target.candidates[0]);
  }
  // 국내 종목은 네이버 증권을 먼저, 실패하면 FMP(.KS/.KQ)로
  if (target.market === "KR") {
    try {
      return await naver.stock(target.candidates[0].slice(0, 6));
    } catch (e) {
      console.error("네이버 조회 실패:", e.message);
    }
  }
  let lastErr;
  for (const sym of target.candidates) {
    try {
      return await fmpStock(sym, process.env.FMP_API_KEY);
    } catch (e) {
      lastErr = e;
      if (e.status !== 404) break;
    }
  }
  if (target.market === "KR" && lastErr?.status === 404) {
    lastErr.message = `${target.query} 종목을 찾지 못했어요. 코드가 맞는지 확인하세요. 사용 중인 FMP 요금제가 한국 거래소를 지원하지 않을 수도 있어요.`;
  }
  throw lastErr;
}

// Vercel에서는 서버가 자주 새로 떠서 메모리 캐시가 비어 있어요.
// 그때마다 시장 판독을 다시 계산하면 원자재 때문에 FMP를 5번 더 쓰니, CDN에 캐시된 /api/macro를 먼저 읽어요.
async function macroForStock(headers) {
  const host = headers["x-forwarded-host"] || headers.host;
  if (process.env.VERCEL && host) {
    try {
      const res = await fetch(`https://${host}/api/macro`, {
        headers: headers["x-access-code"] ? { "x-access-code": headers["x-access-code"] } : {},
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const m = await res.json();
        if (m && Array.isArray(m.signals)) return m;
      }
    } catch {}
  }
  return getMacro();
}

async function getStock(input, headers = {}) {
  const { demo } = env();
  let target;
  try {
    target = resolve(input);
  } catch (e) {
    // 목록에 없는 한글 종목명은 네이버 검색으로 코드를 찾는다
    if (e.code !== "UNKNOWN_KR_NAME" || demo) throw e;
    const hit = (await naver.search(e.query).catch(() => []))[0];
    if (!hit) throw e;
    target = resolve(hit.s);
  }
  return cached(`stock:${target.candidates.join("|")}`, TTL.stock * 1e3, async () => {
    const [macro, raw] = await Promise.all([macroForStock(headers), fetchStock(target, demo)]);
    // 미국 종목(FMP)과 데모는 월가 의견을 버튼으로 따로 불러와요 (호출 한도 절약)
    if (demo) delete raw.street;
    const streetLazy = !raw.street;
    raw.market = target.market;
    raw.marketName = target.market === "KR" ? raw.exchange || marketLabel(raw.symbol) || "한국" : raw.exchange || "미국";
    raw.currency = target.market === "KR" ? "KRW" : "USD";
    if (raw.history.length < 60) {
      const err = new Error(`${target.query}의 주가 이력이 충분하지 않아요.`);
      err.status = 422;
      throw err;
    }
    const stats = priceStats(raw.history);
    const result = judgeStock(raw, stats, macro);
    const history = raw.history.slice(-252).map((p) => [p.date, p.close]);
    return { ...raw, history, stats, ...result, streetLazy, macroScore: macro.score, fetchedAt: new Date().toISOString() };
  });
}

async function aiCommentary(symbol, headers) {
  // 판독 결과는 getStock에서 캐시된 것을 재사용
  const s = await getStock(symbol, headers);
  const macro = await getMacro();
  const facts = {
    종목: `${s.name} (${s.symbol})`,
    가격위치: s.position.label,
    시장해석: macro.view.headline,
    기술적신호: s.position.items.map((i) => `${i.label} ${i.display}`),
    판독: s.judges.map((j) => ({ 이름: j.name, 점수: j.score, 결론: j.verdict })),
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 900,
      system:
        "너는 투자 원칙을 설명하는 해설가다. 주어진 수치만 근거로 쓰고 없는 사실은 지어내지 않는다. 매수·매도를 지시하지 않는다. 투자자들의 판독이 왜 엇갈리는지, 무엇을 더 확인해야 하는지를 한국어로 6~8문장에 정리한다.",
      messages: [{ role: "user", content: JSON.stringify(facts) }],
    }),
  });
  if (!res.ok) throw new Error(`AI 해설 요청 실패 (${res.status})`);
  const json = await res.json();
  return {
    text: (json.content || [])
      .map((c) => c.text || "")
      .join("\n")
      .trim(),
  };
}

// path 예: "config", "macro", "stock/VZ", "stock/VZ/commentary"
// 반환: { status, body, maxAge(CDN 캐시 초) }
async function handle(path, headers = {}) {
  const { demo, ai, code } = env();
  path = path.replace(/^\/+|\/+$/g, "");
  try {
    if (path === "config")
      return { status: 200, body: { demo, ai, needsCode: Boolean(code), demoSymbols: demo ? demoSymbols : [] }, maxAge: 0 };
    if (code && headers["x-access-code"] !== code)
      return { status: 401, body: { error: "접근 코드가 맞지 않아요." }, maxAge: 0 };
    if (path === "macro") return { status: 200, body: await getMacro(), maxAge: TTL.macro };
    // 자동완성: /api/search/검색어 (국내는 네이버, 미국은 FMP)
    const sm = path.match(/^search\/(.{1,40})$/);
    if (sm) {
      const q = decodeURIComponent(sm[1]).trim();
      if (demo) return { status: 200, body: { results: [] }, maxAge: 0 };
      const kr = /[가-힣]|^\d{2,6}$/.test(q);
      const results = await cached(`search:${q}`, TTL.search * 1e3, () =>
        (kr ? naver.search(q) : fmpSearch(q, process.env.FMP_API_KEY)).catch(() => [])
      );
      return { status: 200, body: { results: results.map((r) => ({ ...r, kr })) }, maxAge: TTL.search };
    }
    // 월가 애널리스트 의견 (버튼을 누를 때만): /api/street/종목/우호적인투자자수/현재가
    const sv = path.match(/^street\/([A-Za-z0-9.\-]{1,20})\/([0-7])\/(\d+(?:\.\d+)?)$/);
    if (sv) {
      const [, sym, fav, price] = sv;
      const raw = demo
        ? demoStock(sym).street
        : await cached(`street:${sym}`, TTL.street * 1e3, () => streetData(sym, process.env.FMP_API_KEY));
      const view = streetReading(raw, Number(price), Number(fav));
      return { status: 200, body: { street: view }, maxAge: TTL.street };
    }
    if (path === "check/KR") return { status: 200, body: { naver: await naver.probe("005930") }, maxAge: 0 };
    // 연동 점검: /api/check/VZ → 각 데이터가 들어오는지와 필드명을 보여준다 (키 값은 노출하지 않음)
    const chk = path.match(/^check\/([A-Za-z.\-]{1,10})$/);
    if (chk) {
      if (demo)
        return {
          status: 200,
          body: { mode: "demo", hint: "FRED_API_KEY와 FMP_API_KEY가 둘 다 설정돼야 실제 데이터 모드가 돼요." },
          maxAge: 0,
        };
      const fredRes = await fetch(
        `https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=${process.env.FRED_API_KEY}&file_type=json&limit=1&sort_order=desc`
      );
      return {
        status: 200,
        body: { mode: "live", fred: { status: fredRes.status }, fmp: await probe(chk[1].toUpperCase(), process.env.FMP_API_KEY) },
        maxAge: 0,
      };
    }
    const m = path.match(/^stock\/([^/]{1,120})(\/commentary)?$/);
    if (m) {
      const symbol = decodeURIComponent(m[1]);
      if (m[2]) {
        if (!ai) return { status: 400, body: { error: "ANTHROPIC_API_KEY가 설정되지 않았어요." }, maxAge: 0 };
        return { status: 200, body: await aiCommentary(symbol, headers), maxAge: 0 };
      }
      return { status: 200, body: await getStock(symbol, headers), maxAge: TTL.stock };
    }
    return { status: 404, body: { error: "없는 경로예요." }, maxAge: 0 };
  } catch (err) {
    console.error(err.message);
    // 외부 데이터 오류(FMP·FRED·네이버 원문)는 쉬운 문구로 바꿔 보여줘요
    const raw = /^(FMP|FRED|네이버)|fetch failed|timeout/i.test(err.message);
    const message = raw ? "데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." : err.message;
    return { status: err.status || 502, body: { error: message }, maxAge: 0 };
  }
}

module.exports = { handle };
