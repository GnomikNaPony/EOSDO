# coding: utf-8
from pathlib import Path
import hashlib,json,posixpath,zipfile
from lxml import etree as E
ROOT=Path(__file__).resolve().parents[2]
SRC=Path('/Users/mikevetkal/.t3/userdata/attachments/aaefe396-225f-4dd4-8ccb-ba43d5c7d38c-007d4c26-5a1d-4c13-8477-659994a83bc4-pptx.pptx')
OUT=ROOT/'artifacts/ЕОСОД_ИТ_КоР_2026_исправленная.pptx'
NS={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
expected='6c815e59f68fb9be22c790933508337b01983a54dd7c9e70f34fe12082904dce'
assert hashlib.sha256(SRC.read_bytes()).hexdigest()==expected
texts=[];shapes=0;relationships=0
with zipfile.ZipFile(OUT) as z:
    assert z.testzip() is None
    names=set(z.namelist())
    for n in names:
        if n.endswith('.xml') or n.endswith('.rels'):E.fromstring(z.read(n))
        if n.endswith('.rels'):
            base=posixpath.dirname(posixpath.dirname(n))
            for rel in E.fromstring(z.read(n)):
                if rel.get('TargetMode')=='External':continue
                target=rel.get('Target')
                resolved=posixpath.normpath(posixpath.join(base,target)) if not target.startswith('/') else target[1:]
                assert resolved in names,(n,resolved)
                relationships+=1
    pres=E.fromstring(z.read('ppt/presentation.xml'))
    assert len(pres.find('p:sldIdLst',NS))==7
    size=pres.find('p:sldSz',NS);W=int(size.get('cx'));H=int(size.get('cy'))
    for i in range(1,8):
        r=E.fromstring(z.read('ppt/slides/slide%d.xml'%i))
        ids=r.xpath('//@id');assert len(ids)==len(set(ids)),i
        for xf in r.findall('.//a:xfrm',NS):
            off=xf.find('a:off',NS);ext=xf.find('a:ext',NS)
            if off is None or ext is None:continue
            x,y=int(off.get('x')),int(off.get('y'));w,h=int(ext.get('cx')),int(ext.get('cy'))
            assert x>=0 and y>=0 and x+w<=W and y+h<=H,(i,x,y,w,h)
            shapes+=1
        texts.append('\n'.join(r.xpath('//a:t/text()',namespaces=NS)))
assert '30 мин' not in '\n'.join(texts)
for term in ['01','02','03','04','OCR']:assert term in texts[5],term
for term in ['Поиск переписки','Карточка из шаблона','Сравнение документов']:assert term in texts[6],term
result={'slides':7,'in_bounds_shapes':shapes,'valid_relationship_targets':relationships,'source_sha256':expected,'output_sha256':hashlib.sha256(OUT.read_bytes()).hexdigest(),'zip_crc':'passed','xml':'passed','source_unchanged':True}
(ROOT/'tasks/2026-10-29-presentation-fix/verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
