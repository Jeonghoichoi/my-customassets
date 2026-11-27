// 배당셰프 계산형 밈 카드 (1080x1350, 흑백 소품 배경 + 큰 흰 글씨 + @baedang_chef)
// 사용: node tools/meme-card.js cards.json → 각 항목 out 경로에 png (Playwright·Noto Sans CJK 필요)
// cards.json 예: [{"out":"x.png","lines":["소고기 3번만 줄이면","펩시 1주 && SCHD 4주","(괄호 줄은 작은 글씨)"],"scene":{"type":"receipt","title":"이번 달 정산","rows":[["한우 외식 1회","130,000","x"],"---",["1년 배당(세전)","약 13,700원","b"]]}}]
const { chromium } = require('playwright'); const fs = require('fs');

// 소품 배경: {type:"receipt", title, rows:[[왼쪽, 오른쪽, "x"(취소선)|"b"(굵게)] | "---"]}
//           {type:"phone", title, rows:[[제목, 값, "up"|"dn", 작은글씨] | "## 소제목"]}
const E = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function sceneHtml(s) {
  if (!s) return '';
  if (typeof s === 'string') return s;
  if (s.type === 'receipt') return '<div class="rc"><h3>' + E(s.title || '영 수 증') + '</h3>' + s.rows.map((r) => r === '---' ? '<hr>' :
    `<div class="ln ${r[2] === 'x' ? 'x' : ''}"><span>${r[2] === 'b' ? '<b>' + E(r[0]) + '</b>' : E(r[0])}</span><span>${r[2] === 'b' ? '<b>' + E(r[1]) + '</b>' : E(r[1])}</span></div>`).join('') + '</div>';
  if (s.type === 'phone') return '<div class="phone"><div class="hd">' + E(s.title || '') + '</div>' + s.rows.map((r) => typeof r === 'string' ? `<div class="hd" style="margin-top:22px">${E(r.replace(/^##\s*/, ''))}</div>` :
    `<div class="row"><div>${E(r[0])}${r[3] ? '<small>' + E(r[3]) + '</small>' : ''}</div><div class="${r[2] || ''}">${E(r[1])}</div></div>`).join('') + '</div>';
  return '';
}

const list = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  for (const c of list) {
    const bg = c.photo ? `url(data:image/jpeg;base64,${fs.readFileSync(c.photo).toString('base64')})` : 'none';
    await p.setContent(`<html><head><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@500;900&display=swap" rel="stylesheet"><style>
    body{margin:0;width:1080px;height:1350px;font-family:'Noto Sans KR','Noto Sans CJK KR',sans-serif;overflow:hidden;background:#111}
    .ph{position:absolute;inset:0;background:${bg} center/cover;filter:grayscale(1) contrast(1.08) brightness(.92)}
    .fb{position:absolute;inset:0;background:${c.photo ? 'none' : `radial-gradient(120% 90% at 70% 20%,#5a5a5a 0%,#2a2a2a 45%,#0e0e0e 100%)`}}
    .em{position:absolute;left:0;right:0;text-align:center;top:${c.emTop || 150}px;font-size:${c.emSize || 470}px;line-height:1;filter:grayscale(1);opacity:.9}
    .sc{position:absolute;left:0;right:0;top:70px;display:flex;justify-content:center;filter:grayscale(1)}
    .phone{width:600px;background:#f4f4f4;border-radius:46px;padding:46px 34px 30px;box-shadow:0 30px 80px rgba(0,0,0,.6);transform:rotate(-4deg);font-family:'Noto Sans CJK KR',sans-serif;color:#222}
    .phone .hd{font-size:30px;font-weight:900;margin:0 0 18px 6px}
    .row{display:flex;justify-content:space-between;align-items:center;background:#fff;border-radius:22px;padding:22px 24px;margin:10px 0;font-size:30px;font-weight:700}
    .row small{display:block;font-size:22px;color:#888;font-weight:500}
    .dn{color:#2b5fd9}.up{color:#d93636}
    .rc{width:520px;background:#fafafa;padding:40px 44px;box-shadow:0 30px 80px rgba(0,0,0,.6);transform:rotate(3deg);font-family:'Noto Sans Mono CJK KR','Noto Sans CJK KR',monospace;color:#222;font-size:28px;line-height:1.7}
    .rc h3{margin:0 0 10px;text-align:center;font-size:34px}
    .rc .ln{display:flex;justify-content:space-between}.rc hr{border:0;border-top:3px dashed #999;margin:14px 0}
    .rc .x{text-decoration:line-through;color:#999}
    .sh{position:absolute;left:0;right:0;bottom:0;height:62%;background:linear-gradient(transparent,rgba(0,0,0,.72))}
    .t{position:absolute;left:84px;right:84px;bottom:190px;color:#fff;font-weight:900;word-break:keep-all;font-size:${c.fs || Math.max(66, Math.min(92, Math.floor(912 / Math.max(...c.lines.filter(l=>!l.startsWith('(')).map(l=>l.length)))))}px;line-height:1.32;letter-spacing:-.03em;text-shadow:0 2px 18px rgba(0,0,0,.35)}
    .t small{display:block;margin-top:14px;font-size:44px;font-weight:500;opacity:.85;line-height:1.4}
    .h{position:absolute;left:86px;bottom:118px;color:#fff;font-weight:500;font-size:38px;opacity:.92}
    .g{position:absolute;inset:0;opacity:.13;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence baseFrequency='.9' numOctaves='2'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>")}
    </style></head><body><div class="ph"></div><div class="fb"></div>${c.scene ? `<div class="sc">${sceneHtml(c.scene)}</div>` : (c.emoji && !c.photo ? `<div class="em">${c.emoji}</div>` : '')}<div class="sh"></div><div class="g"></div>
    <div class="t">${c.lines.map(l => l.startsWith('(') ? `<small>${l}</small>` : l).join('<br>')}</div><div class="h">@baedang_chef</div></body></html>`);
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
    await p.screenshot({ path: c.out }); console.log('done', c.out);
  }
  await b.close();
})();
