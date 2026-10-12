# HWP 편집실

한글(HWP·HWPX) 문서를 브라우저에서 열고, 고치고, 저장하는 웹 편집기입니다. 설치 없이 `index.html` 파일 하나로 동작합니다.

**바로 쓰기:** GitHub Pages를 켜면 `https://pina-web.github.io/hangul/` 에서 열립니다. 또는 `index.html`을 내려받아 크롬·엣지로 열어도 됩니다.

## 할 수 있는 것

| 구분 | 내용 |
| --- | --- |
| 열기 | `.hwp` `.hwpx` `.docx` `.html` `.txt` `.md` (끌어다 놓기 가능) |
| 편집 | 글꼴·크기·진하게·기울임·밑줄·취소선·위/아래 첨자·글자색·형광펜, 정렬·줄 간격·들여쓰기, 글머리표·번호 |
| 표 | 줄·칸 추가/삭제, 셀 합치기·나누기, 셀 배경색, 테두리 켜기/끄기, Tab으로 다음 칸 |
| 그 밖에 | 그림 넣기·크기 조절, 쪽 나누기(Ctrl+Enter), 문자표, 찾기·바꾸기(Ctrl+F / Ctrl+H), 편집 용지(크기·방향·여백) |
| 저장 | **HWPX**(기본, Ctrl+S) · **HWP** |
| 내보내기 | Word(.docx) · PDF · 웹페이지(.html) · 마크다운(.md) · 텍스트(.txt) · 쪽별 그림(.png) · 인쇄 |
| 안전장치 | 고친 내용을 브라우저에 자동 보관, 저장 안 하고 닫으려 하면 경고 |

## 저장 방식

- **HWPX**는 브라우저 안에서 바로 만듭니다. 한컴 규격(OWPML)을 따르는 검증된 빈 문서 틀(`vendor/Skeleton.hwpx`)에 글자모양·문단모양·표·그림을 채워 넣는 방식이라 한글 2014 이상에서 그대로 열립니다.
- **HWP**(예전 바이너리 형식)는 처음 저장할 때 변환 엔진(Pyodide + python-hwpx, 약 15MB)을 인터넷에서 한 번 내려받아 HWPX를 HWP로 바꿉니다. 엔진을 쓸 수 없으면 HWPX로 저장한 뒤 한글에서 HWP로 다시 저장하세요.
- HWP 파일을 열 때는 브라우저 안의 빠른 변환기로 바로 엽니다. 표나 그림이 어긋나면 상태줄의 **정밀 변환으로 다시 열기**를 누르면 같은 변환 엔진으로 다시 읽습니다.

## 아직 지원하지 않는 것

머리말·꼬리말, 각주·미주, 쪽 번호, 도형·글맵시, 차트, 다단, 변경 내용 추적은 편집·저장되지 않습니다(글상자 안의 글은 살립니다). 이런 요소가 많은 원본은 덮어쓰지 말고 다른 이름으로 저장하세요.

PDF 내보내기는 쪽을 그림으로 담기 때문에 글자 선택이 되지 않습니다. 글자가 선택되는 PDF가 필요하면 **인쇄 → PDF로 저장**을 쓰세요.

## 폴더 구성

```
index.html          빌드된 편집기 (이 파일만 있으면 동작)
build.py            src/ 를 합쳐 index.html 을 만드는 스크립트
src/
  index.html        화면 구성과 스타일
  app.js            편집기 동작 (도구 막대, 표·그림, 찾기, 저장)
  model.js          편집 화면 → 문서 모델(문단·글자·표) 추출
  hwp-read.js       HWP 5.0 바이너리 읽기
  hwpx-read.js      HWPX 읽기
  hwpx-write.js     HWPX 쓰기
  export.js         DOCX·PDF·PNG·HTML·MD·TXT 내보내기
  engine.js         라이브러리 지연 로딩, HWP 변환 엔진
  sample.js         처음 화면의 예시 문서
vendor/Skeleton.hwpx      python-hwpx의 빈 HWPX 문서 틀
test/                     자동 검사 (Playwright + python-hwpx)
third_party/python-hwpx/  python-hwpx 라이선스·고지
```

## 고치고 다시 만들기

`src/` 안의 파일을 고친 뒤 아래 명령으로 `index.html`을 다시 만듭니다.

```bash
python3 build.py
```

## 검사

`test/verify_hwpx.py`는 저장된 HWPX를 독립 라이브러리로 확인합니다: 한컴 규격 검사, 모든 서식 참조 연결, 표 격자에 빈칸·겹침이 없는지, 그림 목록, HWP로 바꿨다 되돌렸을 때 내용이 같은지.

```bash
pip install python-hwpx playwright lxml
python3 test/verify_hwpx.py 저장한파일.hwpx
```

`test/harness.py`는 편집기를 헤드리스 크롬으로 열어 파일 열기·편집·저장을 자동으로 해 보는 도구입니다. 환경변수 `HWP_TEST_DIR`(샘플 폴더)와 `HWP_NODE_MODULES`(jszip·pako·cfb·html2canvas·jspdf·mammoth를 설치한 `node_modules`)를 지정해서 씁니다.

## 사용한 오픈소스

- [python-hwpx](https://pypi.org/project/python-hwpx/) — Apache-2.0. HWP↔HWPX 변환 엔진과 빈 문서 틀. 고지문은 `third_party/python-hwpx/`에 있습니다.
- [Pyodide](https://pyodide.org) — MPL-2.0. 브라우저에서 파이썬 실행.
- [JSZip](https://stuk.github.io/jszip/), [pako](https://github.com/nodeca/pako), [cfb](https://github.com/SheetJS/js-cfb), [mammoth](https://github.com/mwilliamson/mammoth.js), [html2canvas](https://html2canvas.hertzen.com), [jsPDF](https://github.com/parallax/jsPDF) — CDN에서 불러옵니다.

"한글", "HWP"는 한글과컴퓨터의 상표이며, 이 프로젝트는 한글과컴퓨터와 관계가 없습니다.
