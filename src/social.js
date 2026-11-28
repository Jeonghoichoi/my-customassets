// 인스타 릴스·쓰레드 바로 올리기: data/uploads.json의 쇼츠를 공식 API로 게시해요
// 키는 Vercel 환경변수에만 있어요: IG_ACCESS_TOKEN, IG_USER_ID, THREADS_ACCESS_TOKEN (THREADS_USER_ID는 더 안 써요)
// 영상은 media 브랜치 파일을 jsDelivr 주소로 넘기면, 메타 서버가 직접 가져가요 (video/mp4로 내려줘요)
// 서버리스 60초 제한 때문에 유튜브처럼 단계를 나눠요: start(컨테이너 만들기) → check(처리 확인, 화면이 반복) → publish(게시)
const CDN = "https://cdn.jsdelivr.net/gh/Jeonghoichoi/my-customassets@";
const IG_MAX = 2200; // 릴스 캡션 최대 글자
const TH_MAX = 500; // 쓰레드 글 최대 글자

const clean = (v) => String(v || "").trim().replace(/^["']|["']$/g, "");

const cfg = () => ({
  // 복사·붙여넣기 때 따라온 공백·줄바꿈·따옴표는 지워요
  ig: { token: clean(process.env.IG_ACCESS_TOKEN), user: clean(process.env.IG_USER_ID), ver: clean(process.env.IG_GRAPH_VERSION) || "v25.0" },
  // 쓰레드는 계정 번호 대신 "me"(토큰 주인)로 올려요 — 앱·토큰을 새로 만들어도 번호가 어긋나 실패하지 않게
  th: { token: clean(process.env.THREADS_ACCESS_TOKEN), user: "me" },
});

function fail(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function queue() {
  try {
    return require("../data/uploads.json");
  } catch {
    return { items: [] };
  }
}

function item(id) {
  const it = queue().items.find((x) => x.id === id);
  if (!it) throw fail(404, "대기열에 없는 영상이에요.");
  if (it.kind === "long") throw fail(400, "본편은 유튜브에만 올려요. 쇼츠만 올릴 수 있어요.");
  if (it.draft || !it.video) throw fail(409, "아직 만들고 있는 영상이에요.");
  return it;
}

const media = (p) => `${CDN}${queue().branch || "media"}/${p}`;

// 화면이 만든 캡션은 encodeURIComponent로 헤더에 실려 와요
function textFrom(headers, max) {
  let t = "";
  try {
    t = decodeURIComponent(headers["x-sns-text"] || "");
  } catch {
    throw fail(400, "캡션을 읽지 못했어요.");
  }
  if (!t.trim()) throw fail(400, "캡션이 비어 있어요.");
  if ([...t].length > max) throw fail(400, `캡션이 ${max}자를 넘어요.`);
  return t;
}

const containerId = (s) => {
  if (!/^\d{5,30}$/.test(s)) throw fail(400, "컨테이너 번호가 이상해요.");
  return s;
};

function metaMessage(j, status, who) {
  const e = j.error || {};
  // 원인을 알 수 있게 메타가 보낸 원래 문구도 괄호로 붙여요 (토큰 값은 들어 있지 않아요)
  if (e.code === 190) return `${who} 토큰이 만료됐거나 잘못됐어요. 개발자 대시보드에서 새 토큰을 받아 Vercel에 다시 넣어 주세요. (${e.message || "code 190"})`;
  if (e.code === 4 || e.code === 17 || e.code === 32) return `${who} API 사용 한도를 넘었어요. 잠시 뒤 다시 눌러 주세요.`;
  if (e.error_subcode === 2207081) return `${who} 체험판 릴스는 팔로워 200명 이상(공개 프로페셔널 계정)부터 쓸 수 있어서 아직 못 올렸어요. 체험판 체크를 끄면 일반 릴스로 올라가요. (2207081)`;
  if (e.code === 10 || e.code === 200) return `${who} 게시 권한이 없어요. 앱 권한(콘텐츠 게시)을 확인해 주세요. (${e.error_user_msg || e.message || "code " + e.code}${e.error_subcode ? " · " + e.error_subcode : ""})`;
  return `${who} 오류예요 (${e.error_user_msg || e.message || status}).`;
}

async function call(base, path, params, method, token, who) {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(method === "GET" ? `${base}${path}?${qs}` : `${base}${path}`, {
    method,
    headers: method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : undefined,
    body: method === "POST" ? qs : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw fail(j.error?.code === 190 ? 401 : 502, metaMessage(j, res.status, who));
  return j;
}

// ── 인스타 릴스 ──
const ig = (path, params = {}, method = "POST") => {
  const c = cfg().ig;
  if (!c.token || !c.user) throw fail(400, "Vercel에 IG_ACCESS_TOKEN과 IG_USER_ID를 먼저 넣어 주세요.");
  return call(`https://graph.facebook.com/${c.ver}`, path, params, method, c.token, "인스타");
};

async function igStart(id, headers) {
  const it = item(id);
  const caption = textFrom(headers, IG_MAX);
  // 방금 올린 쇼츠는 CDN이 못 찾을 수 있어요 → 못 찾으면 GitHub 원본 주소로
  const url = await warm([it.video, it.thumb].filter(Boolean));
  const params = { media_type: "REELS", video_url: url[it.video], caption, share_to_feed: "true" };
  if (it.thumb) params.cover_url = url[it.thumb];
  // 체험판 릴스 (팔로워 200명 이상 공개 프로페셔널 계정부터): 팔로워 아닌 사람에게 먼저 보여 주고, 반응 좋으면 자동 공개
  if (headers["x-insta-trial"] === "1") {
    params.trial_params = JSON.stringify({ graduation_strategy: "SS_PERFORMANCE" });
    delete params.share_to_feed;
  }
  const j = await ig(`/${cfg().ig.user}/media`, params);
  return { container: j.id };
}

async function igCheck(cid) {
  const j = await ig(`/${containerId(cid)}`, { fields: "status_code,status" }, "GET");
  // IN_PROGRESS → FINISHED (또는 ERROR / EXPIRED)
  return { state: j.status_code, detail: j.status || "" };
}

async function igPublish(cid) {
  const j = await ig(`/${cfg().ig.user}/media_publish`, { creation_id: containerId(cid) });
  const p = await ig(`/${j.id}`, { fields: "permalink" }, "GET").catch(() => ({}));
  return { id: j.id, url: p.permalink || "" };
}


// ── 인스타 피드 게시물 (카드뉴스 묶음·릴스) ──
// data/insta.json 에 예약 작업·제작 세션이 게시물을 쌓아요. 이미지는 media 브랜치의 JPG(인스타 API는 JPG만 받아요)
// 카드뉴스: 이미지마다 묶음용 컨테이너 → 묶음 컨테이너(CAROUSEL) → 처리 확인 → 게시
function instaItems() {
  try {
    return require("../data/insta.json").items || [];
  } catch {
    return [];
  }
}
function instaItem(id) {
  const it = instaItems().find((x) => x.id === id);
  if (!it) throw fail(404, "인스타 게시물 목록에 없는 항목이에요.");
  if (!it.caption || [...it.caption].length > IG_MAX) throw fail(400, "캡션이 비었거나 2,200자를 넘어요.");
  return it;
}
// jsDelivr는 media 브랜치를 몇 시간씩 캐시해서, 방금 올린 파일은 한동안 404일 수 있어요
// → CDN에서 먼저 받아 보고(미리 불러 두기도 겸해요), 안 되면 GitHub 원본 주소로 넘겨요
const RAW = "https://raw.githubusercontent.com/Jeonghoichoi/my-customassets/";
const rawMedia = (p) => `${RAW}${queue().branch || "media"}/${p}`;
async function warm(paths) {
  const urls = {};
  await Promise.all(paths.map(async (p) => {
    const ok = await fetch(media(p)).then(async (r) => (await r.arrayBuffer(), r.ok)).catch(() => false);
    urls[p] = ok ? media(p) : rawMedia(p);
  }));
  return urls;
}
async function retry(fn, n = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= n || e.status === 401) throw e;
      await new Promise((r) => setTimeout(r, 2500));
    }
  }
}
async function instaStart(id, headers = {}) {
  const trial = headers["x-insta-trial"] === "1";
  const it = instaItem(id);
  const user = cfg().ig.user;
  if (it.kind === "reel") {
    if (!it.video) throw fail(400, "릴스 영상 파일이 아직 없어요.");
    const url = await warm([it.video, it.cover].filter(Boolean));
    const params = { media_type: "REELS", video_url: url[it.video], caption: it.caption, share_to_feed: "true" };
    if (it.cover) params.cover_url = url[it.cover];
    // 체험판 릴스: 팔로워가 아닌 사람에게 먼저 보여 주고, 반응이 좋으면 자동으로 정식 공개돼요
    // 체험판 릴스: 팔로워가 아닌 사람에게 먼저 보여 주고, 반응이 좋으면 자동으로 정식 공개돼요
    // 인스타 조건: 공개 프로페셔널 계정 + 팔로워 200명 이상 (안 되면 2207081 오류 → 일반 릴스로 몰래 바꾸지 않고 알려요)
    if (trial) {
      params.trial_params = JSON.stringify({ graduation_strategy: "SS_PERFORMANCE" });
      delete params.share_to_feed;
    }
    return { container: (await ig(`/${user}/media`, params)).id };
  }
  const imgs = it.images || [];
  if (imgs.length < 2 || imgs.length > 10) throw fail(400, "카드뉴스는 2~10장이어야 해요.");
  // CDN이 처음 받는 파일은 느려서 인스타가 못 가져갈 때가 있어요 → 먼저 한 번씩 불러 두고, 실패하면 두 번 더 시도해요
  const url = await warm(imgs);
  const kids = [];
  for (const p of imgs) kids.push(await retry(() => ig(`/${user}/media`, { image_url: url[p], is_carousel_item: "true" }).then((j) => j.id)));
  const j = await ig(`/${user}/media`, { media_type: "CAROUSEL", children: kids.join(","), caption: it.caption });
  return { container: j.id };
}
const instaList = () => ({ items: instaItems().map(({ id, kind, title, images, video, cover, caption, pair }) => ({ id, kind, title, images, video, cover, caption, pair })) });

// ── 쓰레드 ──
const th = (path, params = {}, method = "POST") => {
  const c = cfg().th;
  if (!c.token) throw fail(400, "Vercel에 THREADS_ACCESS_TOKEN을 먼저 넣어 주세요.");
  return call("https://graph.threads.net/v1.0", path, params, method, c.token, "쓰레드");
};

async function thStart(id, headers) {
  const it = item(id);
  const j = await th(`/${cfg().th.user}/threads`, { media_type: "VIDEO", video_url: media(it.video), text: textFrom(headers, TH_MAX) });
  return { container: j.id };
}

async function thCheck(cid) {
  const j = await th(`/${containerId(cid)}`, { fields: "status,error_message" }, "GET");
  // IN_PROGRESS → FINISHED (또는 ERROR / EXPIRED)
  return { state: j.status, detail: j.error_message || "" };
}

async function thPublish(cid) {
  const j = await th(`/${cfg().th.user}/threads_publish`, { creation_id: containerId(cid) });
  const p = await th(`/${j.id}`, { fields: "permalink" }, "GET").catch(() => ({}));
  return { id: j.id, url: p.permalink || "" };
}

// ── 쓰레드 글(텍스트) ──
// 매일 아침 예약 작업이 threads 브랜치의 threads.json에 초안을 올려요. 노아 님이 앱에서 승인하면
// 아침 글(am)은 바로, 저녁 글(pm)은 밤 9시 Vercel Cron이 올려요.
// threads 브랜치는 배포가 꺼져 있어서(vercel.json) 승인할 때마다 앱이 다시 배포되지 않아요
const GH_DIR = "https://api.github.com/repos/Jeonghoichoi/my-customassets/contents/";
const STORE_BRANCH = "threads";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kstDate = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

async function gh(method, body, file = "threads.json") {
  const GH = GH_DIR + file;
  const token = clean(process.env.GITHUB_TOKEN);
  if (!token) throw fail(400, "Vercel에 GITHUB_TOKEN을 먼저 넣어 주세요.");
  const res = await fetch(method === "GET" ? `${GH}?ref=${STORE_BRANCH}` : GH, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": "baedang-chef-reader",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (method === "GET" && res.status === 404) return null;
  const j = await res.json().catch(() => ({}));
  if (res.status === 401) throw fail(401, "GITHUB_TOKEN이 만료됐거나 잘못됐어요.");
  if (res.status === 409) throw fail(409, "다른 곳에서 동시에 저장했어요. 새로고침하고 다시 눌러 주세요.");
  if (!res.ok) throw fail(502, `글 목록 저장소 오류예요 (${j.message || res.status}).`);
  return j;
}

async function loadStore(file = "threads.json") {
  const j = await gh("GET", null, file);
  if (!j) return { data: file === "threads.json" ? { items: [] } : {}, sha: null };
  return { data: JSON.parse(Buffer.from(j.content, "base64").toString("utf8")), sha: j.sha };
}

async function saveStore(data, sha, message, file = "threads.json") {
  const content = Buffer.from(JSON.stringify(data, null, 1) + "\n", "utf8").toString("base64");
  await gh("PUT", { message, content, branch: STORE_BRANCH, ...(sha ? { sha } : {}) }, file);
}

// 글(+카드 이미지) 올리기: 컨테이너 만들기 → 게시 (준비가 덜 됐으면 몇 초 기다렸다 다시)
// image는 media 브랜치 경로예요 (예: threads/2026-11-28-noon.png) — jsDelivr 주소로 넘기면 메타가 가져가요
async function postText(text, image, topic) {
  const params = image ? { media_type: "IMAGE", image_url: `${CDN}media/${image}`, text } : { media_type: "TEXT", text };
  // 주제 태그(글마다 1개, 50자 이내, 마침표·& 금지): 쓰레드 '재테크'·'주식' 같은 주제 피드에 노출돼요
  const tp = String(topic || "").replace(/[.&#]/g, "").trim().slice(0, 50);
  if (tp) params.topic_tag = tp;
  const { id: container } = await th(`/${cfg().th.user}/threads`, params);
  let last;
  for (let i = 0; i < 5; i++) {
    try {
      const j = await th(`/${cfg().th.user}/threads_publish`, { creation_id: container });
      const p = await th(`/${j.id}`, { fields: "permalink" }, "GET").catch(() => ({}));
      return { id: j.id, url: p.permalink || "" };
    } catch (e) {
      last = e;
      await sleep(3000);
    }
  }
  throw last;
}

async function drafts() {
  const { data } = await loadStore();
  const items = (data.items || []).filter((x) => x.date >= kstDate(Date.now() - 6 * 86400e3));
  return { today: kstDate(), items: items.sort((a, b) => (a.date === b.date ? a.slot.localeCompare(b.slot) : b.date.localeCompare(a.date))) };
}

async function decide(id, action, headers) {
  const { data, sha } = await loadStore();
  const it = (data.items || []).find((x) => x.id === id);
  if (!it) throw fail(404, "그 초안을 찾지 못했어요.");
  if (it.status === "posted") throw fail(409, "이미 올린 글이에요.");
  if (action === "skip") {
    it.status = "skipped";
    await saveStore(data, sha, `쓰레드 ${id} 건너뛰기`);
    return { status: it.status };
  }
  const text = textFrom(headers, TH_MAX);
  if (/\{어제\}|\[[^\]]*\]/.test(text)) throw fail(400, "빈칸([ ]이나 어제 칸)을 채워야 올릴 수 있어요.");
  it.final = text;
  it.approvedAt = new Date().toISOString();
  // 아침 글이나 '지금 올리기'는 바로, 나머지(점심 카드 등)는 12시 30분 예약 게시로 올려요
  if (it.slot === "am" || headers["x-sns-now"] === "1") {
    const r = await postText(text, it.image, it.topic);
    Object.assign(it, { status: "posted", postedAt: new Date().toISOString(), url: r.url, postId: r.id });
  } else {
    it.status = "approved";
  }
  await saveStore(data, sha, `쓰레드 ${id} ${it.status === "posted" ? "게시" : "승인"}`);
  return { status: it.status, url: it.url || "" };
}

// ── 자동 운영 (Vercel Cron) ──────────────────────────────────────────
// 노아 님이 승인하지 않아도 정해진 시간에 올라가요. 판독기에서 '건너뛰기'를 누른 것만 빠져요.
//  · cron/morning (매일 08:30 KST): 아침 쓰레드 글 게시 + 인스타 카드뉴스·릴스 컨테이너 만들기(인스타가 처리할 시간 주기)
//  · cron/threads (매일 12:30 KST): 점심 쓰레드 카드 게시 + 아침에 만든 인스타 컨테이너 게시
//  · cron/youtube (매일 07:00 KST): 대기열의 다음 영상 1개를 유튜브에 예약 업로드
// 인스타 진행 상태는 threads 브랜치 auto.json 에 기록해요 (배포가 꺼진 브랜치라 기록할 때마다 앱이 다시 배포되지 않아요)
const blank = (t) => /\{어제\}|\[[^\]]*\]/.test(String(t || ""));
const AUTO = "auto.json";
const cleanTitle = (t) => String(t || "").replace(/\s*#shorts\b/gi, "").replace(/\s*\|\s*\d+월 \d+일.*$/, "").trim();
function reelCaption(it) {
  const skip = /^(shorts|쇼츠|배당셰프)$/i;
  const tags = ["배당셰프", ...(it.tags || []).filter((t) => !skip.test(t))].slice(0, 12).map((t) => "#" + t.replace(/\s+/g, ""));
  const body = String(it.description || "").split("\n").filter((l) => l.trim() && !/^출처|투자 권유|^https?:|본편|youtu/.test(l)).slice(0, 3).join("\n");
  return [cleanTitle(it.title), "", body, "", "더 긴 이야기는 유튜브 '배당셰프'에서 볼 수 있어요.", "※ 투자 권유가 아니에요.", "", tags.join(" ")].join("\n").slice(0, IG_MAX);
}
function checkCron(headers) {
  const secret = clean(process.env.CRON_SECRET);
  if (!secret || headers.authorization !== `Bearer ${secret}`) throw fail(401, "허용되지 않은 요청이에요.");
}
// 쓰레드: slots 중 오늘(또는 지난) 글을 올려요. 승인한 글은 고친 글(final)로, 승인 안 한 글은 버전 1로
async function autoThreads(slots, max) {
  const { data, sha } = await loadStore();
  const due = (data.items || [])
    .filter((x) => slots.includes(x.slot) && x.date <= kstDate() && x.date >= kstDate(Date.now() - 2 * 86400e3))
    .filter((x) => x.status === "approved" || ((x.status || "draft") === "draft" && !blank(x.text)))
    .slice(0, max);
  const done = [];
  for (const it of due) {
    try {
      const text = it.status === "approved" ? it.final : it.text;
      const r = await postText(text, it.image, it.topic);
      Object.assign(it, { status: "posted", postedAt: new Date().toISOString(), url: r.url, postId: r.id, auto: it.status !== "approved" });
      done.push(it.id);
    } catch (e) {
      it.error = e.message;
    }
  }
  if (due.length) await saveStore(data, sha, `쓰레드 자동 게시 ${done.join(", ") || "실패"}`);
  return { posted: done, tried: due.length };
}
// 인스타 다음 순서: 카드뉴스는 목록 순서대로, 릴스는 유튜브에 이미 공개된 쇼츠 중 최신
async function nextReel(state) {
  const yt = require("./youtube.js");
  let pub = new Set();
  try {
    pub = new Set((await yt.uploads()).videos.filter((v) => v.privacy === "public").map((v) => cleanTitle(v.title)));
  } catch {
    return null;
  }
  return queue().items
    .filter((x) => x.kind !== "long" && x.video && !x.draft && pub.has(cleanTitle(x.title)) && !state.reels[x.id])
    .sort((a, b) => String(b.publishAt).localeCompare(String(a.publishAt)))[0] || null;
}
async function autoInstaStart() {
  const c = cfg().ig;
  if (!c.token || !c.user) return { skipped: "인스타 키 없음" };
  const { data: st, sha } = await loadStore(AUTO);
  st.cards = st.cards || {};
  st.reels = st.reels || {};
  const out = {};
  const card = instaItems().find((x) => x.kind !== "reel" && !st.cards[x.id]);
  if (card) {
    try {
      const { container } = await instaStart(card.id);
      st.cards[card.id] = { status: "pending", container, at: new Date().toISOString() };
      out.card = card.id;
    } catch (e) {
      st.cards[card.id] = { status: "error", error: e.message, at: new Date().toISOString() };
    }
  }
  const reel = await nextReel(st);
  if (reel) {
    try {
      const { container } = await igStart(reel.id, { "x-sns-text": encodeURIComponent(reelCaption(reel)) });
      st.reels[reel.id] = { status: "pending", container, at: new Date().toISOString() };
      out.reel = reel.id;
    } catch (e) {
      st.reels[reel.id] = { status: "error", error: e.message, at: new Date().toISOString() };
    }
  }
  if (card || reel) await saveStore(st, sha, `인스타 자동 준비 ${[out.card, out.reel].filter(Boolean).join(", ") || "실패"}`, AUTO);
  return out;
}
async function autoInstaPublish() {
  const { data: st, sha } = await loadStore(AUTO);
  const out = [];
  let changed = false;
  for (const kind of ["cards", "reels"]) {
    for (const [id, v] of Object.entries(st[kind] || {})) {
      if (v.status !== "pending") continue;
      changed = true;
      try {
        const c = await igCheck(v.container);
        if (c.state === "FINISHED") {
          const r = await igPublish(v.container);
          Object.assign(v, { status: "posted", url: r.url, mediaId: r.id, postedAt: new Date().toISOString() });
          out.push(id);
        } else if (c.state === "ERROR" || c.state === "EXPIRED") Object.assign(v, { status: "error", error: c.detail || c.state });
      } catch (e) {
        v.error = e.message;
      }
    }
  }
  if (changed) await saveStore(st, sha, `인스타 자동 게시 ${out.join(", ") || "대기"}`, AUTO);
  return { posted: out };
}
async function instaSkip(key) {
  const [kind, id] = key.split(":");
  if (!["cards", "reels"].includes(kind)) throw fail(400, "건너뛸 항목이 이상해요.");
  const { data: st, sha } = await loadStore(AUTO);
  st[kind] = st[kind] || {};
  if (st[kind][id]?.status === "posted") throw fail(409, "이미 올린 거예요.");
  st[kind][id] = { status: "skipped", at: new Date().toISOString() };
  await saveStore(st, sha, `인스타 건너뛰기 ${key}`, AUTO);
  return { ok: true };
}

// 성과 수집 (매주 일요일 20:00 KST, cron/metrics): threads 브랜치 metrics.json 에 저장 →
// 주간 예약 작업이 읽고 분석해서 playbook.json(잘된 주제·첫 문장·시간)을 고쳐요 → 다음 생산이 플레이북을 따라요 (선순환)
const num = (x) => Number(x?.total_value?.value ?? x?.values?.[0]?.value ?? 0);
async function pool(list, n, fn) {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(...(await Promise.all(list.slice(i, i + n).map((x) => fn(x).catch(() => null)))));
  return out.filter(Boolean);
}
async function autoMetrics() {
  const t0 = new Date().toISOString();
  const res = { at: t0, threads: [], insta: [], youtube: [], errors: [] };
  // 쓰레드: 최근 30일 내가 올린 글
  try {
    const { data } = await loadStore();
    const posted = (data.items || []).filter((x) => x.status === "posted" && x.postId && x.date >= kstDate(Date.now() - 30 * 86400e3));
    res.threads = await pool(posted, 5, async (x) => {
      const j = await th(`/${x.postId}/insights`, { metric: "views,likes,replies,reposts,quotes,shares" }, "GET");
      const m = Object.fromEntries((j.data || []).map((d) => [d.name, num(d)]));
      return { id: x.id, date: x.date, slot: x.slot, topic: x.topic || "", series: x.series || "", auto: Boolean(x.auto), hook: String(x.final || x.text).split("\n")[0], ...m };
    });
  } catch (e) {
    res.errors.push(`쓰레드: ${e.message}`);
  }
  // 인스타: 최근 게시물 25개
  try {
    const c = cfg().ig;
    if (c.token && c.user) {
      const list = await ig(`/${c.user}/media`, { fields: "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count", limit: "25" }, "GET");
      res.insta = await pool(list.data || [], 5, async (m) => {
        const reel = m.media_product_type === "REELS";
        const metric = reel ? "views,reach,saved,shares,total_interactions" : "reach,saved,shares,total_interactions";
        const j = await ig(`/${m.id}/insights`, { metric }, "GET").catch(() => ({ data: [] }));
        const k = Object.fromEntries((j.data || []).map((d) => [d.name, num(d)]));
        return { id: m.id, type: reel ? "reel" : m.media_type, at: m.timestamp, url: m.permalink, hook: String(m.caption || "").split("\n")[0].slice(0, 80), likes: m.like_count || 0, comments: m.comments_count || 0, ...k };
      });
    }
  } catch (e) {
    res.errors.push(`인스타: ${e.message}`);
  }
  // 유튜브
  try {
    res.youtube = await require("./youtube.js").stats();
  } catch (e) {
    res.errors.push(`유튜브: ${e.message}`);
  }
  const { data: old, sha } = await loadStore("metrics.json");
  const hist = (old.history || []).concat({ at: t0, threads: res.threads.length, insta: res.insta.length, youtube: res.youtube.length }).slice(-52);
  await saveStore({ ...res, history: hist }, sha, `성과 수집 ${kstDate()}`, "metrics.json");
  return { threads: res.threads.length, insta: res.insta.length, youtube: res.youtube.length, errors: res.errors };
}

async function handleCron(headers, which = "threads") {
  checkCron(headers);
  const out = {};
  const safe = async (k, fn) => {
    try {
      out[k] = await fn();
    } catch (e) {
      out[k] = { error: e.message };
    }
  };
  if (which === "morning") {
    await safe("threads", () => autoThreads(["am"], 1));
    await safe("insta", autoInstaStart);
  } else if (which === "metrics") {
    await safe("metrics", autoMetrics);
  } else if (which === "youtube") {
    await safe("youtube", () => require("./youtube.js").autoUpload());
  } else {
    await safe("threads", () => autoThreads(["noon", "pm"], 2));
    await safe("insta", autoInstaPublish);
  }
  return out;
}

// 연결 상태: 토큰이 살아 있는지 계정 이름을 한 번 불러서 확인해요
async function status() {
  const c = cfg();
  const out = { reels: { ready: Boolean(c.ig.token && c.ig.user) }, threads: { ready: Boolean(c.th.token) } };
  const probe = async (key, fn) => {
    if (!out[key].ready) return;
    try {
      out[key].username = (await fn()).username || "";
    } catch (e) {
      out[key].error = e.message;
    }
  };
  await Promise.all([
    probe("reels", () => ig(`/${c.ig.user}`, { fields: "username" }, "GET")),
    probe("threads", () => th(`/${c.th.user}`, { fields: "username" }, "GET")),
  ]);
  return out;
}

// path 예: "sns/status", "sns/reels/start/56-1", "sns/reels/check/1789…", "sns/threads/publish/1789…"
async function handleSns(path, headers) {
  if (path === "sns/status") return status();
  if (path === "sns/threads/drafts") return drafts();
  if (path === "sns/insta/items") return { ...instaList(), auto: (await loadStore(AUTO).catch(() => ({ data: {} }))).data };
  const k = path.match(/^sns\/insta\/skip\/((?:cards|reels):[\w-]{1,40})$/);
  if (k) return instaSkip(k[1]);
  const g = path.match(/^sns\/insta\/(start|check|publish)\/([\w-]{1,40})$/);
  if (g) return { start: instaStart, check: igCheck, publish: igPublish }[g[1]](g[2], headers);
  const d = path.match(/^sns\/threads\/(approve|skip)\/([\w-]{1,40})$/);
  if (d) return decide(d[2], d[1], headers);
  const m = path.match(/^sns\/(reels|threads)\/(start|check|publish)\/([\w-]{1,30})$/);
  if (!m) return null;
  const [, pl, step, arg] = m;
  const fns = pl === "reels" ? { start: igStart, check: igCheck, publish: igPublish } : { start: thStart, check: thCheck, publish: thPublish };
  return fns[step](arg, headers);
}

module.exports = { handleSns, handleCron };
