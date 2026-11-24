// 유튜브 예약 업로드: data/uploads.json 대기열의 영상을 노아 님 채널에 비공개 + 예약 공개로 올려요
// 키는 Vercel 환경변수에만 있어요: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN
// 영상 파일은 같은 저장소의 media 브랜치에 있고, 서버가 조각(8MB)씩 받아 유튜브로 넘겨요
const SCOPE = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl";
const RAW = "https://raw.githubusercontent.com/Jeonghoichoi/my-customassets";
const CHUNK = 32 * 256 * 1024; // 8MB (유튜브는 256KB의 배수를 요구해요)
const PLACEHOLDER = /\(업로드 후 링크 붙이기\)/;

const cfg = () => ({
  id: process.env.YT_CLIENT_ID || "",
  secret: process.env.YT_CLIENT_SECRET || "",
  refresh: process.env.YT_REFRESH_TOKEN || "",
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
  return it;
}

const media = (p) => `${RAW}/${queue().branch || "media"}/${p}`;

// 로그인 뒤 돌아올 주소: 휴대폰에서 연 판독기 주소 그대로 (구글 콘솔에도 똑같이 등록해야 해요)
function redirectUri(headers) {
  const host = headers["x-forwarded-host"] || headers.host;
  const proto = headers["x-forwarded-proto"] || (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return `${proto}://${host}/upload.html`;
}

async function oauth(params) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (j.error === "invalid_grant") throw fail(401, "유튜브 연결이 끊겼어요. '유튜브 연결'을 다시 눌러 주세요.");
    throw fail(502, `구글 로그인 오류예요 (${j.error || res.status}).`);
  }
  return j;
}

let tokenCache = null;
async function accessToken() {
  const c = cfg();
  if (!c.refresh) throw fail(400, "아직 유튜브가 연결되지 않았어요.");
  if (tokenCache && tokenCache.exp > Date.now() + 60e3) return tokenCache.token;
  const j = await oauth({ client_id: c.id, client_secret: c.secret, refresh_token: c.refresh, grant_type: "refresh_token" });
  tokenCache = { token: j.access_token, exp: Date.now() + j.expires_in * 1e3 };
  return tokenCache.token;
}

async function yt(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { authorization: `Bearer ${await accessToken()}`, ...(opts.headers || {}) } });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    const reason = j.error?.errors?.[0]?.reason || j.error?.status || res.status;
    throw fail(res.status === 401 ? 401 : 502, ytMessage(reason, j.error?.message));
  }
  return res;
}

function ytMessage(reason, raw) {
  const m = {
    quotaExceeded: "오늘 유튜브 API 사용량을 다 썼어요. 내일 다시 눌러 주세요.",
    uploadLimitExceeded: "오늘 올릴 수 있는 영상 수를 넘었어요. 내일 다시 눌러 주세요.",
    forbidden: "이 작업을 할 권한이 없어요. 채널 전화번호 인증을 확인해 주세요.",
    invalidPublishAt: "공개 시각이 이미 지났어요. 시각을 바꿔 주세요.",
  };
  return m[reason] || `유튜브 오류예요 (${reason}${raw ? `: ${raw}` : ""}).`;
}

// 채널에 이미 올라간 영상 (제목으로 대기열과 맞춰요)
async function uploads() {
  const ch = await (await yt("https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true")).json();
  const c = ch.items?.[0];
  if (!c) throw fail(400, "연결한 계정에 유튜브 채널이 없어요.");
  const list = await (
    await yt(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=${c.contentDetails.relatedPlaylists.uploads}`)
  ).json();
  const ids = (list.items || []).map((x) => x.contentDetails.videoId).join(",");
  const vids = ids ? await (await yt(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${ids}`)).json() : { items: [] };
  return {
    channel: c.snippet.title,
    videos: (vids.items || []).map((v) => ({
      id: v.id,
      title: v.snippet.title,
      privacy: v.status.privacyStatus,
      publishAt: v.status.publishAt || null,
      upload: v.status.uploadStatus,
    })),
  };
}

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();

async function status() {
  const c = cfg();
  const q = queue();
  const base = { ready: Boolean(c.id && c.secret), connected: Boolean(c.id && c.secret && c.refresh), items: q.items };
  if (!base.connected) return base;
  const u = await uploads();
  const byTitle = new Map(u.videos.map((v) => [norm(v.title), v]));
  return { ...base, channel: u.channel, items: q.items.map((it) => ({ ...it, done: byTitle.get(norm(it.title)) || null })) };
}

function authUrl(headers) {
  const c = cfg();
  if (!c.id || !c.secret) throw fail(400, "Vercel에 YT_CLIENT_ID와 YT_CLIENT_SECRET을 먼저 넣어 주세요.");
  const p = new URLSearchParams({
    client_id: c.id,
    redirect_uri: redirectUri(headers),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${p}` };
}

// 구글이 돌려준 일회용 코드 → 오래 쓰는 연결 키(refresh token). 화면에만 보여 주고 저장하지 않아요
async function exchange(headers) {
  const c = cfg();
  const code = headers["x-yt-code"];
  if (!code) throw fail(400, "구글 코드가 없어요.");
  const j = await oauth({ code, client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri(headers), grant_type: "authorization_code" });
  if (!j.refresh_token) throw fail(400, "연결 키가 오지 않았어요. 구글 계정 > 보안 > 서드파티 액세스에서 앱을 지우고 다시 연결해 주세요.");
  return { refreshToken: j.refresh_token };
}

// 쇼츠 설명의 '본편 링크' 자리를 실제 주소로 바꿔요
async function describe(it, headers) {
  if (it.kind !== "short" || !PLACEHOLDER.test(it.description)) return it.description;
  let url = headers["x-yt-parent"] || "";
  if (!url) {
    const parent = queue().items.find((x) => x.kind === "long" && x.ep === it.parent);
    if (parent) {
      const v = (await uploads()).videos.find((x) => norm(x.title) === norm(parent.title));
      if (v) url = `https://youtu.be/${v.id}`;
    }
  }
  if (!/^https:\/\/(youtu\.be|(www\.|m\.)?youtube\.com)\//.test(url)) throw fail(409, "본편 주소가 필요해요. 본편을 먼저 올리거나 본편 주소를 넣어 주세요.");
  return it.description.replace(PLACEHOLDER, url);
}

function publishTime(it, headers) {
  const iso = headers["x-yt-publish"] || it.publishAt;
  const t = new Date(iso);
  if (isNaN(t)) throw fail(400, "공개 시각을 읽지 못했어요.");
  if (t.getTime() < Date.now() + 10 * 60e3) throw fail(400, "공개 시각은 지금부터 10분 뒤 이후여야 해요.");
  return t.toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

// 1단계: 업로드 자리 만들기 (제목·설명·태그·예약 시각을 먼저 보내요)
async function start(id, headers) {
  const it = item(id);
  if (it.draft || !it.video) throw fail(409, "아직 만들고 있는 영상이에요. 완성되면 올릴 수 있어요.");
  const body = {
    snippet: {
      title: it.title,
      description: await describe(it, headers),
      tags: it.tags,
      categoryId: "27", // 교육
      defaultLanguage: "ko",
      defaultAudioLanguage: "ko",
    },
    status: { privacyStatus: "private", publishAt: publishTime(it, headers), selfDeclaredMadeForKids: false, embeddable: true },
  };
  const res = await yt("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=true", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", "x-upload-content-length": String(it.size), "x-upload-content-type": "video/mp4" },
    body: JSON.stringify(body),
  });
  const session = res.headers.get("location");
  if (!session) throw fail(502, "유튜브 업로드 자리를 만들지 못했어요.");
  return { session, size: it.size, offset: 0 };
}

// 2단계: 영상을 8MB씩 넘겨요. 화면이 끝날 때까지 반복해서 불러요
async function chunk(id, headers) {
  const it = item(id);
  const session = headers["x-yt-session"] || "";
  if (!/^https:\/\/(www\.)?googleapis\.com\/upload\/youtube\/v3\/videos\?/.test(session)) throw fail(400, "업로드 세션 주소가 이상해요.");
  const offset = Number(headers["x-yt-offset"] || 0);
  const end = Math.min(offset + CHUNK, it.size) - 1;
  const src = await fetch(media(it.video), { headers: { range: `bytes=${offset}-${end}` } });
  if (src.status !== 206 && !(src.status === 200 && offset === 0 && end === it.size - 1))
    throw fail(502, `영상 파일을 가져오지 못했어요 (${src.status}).`);
  const buf = Buffer.from(await src.arrayBuffer());
  const res = await fetch(session, {
    method: "PUT",
    headers: { authorization: `Bearer ${await accessToken()}`, "content-length": String(buf.length), "content-range": `bytes ${offset}-${offset + buf.length - 1}/${it.size}` },
    body: buf,
  });
  if (res.status === 308) {
    const r = res.headers.get("range");
    return { offset: r ? Number(r.split("-")[1]) + 1 : 0, size: it.size };
  }
  if (res.ok) {
    const v = await res.json();
    return { offset: it.size, size: it.size, videoId: v.id };
  }
  const j = await res.json().catch(() => ({}));
  throw fail(502, ytMessage(j.error?.errors?.[0]?.reason || res.status, j.error?.message));
}

// 3단계: 썸네일·자막 붙이기 (실패해도 영상은 이미 올라가 있어요)
async function finish(id, headers) {
  const it = item(id);
  const videoId = headers["x-yt-video"] || "";
  if (!/^[\w-]{6,20}$/.test(videoId)) throw fail(400, "영상 ID가 이상해요.");
  const notes = [];
  if (it.thumb) {
    try {
      const img = Buffer.from(await (await fetch(media(it.thumb))).arrayBuffer());
      await yt(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`, {
        method: "POST",
        headers: { "content-type": "image/png", "content-length": String(img.length) },
        body: img,
      });
      notes.push(it.kind === "short" ? "커버 이미지를 보냈어요 (쇼츠는 유튜브 앱에서 커버가 다르게 보일 수 있어요)" : "썸네일을 넣었어요");
    } catch (e) {
      notes.push(`썸네일은 못 넣었어요: ${e.message}`);
    }
  }
  if (it.srt) {
    try {
      const srt = Buffer.from(await (await fetch(media(it.srt))).arrayBuffer());
      const b = "bdchef" + Date.now();
      const meta = JSON.stringify({ snippet: { videoId, language: "ko", name: "한국어", isDraft: false } });
      const body = Buffer.concat([
        Buffer.from(`--${b}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\ncontent-type: application/octet-stream\r\n\r\n`),
        srt,
        Buffer.from(`\r\n--${b}--\r\n`),
      ]);
      await yt("https://www.googleapis.com/upload/youtube/v3/captions?part=snippet&uploadType=multipart", {
        method: "POST",
        headers: { "content-type": `multipart/related; boundary=${b}`, "content-length": String(body.length) },
        body,
      });
      notes.push("한국어 자막을 넣었어요");
    } catch (e) {
      notes.push(`자막은 못 넣었어요: ${e.message}`);
    }
  }
  return { videoId, url: `https://youtu.be/${videoId}`, notes };
}

// 이미 예약한 영상의 공개 시각 옮기기 (아직 비공개 예약 상태일 때만)
async function reschedule(id, headers) {
  const videoId = headers["x-yt-video"] || "";
  if (!/^[\w-]{6,20}$/.test(videoId)) throw fail(400, "영상 ID가 이상해요.");
  const at = publishTime({ publishAt: "" }, headers);
  const cur = await (await yt(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${videoId}`)).json();
  const st = cur.items?.[0]?.status;
  if (!st) throw fail(404, "채널에서 이 영상을 찾지 못했어요.");
  if (st.privacyStatus !== "private" || !st.publishAt) throw fail(409, "이미 공개된 영상은 시각을 옮길 수 없어요.");
  await yt("https://www.googleapis.com/youtube/v3/videos?part=status", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: videoId,
      status: {
        privacyStatus: "private",
        publishAt: at,
        embeddable: st.embeddable,
        license: st.license,
        publicStatsViewable: st.publicStatsViewable,
        selfDeclaredMadeForKids: st.madeForKids ?? false,
      },
    }),
  });
  return { videoId, publishAt: at };
}

// path 예: "yt/status", "yt/auth", "yt/token", "yt/start/52", "yt/chunk/52", "yt/finish/52-1"
async function handleYt(path, headers) {
  if (path === "yt/status") return status();
  if (path === "yt/auth") return authUrl(headers);
  if (path === "yt/token") return exchange(headers);
  const m = path.match(/^yt\/(start|chunk|finish|reschedule)\/([\w-]{1,20})$/);
  if (!m) return null;
  if (!cfg().refresh) throw fail(400, "아직 유튜브가 연결되지 않았어요.");
  return { start, chunk, finish, reschedule }[m[1]](m[2], headers);
}

module.exports = { handleYt };
