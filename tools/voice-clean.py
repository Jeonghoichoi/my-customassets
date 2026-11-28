# 목소리 A 후처리 (노아 님이 고른 설정): 긴 쉼 줄이기 → 잡음 제거 → 저역·고역 정리 → 압축 → 음량 -15 LUFS
# 사용: python3 tools/voice-clean.py 입력.wav 출력.wav [timings.json 출력_timings.json]
# 필요: pip install --break-system-packages noisereduce soundfile numpy  (없으면 잡음 제거만 건너뛰어요)
import sys, json, subprocess, numpy as np, soundfile as sf
src, out = sys.argv[1], sys.argv[2]
x, sr = sf.read(src)
x = x.mean(1) if x.ndim > 1 else x
# 1) 0.5초 넘는 쉼은 0.4초로 (30ms 크로스페이드), 줄인 만큼 timings도 당겨요
fr = int(0.02 * sr); n = len(x) // fr
e = 20 * np.log10(np.sqrt((x[: n * fr].reshape(n, fr) ** 2).mean(1)) + 1e-9)
quiet = e < (np.percentile(e, 95) - 38)
cuts, i = [], 0
while i < n:
    if quiet[i]:
        j = i
        while j < n and quiet[j]: j += 1
        if (j - i) * 0.02 > 0.5: cuts.append((i * fr + int(0.2 * sr), j * fr - int(0.2 * sr)))
        i = j
    else: i += 1
y, last, xf = [], 0, int(0.03 * sr)
for a, b in cuts:
    if b - a <= 2 * xf: continue
    y.append(x[last:a]); last = b
y.append(x[last:]); y = np.concatenate(y) if y else x
def remap(t):
    s = t * sr; d = sum(min(b, s) - a for a, b in cuts if s > a and b - a > 2 * xf); return round((s - d) / sr, 3)
if len(sys.argv) > 4:
    T = json.load(open(sys.argv[3]))
    for sc in T.get("scenes", []):
        for ln in sc.get("lines", []):
            for k in ("st", "en"):
                if k in ln: ln[k] = remap(ln[k])
    json.dump(T, open(sys.argv[4], "w"), ensure_ascii=False)
# 2) 잡음 제거
try:
    import noisereduce as nr
    y = nr.reduce_noise(y=y, sr=sr, stationary=True, prop_decrease=1.0)
    y = nr.reduce_noise(y=y, sr=sr, stationary=False, prop_decrease=0.5)
except Exception as ex:
    print("noisereduce 건너뜀:", ex)
tmp = out + ".tmp.wav"; sf.write(tmp, y, sr)
# 3) 음색 정리 + 음량
af = "highpass=f=75,lowpass=f=10500,deesser=i=0.3,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120,agate=range=0.06:threshold=0.01,loudnorm=I=-15:TP=-1.5"
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-af", af, "-ar", "48000", out], check=True)
subprocess.run(["rm", "-f", tmp])
print("완료:", out)
