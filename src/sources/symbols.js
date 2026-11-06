// 검색어를 보고 미국/한국 주식을 구분한다.
// - 영문 티커 (VZ, BRK.B)          → 미국
// - 6자리 숫자 (005930)            → 한국, 코스피(.KS) 먼저 찾고 없으면 코스닥(.KQ)
// - 6자리.KS / 6자리.KQ            → 한국, 시장 지정
// - 한글 종목명 (삼성전자)          → 아래 목록에서 코드로 변환
const KR_NAMES = {
  "삼성전자": "005930.KS", "SK하이닉스": "000660.KS", "LG에너지솔루션": "373220.KS", "삼성바이오로직스": "207940.KS",
  "현대차": "005380.KS", "기아": "000270.KS", "셀트리온": "068270.KS", "NAVER": "035420.KS", "네이버": "035420.KS",
  "카카오": "035720.KS", "POSCO홀딩스": "005490.KS", "포스코홀딩스": "005490.KS", "KB금융": "105560.KS",
  "신한지주": "055550.KS", "하나금융지주": "086790.KS", "우리금융지주": "316140.KS", "삼성물산": "028260.KS",
  "LG화학": "051910.KS", "삼성SDI": "006400.KS", "현대모비스": "012330.KS", "한화에어로스페이스": "012450.KS",
  "HD현대중공업": "329180.KS", "두산에너빌리티": "034020.KS", "SK텔레콤": "017670.KS", "KT": "030200.KS",
  "삼성생명": "032830.KS", "삼성화재": "000810.KS", "한국전력": "015760.KS", "미래에셋증권": "006800.KS",
  "키움증권": "039490.KS", "삼성증권": "016360.KS", "LG전자": "066570.KS", "SK이노베이션": "096770.KS",
  "고려아연": "010130.KS", "HMM": "011200.KS", "대한항공": "003490.KS",
  "에코프로비엠": "247540.KQ", "에코프로": "086520.KQ", "알테오젠": "196170.KQ", "HLB": "028300.KQ",
};

function resolve(input) {
  const q = decodeURIComponent(String(input || "")).trim();
  const upper = q.toUpperCase().replace(/\s+/g, "");
  if (/^\d{6}\.(KS|KQ)$/.test(upper)) return { market: "KR", candidates: [upper], query: q };
  if (/^\d{6}$/.test(upper)) return { market: "KR", candidates: [`${upper}.KS`, `${upper}.KQ`], query: q };
  const named = KR_NAMES[q] || KR_NAMES[upper] || Object.entries(KR_NAMES).find(([k]) => k.toUpperCase() === upper)?.[1];
  if (named) return { market: "KR", candidates: [named], query: q };
  if (/[가-힣]/.test(q)) {
    const err = new Error(`'${q}'은(는) 목록에 없는 종목명입니다. 6자리 종목코드(예: 005930)로 검색하세요.`);
    err.status = 404;
    throw err;
  }
  if (/^[A-Z][A-Z.\-]{0,9}$/.test(upper)) return { market: "US", candidates: [upper], query: q };
  const err = new Error("미국 티커(예: VZ) 또는 한국 종목코드(예: 005930)로 검색하세요.");
  err.status = 400;
  throw err;
}

const marketLabel = (symbol) => (/\.KS$/.test(symbol) ? "코스피" : /\.KQ$/.test(symbol) ? "코스닥" : null);

module.exports = { resolve, marketLabel, KR_NAMES };
