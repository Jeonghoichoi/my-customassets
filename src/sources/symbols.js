// 검색어를 보고 미국/한국 주식을 구분한다.
// - 영문 티커 (VZ, BRK.B)          → 미국
// - 6자리 숫자 (005930)            → 한국, 코스피(.KS) 먼저 찾고 없으면 코스닥(.KQ)
// - 6자리.KS / 6자리.KQ            → 한국, 시장 지정
// - 한글 종목명 (삼성전자)          → 아래 목록에서 코드로 변환
const KR_NAMES = {
  삼성전자: "005930.KS",
  SK하이닉스: "000660.KS",
  LG에너지솔루션: "373220.KS",
  삼성바이오로직스: "207940.KS",
  현대차: "005380.KS",
  기아: "000270.KS",
  셀트리온: "068270.KS",
  NAVER: "035420.KS",
  네이버: "035420.KS",
  카카오: "035720.KS",
  POSCO홀딩스: "005490.KS",
  포스코홀딩스: "005490.KS",
  KB금융: "105560.KS",
  신한지주: "055550.KS",
  하나금융지주: "086790.KS",
  우리금융지주: "316140.KS",
  삼성물산: "028260.KS",
  LG화학: "051910.KS",
  삼성SDI: "006400.KS",
  현대모비스: "012330.KS",
  한화에어로스페이스: "012450.KS",
  HD현대중공업: "329180.KS",
  두산에너빌리티: "034020.KS",
  SK텔레콤: "017670.KS",
  KT: "030200.KS",
  삼성생명: "032830.KS",
  삼성화재: "000810.KS",
  한국전력: "015760.KS",
  미래에셋증권: "006800.KS",
  키움증권: "039490.KS",
  삼성증권: "016360.KS",
  LG전자: "066570.KS",
  SK이노베이션: "096770.KS",
  고려아연: "010130.KS",
  HMM: "011200.KS",
  대한항공: "003490.KS",
  에코프로비엠: "247540.KQ",
  에코프로: "086520.KQ",
  알테오젠: "196170.KQ",
  HLB: "028300.KQ",
};

// 국내 ETF 브랜드. "KODEX 200", "TIGER 미국배당다우존스"처럼 영문으로 시작해서
// 예전에는 미국 티커로 오해하고 미국 종목만 찾았어요.
const ETF_BRANDS = ["KODEX", "TIGER", "ACE", "SOL", "RISE", "PLUS", "KBSTAR", "HANARO", "ARIRANG", "KOSEF", "KINDEX", "KIWOOM", "TIMEFOLIO", "KOACT", "TRUSTON", "BNK", "WON", "FOCUS"];
// 한글로 친 브랜드 이름 → 영문 (뒤에 띄어쓰기가 있거나 브랜드만 쳤을 때만 바꿔요. '타이거일렉' 같은 종목은 그대로)
const ETF_BRAND_KO = { 코덱스: "KODEX", 타이거: "TIGER", 에이스: "ACE", 솔: "SOL", 라이즈: "RISE", 플러스: "PLUS", 케이비스타: "KBSTAR", 하나로: "HANARO", 아리랑: "ARIRANG", 코세프: "KOSEF", 킨덱스: "KINDEX", 키움: "KIWOOM", 타임폴리오: "TIMEFOLIO" };
function normalizeQuery(input) {
  let q = String(input || "").trim().replace(/\s+/g, " ");
  const m = q.match(/^([가-힣]+)(\s.*)?$/);
  if (m && ETF_BRAND_KO[m[1]]) q = ETF_BRAND_KO[m[1]] + (m[2] || "");
  return q;
}
// 국내 ETF 이름처럼 보이는지: 브랜드 + 뒤에 다른 글자, 또는 5글자 이상 브랜드만 (PLUS·SOL 같은 짧은 건 미국 티커일 수 있어요)
function looksLikeKrEtf(q) {
  const m = String(q || "").trim().toUpperCase().match(/^([A-Z]+)(\s*.*)$/);
  if (!m || !ETF_BRANDS.includes(m[1])) return false;
  return m[2].trim().length > 0 ? /^\s/.test(m[2]) || /^[\d가-힣]/.test(m[2]) : m[1].length >= 5;
}

function resolve(input) {
  const q = normalizeQuery(decodeURIComponent(String(input || "")));
  const upper = q.toUpperCase().replace(/\s+/g, "");
  if (/^\d{6}\.(KS|KQ)$/.test(upper)) return { market: "KR", candidates: [upper], query: q };
  if (/^\d{6}$/.test(upper)) return { market: "KR", candidates: [`${upper}.KS`, `${upper}.KQ`], query: q };
  const named = KR_NAMES[q] || KR_NAMES[upper] || Object.entries(KR_NAMES).find(([k]) => k.toUpperCase() === upper)?.[1];
  if (named) return { market: "KR", candidates: [named], query: q };
  // 한글 이름이나 국내 ETF 이름, 띄어쓰기·숫자가 섞인 영문 이름은 검색으로 종목을 찾아요
  if (/[가-힣]/.test(q) || looksLikeKrEtf(q) || (/[A-Za-z]/.test(q) && /[\s\d]/.test(q) && !/^\d{6}/.test(upper))) {
    const err = new Error(`'${q}' 종목을 찾지 못했어요. 6자리 종목코드(예: 005930)로 검색해 보세요.`);
    err.status = 404;
    err.code = "UNKNOWN_KR_NAME";
    err.query = q;
    throw err;
  }
  if (/^[A-Z][A-Z.\-]{0,9}$/.test(upper)) return { market: "US", candidates: [upper], query: q };
  const err = new Error("미국 티커(예: VZ) 또는 한국 종목코드(예: 005930)로 검색해 주세요.");
  err.status = 400;
  throw err;
}

const marketLabel = (symbol) => (/\.KS$/.test(symbol) ? "코스피" : /\.KQ$/.test(symbol) ? "코스닥" : null);

module.exports = { resolve, marketLabel, KR_NAMES, normalizeQuery, looksLikeKrEtf };
