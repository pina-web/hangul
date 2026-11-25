"""표 편집·쪽 나눔 화면 검사"""
from harness import *
import json, sys
e = Editor(1400, 1000); pg = e.page
J = lambda js, *a: pg.evaluate(js, *a)
caret_in = lambda r, c: J(f"(()=>{{const t=document.querySelector('#page table');const td=t.rows[{r}].cells[{c}];const p=td.querySelector('p')||td;const g=document.createRange();g.selectNodeContents(p);g.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(g);document.getElementById('page').focus();document.dispatchEvent(new Event('selectionchange'));}})()")
shape = lambda: J("(()=>{const t=document.querySelector('#page table');return Array.from(t.rows).map(tr=>Array.from(tr.cells).map(c=>(c.colSpan>1||c.rowSpan>1)?c.colSpan+'x'+c.rowSpan:'1').join(' ')).join(' | ')})()")
gridok = lambda: J("""(()=>{const t=document.querySelector('#page table');const m=TableKit.read(t);const w=m[0].length;return m.every(r=>r.length===w)&&t.querySelector(':scope>colgroup').children.length===w})()""")
# 새 문서
J("HwpEditor.setContent('<p>표 시험</p><p><br></p>')"); pg.wait_for_timeout(200)
J("(()=>{const p=document.querySelectorAll('#page > p')[1];const r=document.createRange();r.selectNodeContents(p);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);document.getElementById('page').focus();})()")
pg.click('#btnTable'); pg.click('.tgrid i[data-r="3"][data-c="3"]'); pg.wait_for_timeout(200)
print('inserted:', shape(), gridok())
# 글 입력해도 칸 너비 유지
w0 = J("Array.from(document.querySelectorAll('#page table col')).map(c=>c.style.width).join(',')")
caret_in(0, 0); pg.keyboard.type('아주아주긴글자를계속입력해도칸너비가바뀌면안됩니다' * 2)
w1 = J("Array.from(document.querySelectorAll('#page table col')).map(c=>c.style.width).join(',')")
rw = J("Array.from(document.querySelector('#page table').rows[0].cells).map(c=>Math.round(c.getBoundingClientRect().width)).join(',')")
print('widths stable:', w0 == w1, rw)
# 블록 끌어서 고르기 0,0 → 1,1 후 합치기
def cell_center(r, c):
    b = J(f"(()=>{{const r=document.querySelector('#page table').rows[{r}].cells[{c}].getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}})()"); return b
a = cell_center(1, 1); b = cell_center(2, 2)
pg.mouse.move(*a); pg.mouse.down(); pg.mouse.move(b[0]-10, b[1], steps=5); pg.mouse.move(*b, steps=3); pg.mouse.up(); pg.wait_for_timeout(100)
print('block:', J("document.querySelectorAll('#page .cell-blk').length"), J("document.getElementById('tblHint').textContent"))
pg.keyboard.press('m'); pg.wait_for_timeout(150)
print('merged:', shape(), gridok())
# 나누기: 합친 셀 → 3x1
caret_in(1, 1)
pg.click('#tableBar [data-t=split]'); pg.fill('#spR', '1'); pg.fill('#spC', '3'); pg.click('.modal .btn.primary'); pg.wait_for_timeout(150)
print('split 1x3:', shape(), gridok())
# 일반 셀을 2칸으로 나누기(다른 줄 유지)
caret_in(3, 0)
pg.click('#tableBar [data-t=split]'); pg.fill('#spR', '2'); pg.fill('#spC', '2'); pg.click('.modal .btn.primary'); pg.wait_for_timeout(150)
print('split 2x2 in plain cell:', shape(), gridok())
# 줄/칸 추가·삭제
caret_in(0, 1); pg.click('#tableBar [data-t=insMenu]'); pg.click('.menu-item:has-text("오른쪽에 칸 넣기")'); pg.wait_for_timeout(100)
tw = J("document.querySelector('#page table').style.width")
print('col added:', gridok(), 'table width kept:', tw)
caret_in(0, 0); pg.keyboard.press('Control+Enter'); pg.wait_for_timeout(100)
print('row added via Ctrl+Enter:', J("document.querySelector('#page table').rows.length"), gridok())
caret_in(1, 0); pg.click('#tableBar [data-t=delMenu]'); pg.click('.menu-item:has-text("줄 지우기")'); pg.wait_for_timeout(100)
print('row deleted:', J("document.querySelector('#page table').rows.length"), gridok())
# 여러 셀 걸친 글 선택 후 Backspace → 표 구조 유지
J("""(()=>{const t=document.querySelector('#page table');const a=t.rows[0].cells[0],b=t.rows[0].cells[2];const r=document.createRange();r.setStart(a.querySelector('p').firstChild||a,0);r.setEnd(b,b.childNodes.length);const s=getSelection();s.removeAllRanges();s.addRange(r);document.getElementById('page').focus();})()""")
cells_before = J("document.querySelectorAll('#page td').length")
pg.keyboard.press('Backspace'); pg.wait_for_timeout(100)
print('cross-cell delete keeps cells:', cells_before == J("document.querySelectorAll('#page td').length"), gridok())
# 표/셀 속성: 안 여백, 바깥 여백
caret_in(0, 0); pg.click('#tableBar [data-t=props]')
pg.check('input[name=tpScope][value=all]', force=True)
for k, v in {'tpPt': '2', 'tpPb': '2', 'tpPl': '3', 'tpPr': '3', 'tpOt': '5', 'tpOb': '4'}.items(): pg.fill('#' + k, v)
pg.select_option('#tpAl', 'center'); pg.select_option('#tpLwhere', 'outer'); pg.select_option('#tpLw', '0.5'); pg.click('.modal .btn.primary'); pg.wait_for_timeout(150)
print('padding:', J("document.querySelector('#page td').style.padding"), '| margin:', J("document.querySelector('#page table').style.margin"))
print('outer border:', J("document.querySelector('#page td').style.borderTop"))
# 테두리 창: 안쪽 점선
caret_in(0, 0); pg.keyboard.press('F5'); pg.keyboard.press('F5'); pg.wait_for_timeout(50)
print('F5x2 whole table block:', J("document.querySelectorAll('#page .cell-blk').length"), '/', J("document.querySelectorAll('#page td').length"))
pg.click('#tableBar [data-t=borderMenu]'); pg.select_option('#bpT', 'DOT'); pg.click('.bgrid button[title="가로 안쪽 테두리"]'); pg.wait_for_timeout(100)
print('innerH dotted:', J("document.querySelector('#page table').rows[1].cells[0].style.borderTop"))
# 계산
J("""(()=>{const t=document.querySelector('#page table');[[0,'10'],[1,'20,000'],[2,'5']].forEach(([r,v])=>{t.rows[r].cells[0].innerHTML='<p>'+v+'</p>'});})()""")
J("""(()=>{const t=document.querySelector('#page table');HwpEditor.state.blk={tbl:t,a:t.rows[0].cells[0],b:t.rows[2].cells[0]};})()""")
caret_in(0, 0); J("HwpEditor.state.blk={tbl:document.querySelector('#page table'),a:document.querySelector('#page table').rows[0].cells[0],b:document.querySelector('#page table').rows[2].cells[0]}")
pg.click('#tableBar [data-t=calcMenu]'); pg.click('.menu-item:has-text("블록 합계")'); pg.wait_for_timeout(100)
print('sum cell:', J("document.querySelector('#page table').rows[3].cells[0].innerText"))
# 엑셀 붙여넣기
caret_in(0, 1)
J("""(()=>{const dt=new DataTransfer();dt.setData('text/plain','가\\t나\\t다\\n라\\t마\\t바');document.getElementById('page').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));})()""")
pg.wait_for_timeout(150)
print('paste grid:', J("Array.from(document.querySelector('#page table').rows).slice(0,2).map(r=>Array.from(r.cells).map(c=>c.innerText.trim()).join('/')).join(' | ')"), gridok())
# 칸 경계 끌기
b = J("(()=>{const r=document.querySelector('#page table').rows[0].cells[0].getBoundingClientRect();return [r.right, r.y+r.height/2]})()")
pg.mouse.move(b[0]-1, b[1]); pg.wait_for_timeout(50); pg.mouse.move(b[0], b[1]); pg.wait_for_timeout(50)
tw0 = J("document.querySelector('#page table').style.width")
g = J("(()=>{const g=document.querySelector('.colgrip');return g.hidden?null:(()=>{const r=g.getBoundingClientRect();return [r.x+r.width/2,r.y+10]})()})()")
if g:
    pg.mouse.move(*g); pg.mouse.down(); pg.mouse.move(g[0]+40, g[1], steps=4); pg.mouse.up(); pg.wait_for_timeout(100)
print('col drag keeps total width:', tw0 == J("document.querySelector('#page table').style.width"), 'grip:', bool(g))
pg.screenshot(path=str(S/'t_table.png'))
# 저장 → 다시 열기: 여백·테두리 보존
e.save('hwpx', S/'t_table.hwpx')
e.open(S/'t_table.hwpx'); pg.wait_for_timeout(300)
print('reopen padding:', J("document.querySelector('#page td').style.padding"), '| border:', J("document.querySelector('#page td').style.borderTop"), '| tmargin:', J("document.querySelector('#page table').style.cssText"))
print('errors:', [x for x in e.errors if 'Failed to load' not in x])
e.close()
