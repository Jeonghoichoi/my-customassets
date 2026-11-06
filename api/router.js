// Vercel 서버리스 함수: /api/* 요청이 vercel.json의 rewrite로 이곳에 모입니다
const { handle } = require("../src/router");

module.exports = async (req, res) => {
  const path = String(req.query.path || "");
  const r = await handle(path, req.headers);
  res.setHeader("content-type", "application/json; charset=utf-8");
  // 같은 종목을 여러 번 열어도 FMP 무료 한도를 쓰지 않도록 Vercel CDN에 잠시 캐시
  res.setHeader("cache-control", r.maxAge ? `public, s-maxage=${r.maxAge}, stale-while-revalidate=${r.maxAge}` : "no-store");
  res.statusCode = r.status;
  res.end(JSON.stringify(r.body));
};
