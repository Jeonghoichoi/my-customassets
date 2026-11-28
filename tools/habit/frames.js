// 습관 쇼츠 프레임 (1080x1920): 크림 배경 · 위 고정 제목 · 가운데 그림 · 아래 자막 2줄
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const art = require("./art.js");
const [specPath, out] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const CSS = `*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1920px;background:#F3EEE4;font-family:'Noto Sans CJK KR',sans-serif;color:#1E1B18;word-break:keep-all;overflow:hidden}
.t{position:absolute;left:80px;right:80px;top:250px;text-align:center;font-size:76px;font-weight:900;line-height:1.28;letter-spacing:-2px}
.t y{color:#B8862B}
.no{position:absolute;left:0;right:0;top:500px;text-align:center;font-size:40px;font-weight:900;color:#B8862B;letter-spacing:2px}
.art{position:absolute;left:110px;right:110px;top:560px;height:880px}
.s{position:absolute;left:90px;right:90px;top:1460px;text-align:center;font-size:50px;font-weight:700;line-height:1.5;letter-spacing:-1px}
.h{position:absolute;right:70px;bottom:330px;font-size:26px;color:#9a9083;font-weight:700}`;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const br = await chromium.launch(), pg = await br.newPage({ viewport: { width: 1080, height: 1920 } });
  for (let i = 0; i < spec.beats.length; i++) {
    const b = spec.beats[i];
    for (let j = 0; j < b.subs.length; j++) {
      await pg.setContent(`<html><head><style>${CSS}</style></head><body>
        <div class="t">${spec.title}</div>${b.no ? `<div class="no">${esc(b.no)}</div>` : ""}
        <div class="art">${art(b.art)}</div><div class="s">${b.subs[j]}</div><div class="h">@배당셰프</div></body></html>`);
      await pg.evaluate(() => document.fonts.ready);
      await pg.screenshot({ path: path.join(out, `b${String(i + 1).padStart(2, "0")}_${j}.png`) });
    }
  }
  await br.close();
})();
