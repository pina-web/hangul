"""src/ 조각을 모아 하나의 HTML 파일(index.html)로 만든다.  사용법: python3 build.py"""
import base64, pathlib, re

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
SKELETON = ROOT / "vendor" / "Skeleton.hwpx"  # python-hwpx(Apache-2.0)의 빈 문서 템플릿

CORE = [
    ("JSZip", "jszip@3.10.1/dist/jszip.min.js"),
    ("pako", "pako@2.1.0/dist/pako.min.js"),
    ("CFB", "cfb@1.2.2/dist/cfb.min.js"),
]

def core_scripts():
    out = []
    for glob, path in CORE:
        out.append(f'<script src="https://cdn.jsdelivr.net/npm/{path}"></script>')
        out.append(f'<script>window.{glob}||document.write(\'<script src="https://unpkg.com/{path}"><\\/script>\')</script>')
    return "\n".join(out)

def build():
    tpl = (SRC / "index.html").read_text(encoding="utf-8")
    head, body = tpl.split('<div class="app"', 1)
    body = '<div class="app"' + body
    skel = base64.b64encode(SKELETON.read_bytes()).decode()
    js = [f'const SKELETON_B64 = "{skel}";']
    for name in ["sample.js", "model.js", "engine.js", "hwp-read.js", "hwpx-read.js", "hwpx-write.js", "export.js", "app.js"]:
        js.append(f"/* ---- {name} ---- */\n" + (SRC / name).read_text(encoding="utf-8"))
    html = (
        '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        + head.strip() + "\n</head>\n<body>\n" + body.strip() + "\n"
        + core_scripts() + "\n<script>\n" + "\n".join(js) + "\n</script>\n</body>\n</html>\n"
    )
    out = ROOT / "index.html"
    out.write_text(html, encoding="utf-8")
    print(out, f"{len(html)/1024:.0f} KB")

if __name__ == "__main__":
    build()
