"""쪽마다 나뉜 화면 검사"""
from harness import *
e = Editor(1400, 1000); pg = e.page
J = lambda js, *a: pg.evaluate(js, *a)
paras = ''.join(f'<p>{i+1}번째 문단입니다. 한글 문서처럼 쪽이 나뉘는지 확인하는 긴 글입니다. 가나다라마바사아자차카타파하 가나다라마바사.</p>' for i in range(38))
rows = ''.join(f'<tr><td><p>{i+1}</p></td><td><p>항목 {i+1}</p></td><td><p>{(i+1)*1000:,}원</p></td></tr>' for i in range(30))
tbl = f'<table class="hwp-table" style="width:600px"><colgroup><col style="width:80px"><col style="width:320px"><col style="width:200px"></colgroup>{rows}</table>'
J("h=>HwpEditor.setContent(h)", paras + tbl + '<p>표 다음 문단</p><div class="pagebreak" contenteditable="false"></div><p>강제로 넘긴 쪽</p>')
pg.wait_for_timeout(400)
info = J("""(()=>{const ed=document.getElementById('page');const pgi=ed._pg;const D=pgi.D;
 const out={pages:pgi.pages, sheets:document.querySelectorAll('#sheets .sheetpg').length, status:document.getElementById('stPages').textContent};
 // 쪽 경계(간격)에 걸친 글줄이 있는지: 모든 문단·표 줄의 위아래가 한 쪽 본문 영역 안에 있어야 함
 const er=ed.getBoundingClientRect(); const bad=[];
 const inBody=(t,b)=>{const k=Math.floor(t/D.pitch);return t>=k*D.pitch+D.top-1 && b<=k*D.pitch+D.top+D.contentH+1;};
 Array.from(ed.children).forEach((k,i)=>{ if(k.classList.contains('pagebreak'))return; if(k.tagName==='TABLE'){Array.from(k.rows).forEach((tr,j)=>{const c=tr.cells[1];const r=c.querySelector('p').getBoundingClientRect();if(!inBody(r.top-er.top,r.bottom-er.top))bad.push('row'+j);});return;}
   const rr=k.getClientRects(); const range=document.createRange(); range.selectNodeContents(k); Array.from(range.getClientRects()).forEach(r=>{if(r.height&&!inBody(r.top-er.top,r.bottom-er.top))bad.push('p'+i);}); });
 out.bad=[...new Set(bad)];
 const last=ed.lastElementChild.getBoundingClientRect(); out.forcedPage=Math.floor((last.top-er.top)/D.pitch)+1;
 out.rules=pgi.css.split('\\n').length; out.holes=pgi.holes.length; return out;})()""")
print(info)
pg.select_option('#zoomSel', '0.5'); pg.wait_for_timeout(300)
pg.evaluate("document.getElementById('workspace').scrollTop = 0")
pg.screenshot(path=str(S/'p_pages1.png'))
y = J("(()=>{const ed=document.getElementById('page');const t=ed.querySelector('table');return t.getBoundingClientRect().top})()")
J(f"document.getElementById('workspace').scrollTop += {y} - 300")
pg.wait_for_timeout(200); pg.screenshot(path=str(S/'p_pages2.png'))
# 글 넣으면 다시 나뉘는지
pg.select_option('#zoomSel', '1')
J("(()=>{const p=document.querySelector('#page > p');const r=document.createRange();r.selectNodeContents(p);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);document.getElementById('page').focus();})()")
for _ in range(6): pg.keyboard.press('Enter')
pg.wait_for_timeout(500)
print('after typing pages:', J("document.getElementById('page')._pg.pages"))
# 내보내기: PDF 쪽 수 = 화면 쪽 수
e.save('pdf', S/'p_doc.pdf'); e.save('hwpx', S/'p_doc.hwpx')
print('errors:', [x for x in e.errors if 'Failed to load' not in x])
e.close()
