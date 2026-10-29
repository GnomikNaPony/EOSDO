# coding: utf-8
"""Create a separate edited OOXML copy; preserve original media and masters."""
from pathlib import Path
from copy import deepcopy
import zipfile
from lxml import etree as E

ROOT = Path(__file__).resolve().parents[2]
SRC = Path('/Users/mikevetkal/.t3/userdata/attachments/aaefe396-225f-4dd4-8ccb-ba43d5c7d38c-007d4c26-5a1d-4c13-8477-659994a83bc4-pptx.pptx')
OUT = ROOT / 'artifacts/ЕОСОД_ИТ_КоР_2026_исправленная.pptx'
NS = {'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
EMU=914400
NAVY='163D72'; BLUE='0072BC'; GRAY='52657B'; DARK='333333'; PALE='F1F6FB'
def el(tag, parent=None, **attrs):
    prefix, local=tag.split(':')
    node=E.Element('{%s}%s'%(NS[prefix],local),{k:str(v) for k,v in attrs.items()})
    if parent is not None: parent.append(node)
    return node

def box(tree,x,y,w,h,fill=None,line=None):
    sp=el('p:sp',tree); nv=el('p:nvSpPr',sp)
    el('p:cNvPr',nv,id=len(tree)+10,name='Edited shape %d'%len(tree)); el('p:cNvSpPr',nv,txBox='1');el('p:nvPr',nv)
    pr=el('p:spPr',sp); xf=el('a:xfrm',pr)
    el('a:off',xf,x=round(x*EMU),y=round(y*EMU));el('a:ext',xf,cx=round(w*EMU),cy=round(h*EMU))
    geom=el('a:prstGeom',pr,prst='rect');el('a:avLst',geom)
    if fill: el('a:srgbClr',el('a:solidFill',pr),val=fill)
    else: el('a:noFill',pr)
    ln=el('a:ln',pr,w='9525')
    if line: el('a:srgbClr',el('a:solidFill',ln),val=line)
    else: el('a:noFill',ln)
    return sp

def text(tree,x,y,w,h,txt,size=20,color=DARK,bold=False,fill=None):
    sp=box(tree,x,y,w,h,fill)
    tx=el('p:txBody',sp);el('a:bodyPr',tx,wrap='square',lIns='0',rIns='0',tIns='0',bIns='0',anchor='t');el('a:lstStyle',tx)
    for line in txt.split('\n'):
        p=el('a:p',tx); pp=el('a:pPr',p)
        el('a:spcPts',el('a:spcAft',pp),val='200')
        r=el('a:r',p);rp=el('a:rPr',r,lang='ru-RU',sz=round(size*100),b='1' if bold else '0')
        el('a:srgbClr',el('a:solidFill',rp),val=color);el('a:latin',rp,typeface='Arial');el('a:ea',rp,typeface='Arial');el('a:cs',rp,typeface='Arial')
        el('a:t',r).text=line
        el('a:endParaRPr',p,lang='ru-RU',sz=round(size*100))
    return sp

def picture(tree,original,x,y,w,h):
    pic=deepcopy(original);tree.append(pic)
    pic.find('p:nvPicPr/p:cNvPr',NS).set('id',str(len(tree)+10))
    xf=pic.find('p:spPr/a:xfrm',NS)
    xf.find('a:off',NS).attrib.update({'x':str(round(x*EMU)),'y':str(round(y*EMU))})
    xf.find('a:ext',NS).attrib.update({'cx':str(round(w*EMU)),'cy':str(round(h*EMU))})

def card(t,x,y,w,h,title,body):
    box(t,x,y,w,h,PALE)
    text(t,x+.18,y+.17,w-.36,.45,title,20,NAVY,True)
    text(t,x+.18,y+.64,w-.36,h-.70,body,16)

def base(i,title,status):
    r=E.fromstring(data['ppt/slides/slide%d.xml'%i]);t=r.find('p:cSld/p:spTree',NS)
    for node in list(t)[2:]:t.remove(node)
    # Keep the corporate master header; clear its decorative content area.
    box(t,.55,1.43,12.28,5.78,'FFFFFF')
    text(t,.92,.40,9.35,.75,title,28,NAVY,True)
    text(t,.94,1.64,11.5,.40,status,14,BLUE,True)
    text(t,12.0,7.18,.35,.22,str(i),10,GRAY)
    return r,t

def footer(t,txt):text(t,.94,6.88,11.25,.4,txt,12,GRAY)

with zipfile.ZipFile(SRC) as z:data={n:z.read(n) for n in z.namelist()}
original={i:E.fromstring(data['ppt/slides/slide%d.xml'%i]).findall('p:cSld/p:spTree/p:pic',NS) for i in range(1,8)}
slides={}
# 1: preserve original title background and author identities.
r=E.fromstring(data['ppt/slides/slide1.xml']);t=r.find('p:cSld/p:spTree',NS)
for node in list(t)[2:]:t.remove(node)
text(t,.88,2.10,10.4,.70,'ЕОСОД 3.0',38,'FFFFFF',True)
text(t,.9,2.98,10.3,1.05,'Меньше повторного ввода.\nБыстрее поиск нужной переписки.',27,'FFFFFF',True)
text(t,.92,4.28,9.8,.5,'Команда «Эффективность» • прототип и предложение пилота',18,'FFFFFF')
text(t,.92,5.00,10.9,1.13,'Брекер Е.Е. | Ростовская АЭС, начальник участка программного обеспечения\nКико А.Г. | Студент ВИТИ НИЯУ МИФИ\nВеткаль М.М. | Студент филиала ДГТУ в Волгодонске',14,'FFFFFF')
box(t,.78,6.20,11.30,.65,'07578C')
text(t,.92,6.34,10.8,.43,'Цель встречи — согласовать проверку пользы на повседневных задачах',17,'FFFFFF')
slides[1]=r
# 2: screenshot with a concise three-part legend.
r,t=base(2,'Что показывает прототип','СКРИНШОТ ИСХОДНОЙ ДЕМОНСТРАЦИИ • готовность функций сверяем перед пилотом')
picture(t,original[2][0],.94,2.23,7.30,4.08)
card(t,8.55,2.22,3.75,1.25,'1  Найти документ','Слова в тексте, реквизиты\nи история версий')
card(t,8.55,3.67,3.75,1.25,'2  Повторить задачу','Личные шаблоны\nи рабочие разделы')
card(t,8.55,5.12,3.75,1.25,'3  Сохранить контекст','Карточки в новых вкладках\nи выгрузка реестра')
footer(t,'Текстовый поиск и поиск по смыслу — разные режимы. ИИ-проверке нужны настроенные правила и модель.')
slides[2]=r
# 3: replace the illustrative pseudo-screenshot and unsupported metrics with editable example.
r,t=base(3,'Данные и переписка: проверить на примере','ЭКСПЕРИМЕНТАЛЬНЫЙ СЦЕНАРИЙ • схема результата, а не подтверждение точности')
card(t,.94,2.28,3.56,2.75,'01  Письмо','Замечание по кабелю\nКод оборудования (KKS)\nМарка, сечение, длина')
card(t,4.76,2.28,3.56,2.75,'02  Данные','Значение и цитата\nСсылка на исходную версию\nПроверка специалистом')
card(t,8.58,2.28,3.56,2.75,'03  Переписка','Кандидаты в одну группу\nОснование связи\nПодтверждение человеком')
text(t,1.05,5.40,11.0,.5,'Найденная связь ещё не означает, что замечание закрыто.',23,NAVY,True)
text(t,1.05,6.04,10.9,.62,'В пилоте измерим время поиска и долю верных / пропущенных связей.',20)
footer(t,'Схема иллюстрирует ожидаемый сценарий. Группировка документов не заменяет согласование.')
slides[3]=r
# 4: existing template screenshot.
r,t=base(4,'Повторная карточка из личного шаблона','ПОЛЬЗОВАТЕЛЬСКИЙ СЦЕНАРИЙ • реквизиты и маршрут можно использовать повторно')
picture(t,original[4][0],.98,2.24,6.40,4.38)
card(t,7.78,2.25,4.40,1.28,'Один раз настроить','Тип, реквизиты, адресаты\nи маршрут рассмотрения')
card(t,7.78,3.74,4.40,1.28,'Использовать повторно','Выбрать шаблон и уточнить\nданные новой карточки')
card(t,7.78,5.23,4.40,1.28,'Измерить в пилоте','Время создания карточки\nи число ручных заполнений')
footer(t,'На скриншоте учебные данные. Шаблон сохраняет настройки карточки; файл документа загружается отдельно.')
slides[4]=r
# 5: browser frames clarify the two-window concept without inventing a complete UI screenshot.
r,t=base(5,'Сравнить документы, сохранив реестр','ПОЛЬЗОВАТЕЛЬСКИЙ СЦЕНАРИЙ • отдельную вкладку можно вынести в соседнее окно')
for x,title in [(.94,'ОКНО 1 • РЕЕСТР'),(6.90,'ОКНО 2 • КАРТОЧКА')]:
    box(t,x,2.25,5.48,3.45,'FFFFFF','C8D8E8');box(t,x,2.25,5.48,.48,PALE)
    text(t,x+.16,2.35,5.1,.28,title,13,NAVY,True)
picture(t,original[5][0],1.08,2.91,5.20,2.50)
text(t,7.10,2.97,5.02,.5,'Карточка выбранного документа',19,NAVY,True)
text(t,7.10,3.63,4.98,.55,'Фрагмент интерфейса из исходной презентации',13,GRAY)
picture(t,original[5][1],7.10,4.25,5.02,.972)
text(t,1.05,5.99,11.0,.5,'Открыть карточку по прямой ссылке — продолжить работу со списком.',21,NAVY,True)
footer(t,'Схема двух окон со скриншотами. В пилоте: время сравнения и число повторных поисков. Данные учебные.')
slides[5]=r
# 6: four real on-canvas columns.
r,t=base(6,'Следующий этап: документы как данные','ПРЕДЛАГАЕМОЕ РАЗВИТИЕ • состав работ уточняем относительно выбранной сборки')
text(t,.98,2.22,11.15,.90,'Оригинал сохраняется. Из содержимого файла\nготовятся данные для поиска и анализа.',25,NAVY,True)
for x,num,title,body in [( .98,'01','Извлечение','Текст и реквизиты\nРаспознавание сканов\n(OCR) — в плане'),(3.88,'02','Контекст','Тип, тема, участники\nи версия документа'),(6.78,'03','Индекс','Фрагменты текста\nи индекс для поиска\nпо смыслу'),(9.68,'04','Применение','Поиск, предложения\nсвязей и сводки\nс опорой на источник')]:
    box(t,x,3.52,2.68,2.70,PALE)
    text(t,x+.17,3.70,2.34,.48,num,28,BLUE,True)
    text(t,x+.17,4.36,2.34,.43,title,19,NAVY,True)
    text(t,x+.17,5.00,2.34,1.10,body,16)
footer(t,'Это план развития, а не перечень обещаний о текущем сайте. Автоматические результаты проверяет специалист.')
slides[6]=r
# 7: concrete request without invented owners or thresholds.
r,t=base(7,'Предлагаем ограниченный пилот','РЕШЕНИЕ ВСТРЕЧИ • согласовать сценарии, участников, срок и ответственного')
for y,title,body in [(2.25,'Поиск переписки','Время поиска • верные и пропущенные связи'),(3.40,'Карточка из шаблона','Время создания • число ручных заполнений'),(4.55,'Сравнение документов','Время сравнения • число повторных поисков')]:
    box(t,.98,y,11.20,.95,PALE)
    text(t,1.16,y+.20,3.88,.52,title,20,NAVY,True)
    text(t,5.22,y+.23,6.68,.50,body,18)
text(t,1.0,5.88,11.08,.62,'До старта: согласовать данные, доступ и пороги успеха.\nПосле: сравнить одинаковые задачи до / после и решить о масштабе.',18,NAVY)
footer(t,'Просим согласовать подготовку пилота. Численные критерии, ресурсы и сроки определяются с владельцем процесса.')
slides[7]=r
for i,r in slides.items(): data['ppt/slides/slide%d.xml'%i]=E.tostring(r,xml_declaration=True,encoding='UTF-8',standalone=True)
OUT.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(OUT,'w',zipfile.ZIP_DEFLATED) as z:
    for n,v in data.items():z.writestr(n,v)
print(OUT)
