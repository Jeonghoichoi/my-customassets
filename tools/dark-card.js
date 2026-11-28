// 배당셰프 다크 카드뉴스 (1080x1350): 그레이·블랙 + 핵심 숫자만 탁한 옐로우
// node dark-card.js spec.json outdir
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const esc = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const Y = "#c9a646", W = "#f2f2f2", G1 = "#bdbdbd", G2 = "#7a7a7a", G3 = "#3a3a3a", G4 = "#262626", BG = "#121212";

// 굵은 제목 폰트(Black Han Sans): tools/make-font.sh 가 tools/fonts/bhs.css 를 만들어요
const FONTCSS = (n) => { try { return n ? fs.readFileSync(path.join(__dirname, "fonts", `${n}.css`), "utf8") : ""; } catch { return ""; } };
const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans CJK KR',sans-serif;word-break:keep-all;background:${BG};color:${W}}
.c{position:relative;width:1080px;height:1350px;overflow:hidden;background:radial-gradient(120% 80% at 50% 0%,#232323 0%,${BG} 60%,#0b0b0b 100%)}
.grain{position:absolute;inset:0;opacity:.18;mix-blend-mode:overlay}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:90px 90px}
.top{position:absolute;left:72px;right:72px;top:58px;display:flex;justify-content:space-between;align-items:center;font-size:24px;color:${G2};font-weight:700;letter-spacing:1px}
.top .no{color:${W};font-size:26px}
.top .no i{font-style:normal;color:${G2}}
y,.y{color:${Y}}
.k{font-size:32px;font-weight:700;color:${G1};letter-spacing:-.5px}
h1{font-weight:900;letter-spacing:-3px;line-height:1.12}
h2{font-size:72px;font-weight:900;letter-spacing:-2.5px;line-height:1.18}
.p{font-size:36px;line-height:1.6;color:${G1};letter-spacing:-.6px}
.p b{color:${W};font-weight:900}
.hd{position:absolute;right:72px;bottom:52px;font-size:24px;color:${G2};font-weight:700}
.src{position:absolute;left:72px;bottom:52px;font-size:21px;color:#5a5a5a}
.next{position:absolute;left:72px;bottom:110px;font-size:30px;font-weight:700;color:${G1}}
.next b{color:${W}}
/* 부품 */
.bar{display:flex;align-items:center;gap:26px;margin:30px 0}
.bar .nm{width:210px;font-size:38px;font-weight:700;color:${G1}}
.bar .tr{flex:1;height:92px;background:${G4};position:relative;border-radius:6px}
.bar .fl{position:absolute;top:0;bottom:0;border-radius:6px}
.bar .v{width:280px;text-align:right;font-size:50px;font-weight:900;letter-spacing:-1.5px}
.flow{display:flex;flex-direction:column;gap:0}
.st{display:flex;align-items:center;gap:30px}
.st .dot{flex:none;width:86px;height:86px;border-radius:50%;border:3px solid ${G3};display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:900;color:${G1};background:${BG}}
.st.hl .dot{border-color:${Y};color:${BG};background:${Y}}
.st .t{font-size:44px;font-weight:900;letter-spacing:-1px}
.st .s{font-size:28px;color:${G2};margin-top:4px}
.ln{width:3px;height:44px;background:${G3};margin-left:42px}
.lanes{display:grid;grid-template-columns:1fr 1fr;gap:26px}
.lane{border:2px solid ${G3};border-radius:14px;padding:30px 30px 20px}
.lane.hl{border-color:${Y}}
.lane h4{font-size:30px;color:${G2};font-weight:700;margin-bottom:14px}
.lane.hl h4{color:${Y}}
.lane .r{font-size:38px;font-weight:900;padding:16px 0;border-top:1px solid ${G4}}
.lane .r:first-of-type{border:0}
.lane .r small{display:block;font-size:24px;color:${G2};font-weight:400;margin-top:4px}
.ck{display:flex;gap:26px;align-items:center;padding:28px 0;border-bottom:1px solid ${G4}}
.ck .b{flex:none;width:60px;height:60px;border:3px solid ${G2};border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:900}
.ck.hl .b{border-color:${Y};color:${Y}}
.ck .t{font-size:42px;font-weight:900;letter-spacing:-1px}
.ck .t small{display:block;font-size:27px;color:${G2};font-weight:400;margin-top:6px;letter-spacing:0}
`;

const GRAIN = `<svg class="grain" width="1080" height="1350"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;

// 캔들 차트 시각 요소 (pseudo 시세: 오르다 폭락, 마지막 한 개만 옐로우)
function candles({ x = 0, y = 600, w = 1080, h = 650, n = 26, crashAt = 21, op = 1 }) {
  let v = 50, out = [], seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < n; i++) {
    const o = v; let c;
    if (i === crashAt) c = v - 34; else if (i > crashAt) c = v + (i === crashAt + 1 ? 5 : (rnd() - .45) * 6); else c = v + (rnd() - .32) * 7;
    const hi = Math.max(o, c) + rnd() * 3 + 1, lo = Math.min(o, c) - rnd() * 3 - 1; out.push({ o, c, hi, lo }); v = c;
  }
  const all = out.flatMap(k => [k.hi, k.lo]), mn = Math.min(...all), mx = Math.max(...all);
  const Yp = v => y + h * (1 - (v - mn) / (mx - mn)), cw = w / n;
  return `<svg style="position:absolute;left:0;top:0;opacity:${op}" width="1080" height="1350">${out.map((k, i) => {
    const cx = x + cw * i + cw / 2, up = k.c >= k.o, last = i === n - 1, crash = i === crashAt;
    const col = last ? Y : crash ? "#5a5a5a" : up ? "#8a8a8a" : "#3e3e3e";
    return `<line x1="${cx}" x2="${cx}" y1="${Yp(k.hi)}" y2="${Yp(k.lo)}" stroke="${col}" stroke-width="3"/>
      <rect x="${cx - cw * .32}" y="${Yp(Math.max(k.o, k.c))}" width="${cw * .64}" height="${Math.max(4, Math.abs(Yp(k.o) - Yp(k.c)))}" fill="${up && !last ? "none" : col}" stroke="${col}" stroke-width="3"/>`;
  }).join("")}</svg>`;
}
function bigGhost(t, top = 520, size = 420) {
  return `<div style="position:absolute;left:-20px;right:-20px;top:${top}px;text-align:center;font-size:${size}px;font-weight:900;letter-spacing:-20px;color:transparent;-webkit-text-stroke:2px rgba(255,255,255,.09);line-height:1">${esc(t)}</div>`;
}
function stack(n, hlLast = true) { // 쌓이는 막대(콘텐츠가 쌓인다)
  return `<svg style="position:absolute;left:0;top:0" width="1080" height="1350">${Array.from({ length: n }, (_, i) => {
    const h = 60 + i * 34, x = 90 + i * 76, last = i === n - 1;
    return `<rect x="${x}" y="${1230 - h}" width="52" height="${h}" fill="${last && hlLast ? Y : i % 2 ? "#3a3a3a" : "#4d4d4d"}"/>`;
  }).join("")}</svg>`;
}

const PART = {
  quote: d => `<div style="border-left:6px solid ${Y};padding:10px 0 10px 40px"><div style="font-size:120px;line-height:.6;color:${Y};font-weight:900;margin-bottom:10px">“</div><div class="disp" style="font-size:${d.size || 62}px;line-height:1.3;color:${W}">${d.q}</div><div style="font-size:28px;color:${G2};margin-top:26px">${esc(d.by)}</div></div>`,
  bars: d => { const mx = Math.max(...d.rows.map(r => Math.abs(r.v))); return d.rows.map(r => `<div class="bar"><div class="nm">${esc(r.name)}</div><div class="tr"><div class="fl" style="left:0;width:${Math.abs(r.v) / mx * 100}%;background:${r.hl ? Y : r.v >= 0 ? "#8a8a8a" : "#4a4a4a"}"></div></div><div class="v" style="color:${r.hl ? Y : W}">${esc(r.label)}</div></div>`).join(""); },
  flow: d => `<div class="flow">${d.steps.map((s, i) => `${i ? '<div class="ln"></div>' : ""}<div class="st ${s.hl ? "hl" : ""}"><div class="dot">${esc(s.n ?? i + 1)}</div><div><div class="t">${s.t}</div>${s.s ? `<div class="s">${esc(s.s)}</div>` : ""}</div></div>`).join("")}</div>`,
  lanes: d => `<div class="lanes">${d.lanes.map(l => `<div class="lane ${l.hl ? "hl" : ""}"><h4>${esc(l.h)}</h4>${l.rows.map(r => `<div class="r">${r[0]}${r[1] ? `<small>${esc(r[1])}</small>` : ""}</div>`).join("")}</div>`).join("")}</div>`,
  checks: d => d.items.map(i => `<div class="ck ${i.hl ? "hl" : ""}"><div class="b">✓</div><div class="t">${i.t}${i.s ? `<small>${esc(i.s)}</small>` : ""}</div></div>`).join(""),
};

function page(s, i, n, spec) {
  if (s.kind === "photo") {
    const bgv = `<div style="position:absolute;inset:-40px;filter:blur(6px) brightness(1.25) contrast(1.15)">${candles({ x: -60, y: 180, w: 1300, h: 1000, n: 18, crashAt: 13 })}</div>
         <div style="position:absolute;inset:0;background:radial-gradient(55% 40% at 70% 45%,rgba(255,255,255,.16),transparent 70%)"></div>`;
    return `<div class="c">${bgv}<div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.25) 50%,rgba(0,0,0,.7));"></div>
      <div style="position:absolute;inset:0;box-shadow:inset 0 0 260px rgba(0,0,0,.85)"></div>${GRAIN}
      <div style="position:absolute;left:80px;right:60px;top:${s.top ?? 360}px">
        <div style="display:inline-block;background:${Y};color:#141414;font-size:42px;font-weight:900;padding:10px 30px;border-radius:40px;margin-bottom:34px;letter-spacing:-.5px">${esc(s.chip)}</div>
        <h1 class="disp" style="font-size:${s.size || 128}px;line-height:1.14;color:#fff;text-shadow:0 6px 30px rgba(0,0,0,.5)">${s.title}</h1>
        ${s.sub ? `<div style="margin-top:38px;font-size:42px;font-weight:700;color:#d6d6d6;display:flex;align-items:center;gap:14px"><svg width="34" height="42" viewBox="0 0 24 30"><path d="M12 0C5.4 0 0 5.2 0 11.7 0 20 12 30 12 30s12-10 12-18.3C24 5.2 18.6 0 12 0z" fill="${Y}"/><circle cx="12" cy="11.5" r="4.5" fill="#141414"/></svg>${s.sub}</div>` : ""}
      </div>
      <div class="hd">@baedang_chef</div></div>`;
  }

  const top = `<div class="top"><span>BAEDANG CHEF · ${esc(spec.tag || "")}</span><span class="no">${String(i + 1).padStart(2, "0")} <i>/ ${String(n).padStart(2, "0")}</i></span></div>`;
  let body = "";
  if (s.kind === "cover") {
    const vis = s.visual === "candles" ? candles({ y: 700, h: 520, op: .95 }) : s.visual === "stack" ? stack(12) : "";
    body = `${s.ghost ? bigGhost(s.ghost, s.ghostTop, s.ghostSize) : ""}${vis}
      <div style="position:absolute;left:72px;right:72px;top:${s.top ?? 170}px">
        <div class="k" style="margin-bottom:26px">${esc(s.kicker)}</div>
        <h1 style="font-size:${s.size || 104}px">${s.title}</h1>
        ${s.sub ? `<div class="p" style="margin-top:30px;font-size:38px">${s.sub}</div>` : ""}
      </div>
      <div class="next"><b>${esc(s.next || "넘겨 보세요")}</b> →</div>`;
  } else {
    body = `<div style="position:absolute;left:72px;right:72px;top:150px">
        ${s.kicker ? `<div class="k" style="color:${G2};margin-bottom:18px">${esc(s.kicker)}</div>` : ""}
        <h2 class="disp" style="font-size:84px;line-height:1.15">${s.title}</h2>
      </div>
      <div style="position:absolute;left:72px;right:72px;top:${s.partTop ?? 470}px">${s.part ? PART[s.part.type](s.part) : ""}</div>
      ${s.text ? `<div class="p" style="position:absolute;left:72px;right:72px;bottom:${s.textBottom ?? 140}px">${s.text}</div>` : ""}`;
  }
  return `<div class="c"><div class="grid"></div>${GRAIN}${top}${body}${s.src ? `<div class="src">${esc(s.src)}</div>` : ""}<div class="hd">@baedang_chef</div></div>`;
}

(async () => {
  const [sp, out] = process.argv.slice(2);
  const spec = JSON.parse(fs.readFileSync(sp, "utf8"));
  fs.mkdirSync(out, { recursive: true });
  const br = await chromium.launch(), pg = await br.newPage({ viewport: { width: 1080, height: 1350 } });
  for (let i = 0; i < spec.slides.length; i++) {
    await pg.setContent(`<html><head><style>${FONTCSS(spec.font)}${CSS}${spec.font ? `.disp{font-family:"Black Han Sans",sans-serif !important;font-weight:400 !important;letter-spacing:-1px !important}` : ""}</style></head><body>${page(spec.slides[i], i, spec.slides.length, spec)}</body></html>`);
    await pg.evaluate(() => document.fonts.ready);
    await pg.screenshot({ path: path.join(out, `${spec.name}_${String(i + 1).padStart(2, "0")}.png`) });
  }
  await br.close();
})();
