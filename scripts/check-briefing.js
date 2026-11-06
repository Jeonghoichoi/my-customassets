// data/briefing.json 형식 검사. 아침 예약 작업이 push 전에 돌려요.
// 사용법: node scripts/check-briefing.js [파일경로]
const fs = require("fs");
const path = require("path");
const file = process.argv[2] || path.join(__dirname, "..", "data", "briefing.json");
const errs = [];
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v, where) => v === null || isNum(v) || errs.push(`${where}: 숫자나 null이어야 해요`);
const str = (v, where, opt = false) => (opt && (v === null || v === undefined)) || (typeof v === "string" && v.trim()) || errs.push(`${where}: 글자가 비어 있어요`);
const arr = (v, where) => Array.isArray(v) || (errs.push(`${where}: 목록이어야 해요`), false);
const ymd = (v, where) => /^\d{4}-\d{2}-\d{2}$/.test(v || "") || errs.push(`${where}: YYYY-MM-DD 형식이어야 해요`);
const sym = (v, where) => v === null || v === undefined || /^(\d{6}|[A-Z][A-Z.\-]{0,9})$/.test(v) || errs.push(`${where}: 종목코드는 6자리 숫자나 미국 티커예요`);

let b;
try {
  b = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (e) {
  console.error("JSON을 읽지 못했어요: " + e.message);
  process.exit(1);
}
ymd(b.date, "date");
str(b.generatedAt, "generatedAt");
str(b.headline, "headline");
if (b.headline && b.headline.length > 140) errs.push("headline: 140자 이내로 써요");

function market(m, key) {
  if (!m || typeof m !== "object") return errs.push(`${key}: 없어요`);
  ymd(m.date, `${key}.date`);
  if (m.closed) return;
  if (arr(m.indices, `${key}.indices`)) m.indices.forEach((x, i) => (str(x.name, `${key}.indices[${i}].name`), numOrNull(x.value, `${key}.indices[${i}].value`), numOrNull(x.changePct, `${key}.indices[${i}].changePct`)));
  for (const side of ["up", "down"])
    if (arr(m.sectors?.[side], `${key}.sectors.${side}`)) m.sectors[side].forEach((x, i) => (str(x.name, `${key}.sectors.${side}[${i}].name`), numOrNull(x.changePct ?? null, `${key}.sectors.${side}[${i}].changePct`), str(x.why, `${key}.sectors.${side}[${i}].why`, true)));
  if (arr(m.movers, `${key}.movers`)) m.movers.forEach((x, i) => (str(x.name, `${key}.movers[${i}].name`), sym(x.symbol, `${key}.movers[${i}].symbol`), numOrNull(x.changePct ?? null, `${key}.movers[${i}].changePct`)));
}
market(b.us, "us");
market(b.kr, "kr");
if (b.us?.macro && arr(b.us.macro, "us.macro")) b.us.macro.forEach((x, i) => (str(x.name, `us.macro[${i}].name`), str(x.value, `us.macro[${i}].value`, true)));

const f = b.kr?.flows;
if (b.kr && !b.kr.closed) {
  if (!f) errs.push("kr.flows: 수급이 없어요");
  else {
    for (const who of ["foreign", "institution", "individual"]) {
      const w = f[who];
      if (!w) {
        errs.push(`kr.flows.${who}: 없어요`);
        continue;
      }
      numOrNull(w.kospi ?? null, `kr.flows.${who}.kospi`);
      numOrNull(w.kosdaq ?? null, `kr.flows.${who}.kosdaq`);
      for (const side of ["buy", "sell"])
        if (arr(w[side], `kr.flows.${who}.${side}`)) w[side].forEach((x, i) => (str(x.name, `kr.flows.${who}.${side}[${i}].name`), sym(x.symbol, `kr.flows.${who}.${side}[${i}].symbol`), numOrNull(x.amount ?? null, `kr.flows.${who}.${side}[${i}].amount`)));
    }
    str(f.summary, "kr.flows.summary", true);
  }
}
if (arr(b.issues, "issues")) b.issues.forEach((x, i) => (str(x.title, `issues[${i}].title`), str(x.body, `issues[${i}].body`)));
if (b.dividend !== undefined && b.dividend !== null) arr(b.dividend, "dividend");
if (arr(b.today, "today")) b.today.forEach((x, i) => str(x.title, `today[${i}].title`));
if (arr(b.sources, "sources")) {
  if (!b.sources.length) errs.push("sources: 출처가 하나는 있어야 해요");
  b.sources.forEach((x, i) => (str(x.title, `sources[${i}].title`), /^https?:\/\//.test(x.url || "") || errs.push(`sources[${i}].url: 링크가 아니에요`)));
}
if (errs.length) {
  console.error("형식 오류 " + errs.length + "개:\n- " + errs.join("\n- "));
  process.exit(1);
}
console.log("briefing OK: " + b.date);
