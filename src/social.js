// 인스타 릴스·쓰레드 바로 올리기: data/uploads.json의 쇼츠를 공식 API로 게시해요
// 키는 Vercel 환경변수에만 있어요: IG_ACCESS_TOKEN, IG_USER_ID, THREADS_ACCESS_TOKEN, THREADS_USER_ID
// 영상은 media 브랜치 파일을 jsDelivr 주소로 넘기면, 메타 서버가 직접 가져가요 (video/mp4로 내려줘요)
// 서버리스 60초 제한 때문에 유튜브처럼 단계를 나눠요: start(컨테이너 만들기) → check(처리 확인, 화면이 반복) → publish(게시)
const CDN = "https://cdn.jsdelivr.net/gh/Jeonghoichoi/my-customassets@";
const IG_MAX = 2200; // 릴스 캡션 최대 글자
const TH_MAX = 500; // 쓰레드 글 최대 글자

const clean = (v) => String(v || "").trim().replace(/^["']|["']$/g, "");

const cfg = () => ({
  // 복사·붙여넣기 때 따라온 공백·줄바꿈·따옴표는 지워요
  ig: { token: clean(process.env.IG_ACCESS_TOKEN), user: clean(process.env.IG_USER_ID), ver: clean(process.env.IG_GRAPH_VERSION) || "v25.0" },
  th: { token: clean(process.env.THREADS_ACCESS_TOKEN), user: clean(process.env.THREADS_USER_ID) },
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
  const params = { media_type: "REELS", video_url: media(it.video), caption: textFrom(headers, IG_MAX), share_to_feed: "true" };
  if (it.thumb) params.cover_url = media(it.thumb);
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
async function instaStart(id) {
  const it = instaItem(id);
  const user = cfg().ig.user;
  if (it.kind === "reel") {
    const params = { media_type: "REELS", video_url: media(it.video), caption: it.caption, share_to_feed: "true" };
    if (it.cover) params.cover_url = media(it.cover);
    return { container: (await ig(`/${user}/media`, params)).id };
  }
  const imgs = it.images || [];
  if (imgs.length < 2 || imgs.length > 10) throw fail(400, "카드뉴스는 2~10장이어야 해요.");
  const kids = await Promise.all(imgs.map((p) => ig(`/${user}/media`, { image_url: media(p), is_carousel_item: "true" }).then((j) => j.id)));
  const j = await ig(`/${user}/media`, { media_type: "CAROUSEL", children: kids.join(","), caption: it.caption });
  return { container: j.id };
}
const instaList = () => ({ items: instaItems().map(({ id, kind, title, images, video, cover, caption }) => ({ id, kind, title, images, video, cover, caption })) });

// ── 쓰레드 ──
const th = (path, params = {}, method = "POST") => {
  const c = cfg().th;
  if (!c.token || !c.user) throw fail(400, "Vercel에 THREADS_ACCESS_TOKEN과 THREADS_USER_ID를 먼저 넣어 주세요.");
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
const GH = "https://api.github.com/repos/Jeonghoichoi/my-customassets/contents/threads.json";
const STORE_BRANCH = "threads";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kstDate = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);

async function gh(method, body) {
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

async function loadStore() {
  const j = await gh("GET");
  if (!j) return { data: { items: [] }, sha: null };
  return { data: JSON.parse(Buffer.from(j.content, "base64").toString("utf8")), sha: j.sha };
}

async function saveStore(data, sha, message) {
  const content = Buffer.from(JSON.stringify(data, null, 1) + "\n", "utf8").toString("base64");
  await gh("PUT", { message, content, branch: STORE_BRANCH, ...(sha ? { sha } : {}) });
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

// Vercel Cron (매일 12:30 KST, 쓰레드 황금 시간대): 승인된 점심 글·카드를 올려요. CRON_SECRET이 맞을 때만 동작해요
async function handleCron(headers) {
  const secret = clean(process.env.CRON_SECRET);
  if (!secret || headers.authorization !== `Bearer ${secret}`) throw fail(401, "허용되지 않은 요청이에요.");
  const { data, sha } = await loadStore();
  const due = (data.items || []).filter((x) => x.status === "approved" && x.date <= kstDate()).slice(0, 2);
  const done = [];
  for (const it of due) {
    try {
      const r = await postText(it.final, it.image, it.topic);
      Object.assign(it, { status: "posted", postedAt: new Date().toISOString(), url: r.url, postId: r.id });
      done.push(it.id);
    } catch (e) {
      it.error = e.message;
    }
  }
  if (due.length) await saveStore(data, sha, `쓰레드 예약 게시 ${done.join(", ") || "실패"}`);
  return { posted: done, tried: due.length };
}

// 연결 상태: 토큰이 살아 있는지 계정 이름을 한 번 불러서 확인해요
async function status() {
  const c = cfg();
  const out = { reels: { ready: Boolean(c.ig.token && c.ig.user) }, threads: { ready: Boolean(c.th.token && c.th.user) } };
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
  if (path === "sns/insta/items") return instaList();
  const g = path.match(/^sns\/insta\/(start|check|publish)\/([\w-]{1,40})$/);
  if (g) return { start: instaStart, check: igCheck, publish: igPublish }[g[1]](g[2]);
  const d = path.match(/^sns\/threads\/(approve|skip)\/([\w-]{1,40})$/);
  if (d) return decide(d[2], d[1], headers);
  const m = path.match(/^sns\/(reels|threads)\/(start|check|publish)\/([\w-]{1,30})$/);
  if (!m) return null;
  const [, pl, step, arg] = m;
  const fns = pl === "reels" ? { start: igStart, check: igCheck, publish: igPublish } : { start: thStart, check: thCheck, publish: thPublish };
  return fns[step](arg, headers);
}

module.exports = { handleSns, handleCron };
