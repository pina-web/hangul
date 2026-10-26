from harness import *
e = Editor(1440, 900); pg = e.page
errs = lambda: [x for x in e.errors if 'Failed to load' not in x]
pg.click('#btnNew'); pg.wait_for_timeout(200)
pg.click('.modal .choice button:has-text("프레젠테이션 16:9")'); pg.wait_for_timeout(800)
P = lambda: pg.evaluate("HwpEditor.design.project")
p = P(); print('new design', p['w'], p['h'], 'layers', len(p['pages'][0]['layers']))
pg.click('[data-d="addPage"]'); pg.wait_for_timeout(200)
pg.click('[data-tab="elements"]'); pg.click('[data-tpl="titleBody"]'); pg.wait_for_timeout(300)
pg.set_input_files('#dImgInput', str(S/'photo.jpg')); pg.wait_for_timeout(800)
pg.click('[data-shape="star"]'); pg.wait_for_timeout(200)
box = pg.locator('#dSel .dframe').bounding_box()
pg.mouse.move(box['x']+box['width']/2, box['y']+box['height']/2); pg.mouse.down(); pg.mouse.move(box['x']+box['width']/2+150, box['y']+box['height']/2-80, steps=8); pg.mouse.up()
h = pg.locator('.dh-se').bounding_box(); pg.mouse.move(h['x']+5,h['y']+5); pg.mouse.down(); pg.mouse.move(h['x']+60,h['y']+40, steps=6); pg.mouse.up()
r = pg.locator('.dh-rot').bounding_box(); fr = pg.locator('#dSel .dframe').bounding_box()
pg.mouse.move(r['x']+7,r['y']+7); pg.mouse.down(); pg.mouse.move(fr['x']+fr['width']*0.9, fr['y']-10, steps=8); pg.mouse.up()
star = [l for l in P()['pages'][1]['layers'] if l.get('kind')=='star'][0]
print('star x,y,w,h,rot', star['x'], star['y'], star['w'], star['h'], star['rot'])
pg.click('[data-ptab="motion"]'); pg.wait_for_timeout(200)
pg.select_option('#ps_효과', 'pop'); pg.select_option('#ps_반복', 'pulse')
pg.select_option('#ps_전환효과', 'slide')
title_id = [l for l in P()['pages'][1]['layers'] if l['type']=='text'][0]['id']
t = pg.locator(f'#dWrap .ly[data-id="{title_id}"]').bounding_box()
pg.mouse.dblclick(t['x']+20, t['y']+t['height']/2); pg.wait_for_timeout(200)
pg.keyboard.type('우리 공방 소개'); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
print('title html:', [l['html'] for l in P()['pages'][1]['layers'] if l['id']==title_id])
pg.keyboard.press('Control+z'); a1 = [l['html'] for l in P()['pages'][1]['layers'] if l['id']==title_id]
pg.keyboard.press('Control+y'); a2 = [l['html'] for l in P()['pages'][1]['layers'] if l['id']==title_id]
print('undo ->', a1, '| redo ->', a2)
pg.click(f'#dWrap .ly[data-id="{title_id}"]'); pg.keyboard.press('Control+d')
print('layers p2:', len(P()['pages'][1]['layers']))
pg.click('[data-tab="layers"]'); pg.click('[data-ptab="props"]'); pg.screenshot(path=str(S/'v2_design2.png'))
pg.click('[data-d="preview"]'); pg.wait_for_timeout(1500)
pg.click('[data-d="show"]'); pg.wait_for_timeout(1200)
pg.screenshot(path=str(S/'v2_show1.png'))
for i in range(3): pg.keyboard.press('ArrowRight'); pg.wait_for_timeout(1000)
pg.screenshot(path=str(S/'v2_show2.png'))
print('slideshow count:', pg.inner_text('.ss-count') if pg.locator('.ss-count').count() else None)
pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
print('slideshow closed:', pg.locator('.ss-root').count()==0)
out = S/'out2'; out.mkdir(exist_ok=True)
for k,ext in [('hwpx','hwpx'),('pptx','pptx'),('show','html'),('hpd','hpd'),('pdf','pdf'),('png','zip'),('docx','docx'),('md','md')]:
    try:
        f = e.save(k, out/f'design.{ext}'); print('export', k, f.stat().st_size)
    except Exception as ex: print('export FAIL', k, str(ex)[:200])
print('errors:', errs())
e.close()
