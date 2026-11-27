// 배당셰프 계산형 밈 카드 (1080x1350, 그레이·블랙 톤: 위에 후킹 문장, 아래 소품(영수증·폰), 핵심 숫자만 [[ ]]로 감싸면 탁한 옐로우)
// 사용: node tools/meme-card.js cards.json → 각 항목 out 경로에 png (Playwright·Noto Sans CJK 필요)
// cards.json 예: [{"out":"x.png","tag":"한 달 외식비 계산","lines":["소고기 [[3번]]만 줄이면","펩시 1주 && SCHD [[4주]]","(괄호 줄은 작은 글씨)"],"scene":{"type":"receipt","title":"이번 달 정산","rows":[["한우 외식 1회","130,000","x"],"---",["1년 배당(세전)","약 13,700원","b"]]}}]
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
    const hl = (t) => E(t).replace(/\[\[(.+?)\]\]/g, '<y>$1</y>');
    const big = c.lines.filter(l => !l.startsWith('(')), small = c.lines.filter(l => l.startsWith('('));
    const fs = c.fs || Math.max(70, Math.min(100, Math.floor(930 / Math.max(...big.map(l => l.replace(/\[\[|\]\]/g, '').length)))));
    await p.setContent(`<html><head><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{width:1080px;height:1350px;font-family:'Noto Sans CJK KR',sans-serif;overflow:hidden;background:#121212;color:#f2f2f2;word-break:keep-all}
    .bg{position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 0%,#262626 0%,#121212 60%,#0b0b0b 100%)}
    .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:90px 90px}
    .ph{position:absolute;left:0;right:0;bottom:0;height:62%;background:${bg} center/cover;filter:grayscale(1) contrast(1.05) brightness(.55)}
    .top{position:absolute;left:72px;right:72px;top:58px;display:flex;justify-content:space-between;font-size:24px;color:#7a7a7a;font-weight:700;letter-spacing:1px}
    .t{position:absolute;left:72px;right:72px;top:140px;font-weight:900;font-size:${fs}px;line-height:1.18;letter-spacing:-3px}
    .t small{display:block;margin-top:24px;font-size:38px;font-weight:700;color:#bdbdbd;letter-spacing:-.5px;line-height:1.45}
    y{color:#c9a646}
    .sc{position:absolute;left:0;right:0;top:${c.scTop || 500}px;display:flex;justify-content:center}
    .em{position:absolute;left:0;right:0;text-align:center;top:${c.emTop || 680}px;font-size:${c.emSize || 380}px;line-height:1;filter:grayscale(1) brightness(.85)}
    .phone{width:700px;background:#1c1c1c;border:2px solid #333;border-radius:46px;padding:44px 34px 30px;box-shadow:0 40px 90px rgba(0,0,0,.7);transform:rotate(-3deg);color:#f2f2f2}
    .phone .hd{font-size:30px;font-weight:900;margin:0 0 18px 6px;color:#bdbdbd}
    .row{display:flex;justify-content:space-between;align-items:center;background:#262626;border-radius:22px;padding:22px 24px;margin:10px 0;font-size:30px;font-weight:700}
    .row small{display:block;font-size:22px;color:#7a7a7a;font-weight:400}
    .dn{color:#8a8a8a}.up{color:#c9a646}
    .rc{width:660px;background:#d8d8d8;padding:40px 44px;box-shadow:0 40px 90px rgba(0,0,0,.75);transform:rotate(2.5deg);font-family:'Noto Sans Mono CJK KR','Noto Sans CJK KR',monospace;color:#1b1b1b;font-size:33px;line-height:1.7}
    .rc h3{margin:0 0 10px;text-align:center;font-size:34px}
    .rc .ln{display:flex;justify-content:space-between}.rc hr{border:0;border-top:3px dashed #8a8a8a;margin:14px 0}
    .rc .x{text-decoration:line-through;color:#7a7a7a}
    .fade{position:absolute;left:0;right:0;bottom:0;height:260px;background:linear-gradient(transparent,#0b0b0b)}
    .h{position:absolute;right:72px;bottom:56px;color:#7a7a7a;font-weight:700;font-size:26px}
    .g{position:absolute;inset:0;opacity:.14;mix-blend-mode:overlay;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence baseFrequency='.9' numOctaves='2'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>")}
    </style></head><body><div class="bg"></div><div class="grid"></div>${c.photo ? '<div class="ph"></div>' : ''}
    ${c.scene ? `<div class="sc">${sceneHtml(c.scene)}</div>` : (c.emoji && !c.photo ? `<div class="em">${c.emoji}</div>` : '')}<div class="fade"></div><div class="g"></div>
    <div class="top"><span>BAEDANG CHEF</span><span>${E(c.tag || '')}</span></div>
    <div class="t">${big.map(hl).join('<br>')}${small.map(l => `<small>${hl(l)}</small>`).join('')}</div><div class="h">@baedang_chef</div></body></html>`);
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
    await p.screenshot({ path: c.out }); console.log('done', c.out);
  }
  await b.close();
})();
