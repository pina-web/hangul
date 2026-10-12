"""Playwright 하네스: CDN 요청을 로컬 node_modules로 연결해 편집기를 연다."""
import os, pathlib, re
from playwright.sync_api import sync_playwright

S = pathlib.Path(os.environ.get("HWP_TEST_DIR", "/tmp/hwp-test"))  # 샘플·결과 파일 폴더
NM = pathlib.Path(os.environ.get("HWP_NODE_MODULES", S / "libs" / "node_modules"))  # jszip·pako·cfb 등 로컬 사본
DIST = pathlib.Path(__file__).resolve().parent.parent / "index.html"

def route(r):
    url = r.request.url
    m = re.match(r"https://(?:cdn\.jsdelivr\.net/npm|unpkg\.com)/([^@/]+(?:/[^@/]+)?)@[^/]+/(.*)", url)
    if m:
        f = NM / m.group(1) / m.group(2)
        if f.exists():
            return r.fulfill(path=str(f), content_type="application/javascript")
    return r.abort()

class Editor:
    def __init__(self, width=1400, height=1000):
        self.pw = sync_playwright().start()
        self.browser = self.pw.chromium.launch()
        self.ctx = self.browser.new_context(viewport={"width": width, "height": height}, accept_downloads=True)
        self.page = self.ctx.new_page()
        self.errors = []
        self.page.on("console", lambda m: self.errors.append(m.text) if m.type == "error" else None)
        self.page.on("pageerror", lambda e: self.errors.append("PAGEERROR " + str(e)))
        self.page.route("**/*", lambda r: r.continue_() if r.request.url.startswith("file:") else route(r))
        self.page.goto(DIST.as_uri())
        self.page.wait_for_function("window.HwpEditor")

    def open(self, path):
        self.page.set_input_files("#fileInput", str(path))
        self.page.wait_for_function("!document.querySelector('.busy')", timeout=60000)
        self.page.wait_for_timeout(300)

    def save(self, kind, out):
        with self.page.expect_download(timeout=120000) as d:
            self.page.evaluate(f"HwpEditor.exportAs('{kind}')")
        d.value.save_as(str(out))
        return out

    def text(self):
        return self.page.inner_text("#page")

    def close(self):
        self.browser.close(); self.pw.stop()
