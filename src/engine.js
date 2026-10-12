/* ===== 라이브러리 지연 로더 + HWP 변환 엔진(Pyodide + python-hwpx, Apache-2.0) ===== */
const Loader = (() => {
  const LIBS = {
    html2canvas: ['https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', 'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js'],
    jspdf: ['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js'],
    mammoth: ['https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js', 'https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js'],
  };
  const GLOBAL = { html2canvas: 'html2canvas', jspdf: 'jspdf', mammoth: 'mammoth' };
  const done = {};
  function script(url) {
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = url; s.async = true;
      s.onload = () => res(); s.onerror = () => { s.remove(); rej(new Error('불러오기 실패: ' + url)); };
      document.head.appendChild(s);
    });
  }
  async function need(name) {
    if (window[GLOBAL[name]]) return;
    if (done[name]) return done[name];
    done[name] = (async () => {
      let err;
      for (const u of LIBS[name]) { try { await script(u); if (window[GLOBAL[name]]) return; } catch (e) { err = e; } }
      done[name] = null;
      throw new Error('인터넷 연결을 확인해 주세요. 필요한 구성요소(' + name + ')를 불러오지 못했습니다.');
    })();
    return done[name];
  }
  return { need, script };
})();

const Engine = (() => {
  const BASE = 'https://cdn.jsdelivr.net/pyodide/v0.27.7/full/';
  const GLUE = `
import zipfile
from hwpx.hwp5.writer import write_hwp5
from hwpx.hwp5.package import convert, to_hwpx_bytes

def to_hwp(src, dst):
    z = zipfile.ZipFile(src)
    files = {n: z.read(n) for n in z.namelist()}
    data = write_hwp5(files)
    with open(dst, 'wb') as f:
        f.write(data)

def to_hwpx(src, dst):
    with open(src, 'rb') as f:
        c = convert(f.read())
    with open(dst, 'wb') as f:
        f.write(to_hwpx_bytes(c.files))
`;
  let py = null, loading = null;
  function ready() { return !!py; }
  async function load(status = () => {}) {
    if (py) return py;
    if (loading) return loading;
    loading = (async () => {
      status('HWP 엔진 내려받는 중… (처음 한 번만, 약 15MB)');
      if (!window.loadPyodide) await Loader.script(BASE + 'pyodide.js');
      const p = await window.loadPyodide({ indexURL: BASE });
      status('문서 처리 모듈 준비 중…');
      await p.loadPackage(['micropip', 'lxml']);
      status('HWP 변환기 설치 중…');
      const mp = p.pyimport('micropip');
      await mp.install('python-hwpx==6.8.0');
      await p.runPythonAsync(GLUE);
      py = p; return p;
    })();
    try { return await loading; } catch (e) { loading = null; throw e; }
  }
  async function hwpxToHwp(u8, status) {
    const p = await load(status);
    status && status('HWP 파일로 변환 중…');
    p.FS.writeFile('/tmp/in.hwpx', u8);
    p.runPython('to_hwp("/tmp/in.hwpx", "/tmp/out.hwp")');
    return p.FS.readFile('/tmp/out.hwp');
  }
  async function hwpToHwpx(u8, status) {
    const p = await load(status);
    status && status('HWP 문서 정밀 변환 중…');
    p.FS.writeFile('/tmp/in.hwp', u8);
    p.runPython('to_hwpx("/tmp/in.hwp", "/tmp/out.hwpx")');
    return p.FS.readFile('/tmp/out.hwpx');
  }
  return { load, ready, hwpxToHwp, hwpToHwpx };
})();
