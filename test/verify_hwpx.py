"""생성된 HWPX를 독립 라이브러리(python-hwpx)로 검증한다."""
import sys, zipfile, re, io
from lxml import etree
from hwpx.document import HwpxDocument
from hwpx.hwp5.writer import write_hwp5
from hwpx.hwp5.package import convert

def texts(xml):
    return [t for t in re.findall(r'<hp:t>([^<]*)', xml) if t.strip()]

def verify(path, expect=()):
    z = zipfile.ZipFile(path)
    names = z.namelist()
    assert names[0] == 'mimetype', 'mimetype must be first'
    assert z.getinfo('mimetype').compress_type == zipfile.ZIP_STORED
    assert z.read('mimetype') == b'application/hwp+zip'
    for n in names:
        if n.endswith(('.xml', '.hpf', '.rdf')):
            etree.fromstring(z.read(n))  # well-formed
    sec = z.read('Contents/section0.xml').decode()
    hdr = z.read('Contents/header.xml').decode()
    # 참조 무결성: 모든 charPrIDRef/paraPrIDRef/borderFillIDRef가 header에 존재
    cids = set(re.findall(r'<hh:charPr id="(\d+)"', hdr)); pids = set(re.findall(r'<hh:paraPr id="(\d+)"', hdr))
    bids = set(re.findall(r'<hh:borderFill id="(\d+)"', hdr))
    miss_c = set(re.findall(r'charPrIDRef="(\d+)"', sec)) - cids
    miss_p = set(re.findall(r'paraPrIDRef="(\d+)"', sec)) - pids
    miss_b = set(re.findall(r'borderFillIDRef="(\d+)"', sec + hdr)) - bids
    assert not (miss_c or miss_p or miss_b), (miss_c, miss_p, miss_b)
    for tag in ['charProperties', 'paraProperties', 'borderFills']:
        cnt = int(re.search(rf'<hh:{tag} itemCnt="(\d+)"', hdr).group(1))
        real = len(re.findall({'charProperties': r'<hh:charPr ', 'paraProperties': r'<hh:paraPr ', 'borderFills': r'<hh:borderFill '}[tag], hdr))
        assert cnt == real, (tag, cnt, real)
    for m in re.finditer(r'<hh:fontface lang="(\w+)" fontCnt="(\d+)">(.*?)</hh:fontface>', hdr, re.S):
        assert int(m.group(2)) == len(re.findall('<hh:font ', m.group(3))), m.group(1)
    # 그림 manifest
    hpf = z.read('Contents/content.hpf').decode()
    for bid in re.findall(r'binaryItemIDRef="([^"]+)"', sec):
        href = re.search(rf'id="{bid}" href="([^"]+)"', hpf).group(1)
        assert href in names, href
    # 표 구조: 각 표의 셀 격자가 빈틈·겹침 없이 채워짐
    root = etree.fromstring(z.read('Contents/section0.xml'))
    ns = {'hp': 'http://www.hancom.co.kr/hwpml/2011/paragraph'}
    for tbl in root.iter('{%s}tbl' % ns['hp']):
        R, C = int(tbl.get('rowCnt')), int(tbl.get('colCnt'))
        occ = [[0] * C for _ in range(R)]
        for tc in tbl.iterfind('hp:tr/hp:tc', ns):
            a = tc.find('hp:cellAddr', ns); s = tc.find('hp:cellSpan', ns)
            c0, r0, cs, rs = int(a.get('colAddr')), int(a.get('rowAddr')), int(s.get('colSpan')), int(s.get('rowSpan'))
            for y in range(r0, r0 + rs):
                for x in range(c0, c0 + cs):
                    occ[y][x] += 1
        assert all(v == 1 for row in occ for v in row), f'table grid broken {R}x{C}: {occ}'
    # 라이브러리로 열기 + 자체 검증
    doc = HwpxDocument.open(path)
    rep = doc.validate() if hasattr(doc, 'validate') else None
    lib_text = doc.export_text() if hasattr(doc, 'export_text') else ''
    # HWP 바이너리로 변환 후 다시 읽기
    files = {n: z.read(n) for n in names}
    hwp = write_hwp5(files)
    back = convert(hwp)
    t1 = texts(sec); t2 = texts(back.files['Contents/section0.xml'].decode())
    for e in expect:
        assert any(e in t for t in t1), f'missing text: {e}'
    return {'paras': sec.count('<hp:p '), 'tables': sec.count('<hp:tbl '), 'pics': sec.count('<hp:pic '),
            'texts': len(t1), 'hwp_bytes': len(hwp), 'hwp_roundtrip_same_text': t1 == t2, 'validate': str(rep)[:160]}

if __name__ == '__main__':
    for p in sys.argv[1:]:
        print(p.split('/')[-1], verify(p))
