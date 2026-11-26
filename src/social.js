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
  if (e.code === 10 || e.code === 200) return `${who} 게시 권한이 없어요. 앱 권한(콘텐츠 게시)을 확인해 주세요.`;
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
  const m = path.match(/^sns\/(reels|threads)\/(start|check|publish)\/([\w-]{1,30})$/);
  if (!m) return null;
  const [, pl, step, arg] = m;
  const fns = pl === "reels" ? { start: igStart, check: igCheck, publish: igPublish } : { start: thStart, check: thCheck, publish: thPublish };
  return fns[step](arg, headers);
}

module.exports = { handleSns };
