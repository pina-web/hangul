from harness import *
e = Editor(1440, 1000); pg = e.page
errs = lambda: [x for x in e.errors if 'Failed to load' not in x]
pg.click('#btnNew'); pg.wait_for_timeout(200); pg.click('.modal .choice button:has-text("빈 한글 문서")'); pg.wait_for_timeout(300)
pg.click('#page'); pg.keyboard.type('공방 수업 안내문')
pg.keyboard.press('Enter'); pg.keyboard.type('이번 달 가죽공예 원데이 클래스를 안내합니다. 수업은 매주 토요일 오후 2시에 열리며 재료는 모두 준비되어 있습니다. 처음 오시는 분도 쉽게 따라 할 수 있도록 천천히 진행합니다.')
pg.keyboard.press('Enter'); pg.keyboard.type('두 번째 문단입니다. 그림을 어울림으로 두면 글이 그림 옆으로 흐릅니다. 글자처럼 취급하면 글자 하나처럼 줄 안에 들어갑니다.')
# 그림 넣기 → 배치 바꾸기
pg.click('#page p:nth-of-type(2)'); pg.keyboard.press('Home')
pg.set_input_files('#imgInput', str(S/'photo.jpg')); pg.wait_for_timeout(500)
pg.click('#page img'); pg.wait_for_timeout(100)
pg.fill('#imgW', '200'); pg.press('#imgW', 'Enter'); pg.wait_for_timeout(100)
seq = {}
for v in ['square-left','block-center','front']:
    pg.select_option('#objWrap', v); pg.wait_for_timeout(150)
    seq[v] = pg.evaluate("(()=>{const o=HwpEditor.state.selObj;return o?(o.tagName+':'+(o.dataset.wrap||'inline')+':'+(o.dataset.align||o.style.float||'')):null})()")
print('wrap seq:', seq)
# 글 앞 그림 끌어 옮기기
b = pg.locator('#page .fobj').bounding_box()
pg.mouse.move(b['x']+50, b['y']+40); pg.mouse.down(); pg.mouse.move(b['x']+250, b['y']+140, steps=6); pg.mouse.up()
print('moved fobj style:', pg.evaluate("document.querySelector('#page .fobj').style.cssText"))
# 글상자
pg.click('#page p:nth-of-type(1)'); pg.click('#btnObj'); pg.click('.pop .menu-item:has-text("둥근 글상자")'); pg.wait_for_timeout(200)
pg.keyboard.type('신청은 카카오톡으로!')
pg.click('#imageBar [data-i="boxFill"]'); pg.click('.pop .swatches button >> nth=4')
print('tbox:', pg.evaluate("(()=>{const t=document.querySelector('#page .tbox');return t.innerText+' | '+t.style.cssText})()"))
# 머리말·쪽 번호
pg.click('#btnHF'); pg.fill('#hfH', '맘스아지트 공방'); pg.select_option('#hfHa', 'right'); pg.fill('#hfF', '문의 010-0000-0000'); pg.select_option('#hfP', 'bottom-center'); pg.select_option('#hfPf', 'dash'); pg.click('.modal .btn.primary')
# 각주
caret = lambda i, end=True: pg.evaluate(f"""(()=>{{const p=document.querySelectorAll('#page > p, #page > div:not(.pagebreak)')[{i}];const r=document.createRange();r.selectNodeContents(p);r.collapse({'false' if end else 'true'});const s=getSelection();s.removeAllRanges();s.addRange(r);document.getElementById('page').focus();}})()""")
caret(1)
pg.click('#btnFootnote'); pg.fill('#fnText', '재료비는 수강료에 포함됩니다.'); pg.click('.modal .btn.primary'); pg.wait_for_timeout(100)
# 링크: 단어 선택 후
pg.evaluate("""(()=>{const p=document.querySelectorAll('#page > p, #page > div:not(.pagebreak)')[2];const t=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let n;while(n=t.nextNode()){const i=n.nodeValue.indexOf('두 번째');if(i>=0){const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+4);const s=getSelection();s.removeAllRanges();s.addRange(r);break;}}})()""")
pg.click('#btnLink'); pg.fill('#lkUrl', 'momsagit.com'); pg.click('.modal .btn.primary'); pg.wait_for_timeout(100)
print('link:', pg.evaluate("(document.querySelector('#page a')||{}).outerHTML"))
# 글자 모양: 제목 줄 고르고 자간·그림자
pg.evaluate("(()=>{const p=document.querySelector('#page > p, #page > div:not(.pagebreak)');const r=document.createRange();r.selectNodeContents(p);const s=getSelection();s.removeAllRanges();s.addRange(r);})()")
pg.keyboard.press('Alt+l'); pg.fill('#csSize', '18'); pg.fill('#csLs', '10'); pg.check('#csB'); pg.check('#csSh'); pg.click('.modal .btn.primary')
print('char shape:', pg.evaluate("(document.querySelector('#page span[style*=letter-spacing]')||{}).outerHTML"))
# 문단 모양: 둘째 문단 내어쓰기 10mm
caret(1); pg.keyboard.press('Alt+t'); pg.select_option('#psFirst', 'hang'); pg.fill('#psFv', '10'); pg.fill('#psL', '5'); pg.click('.modal .btn.primary')
print('para shape:', pg.evaluate("document.querySelectorAll('#page > p, #page > div:not(.pagebreak)')[1].style.cssText"))
# 모양 복사: 제목 모양을 셋째 문단 일부에 칠하기
caret(0, False); pg.keyboard.press('ArrowRight'); pg.keyboard.press('Alt+c')
pg.evaluate("""(()=>{const p=document.querySelectorAll('#page > p, #page > div:not(.pagebreak)')[2];const t=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let n=t.nextNode();while(n&&!n.nodeValue.includes('그림을')) n=t.nextNode();const i=n.nodeValue.indexOf('그림을');const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+3);const s=getSelection();s.removeAllRanges();s.addRange(r);})()""")
pg.dispatch_event('#page', 'mouseup'); pg.wait_for_timeout(200)
print('painted:', pg.evaluate("[...document.querySelectorAll('#page > p, #page > div:not(.pagebreak)')[2].querySelectorAll('span[style]')].map(s=>s.textContent+'|'+s.style.fontSize).join(' / ')"))
# 표 + 칸 너비 끌기
pg.evaluate("(()=>{const ps=document.querySelectorAll('#page > p, #page > div:not(.pagebreak)');const p=ps[ps.length-1];const r=document.createRange();r.selectNodeContents(p);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);document.getElementById('page').focus();})()"); pg.keyboard.press('Enter')
pg.click('#btnTable'); pg.click('.tgrid i[data-r="1"][data-c="2"]'); pg.keyboard.type('품목')
td = pg.locator('#page table td').first.bounding_box()
pg.mouse.move(td['x']+td['width']-1, td['y']+td['height']/2); pg.wait_for_timeout(100)
g = pg.locator('.colgrip'); print('grip visible:', g.is_visible())
if g.is_visible():
    gb = g.bounding_box(); pg.mouse.move(gb['x']+3, gb['y']+5); pg.mouse.down(); pg.mouse.move(gb['x']+90, gb['y']+5, steps=5); pg.mouse.up()
print('cols:', pg.evaluate("[...document.querySelectorAll('#page table col')].map(c=>c.style.width).join(',')"))
pg.screenshot(path=str(S/'v2_doc_edit.png'))
out = S/'out3'; out.mkdir(exist_ok=True)
for k,ext in [('hwpx','hwpx'),('docx','docx'),('pdf','pdf'),('md','md'),('html','html'),('pptx','pptx')]:
    try: f = e.save(k, out/f'doc.{ext}'); print('export', k, f.stat().st_size)
    except Exception as ex: print('export FAIL', k, str(ex)[:200])
print('errors:', errs())
e.close()
