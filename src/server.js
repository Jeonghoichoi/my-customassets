// 로컬 실행용 서버 (외부 패키지 없음, Node 18 이상)
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
loadEnv(path.join(ROOT, ".env"));
const { handle } = require("./router");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".png": "image/png", ".json": "application/json" };
const PUBLIC = path.join(ROOT, "public");

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    const r = await handle(url.pathname.slice(5), req.headers);
    res.writeHead(r.status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    return res.end(JSON.stringify(r.body));
  }
  const file = path.normalize(path.join(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("Not found");
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  res.end(fs.readFileSync(file));
}).listen(Number(process.env.PORT || 3000), "0.0.0.0", () => {
  const demo = process.env.DEMO === "1" || !process.env.FRED_API_KEY || !process.env.FMP_API_KEY;
  console.log(`배당셰프 판독기: http://localhost:${process.env.PORT || 3000}`);
  console.log(demo ? "데모 모드 (.env에 FRED_API_KEY, FMP_API_KEY를 넣으면 실제 데이터)" : "실제 데이터 모드");
});
