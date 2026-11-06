// 주가·시계열 계산 도구
const last = (a) => a[a.length - 1];
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const sma = (values, n) => (values.length >= n ? avg(values.slice(-n)) : null);

// Wilder 방식 RSI(14)
function rsi(values, n = 14) {
  if (values.length <= n) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= n; loss /= n;
  for (let i = n + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

// 슬로우 스토캐스틱(14, 3, 3)과 윌리엄스 %R(14)
// %R은 래리 윌리엄스가 1966년에 만든 지표로, 패스트 스토캐스틱을 0~-100으로 뒤집은 것과 같습니다.
function oscillators(history, n = 14, smoothK = 3, smoothD = 3) {
  const hasHL = history.every((p) => p.high && p.low);
  const highs = history.map((p) => (hasHL ? p.high : p.close));
  const lows = history.map((p) => (hasHL ? p.low : p.close));
  const closes = history.map((p) => p.close);
  const fastK = [];
  for (let i = n - 1; i < closes.length; i++) {
    const hh = Math.max(...highs.slice(i - n + 1, i + 1));
    const ll = Math.min(...lows.slice(i - n + 1, i + 1));
    fastK.push(hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100);
  }
  if (fastK.length < smoothK + smoothD + 1) return null;
  const smooth = (arr, k) => arr.slice(k - 1).map((_, i) => avg(arr.slice(i, i + k)));
  const slowK = smooth(fastK, smoothK);
  const slowD = smooth(slowK, smoothD);
  const k = last(slowK), d = last(slowD);
  const prevK = slowK[slowK.length - 2], prevD = slowD[slowD.length - 2];
  return {
    k, d, prevK, prevD,
    williamsR: last(fastK) - 100,
    crossUp: prevK <= prevD && k > d,
    crossDown: prevK >= prevD && k < d,
    approximated: !hasHL,
  };
}

// 최근 1년(약 252거래일) 범위의 통계
function priceStats(history) {
  const closes = history.map((p) => p.close);
  const year = closes.slice(-252);
  const price = last(closes);
  const high = Math.max(...year);
  const low = Math.min(...year);
  const ma200 = sma(closes, 200);
  const ma50 = sma(closes, 50);
  return {
    price, high52: high, low52: low,
    fromHigh: ((price - high) / high) * 100,
    fromLow: ((price - low) / low) * 100,
    return12m: ((price - year[0]) / year[0]) * 100,
    ma50, ma200,
    vsMa200: ma200 ? ((price - ma200) / ma200) * 100 : null,
    rsi14: rsi(closes),
    osc: oscillators(history),
  };
}

// 시계열 값 배열의 최근 n일 전 값
function valueDaysAgo(series, days) {
  const target = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  for (let i = series.length - 1; i >= 0; i--) if (series[i].date <= target) return series[i].value;
  return series[0]?.value ?? null;
}

module.exports = { last, avg, sma, rsi, oscillators, priceStats, valueDaysAgo };
