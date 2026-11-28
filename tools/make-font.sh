#!/bin/sh
# Black Han Sans 폰트를 npm 레지스트리에서 받아 tools/fonts/bhs.css(글꼴 내장)로 만들어요. 카드·쇼츠 만들기 전에 한 번 실행
set -e
D=$(cd "$(dirname "$0")" && pwd); T=$(mktemp -d); cd "$T"
npm pack -q @fontsource/black-han-sans >/dev/null && mkdir x && tar xzf fontsource-black-han-sans-*.tgz -C x
mkdir -p "$D/fonts"
python3 - "$T/x/package" "$D/fonts/bhs.css" <<'PY'
import re,base64,os,sys
d,out=sys.argv[1],sys.argv[2]; css=open(os.path.join(d,'400.css')).read()
css=re.sub(r"url\(\./(files/[^)]+\.woff2)\)",lambda m:'url(data:font/woff2;base64,'+base64.b64encode(open(os.path.join(d,m.group(1)),'rb').read()).decode()+')',css)
css=re.sub(r",\s*url\(\./files/[^)]+\.woff\)\s*format\('woff'\)","",css); open(out,'w').write(css)
PY
echo "폰트 준비 완료: $D/fonts/bhs.css"
