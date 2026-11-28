// 배당셰프 습관 쇼츠용 평면 일러스트 (원작 캐릭터: 책상 앞 30대 직장인) — viewBox 0 0 800 820
const SK = "#F1D3B8", SKD = "#E2B898", HAIR = "#2A2522", SW = "#3E4C66", SWD = "#33405A", DESK = "#C9A27A", DESKD = "#A9825C", INK = "#2A2522";

function face(e = "normal") {
  const eyes = {
    normal: `<circle cx="368" cy="292" r="7" fill="${INK}"/><circle cx="432" cy="292" r="7" fill="${INK}"/>`,
    wide: `<circle cx="368" cy="290" r="11" fill="#fff" stroke="${INK}" stroke-width="4"/><circle cx="368" cy="291" r="5" fill="${INK}"/><circle cx="432" cy="290" r="11" fill="#fff" stroke="${INK}" stroke-width="4"/><circle cx="432" cy="291" r="5" fill="${INK}"/>`,
    tired: `<path d="M356 294 q12 -6 24 0" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M420 294 q12 -6 24 0" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M358 306 q10 5 20 0 M422 306 q10 5 20 0" stroke="#B08B78" stroke-width="3" fill="none"/>`,
    happy: `<path d="M356 296 q12 -12 24 0" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M420 296 q12 -12 24 0" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    side: `<circle cx="376" cy="294" r="7" fill="${INK}"/><circle cx="440" cy="294" r="7" fill="${INK}"/>`,
  }[e];
  const brows = e === "wide" ? `<path d="M352 266 l28 -6 M420 260 l28 6" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`
    : e === "tired" ? `<path d="M352 272 l28 4 M420 276 l28 -4" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`
    : `<path d="M352 270 q14 -6 28 0 M420 270 q14 -6 28 0" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  return { eyes, brows };
}
function mouth(m = "flat") {
  return {
    flat: `<path d="M384 346 h32" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
    smile: `<path d="M380 340 q20 18 40 0" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    o: `<ellipse cx="400" cy="348" rx="11" ry="14" fill="#7A3B33"/>`,
    frown: `<path d="M382 352 q18 -14 36 0" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    grin: `<path d="M378 336 q22 26 44 0 z" fill="#fff" stroke="${INK}" stroke-width="4"/>`,
  }[m];
}
function person({ e = "normal", m = "flat", arm = "desk", sweat = false }) {
  const f = face(e);
  const armsDesk = `<path d="M262 470 q-30 70 -10 120 h110 q-10 -30 -60 -40 z" fill="${SW}"/><path d="M538 470 q30 70 10 120 h-110 q10 -30 60 -40 z" fill="${SW}"/>
    <ellipse cx="350" cy="594" rx="34" ry="18" fill="${SK}"/><ellipse cx="450" cy="594" rx="34" ry="18" fill="${SK}"/>`;
  const armsHold = `<path d="M262 470 q-30 70 -10 120 h110 q-10 -30 -60 -40 z" fill="${SW}"/><ellipse cx="350" cy="594" rx="34" ry="18" fill="${SK}"/>
    <path d="M538 470 q40 40 30 110 l-40 0 q0 -50 -40 -70 z" fill="${SW}"/><path d="M560 560 q-20 -60 -70 -90" stroke="${SW}" stroke-width="58" fill="none" stroke-linecap="round"/>
    <circle cx="488" cy="462" r="30" fill="${SK}"/>`;
  const armsThumb = `<path d="M262 470 q-30 70 -10 120 h110 q-10 -30 -60 -40 z" fill="${SW}"/><ellipse cx="350" cy="594" rx="34" ry="18" fill="${SK}"/>
    <path d="M560 570 q-10 -70 -40 -120" stroke="${SW}" stroke-width="58" fill="none" stroke-linecap="round"/>
    <rect x="496" y="400" width="52" height="50" rx="16" fill="${SK}"/><rect x="506" y="360" width="20" height="50" rx="10" fill="${SK}"/>`;
  const arms = { desk: armsDesk, hold: armsHold, thumb: armsThumb }[arm];
  return `
    <path d="M250 600 q-10 -150 60 -175 q90 -30 180 0 q70 25 60 175 z" fill="${SW}"/>
    <path d="M360 430 q40 30 80 0" stroke="${SWD}" stroke-width="10" fill="none"/>
    <rect x="372" y="370" width="56" height="64" fill="${SKD}"/>
    <ellipse cx="300" cy="305" rx="16" ry="24" fill="${SKD}"/><ellipse cx="500" cy="305" rx="16" ry="24" fill="${SKD}"/>
    <ellipse cx="400" cy="300" rx="100" ry="110" fill="${SK}"/>
    <path d="M298 290 q-6 -120 102 -126 q112 2 104 122 q-14 -60 -60 -74 q-40 30 -100 22 q-30 10 -46 56 z" fill="${HAIR}"/>
    ${f.brows}${f.eyes}
    <path d="M398 304 q-8 22 4 26" stroke="#C99A80" stroke-width="4" fill="none" stroke-linecap="round"/>
    ${mouth(m)}
    <ellipse cx="350" cy="330" rx="16" ry="8" fill="#F0A99A" opacity=".45"/><ellipse cx="450" cy="330" rx="16" ry="8" fill="#F0A99A" opacity=".45"/>
    ${sweat ? `<path d="M494 250 q10 18 0 26 q-10 -8 0 -26z" fill="#8EC5E8"/>` : ""}
    ${arms}`;
}
const desk = `<rect x="40" y="600" width="720" height="40" rx="8" fill="${DESK}"/><rect x="40" y="636" width="720" height="14" fill="${DESKD}"/><rect x="90" y="650" width="26" height="170" fill="${DESKD}"/><rect x="684" y="650" width="26" height="170" fill="${DESKD}"/>`;

// 소품
const phone = (x, y, inner, s = 1) => `<g transform="translate(${x},${y}) scale(${s})"><rect x="0" y="0" width="120" height="210" rx="18" fill="#222"/><rect x="8" y="14" width="104" height="182" rx="10" fill="#fff"/>${inner}</g>`;
const zig = (col = "#E5484D") => `<polyline points="18,150 36,90 54,130 72,60 90,120 102,80" fill="none" stroke="${col}" stroke-width="6" stroke-linejoin="round"/>`;
const down = `<polyline points="18,60 40,80 58,70 78,130 100,160" fill="none" stroke="#3B82F6" stroke-width="7" stroke-linejoin="round"/><text x="60" y="185" font-size="22" font-weight="900" text-anchor="middle" fill="#3B82F6" font-family="Noto Sans CJK KR">-12%</text>`;
const bubble = (x, y, w, t, col = "#fff", tc = INK) => `<g><rect x="${x}" y="${y}" width="${w}" height="64" rx="32" fill="${col}" stroke="${INK}" stroke-width="3"/><text x="${x + w / 2}" y="${y + 43}" font-size="30" font-weight="900" text-anchor="middle" fill="${tc}" font-family="Noto Sans CJK KR">${t}</text></g>`;
const clock = (x, y, t) => `<g><circle cx="${x}" cy="${y}" r="38" fill="#fff" stroke="${INK}" stroke-width="4"/><path d="M${x} ${y} v-22 M${x} ${y} h16" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><text x="${x}" y="${y + 70}" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}" font-family="Noto Sans CJK KR">${t}</text></g>`;

const SCENES = {
  intro: () => `${desk}${person({ e: "wide", m: "o", arm: "hold", sweat: true })}${phone(440, 380, down, .9)}${bubble(560, 150, 190, "왜 이래?!")}`,
  chart: () => `${desk}${person({ e: "tired", m: "flat", arm: "hold" })}${phone(440, 380, zig(), .9)}${clock(120, 150, "출근길")}${clock(250, 90, "점심")}${clock(640, 110, "자기 전")}`,
  trade: () => `${desk}${person({ e: "wide", m: "grin", arm: "desk" })}
    ${bubble(80, 170, 150, "매수", "#E5484D", "#fff")}${bubble(570, 170, 150, "매도", "#3B82F6", "#fff")}${bubble(100, 330, 150, "매수", "#E5484D", "#fff")}${bubble(550, 330, 150, "매도", "#3B82F6", "#fff")}
    <text x="400" y="110" font-size="44" font-weight="900" text-anchor="middle" fill="${INK}" font-family="Noto Sans CJK KR">도파민 ↑ 일상 재미 ↓</text>`,
  rule: () => `${desk}${person({ e: "normal", m: "smile", arm: "desk" })}
    <g transform="translate(500,330) rotate(6)"><rect width="230" height="260" rx="10" fill="#fff" stroke="${INK}" stroke-width="4"/>
    <text x="115" y="50" font-size="28" font-weight="900" text-anchor="middle" fill="${INK}" font-family="Noto Sans CJK KR">내 기준</text>
    <text x="24" y="110" font-size="26" font-weight="700" fill="${INK}" font-family="Noto Sans CJK KR">SCHD 배당률</text>
    <text x="115" y="180" font-size="58" font-weight="900" text-anchor="middle" fill="#C9A646" font-family="Noto Sans CJK KR">3.6%↑</text>
    <text x="115" y="230" font-size="24" font-weight="700" text-anchor="middle" fill="${INK}" font-family="Noto Sans CJK KR">일 때만 ✓</text></g>`,
  greed: () => `${desk}${person({ e: "happy", m: "smile", arm: "thumb" })}
    <g transform="translate(70,150)"><rect width="250" height="190" rx="14" fill="#fff" stroke="${INK}" stroke-width="4"/>
    <polyline points="20,160 70,130 110,140 160,80 220,40" fill="none" stroke="#E5484D" stroke-width="7"/>
    <circle cx="220" cy="40" r="10" fill="#C9A646"/><text x="125" y="185" font-size="1" fill="none">.</text></g>
    ${bubble(80, 370, 230, "약 +70% 매도", "#C9A646", "#fff")}`,
  trend: () => `${desk}${person({ e: "side", m: "flat", arm: "desk" })}
    <g opacity=".45"><path d="M130 330 l40 -150 l40 150 z" fill="#bbb"/><text x="170" y="380" font-size="28" font-weight="700" text-anchor="middle" fill="#888" font-family="Noto Sans CJK KR">유행 테마</text>
    <line x1="100" y1="170" x2="240" y2="360" stroke="#888" stroke-width="8"/></g>
    <g transform="translate(560,160)"><rect width="170" height="180" fill="#fff" stroke="${INK}" stroke-width="4"/><path d="M0 60 l40 -40 l40 40 l40 -40 l50 40" fill="none" stroke="${INK}" stroke-width="4"/>
    <rect x="30" y="90" width="30" height="40" fill="#C9A646"/><rect x="110" y="90" width="30" height="40" fill="#C9A646"/>
    <text x="85" y="230" font-size="30" font-weight="900" text-anchor="middle" fill="${INK}" font-family="Noto Sans CJK KR">기업가치</text></g>`,
  outro: () => `${desk}${person({ e: "happy", m: "smile", arm: "thumb" })}
    <g transform="translate(90,170)">${[0, 1, 2, 3, 4].map(i => `<rect x="${i * 46}" y="${200 - i * 40}" width="36" height="${i * 40 + 40}" fill="${i === 4 ? "#C9A646" : "#9AA6BC"}"/>`).join("")}</g>
    ${bubble(80, 110, 260, "반복이 이긴다", "#fff")}`,
};
module.exports = (k) => `<svg viewBox="0 0 800 820" width="100%" height="100%">${SCENES[k]()}</svg>`;
