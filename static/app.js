'use strict';

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
const labels = {new:'Новый',ai:'ИИ-проверка',review:'На рассмотрении',revision:'На доработке',approved:'Согласован',done:'Завершён'};
const laneLabels = {new:'Новые документы',ai:'ИИ-проверка',review:'На рассмотрении',revision:'На доработке',approved:'Согласованы',done:'Завершены'};
const priorities = {normal:'Обычный',high:'Высокий',low:'Низкий'};
const types = ['Служебная записка','Отчёт','План мероприятий','Протокол','Письмо','Поручение'];
const S = {data:null,view:'registry',folder:'all',doc:null,tab:'main',version:null,search:'',status:'',type:'',from:'',to:'',only:'all',commentsVersion:'all',commentsStatus:'all',mobile:false,model:null};
let toastTimer, pollBusy=false;

async function api(path, data, method='POST') {
  const response = await fetch(path, data===undefined ? {} : {method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  let value;
  try { value=await response.json(); } catch { throw new Error('Не удалось прочитать ответ сервера'); }
  if(!response.ok) throw new Error(value.error || 'Запрос не выполнен');
  return value;
}
function toast(message) { const t=$('#toast');t.textContent=message;t.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('visible'),5500); }
const person = id => S.data.users.find(u=>u.id===id)?.name || (id==='system'?'Система':id);
const shortPerson = id => { const n=person(id).split(' ');return `${n[0]} ${n[1]?.[0] || ''}.`; };
const initials = id => person(id).split(' ').map(n=>n[0]).slice(0,2).join('');
const avatar = (id,tiny=false) => `<span class="avatar ${tiny?'tiny':''}" aria-hidden="true">${e(initials(id))}</span>`;
const dt = value => value ? new Date(value).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
const day = value => value ? new Date(value+'T12:00:00').toLocaleDateString('ru-RU') : '—';
const today = () => new Date().toLocaleDateString('en-CA');
const overdue = d => d.due<today() && !['approved','done'].includes(d.status);
const dueClass = d => overdue(d)?'overdue':d.due===today()?'today':'';
const bytes = n => n>1048576?`${(n/1048576).toFixed(1)} МБ`:`${Math.max(1,Math.round(n/1024))} КБ`;
const chip = status => `<span class="chip ${e(status)}">${e(labels[status]||status)}</span>`;
const button = (text,action,ic='',cls='',extra='') => `<button type="button" class="${cls}" data-action="${action}" ${extra}>${ic?icon(ic):''}${text}</button>`;
const docURL = (id,tab='main',version=null) => `#document=${encodeURIComponent(id)}&tab=${encodeURIComponent(tab)}${version?'&version='+encodeURIComponent(version):''}`;
const docLink = (d,tab='main') => `<a class="document-title" href="${docURL(d.id,tab)}" data-open="${e(d.id)}" data-open-tab="${tab}">${e(d.title)}</a>`;
const newTabLink = d => `<a class="new-tab-link" href="${docURL(d.id)}" target="_blank" rel="noopener" aria-label="Открыть ${e(d.number)} в новой вкладке" title="Открыть в новой вкладке">↗</a>`;
const caseLabel = id => {const c=S.data.cases.find(c=>c.id===id);return c?`${c.code} · ${c.title}`:'';};
const empty = (title,text='',ic='file') => `<div class="empty">${icon(ic)}<h3>${e(title)}</h3><p>${e(text)}</p></div>`;
const notice = (text,kind='') => `<div class="notice ${kind}">${icon(kind==='error'?'alert':'ai')}<span>${text}</span></div>`;
function checkLabel(check) {
  if(!check) return 'Не проверен';
  if(check.status==='queued')return 'В очереди';
  if(check.status==='running')return 'Проверяется';
  if(check.status==='error')return 'Нужна проверка';
  if(check.rules_revision!==S.data.rules.revision)return 'Правила изменены';
  const issues=check.result?.items.filter(i=>i.status!=='met').length;
  return issues?`${issues} несоответств.`:'По правилам заполнен';
}
function checkTone(check) { return !check?'':check.status==='error'?'warn':check.status==='done' && (check.rules_revision!==S.data.rules.revision||check.result?.items.some(i=>i.status!=='met'))?'warn':''; }

function docsFiltered() {
  return S.data.documents.filter(d=>{
    const search=[d.title,d.number,d.type,person(d.owner_id),d.department,caseLabel(d.case_id)].join(' ').toLowerCase();
    if(S.search && !search.includes(S.search.toLowerCase()))return false;
    if(S.folder==='favorites'&&!d.favorite)return false;
    if(S.folder==='mine' && d.owner_id!==S.data.user.id)return false;
    if(S.folder==='revision'&&d.status!=='revision')return false;
    if(S.folder==='done'&&d.status!=='done')return false;
    if(['active','tasks','assignments'].includes(S.folder)&&['approved','done'].includes(d.status))return false;
    if(S.status&&d.status!==S.status)return false;
    if(S.type&&d.type!==S.type)return false;
    if(S.from&&d.due<S.from||S.to&&d.due>S.to)return false;
    if(S.only==='overdue'&&!overdue(d))return false;
    if(S.only==='attention'&&!(d.open_comments||checkTone(d.check)||overdue(d)))return false;
    return true;
  });
}

function nav(label,view,ic,folder='',count='',sub=false) {
  const active=S.view===view&&(view!=='registry'||S.folder===(folder||'all'));
  return `<button class="${sub?'nav-sub':'nav-item'} ${active?'active':''}" data-nav="${view}" data-folder="${folder}">${ic?icon(ic):''}<span>${label}</span>${count!==''?`<span class="nav-count">${count}</span>`:''}</button>`;
}

function render() {
  if(!S.data)return;
  const d=S.data, unread=d.notifications.filter(n=>!n.read).length;
  const folderTitle={all:'Все документы',mine:'Созданные мной',favorites:'Избранные',active:'На исполнении',revision:'На доработке',done:'Обработанные',journal:'Журнал документов',tasks:'Мои задачи',assignments:'Поручения на исполнении'}[S.folder]||'Все документы';
  document.title=`ЕОСДО · ${S.view==='detail'?S.doc?.number:S.view==='kanban'?'Канбан куратора':S.view==='notifications'?'Уведомления':S.view==='rules'?'Правила проверки':S.view==='templates'?'Мои шаблоны':folderTitle}`;
  $('#app').innerHTML=`<div class="shell ${S.mobile?'nav-open':''}"><button class="mobile-backdrop" data-action="mobile" aria-label="Закрыть навигацию"></button>
    <aside class="sidebar" aria-label="Главная навигация"><div class="brand"><span class="brand-mark">${icon('file')}</span><span class="brand-name">ЕОСДО <small>2.6</small></span></div>
      <div class="workspace-label">Рабочее пространство</div><div class="org">Документооборот<br><span class="muted" style="color:#a3bde1">Локальный контур · ДЕМО</span></div>
      ${nav('Документы','registry','folder','all',d.documents.length)}
      ${nav('Все документы','registry','','all','',true)}${nav('Созданные мной','registry','','mine','',true)}${nav('На исполнении','registry','','active','',true)}${nav('Обработанные','registry','','done','',true)}${nav('Избранные','registry','','favorites','',true)}
      <div class="nav-section">${nav('Канбан куратора','kanban','board')}${nav('Мои задачи','registry','check','tasks')}${nav('Рассмотрение / доработка','registry','','revision',d.documents.filter(x=>x.status==='revision').length,true)}${nav('Поручения','registry','file','assignments')}</div>
      <div class="nav-section">${nav('Журналы документов','registry','grid','journal')}${nav('Уведомления','notifications','bell','',unread||'')}${nav('Мои шаблоны','templates','file')}${nav('Правила ИИ-проверки','rules','ai')}</div>
      <div class="sidebar-foot"><span class="local-dot"></span> Данные на этом компьютере<br>Демонстрационный прототип<br>Версии · замечания · контроль</div>
    </aside>
    <header class="topbar"><div class="topbar-left">${button('','mobile','menu','icon-button quiet mobile-menu','aria-label="Открыть навигацию"')}<span>Единая система документооборота</span><span class="demo-label">ЛОКАЛЬНЫЙ ПРОТОТИП</span></div>
      <div class="topbar-right"><div class="bell-wrap">${button('','notifications','bell','icon-button quiet','aria-label="Открыть уведомления"')}${unread?`<span class="bubble">${unread>9?'9+':unread}</span>`:''}</div>
      <div class="user-picker">${avatar(d.user.id)}<div><select id="demo-user" aria-label="Демонстрационная роль">${d.users.map(u=>`<option value="${u.id}" ${u.id===d.user.id?'selected':''}>${e(u.name)}</option>`).join('')}</select><div class="user-role">${d.user.role==='curator'?'Куратор':'Исполнитель'} · демонстрационная роль</div></div></div></div></header>
    <main class="main" id="main-content">${S.view==='registry'?registry(folderTitle):S.view==='kanban'?kanban():S.view==='detail'&&S.doc?detail():S.view==='notifications'?notifications():S.view==='rules'?rules():S.view==='templates'?templatesPage():empty('Откройте документ')}</main></div>`;
}

function searchBox(placeholder='Номер, наименование, исполнитель…') {return `<div class="searchbox">${icon('search')}<input id="search" type="search" value="${e(S.search)}" placeholder="${placeholder}" aria-label="Поиск документов"></div>`;}
function registry(title) {
  const docs=docsFiltered();
  return `<div class="page-header"><div><div class="eyebrow">Документы / Реестр</div><h1>${title}</h1><div class="subtitle">Открывайте документы в отдельных вкладках · личные шаблоны ускоряют создание</div></div><div class="actions">${button('Обновить','refresh','refresh')}${button('Создать проект документа','create','plus','primary')}</div></div>
    <div class="tabs" aria-label="Разделы документов">${[['all','Все документы'],['mine','Созданные мной'],['active','На исполнении'],['favorites','Избранные'],['done','Обработанные']].map(([id,t])=>`<button class="tab ${S.folder===id?'active':''}" data-folder-tab="${id}">${t}${id==='all'?` <span class="count">${S.data.documents.length}</span>`:''}</button>`).join('')}</div>
    <section class="panel"><div class="toolbar">${searchBox()}<div class="actions">${button('Канбан','kanban','board')}${button('Сбросить фильтры','reset','settings','quiet small')}</div></div>
    <div class="filters"><div class="field"><label for="filter-status">Статус</label><select id="filter-status"><option value="">Все статусы</option>${Object.entries(labels).map(([k,v])=>`<option value="${k}" ${S.status===k?'selected':''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label for="filter-type">Вид документа</label><select id="filter-type"><option value="">Все виды</option>${types.map(t=>`<option ${S.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label for="filter-from">Срок с</label><input id="filter-from" type="date" value="${e(S.from)}"></div><div class="field"><label for="filter-to">По</label><input id="filter-to" type="date" value="${e(S.to)}"></div>
      <div class="field"><label for="filter-only">Контроль</label><select id="filter-only"><option value="all">Все документы</option><option value="overdue" ${S.only==='overdue'?'selected':''}>Просроченные</option><option value="attention" ${S.only==='attention'?'selected':''}>Требуют внимания</option></select></div></div>
      <div class="registry-summary"><span>Найдено документов: <b>${docs.length}</b></span><span>Синтетические примеры · оригинальные материалы не импортированы</span></div>
      <div class="table-wrap"><table class="document-table"><thead><tr><th></th><th>Документ / регистрационный №</th><th>Статус</th><th>Исполнитель</th><th>Срок</th><th>Версия</th><th>ИИ-проверка</th><th>Замечания</th></tr></thead><tbody>${docs.map(d=>`<tr><td><button class="star ${d.favorite?'selected':''}" data-favorite="${d.id}" aria-label="${d.favorite?'Убрать из избранного':'В избранное'}">${icon('star')}</button></td><td class="title-cell"><span class="type-label">${e(d.type)}</span>${docLink(d)}${newTabLink(d)}<span class="doc-number">${e(d.number)}</span>${d.case_id?`<span class="case-label">${e(caseLabel(d.case_id))}</span>`:''}</td><td>${chip(d.status)}${d.priority==='high'?`<div class="priority">↑ Высокий приоритет</div>`:''}</td><td><span>${e(shortPerson(d.owner_id))}</span><div class="small-text muted">${e(d.department)}</div></td><td class="date-cell ${dueClass(d)}">${day(d.due)}${overdue(d)?'<div class="small-text">Просрочен</div>':d.due===today()?'<div class="small-text">Сегодня</div>':''}</td><td><span class="mini-metric">${icon('file')}${d.latest?'v'+d.latest.number:'—'}</span></td><td><span class="mini-metric ${checkTone(d.check)}">${d.check?icon('ai'):''}${checkLabel(d.check)}</span></td><td><button class="quiet small" data-open="${d.id}" data-open-tab="comments" aria-label="Открыть замечания к документу ${e(d.number)}"><span class="mini-metric ${d.open_comments?'warn':''}">${icon('comment')}${d.open_comments}</span></button></td></tr>`).join('')}</tbody></table>${!docs.length?empty('Документы не найдены','Измените запрос или сбросьте фильтры','search'):''}</div><div class="panel-foot"><span>Показано ${docs.length} из ${S.data.documents.length}</span><span>Версии и история сохраняются автоматически</span></div></section>`;
}

function kanban() {
  const ds=S.data.documents, docs=docsFiltered();
  const stats=[['Активные документы',ds.filter(d=>!['approved','done'].includes(d.status)).length,'file',''],['На рассмотрении',ds.filter(d=>d.status==='review').length,'eye',''],['С открытыми замечаниями',ds.filter(d=>d.open_comments).length,'comment','amber'],['Просрочены',ds.filter(overdue).length,'clock','red']];
  return `<div class="page-header"><div><div class="eyebrow">Рабочий стол / Контроль исполнения</div><h1>Канбан куратора</h1><div class="subtitle">${S.data.user.role==='curator'?'Перемещайте карточки между этапами или выберите статус в документе':'Ваши документы по этапам · статусом управляет куратор'}</div></div><div class="actions">${button('Обновить','refresh','refresh')}${button('Создать документ','create','plus','primary')}</div></div>
  <div class="stats-row">${stats.map(([l,n,i,c])=>`<div class="stat"><div class="stat-icon ${c}">${icon(i)}</div><div><div class="stat-value">${n}</div><div class="stat-label">${l}</div></div></div>`).join('')}</div>
  <div class="board-toolbar">${searchBox()}<div class="pill-switch"><button class="${S.only==='all'?'active':''}" data-only="all">Все</button><button class="${S.only==='attention'?'active':''}" data-only="attention">Требуют внимания</button><button class="${S.only==='overdue'?'active':''}" data-only="overdue">Просрочены</button></div>${button('Реестр','registry','grid')}</div>
  <div class="board" aria-label="Документы по статусам">${Object.entries(laneLabels).map(([status,label])=>{const list=docs.filter(d=>d.status===status).sort((a,b)=>a.due.localeCompare(b.due));return `<section class="lane" data-status="${status}" aria-label="${label}"><div class="lane-heading"><span><span class="dot"></span>${label}</span><span class="lane-count">${list.length}</span></div><div class="lane-cards">${list.map(d=>`<article class="kanban-card" draggable="${S.data.user.role==='curator'}" data-drag="${d.id}"><div class="card-top"><span>${e(d.number)}</span><span class="priority ${d.priority}">${d.priority==='high'?'↑ Высокий':d.priority==='low'?'↓ Низкий':''}</span></div>${docLink(d)}${newTabLink(d)}<div class="card-type">${e(d.type)}</div>${d.case_id?`<div class="case-label">${e(caseLabel(d.case_id))}</div>`:''}<div class="card-person">${avatar(d.owner_id,true)}<span>${e(person(d.owner_id))}</span></div><div class="card-person"><span class="muted">Куратор:</span> ${e(shortPerson(d.curator_id))}</div><div class="card-date"><span class="mini-metric ${dueClass(d)}">${icon('clock')}${day(d.due)}${overdue(d)?' · просрочен':''}</span><span class="mini-metric">${d.latest?'v'+d.latest.number:'Нет файла'}</span></div><div class="card-metrics"><span class="mini-metric ${d.open_comments?'warn':''}">${icon('comment')}${d.open_comments} открытых</span><span class="mini-metric ${checkTone(d.check)}">${icon('ai')}${checkLabel(d.check)}</span></div><div class="card-next">${e(d.next_action)}</div></article>`).join('')}${!list.length?'<div class="lane-empty">На этом этапе<br>пока нет документов</div>':''}</div></section>`;}).join('')}</div>`;
}

function currentVersion() {return S.doc?.versions.find(v=>v.id===S.version)||S.doc?.versions[0];}
function detail() {
  const d=S.doc, v=currentVersion();
  const tabs=[['main','Основные реквизиты'],['versions','Файлы и версии'],['comments','Замечания',d.comments.filter(c=>c.status!=='closed').length],['ai','ИИ-проверка'],['approval','Согласование и подписание'],['links','Связанные документы'],['original','Где подлинник'],['history','История']];
  return `<div class="backline">${button('К реестру','registry','arrow','quiet small')}<span>/</span><span>${e(d.number)}</span>${newTabLink(d)}</div>
    <div class="detail-header"><div><div class="eyebrow">${e(d.type)}</div><h1>${e(d.title)}</h1><div class="detail-meta">${chip(d.status)}<span class="small-text muted">${e(d.number)}</span><span class="small-text ${dueClass(d)}">Срок: ${day(d.due)}</span>${d.priority==='high'?'<span class="priority">↑ Высокий приоритет</span>':''}</div></div><div class="actions">${button('Загрузить новую версию','upload','upload','primary')}${S.data.user.role==='curator'?button('Изменить статус','status','check'):''}</div></div>
    <div class="tabs">${tabs.map(([id,t,count])=>`<button class="tab ${S.tab===id?'active':''}" data-tab="${id}">${t}${count?` <span class="count">${count}</span>`:''}</button>`).join('')}</div>
    <div class="detail-layout"><div class="detail-main"><section class="panel">${S.tab==='main'?mainTab():S.tab==='versions'?versionsTab():S.tab==='comments'?commentsTab():S.tab==='ai'?aiTab():S.tab==='approval'?approvalTab():S.tab==='links'?linksTab():S.tab==='original'?originalTab():historyTab()}</section></div>
      <aside class="detail-aside"><section class="panel"><div class="panel-header"><span class="panel-title">Контроль документа</span>${icon('clock')}</div><div class="panel-body"><div class="info-row"><span>Исполнитель</span><span>${e(person(d.owner_id))}</span></div><div class="info-row"><span>Куратор</span><span>${e(person(d.curator_id))}</span></div><div class="info-row"><span>Приоритет</span><span>${priorities[d.priority]}</span></div><div class="info-row"><span>Актуальная версия</span><span>${d.versions[0]?'v'+d.versions[0].number:'Нет файла'}</span></div><div class="info-row"><span>Открытые замечания</span><span>${d.comments.filter(c=>c.status!=='closed').length}</span></div><div class="next-action"><b>Следующее действие</b>${e(S.data.documents.find(x=>x.id===d.id)?.next_action||'Проверьте актуальные данные')}</div></div></section>
      <section class="panel"><div class="panel-body"><div class="small-text muted">${icon('history')} Последнее изменение</div><p class="small-text">${dt(d.updated)}</p><div class="subtitle">Новая загрузка сохраняет предыдущие версии и запускает проверку заново.</div></div></section></aside></div>`;
}

function mainTab() {
  const d=S.doc,locked=['approved','done'].includes(d.status);
  return `<div class="panel-header"><span class="panel-title">Основные реквизиты</span><span class="small-text muted">Карточка документа</span></div><div class="panel-body">${locked?notice('Документ согласован. Для изменения реквизитов куратор должен вернуть его на рассмотрение.'):''}<form id="metadata-form"><input type="hidden" name="profile_revision" value="${d.profile_revision}"><div class="form-grid"><div class="field span-2"><label for="meta-title">Наименование документа *</label><input id="meta-title" name="title" value="${e(d.title)}" required maxlength="300" ${locked?'disabled':''}></div><div class="field"><label>Вид документа</label><input value="${e(d.type)}" disabled></div><div class="field"><label>Регистрационный номер</label><input value="${e(d.number)}" disabled></div><div class="field"><label>Подразделение</label><input value="${e(d.department)}" disabled></div><div class="field"><label>Исполнитель</label><input value="${e(person(d.owner_id))}" disabled></div><div class="field"><label for="meta-due">Срок выполнения *</label><input id="meta-due" type="date" name="due" value="${e(d.due)}" required ${locked?'disabled':''}></div><div class="field"><label for="meta-priority">Приоритет</label><select id="meta-priority" name="priority" ${locked?'disabled':''}>${Object.entries(priorities).map(([id,t])=>`<option value="${id}" ${id===d.priority?'selected':''}>${t}</option>`).join('')}</select></div><div class="field span-2"><label for="meta-summary">Краткое содержание / поручение</label><textarea id="meta-summary" name="summary" rows="5" maxlength="5000" ${locked?'disabled':''}>${e(d.summary)}</textarea></div></div>${profileFields(d,'meta',locked)}${!locked?'<div class="form-actions"><button class="primary" type="submit">Сохранить реквизиты</button></div>':''}<div class="form-error"></div></form></div>`;
}

function versionsTab() {
  const d=S.doc,v=currentVersion();
  if(!v)return `<div class="panel-body">${empty('Результат работы ещё не загружен','Загрузите документ: он появится здесь у исполнителя и у куратора','upload')}<div class="actions">${button('Загрузить первую версию','upload','upload','primary')}</div></div>`;
  return `<div class="panel-header"><span class="panel-title">Документы и история версий</span><span class="small-text muted">Оригиналы сохраняются без изменений</span></div><div class="version-layout"><div class="version-list">${d.versions.map((x,i)=>`<button class="version-item ${x.id===v.id?'active':''}" data-version="${x.id}"><div class="version-top"><span><span class="version-dot"></span>Версия ${x.number}</span>${i===0?'<span class="chip review">Актуальная</span>':''}</div><div class="version-message">${e(x.message)}</div><small>${dt(x.created)}<br>${e(shortPerson(x.author_id))}</small></button>`).join('')}</div><div class="version-view"><div class="version-view-head"><div><h3>${e(v.filename)}</h3><div class="version-info"><span>v${v.number} · ${bytes(v.size)}</span><span>${e(person(v.author_id))}</span></div></div><div class="actions"><a class="button-link" href="/api/versions/${v.id}/file" download>${icon('download')} Скачать</a>${button('Сравнить','diff','history','small')}</div></div>
    ${v.id!==d.versions[0].id?notice(`Вы просматриваете предыдущую версию v${v.number}. Актуальная версия — v${d.versions[0].number}.`,'warning'):''}
    <div class="actions" style="margin-bottom:12px">${button('Замечание к фрагменту','comment-selection','comment','small')}${button('Отчёт ИИ','ai-tab','ai','small')}</div>
    ${v.text?`<pre class="text-preview" id="document-text" tabindex="0" aria-label="Текст версии ${v.number}">${e(v.text)}</pre><div class="selected-text-hint">Выделите текст и нажмите «Замечание к фрагменту». Привязка сохранится к этой версии.</div>`:v.filename.toLowerCase().endsWith('.pdf')?`<iframe class="pdf-preview" title="Предпросмотр PDF" src="/api/versions/${v.id}/file?inline=1"></iframe>${notice(e(v.extraction_error||'Текст будет доступен после извлечения. Оригинальный PDF можно просмотреть и скачать.'))}`:notice(e(v.extraction_error||'Файл сохранён. Извлечение текста и локальная проверка выполняются в фоне. Для просмотра оформления скачайте оригинал.'))}
    <div class="version-info"><span class="mono">SHA-256: ${e(v.sha256)}</span></div><div class="small-text muted">Родитель: ${v.parent_id?e('v'+(d.versions.find(x=>x.id===v.parent_id)?.number||'—')):'первая версия'} · ${d.comments.filter(c=>c.version_id===v.id).length} замечаний к этой версии</div>
    <div class="upload-area">${icon('upload')}<p>Исправили документ? Загрузите следующую редакцию.<br>Предыдущий файл и его замечания останутся в истории.</p>${button('Загрузить новую версию','upload','plus','small')}</div></div></div>`;
}

function commentsTab() {
  const d=S.doc,comments=d.comments.filter(c=>(S.commentsVersion==='all'||c.version_id===S.commentsVersion)&&(S.commentsStatus==='all'||S.commentsStatus==='open'&&c.status!=='closed'||S.commentsStatus==='closed'&&c.status==='closed'));
  return `<div class="panel-header"><span class="panel-title">Замечания и обсуждение</span>${button('Добавить замечание','comment','plus','primary small',!d.versions.length?'disabled':'')}</div><div class="panel-body"><div class="comment-toolbar"><select id="comments-version" class="version-filter" aria-label="Версия для фильтра замечаний"><option value="all">Замечания ко всем версиям</option>${d.versions.map(v=>`<option value="${v.id}" ${S.commentsVersion===v.id?'selected':''}>Версия ${v.number} · ${e(v.filename)}</option>`).join('')}</select><div class="pill-switch">${[['all','Все'],['open','Открытые'],['closed','Закрытые']].map(([id,t])=>`<button class="${S.commentsStatus===id?'active':''}" data-comment-filter="${id}">${t}</button>`).join('')}</div></div>
    ${notice('Исполнитель отмечает исправление. Окончательное закрытие обязательного замечания подтверждает куратор. Новая версия не закрывает старые замечания автоматически.')}
    ${comments.map(c=>{const v=d.versions.find(x=>x.id===c.version_id);return `<article class="comment ${c.status==='closed'?'closed':''}"><div class="comment-heading"><div class="person-label">${avatar(c.author_id,true)}<b>${e(person(c.author_id))}</b><span class="muted">· v${v?.number||'?'}</span></div><div class="actions"><span class="chip ${c.status==='closed'?'met':c.status==='addressed'?'review':'revision'}">${c.status==='closed'?'Закрыто куратором':c.status==='addressed'?'Исправлено · на проверке':'Открыто'}</span>${c.severity==='blocking'?'<span class="small-text priority">Обязательное</span>':''}</div></div>${c.anchor?`<div class="quote">${e(c.anchor)}</div>`:''}<p>${e(c.text)}</p><div class="small-text muted">${dt(c.created)}${c.resolved_version?' · исправление проверяется по v'+(d.versions.find(v=>v.id===c.resolved_version)?.number||'?'):''}</div>
      ${c.replies.length?`<div class="replies">${c.replies.map(r=>`<div class="reply"><div class="reply-meta"><b>${e(person(r.author_id))}</b><span>${dt(r.created)}</span></div><p>${e(r.text)}</p></div>`).join('')}</div>`:''}
      <form class="inline-form reply-form" data-comment="${c.id}"><input name="text" placeholder="Ответить на замечание…" aria-label="Ответ на замечание" required maxlength="5000"><button type="submit" class="small">Отправить</button></form>
      <div class="comment-actions"><button class="quiet small" data-view-comment-version="${c.version_id}">${icon('file')}Открыть v${v?.number||'?'}</button><div class="actions">${c.status==='closed'?`<button class="small" data-comment-status="${c.id}" data-value="open">Открыть повторно</button>`:S.data.user.role==='curator'?`<button class="small" data-comment-status="${c.id}" data-value="closed">${icon('check')}Подтвердить устранение</button>`:`<button class="small" data-comment-status="${c.id}" data-value="addressed" ${c.status==='addressed'?'disabled':''}>${icon('check')}Исправлено</button>`}</div></div></article>`;}).join('')||empty('Замечаний нет','Добавьте замечание к документу или к выделенному фрагменту','comment')}</div>`;
}

function aiTab() {
  const d=S.doc,v=currentVersion();
  if(!v)return `<div class="panel-body">${empty('Сначала загрузите документ','Проверка запускается автоматически после каждой загрузки','ai')}${button('Загрузить файл','upload','upload','primary')}</div>`;
  const c=d.checks.find(c=>c.version_id===v.id), active=c&&['queued','running'].includes(c.status);
  return `<div class="panel-header"><span class="panel-title">Локальная ИИ-проверка · v${v.number}</span>${button(c?'Проверить повторно':'Запустить проверку','check-ai','refresh','small',active?'disabled':'')}</div><div class="panel-body"><div class="report-top"><div class="ai-emblem">${icon('ai')}</div><div><h3>Проверка правильности и полноты заполнения</h3><p>${e(S.data.model)} · Ollama · обработка на этом компьютере</p></div></div>${S.data.rules.demo?notice('Используются демонстрационные правила: реальные шаблоны пока не предоставлены. Результат не подтверждает соответствие отраслевым нормативам.','warning'):''}
    ${c&&c.rules_revision!==S.data.rules.revision?notice('Правила изменились после этой проверки. Запустите её повторно; старый отчёт сохранён для истории.','warning'):''}
    ${!c?`<div class="checking">${icon('ai')}<h3>Эта версия ещё не проверена</h3><p>Запустите проверку по текущему набору правил.</p></div>`:active?`<div class="checking"><span class="spinner big"></span><h3>${c.status==='queued'?'Документ в очереди':'Модель проверяет документ'}</h3><p>Результат появится автоматически. Можно продолжать работу.<br>Одновременно проверяется один файл, чтобы ограничить нагрузку.</p></div>`:c.status==='error'?`${notice(e(c.error),'error')}<p class="guidance">Файл и история сохранены. Доступна ручная проверка куратором. После устранения причины нажмите «Проверить повторно».</p>`:`<div class="small-text muted">Проверено ${dt(c.finished)} · правила, редакция ${c.rules_revision}</div><div>${c.result.items.map(item=>`<div class="check-item"><div class="check-mark ${item.status}">${icon(item.status==='met'?'check':'alert')}</div><div><h4>${e(item.rule)}</h4><p>${e(item.reason)}</p>${item.quote?`<div class="quote">${e(item.quote)}</div>`:''}</div><span class="chip ${item.status} check-status">${{met:'Заполнено',missing:'Не заполнено',uncertain:'Уточнить'}[item.status]}</span></div>`).join('')}</div>${notice(e(c.result.notice))}`}
    <div class="actions">${button('Открыть версию','versions-tab','file','small')}${button('Правила проверки','rules','settings','small')}</div>${c?`<details style="margin-top:20px"><summary class="small-text muted">Правила, использованные в этом отчёте</summary><ol class="guidance">${c.rules.items.map(r=>`<li>${e(r)}</li>`).join('')}</ol></details>`:''}</div>`;
}

function approvalTab() {
  const d=S.doc, latest=d.versions[0], approved=latest&&d.approved_version===latest.id&&['approved','done'].includes(d.status);
  return `<div class="panel-header"><span class="panel-title">Согласование и подписание</span>${S.data.user.role==='curator'?button('Изменить статус','status','check','small'):''}</div><div class="panel-body">${notice('Действующее решение принимает куратор. Настроенный ниже маршрут сохраняет план очередности; корпоративная отправка и электронная подпись не подключены.','warning')}${d.route.length?`<h3>Настроенная очередь</h3>${d.route.map((step,i)=>`<div class="route-step"><span class="route-num">${i+1}</span><div><div class="route-person">${e(person(step.user_id))}</div><div class="route-role">${step.kind==='sign'?'Подписание':'Согласование'} · ${step.days} календ. дн.</div></div><span class="chip">План</span></div>`).join('')}<p class="small-text muted">Изменить очередь можно в основных реквизитах.</p>`:'<p class="small-text muted">Индивидуальный маршрут не задан. Настройте его в основных реквизитах или выберите личный шаблон при создании.</p>'}<h3>Рассмотрение в прототипе</h3>
    <div class="route-step"><span class="route-num">1</span><div><div class="route-person">${e(person(d.owner_id))}</div><div class="route-role">Исполнитель · подготовка и загрузка документа</div></div>${chip(latest?'done':'new')}</div><div class="route-step"><span class="route-num">2</span><div><div class="route-person">Локальная ИИ</div><div class="route-role">Проверка по настраиваемым правилам · рекомендация</div></div><span class="chip ai">Ollama</span></div><div class="route-step"><span class="route-num">3</span><div><div class="route-person">${e(person(d.curator_id))}</div><div class="route-role">Куратор · замечания и решение по конкретной версии</div></div>${chip(approved?'approved':'review')}</div>
    <div class="panel" style="padding:17px;margin-top:20px"><div class="info-row"><span>Решение куратора</span><span>${approved?'Согласована версия v'+latest.number:'Согласование актуальной версии не подтверждено'}</span></div><div class="info-row"><span>Электронная подпись</span><span>Не подключена</span></div></div></div>`;
}
function linksTab() {const d=S.doc;return `<div class="panel-header"><span class="panel-title">Связанные документы</span>${button('Добавить связь','add-link','plus','small')}</div><div class="panel-body">${d.links.map(l=>`<div class="route-step">${icon('file')}<div>${docLink(l)}${newTabLink(l)}<span class="small-text muted">${e(l.number)}</span></div></div>`).join('')||empty('Связанных документов нет','Найдите документ по наименованию или регистрационному номеру','link')}</div>`;}
function originalTab() {return `<div class="panel-header"><span class="panel-title">Где подлинник</span></div><div class="panel-body">${notice('Оригинальные байты каждой загруженной версии хранятся на этом компьютере. SHA-256 позволяет проверить соответствие скачанного файла. Юридический статус подлинника и ЭП не устанавливаются.')}<div class="table-wrap"><table><thead><tr><th>Версия</th><th>Файл</th><th>Размер</th><th>Загружен</th><th></th></tr></thead><tbody>${S.doc.versions.map(v=>`<tr><td>v${v.number}</td><td>${e(v.filename)}</td><td>${bytes(v.size)}</td><td>${dt(v.created)}</td><td><a href="/api/versions/${v.id}/file" download>Скачать</a></td></tr>`).join('')}</tbody></table></div></div>`;}
function historyTab() {return `<div class="panel-header"><span class="panel-title">История действий</span><span class="small-text muted">${S.doc.history.length} событий</span></div><div class="panel-body">${S.doc.history.map(h=>`<div class="history-item"><span class="history-icon">${icon('history')}</span><div><p>${e(h.action)}</p><small>${e(person(h.author_id))} · ${dt(h.created)}</small></div></div>`).join('')}</div>`;}

function notifications() {
  const ns=S.data.notifications;
  return `<div class="page-header"><div><div class="eyebrow">События / Входящие</div><h1>Уведомления</h1><div class="subtitle">Версии, замечания, результаты ИИ и контроль сроков</div></div><div class="actions">${button('Настроить','notification-settings','settings')}${button('Прочитать все','read-all','check')}</div></div><div class="tabs"><button class="tab active">Все уведомления <span class="count">${ns.length}</span></button></div><section class="panel">${ns.map(n=>`<button class="notification ${n.read?'':'unread'}" data-notification="${n.id}"><span class="notification-icon">${icon({ai:'ai',upload:'upload',comment:'comment',status:'check',deadline:'clock'}[n.category]||'bell')}</span><span class="notification-content"><h3>${e(n.title)}</h3><p>${e(n.body)}</p>${n.version_id?'<span class="small-text muted">Перейти к событию и версии →</span>':''}</span><small>${dt(n.created)}</small>${!n.read?'<span class="unread-dot" aria-label="Не прочитано"></span>':''}</button>`).join('')||empty('Новых событий пока нет','Уведомления появятся при загрузке документов, замечаниях и изменениях статуса','bell')}</section>`;
}
function rules() {
  const r=S.data.rules,isCurator=S.data.user.role==='curator';
  return `<div class="page-header"><div><div class="eyebrow">Настройки / Контроль качества</div><h1>Правила ИИ-проверки</h1><div class="subtitle">Редакция ${r.revision} · ${r.demo?'демонстрационный набор':'пользовательский набор правил'}</div></div>${button('Проверить подключение','model-status','refresh')}</div><div class="rules-layout"><section class="panel"><div class="panel-header"><span class="panel-title">Что проверять в документах</span><span class="small-text muted">До 20 правил</span></div><div class="panel-body">${notice('Шаблоны организации не предоставлены. Начальные правила — пример. Опишите обязательные реквизиты и требования, которые модель должна проверять.','warning')}<form id="rules-form"><div id="rule-list">${r.items.map((item,i)=>ruleInput(item,i,isCurator)).join('')}</div>${isCurator?button('Добавить правило','add-rule','plus','small'):''}<div class="settings-list"><label class="check-label"><input name="demo" type="checkbox" ${r.demo?'checked':''} ${isCurator?'':'disabled'}>Это демонстрационные правила</label></div>${isCurator?'<div class="form-actions"><button class="primary" type="submit">Сохранить правила</button></div>':''}<div class="form-error"></div></form></div></section><aside><section class="panel"><div class="panel-header"><span class="panel-title">Локальная модель</span>${icon('ai')}</div><div class="panel-body"><p class="mono">${e(S.data.model)}</p><div class="model-state ${S.model?.available?'':'offline'}"><span class="model-dot"></span>${e(S.model?.message||'Проверяем подключение…')}</div><div class="guidance" style="margin-top:20px"><p>Документы передаются только локальному сервису Ollama.</p><p>Каждая проверка сохраняет модель, версию файла, использованные правила и цитаты.</p><p>Новые правила делают прежние отчёты неактуальными. Согласованные документы возвращаются на рассмотрение.</p><p>ИИ помогает найти пропуски. Решение о согласовании принимает куратор.</p></div></div></section></aside></div>`;
}
function ruleInput(item,index,editable=true) {return `<div class="rule-item"><span>${index+1}</span><input name="rule" value="${e(item)}" maxlength="500" required aria-label="Правило ${index+1}" ${editable?'':'disabled'}>${editable?'<button class="quiet small" type="button" data-action="remove-rule" aria-label="Удалить правило">'+icon('x')+'</button>':''}</div>`;}

function modal(title,body,footer='',wide=false) {
  const previous=document.activeElement;
  $('#modal-root').innerHTML=`<div class="modal-overlay"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title">${title}</h2>${button('','close-modal','x','icon-button quiet','aria-label="Закрыть окно"')}</div>${body}${footer}</section></div>`;
  $('#modal-root').previousFocus=previous;
  $('.modal input:not([type=hidden]), .modal textarea, .modal select, .modal button')?.focus();
}
function closeModal() {const old=$('#modal-root').previousFocus;$('#modal-root').innerHTML='';if(old?.isConnected)old.focus();}
const modalFooter = (text,form) => `<div class="modal-footer">${button('Отмена','close-modal')}<button type="submit" form="${form}" class="primary">${text}</button></div>`;
function profileFields(value={},prefix='new',locked=false) {
  const disabled=locked?'disabled':'';
  return `<div class="profile-fields"><div class="form-grid"><div class="field"><label for="${prefix}-case">Дело · номенклатура</label><input id="${prefix}-case" name="case_choice" list="${prefix}-cases" value="${e(caseLabel(value.case_id))}" placeholder="Номер или название дела…" autocomplete="off" ${disabled}><datalist id="${prefix}-cases">${S.data.cases.map(c=>`<option value="${e(caseLabel(c.id))}" label="${e(c.group)}"></option>`).join('')}</datalist><span class="small-text muted">Демонстрационный справочник · можно оставить пустым</span></div><div class="field"><label>Адресаты</label><details class="quick-select"><summary>${value.recipients?.length?`Выбрано: ${value.recipients.length}`:'Выбрать адресатов'}</summary><div class="quick-options">${S.data.users.map(u=>`<label class="check-label"><input type="checkbox" name="recipient" value="${u.id}" ${value.recipients?.includes(u.id)?'checked':''} ${disabled}><span>${e(u.name)}<small>${e(u.department)}</small></span></label>`).join('')}</div></details><span class="small-text muted">Список для карточки · доступ к документам не меняет</span></div></div><div class="section-heading"><div><h3>Маршрут согласования и подписания</h3><p class="small-text muted">Сначала согласование, затем подписание. Срок каждого этапа — в календарных днях.</p></div>${!locked?button('Добавить этап','add-route','plus','small'):''}</div><div class="route-editor">${(value.route||[]).map((step,i)=>routeRow(step,i,locked)).join('')}</div><p class="small-text muted">${value.route?.length?'':'Маршрут пока не задан. '}Это настройка очередности; электронная подпись и отправка по корпоративному маршруту не подключены.</p></div>`;
}
function routeRow(step={},index=0,locked=false) {
  return `<div class="route-editor-row"><span class="route-position">${index+1}</span><select name="route_kind" aria-label="Вид этапа ${index+1}" ${locked?'disabled':''}><option value="review">Согласование</option><option value="sign" ${step.kind==='sign'?'selected':''}>Подписание</option></select><select name="route_user" aria-label="Участник этапа ${index+1}" ${locked?'disabled':''}>${S.data.users.map(u=>`<option value="${u.id}" ${step.user_id===u.id?'selected':''}>${e(u.name)} · ${e(u.department)}</option>`).join('')}</select><label class="route-days"><input name="route_days" type="number" min="1" max="365" step="1" required value="${step.days||2}" aria-label="Дней на этап ${index+1}" ${locked?'disabled':''}>дн.</label>${!locked?`<div class="actions">${button('↑','route-up','','quiet small','aria-label="Переместить этап выше"')}${button('↓','route-down','','quiet small','aria-label="Переместить этап ниже"')}${button('','remove-route','x','quiet small','aria-label="Удалить этап"')}</div>`:''}</div>`;
}
function readProfile(form) {
  const f=new FormData(form),choice=String(f.get('case_choice')||'').trim();
  const selected=S.data.cases.find(c=>caseLabel(c.id)===choice);
  if(choice&&!selected)throw new Error('Выберите дело из выпадающего списка или очистите поле');
  return {case_id:selected?.id||'',recipients:f.getAll('recipient'),route:$$('.route-editor-row',form).map(row=>({kind:$('[name=route_kind]',row).value,user_id:$('[name=route_user]',row).value,days:Number($('[name=route_days]',row).value)}))};
}
function templateConfig(form,dueDays) {
  const f=new FormData(form);
  return {type:f.get('type'),title:f.get('title'),summary:f.get('summary'),priority:f.get('priority'),due_days:Number(dueDays),...readProfile(form)};
}
function templatePayload(name,config) {return {format:'eosdo-personal-template',version:1,name,config};}
function templatesPage() {
  return `<div class="page-header"><div><div class="eyebrow">Личные настройки / Повторяющиеся документы</div><h1>Мои шаблоны</h1><div class="subtitle">${e(person(S.data.user.id))} · шаблоны доступны только в этом аккаунте</div></div><div class="actions">${button('Импорт настроек','import-template','upload')}${button('Новый шаблон','new-template','plus','primary')}</div></div>${notice('Один раз настройте карточку, дело, адресатов и очередь согласования. При создании документа выберите шаблон — поля заполнятся автоматически. Срок вычисляется от даты создания; файлы и решения в шаблон не входят.')}<div class="template-grid">${S.data.templates.map(t=>`<section class="panel template-card"><div class="panel-body"><div class="eyebrow">Личный шаблон · редакция ${t.revision}</div><h2>${e(t.name)}</h2><p>${e(t.config.type)} · ${t.config.due_days} дн. на подготовку</p><div class="small-text muted">${e(caseLabel(t.config.case_id)||'Дело не задано')}<br>Адресатов: ${t.config.recipients.length} · этапов: ${t.config.route.length}</div><div class="template-actions"><button type="button" class="primary small" data-use-template="${t.id}">Создать документ</button><button type="button" class="small" data-edit-template="${t.id}">Изменить</button><button type="button" class="small" data-export-template="${t.id}">${icon('download')}Экспорт JSON</button><button type="button" class="quiet small danger" data-delete-template="${t.id}">Удалить</button></div></div></section>`).join('')||`<section class="panel">${empty('Создайте первый личный шаблон','Например, служебную записку с привычным делом, адресатами и маршрутом. Его можно будет перенести файлом настроек.','file')}</section>`}</div>`;
}
function templateModal(id=null) {
  const t=S.data.templates.find(t=>t.id===id),c=t?.config||{};
  modal(t?'Изменить личный шаблон':'Новый личный шаблон',`<div class="modal-body"><p class="modal-description">Только для ${e(person(S.data.user.id))}. Шаблон хранится на локальном сервере; его можно экспортировать в JSON.</p><form id="template-form" data-id="${t?.id||''}" data-revision="${t?.revision||''}"><div class="field"><label for="template-name">Название шаблона *</label><input id="template-name" name="name" value="${e(t?.name||'')}" maxlength="100" required placeholder="Моя типовая служебная записка"></div>${cardDefaults(c,'tpl',true)}${profileFields(c,'tpl')}<div class="form-error"></div></form></div>`,modalFooter('Сохранить шаблон','template-form'),true);
}
function cardDefaults(c={},prefix='new',template=false) {
  const due=new Date();due.setDate(due.getDate()+(c.due_days||7));
  return `<div class="form-grid"><div class="field span-2"><label for="${prefix}-title">${template?'Типовое наименование':'Наименование документа *'}</label><input id="${prefix}-title" name="title" ${template?'':'required'} maxlength="300" value="${e(c.title||'')}" placeholder="О чём документ"></div><div class="field"><label for="${prefix}-type">Вид документа</label><select id="${prefix}-type" name="type">${types.map(t=>`<option ${c.type===t?'selected':''}>${t}</option>`).join('')}</select></div><div class="field"><label for="${prefix}-priority">Приоритет</label><select id="${prefix}-priority" name="priority">${Object.entries(priorities).map(([id,t])=>`<option value="${id}" ${c.priority===id?'selected':''}>${t}</option>`).join('')}</select></div><div class="field"><label for="${prefix}-due">${template?'Дней на подготовку *':'Срок выполнения *'}</label><input id="${prefix}-due" name="${template?'due_days':'due'}" type="${template?'number':'date'}" ${template?'min="1" max="365" step="1"':''} required value="${template?c.due_days||7:due.toLocaleDateString('en-CA')}">${template?'<span class="small-text muted">От даты создания документа · календарные дни</span>':''}</div>${!template?`<div class="field"><label for="new-owner">Исполнитель</label><select id="new-owner" name="owner_id">${S.data.users.filter(u=>u.role==='author'&&(S.data.user.role==='curator'||u.id===S.data.user.id)).map(u=>`<option value="${u.id}">${e(u.name)}</option>`).join('')}</select></div>`:''}<div class="field span-2"><label for="${prefix}-summary">Краткое содержание / поручение</label><textarea id="${prefix}-summary" name="summary" rows="3" maxlength="5000" placeholder="Какой результат нужно подготовить">${e(c.summary||'')}</textarea></div></div>`;
}
function createModal(templateId='') {
  const t=S.data.templates.find(t=>t.id===templateId),c=t?.config||{};
  modal('Создать проект документа',`<div class="modal-body"><div class="template-picker field"><label for="creation-template">Личный шаблон</label><select id="creation-template"><option value="">Без шаблона · новая карточка</option>${S.data.templates.map(x=>`<option value="${x.id}" ${x.id===templateId?'selected':''}>${e(x.name)}</option>`).join('')}</select><span class="small-text muted">Выбор шаблона заменяет поля формы. Файл документа загрузите после создания.</span></div><form id="create-form">${cardDefaults(c)}${profileFields(c)}<details class="save-template-box"><summary>Сохранить эти настройки как личный шаблон</summary><div class="form-grid"><div class="field"><label for="quick-template-name">Название шаблона</label><input id="quick-template-name" name="template_name" maxlength="100" placeholder="Моя служебная записка"></div><div class="field"><label for="quick-template-days">Дней на подготовку от даты создания</label><input id="quick-template-days" name="template_days" type="number" min="1" max="365" step="1" value="${c.due_days||7}"></div></div>${button('Сохранить в мои шаблоны','save-create-template','file','small')}<span id="template-saved" class="small-text" role="status"></span></details><div class="form-error"></div></form></div>`,modalFooter('Создать документ','create-form'),true);
}
function uploadModal() {
  const d=S.doc, latest=d.versions[0];
  modal(latest?`Загрузить версию ${latest.number+1}`:'Загрузить результат работы',`<div class="modal-body"><p class="modal-description">${e(d.number)} · ${e(d.title)}<br>Исходные файлы сохраняются. Новая версия запускает ИИ-проверку и уведомляет куратора.</p><form id="upload-form" data-parent="${latest?.id||''}"><div class="field"><label for="version-file">Документ *</label><input id="version-file" class="file-input" name="file" type="file" accept=".pdf,.docx,.xlsx,.txt,.md,.csv" required><span class="small-text muted">PDF, DOCX, XLSX, TXT, MD, CSV · до 20 МБ</span></div><div class="field" style="margin-top:20px"><label for="version-message">Что изменилось в этой версии *</label><textarea id="version-message" name="message" required rows="3" maxlength="1000" placeholder="Например: уточнены сроки, добавлен перечень приложений"></textarea></div><div class="form-error"></div></form></div>`,modalFooter('Загрузить и проверить','upload-form'));
}
function commentModal(anchor='') {
  const v=currentVersion();if(!v){toast('Сначала загрузите версию документа');return;}
  modal('Замечание к документу',`<div class="modal-body"><form id="comment-form"><div class="field"><label for="comment-version">Версия документа</label><select id="comment-version" name="version_id" ${anchor?'disabled':''}>${S.doc.versions.map(x=>`<option value="${x.id}" ${x.id===v.id?'selected':''}>Версия ${x.number} · ${e(x.filename)}</option>`).join('')}</select>${anchor?`<input type="hidden" name="version_id" value="${v.id}">`:''}</div>${anchor?`<div class="quote">${e(anchor)}</div>`:''}<input type="hidden" name="anchor" value="${e(anchor)}"><div class="field" style="margin-top:18px"><label for="comment-text">Замечание *</label><textarea id="comment-text" name="text" required rows="4" maxlength="5000" placeholder="Что нужно исправить и какой результат ожидается"></textarea></div><label class="check-label" style="margin-top:16px"><input name="blocking" type="checkbox" ${S.data.user.role==='curator'?'checked':''}>Обязательное: блокирует согласование до подтверждения куратора</label><div class="form-error"></div></form></div>`,modalFooter('Добавить замечание','comment-form'));
}
async function statusModal(docId=S.doc?.id,target='') {
  const d=docId===S.doc?.id?S.doc:await api('/api/documents/'+docId);
  modal('Изменить статус документа',`<div class="modal-body"><p class="modal-description">${e(d.number)} · ${e(d.title)}<br>Решение относится к текущей версии ${d.versions[0]?'v'+d.versions[0].number:'(файл не загружен)'}.</p><form id="status-form" data-document="${d.id}" data-version="${d.versions[0]?.id||''}"><div class="field"><label for="new-status">Новый статус</label><select name="status" id="new-status">${Object.entries(labels).filter(([id])=>id!=='ai').map(([id,t])=>`<option value="${id}" ${id===(target||d.status)?'selected':''}>${t}</option>`).join('')}</select></div><label class="check-label" style="margin-top:22px"><input type="checkbox" name="manual_review">Я выполнил ручную проверку актуальной версии и подтверждаю решение при отсутствии положительного отчёта ИИ</label><div class="small-text muted" style="margin-top:12px;line-height:1.8">Открытые обязательные замечания нужно закрыть отдельно. Для завершения документ должен быть согласован.</div><div class="form-error"></div></form></div>`,modalFooter('Сохранить статус','status-form'));
}
function preferencesModal() {
  modal('Настройка уведомлений',`<div class="modal-body"><p class="modal-description">Настройки для ${e(person(S.data.user.id))}. Уведомления доставляются внутри приложения, без почты и внешних сервисов.</p><form id="preferences-form"><div class="settings-list">${Object.entries({upload:'Новые версии документов',comment:'Замечания, ответы и их статусы',ai:'Результаты и ошибки ИИ-проверки',status:'Изменение статуса документа',deadline:'Наступление срока и просрочки'}).map(([id,t])=>`<label class="check-label"><input name="${id}" type="checkbox" ${S.data.preferences[id]!==false?'checked':''}>${t}</label>`).join('')}</div><div class="form-error"></div></form></div>`,modalFooter('Сохранить настройки','preferences-form'));
}
function linkModal() {
  modal('Связать с документом',`<div class="modal-body"><p class="modal-description">Поиск по всему доступному реестру, без ограничений по датам.</p><div class="searchbox">${icon('search')}<input id="link-search" type="search" aria-label="Найти связанный документ" placeholder="Наименование или номер…"></div><div id="link-results" style="max-height:350px;overflow:auto;margin-top:15px">${linkResults('')}</div></div>`);
}
function linkResults(search) {return S.data.documents.filter(d=>d.id!==S.doc.id && (d.title+' '+d.number).toLowerCase().includes(search.toLowerCase())).map(d=>`<div class="route-step"><div style="flex:1"><div class="small-text">${e(d.title)}</div><div class="doc-number">${e(d.number)}</div></div><button class="small" data-link-target="${d.id}">Добавить</button></div>`).join('')||'<p class="muted">Документы не найдены</p>';}

async function openDoc(id,tab='main',version=null,update=true) {
  S.doc=await api('/api/documents/'+id);S.view='detail';S.tab=tab;S.version=version;S.mobile=false;S.commentsVersion='all';
  if(update)history.pushState(null,'',docURL(id,tab,version));
  render();window.scrollTo(0,0);
}
function navigate(view,folder='all',update=true) {
  S.view=view;S.folder=folder;S.doc=null;S.mobile=false;S.status='';S.type='';S.from='';S.to='';S.only='all';S.search='';
  if(update)history.pushState(null,'',`#view=${view}${view==='registry'?'&folder='+folder:''}`);
  render();window.scrollTo(0,0);
}
async function refresh(renderNow=true) {
  S.data=await api('/api/bootstrap');
  if(S.doc)S.doc=await api('/api/documents/'+S.doc.id);
  if(renderNow)render();
}
async function route() {
  const p=new URLSearchParams(location.hash.slice(1));
  if(p.get('document'))await openDoc(p.get('document'),p.get('tab')||'main',p.get('version'),false);
  else navigate(['registry','kanban','notifications','rules','templates'].includes(p.get('view'))?p.get('view'):'registry',p.get('folder')||'all',false);
}

document.addEventListener('click',async event=>{
  const el=event.target.closest('button,a[data-action],a[data-open]');if(!el)return;
  if(el.matches('a[data-open]')){if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;event.preventDefault();}
  if(el.closest('form')&&el.type==='submit'&&!el.dataset.action)return;
  try {
    if(el.dataset.nav){navigate(el.dataset.nav,el.dataset.folder||'all');return;}
    if(el.dataset.open){await openDoc(el.dataset.open,el.dataset.openTab||'main');return;}
    if(el.dataset.useTemplate){createModal(el.dataset.useTemplate);return;}
    if(el.dataset.editTemplate){templateModal(el.dataset.editTemplate);return;}
    if(el.dataset.exportTemplate){
      const value=await api('/api/templates/'+el.dataset.exportTemplate),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='eosdo-template.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
    }
    if(el.dataset.deleteTemplate){
      const t=S.data.templates.find(t=>t.id===el.dataset.deleteTemplate);
      modal('Удалить личный шаблон',`<div class="modal-body"><p>Удалить «${e(t.name)}»? Созданные по нему документы и их файлы сохранятся.</p><form id="delete-template-form" data-id="${t.id}" data-revision="${t.revision}"><div class="form-error"></div></form></div>`,modalFooter('Удалить шаблон','delete-template-form'));return;
    }
    if(el.dataset.folderTab){S.folder=el.dataset.folderTab;render();return;}
    if(el.dataset.only){S.only=el.dataset.only;render();return;}
    if(el.dataset.favorite){await api(`/api/documents/${el.dataset.favorite}/favorite`,{});await refresh();return;}
    if(el.dataset.tab){S.tab=el.dataset.tab;render();history.replaceState(null,'',docURL(S.doc.id,S.tab,S.version));return;}
    if(el.dataset.version){S.version=el.dataset.version;history.replaceState(null,'',docURL(S.doc.id,S.tab,S.version));render();return;}
    if(el.dataset.commentFilter){S.commentsStatus=el.dataset.commentFilter;render();return;}
    if(el.dataset.viewCommentVersion){S.version=el.dataset.viewCommentVersion;S.tab='versions';render();return;}
    if(el.dataset.commentStatus){await api(`/api/comments/${el.dataset.commentStatus}/status`,{status:el.dataset.value,version_id:S.doc.versions[0]?.id});await refresh();toast('Статус замечания сохранён');return;}
    if(el.dataset.notification){const n=S.data.notifications.find(n=>n.id===el.dataset.notification);await api('/api/notifications/read',{id:n.id});await refresh(false);if(n.document_id)await openDoc(n.document_id,n.category==='ai'?'ai':n.category==='comment'?'comments':'versions',n.version_id);else render();return;}
    if(el.dataset.linkTarget){await api(`/api/documents/${S.doc.id}/links`,{target_id:el.dataset.linkTarget});closeModal();await refresh();toast('Связь добавлена');return;}
    switch(el.dataset.action){
      case 'mobile': S.mobile=!S.mobile;render();break;
      case 'registry': case 'kanban': case 'notifications':case 'rules':case 'templates':navigate(el.dataset.action);break;
      case 'refresh':await refresh();toast('Данные обновлены');break;
      case 'reset':S.search='';S.status='';S.type='';S.from='';S.to='';S.only='all';render();break;
      case 'create':createModal();break;
      case 'new-template':templateModal();break;
      case 'import-template':modal('Импорт личного шаблона',`<div class="modal-body"><p class="modal-description">JSON-файл настроек ЕОСДО, до 64 КБ. Будет создан отдельный шаблон только в вашем аккаунте. Существующие документы не изменятся.</p><form id="import-template-form"><div class="field"><label for="template-file">Файл настроек *</label><input id="template-file" name="file" type="file" accept=".json,application/json" required></div><div class="form-error"></div></form></div>`,modalFooter('Импортировать','import-template-form'));break;
      case 'save-create-template':{
        const form=$('#create-form'),f=new FormData(form);el.disabled=true;
        try{await api('/api/templates',templatePayload(f.get('template_name'),templateConfig(form,f.get('template_days'))));await refresh(false);$('#template-saved').textContent='Сохранено в «Мои шаблоны»';toast('Личный шаблон сохранён');}
        finally{el.disabled=false;}break;
      }
      case 'add-route':{
        const editor=$('.route-editor',el.closest('form'));if($$('.route-editor-row',editor).length>=20){toast('Не больше 20 этапов');break;}
        editor.insertAdjacentHTML('beforeend',routeRow({},$$('.route-editor-row',editor).length));break;
      }
      case 'remove-route':case 'route-up':case 'route-down':{
        const row=el.closest('.route-editor-row'),editor=row.parentElement;
        if(el.dataset.action==='remove-route')row.remove();
        else if(el.dataset.action==='route-up'&&row.previousElementSibling)editor.insertBefore(row,row.previousElementSibling);
        else if(el.dataset.action==='route-down'&&row.nextElementSibling)editor.insertBefore(row.nextElementSibling,row);
        $$('.route-position',editor).forEach((node,i)=>node.textContent=i+1);break;
      }
      case 'upload':uploadModal();break;
      case 'close-modal':closeModal();break;
      case 'comment':commentModal();break;
      case 'comment-selection':{
        const selection=window.getSelection();const preview=$('#document-text');
        const anchor=selection&&preview?.contains(selection.anchorNode)&&preview.contains(selection.focusNode)?selection.toString():'';
        if(anchor.length>1000){toast('Выделите фрагмент не длиннее 1000 символов');break;}
        commentModal(anchor);break;
      }
      case 'status':await statusModal();break;
      case 'ai-tab':S.tab='ai';render();break;
      case 'versions-tab':S.tab='versions';render();break;
      case 'check-ai':await api(`/api/versions/${currentVersion().id}/check`,{});await refresh();toast('Документ поставлен в очередь локальной проверки');break;
      case 'diff':{
        const result=await api(`/api/versions/${currentVersion().id}/diff`);
        modal('Сравнение текста версий',`<div class="modal-body"><p class="modal-description">Сравнивается извлечённый текст. Изменения оформления не отображаются.</p><pre class="text-preview diff">${result.diff.split('\n').map(l=>`<span class="${l.startsWith('+')?'added':l.startsWith('-')?'removed':'context'}">${e(l)||' '}</span>`).join('')}</pre></div>`,'',true);break;
      }
      case 'read-all':await api('/api/notifications/read',{id:'all'});await refresh();break;
      case 'notification-settings':preferencesModal();break;
      case 'add-rule':{const list=$('#rule-list');const count=$$('.rule-item',list).length;if(count>=20){toast('Не больше 20 правил');break;}list.insertAdjacentHTML('beforeend',ruleInput('',count));$$('input',list).at(-1).focus();break;}
      case 'remove-rule':el.closest('.rule-item').remove();break;
      case 'model-status':S.model=await api('/api/ai-status');render();toast(S.model.message);break;
      case 'add-link':linkModal();break;
    }
  } catch(error) {toast(error.message);}
});

document.addEventListener('input',event=>{
  if(event.target.closest('#metadata-form'))$('#metadata-form').dataset.dirty='true';
  if(event.target.id==='search'){
    S.search=event.target.value;const pos=event.target.selectionStart;render();const input=$('#search');input?.focus();if(input)input.setSelectionRange(pos,pos);
  }
  if(event.target.id==='link-search')$('#link-results').innerHTML=linkResults(event.target.value);
});
document.addEventListener('change',async event=>{
  const el=event.target;
  if(el.closest('#metadata-form'))$('#metadata-form').dataset.dirty='true';
  try {
    if(el.id==='demo-user'){await api('/api/demo-session',{user_id:el.value});S.doc=null;await refresh(false);navigate('registry');return;}
    if(el.id==='creation-template'){createModal(el.value);return;}
    if(el.name==='recipient'){const box=el.closest('details');$('summary',box).textContent=`Выбрано: ${$$('input:checked',box).length}`;}
    const filters={'filter-status':'status','filter-type':'type','filter-from':'from','filter-to':'to','filter-only':'only','comments-version':'commentsVersion'};
    if(filters[el.id]){S[filters[el.id]]=el.value;render();}
  }catch(error){toast(error.message);}
});

document.addEventListener('submit',async event=>{
  const form=event.target;if(!form.id&&!form.classList.contains('reply-form'))return;
  event.preventDefault();
  const submit=$(`[form="${form.id}"][type=submit]`)||$('button[type=submit]',form);
  if(submit?.disabled)return;
  const errorNode=$('.form-error',form);if(errorNode)errorNode.innerHTML='';
  if(submit)submit.disabled=true;
  const f=new FormData(form),data=Object.fromEntries(f);
  try {
    if(form.id==='create-form'){const d=await api('/api/documents',{...data,...readProfile(form)});closeModal();await refresh(false);await openDoc(d.id,'versions');toast('Карточка создана. Загрузите результат работы.');}
    else if(form.id==='metadata-form'){await api(`/api/documents/${S.doc.id}`,{...data,...readProfile(form),profile_revision:Number(data.profile_revision)},'PATCH');await refresh();toast('Реквизиты сохранены');}
    else if(form.id==='template-form'){
      const payload=templatePayload(data.name,templateConfig(form,data.due_days));
      if(form.dataset.id)Object.assign(payload,{id:form.dataset.id,revision:Number(form.dataset.revision)});
      await api('/api/templates',payload);closeModal();await refresh();toast('Личный шаблон сохранён');
    }
    else if(form.id==='import-template-form'){
      const file=f.get('file');if(!file?.size||file.size>65536)throw new Error('Выберите JSON-файл размером до 64 КБ');
      let value;try{value=JSON.parse(await file.text());}catch{throw new Error('Файл не содержит корректный JSON');}
      if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Ожидается файл настроек ЕОСДО');
      await api('/api/templates',{format:value.format,version:value.version,name:value.name,config:value.config});closeModal();await refresh();toast('Шаблон импортирован в ваш аккаунт');
    }
    else if(form.id==='delete-template-form'){
      await api(`/api/templates/${form.dataset.id}/delete`,{revision:Number(form.dataset.revision)});closeModal();await refresh();toast('Личный шаблон удалён');
    }
    else if(form.id==='upload-form'){
      const file=f.get('file');if(!file?.size)throw new Error('Выберите непустой файл');if(file.size>20*1024*1024)throw new Error('Файл превышает 20 МБ');
      const buffer=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<buffer.length;i+=32768)binary+=String.fromCharCode(...buffer.subarray(i,i+32768));
      const result=await api(`/api/documents/${S.doc.id}/versions`,{filename:file.name,content:btoa(binary),message:data.message,parent_id:form.dataset.parent||null});
      closeModal();S.version=result.id;S.tab='ai';await refresh();toast('Версия сохранена. Локальная проверка запущена.');
    }
    else if(form.id==='comment-form'){await api('/api/comments',{...data,document_id:S.doc.id,severity:f.has('blocking')?'blocking':'normal'});closeModal();S.tab='comments';await refresh();toast('Замечание добавлено, уведомление отправлено');}
    else if(form.classList.contains('reply-form')){await api(`/api/comments/${form.dataset.comment}/reply`,data);await refresh();toast('Ответ отправлен');}
    else if(form.id==='status-form'){await api(`/api/documents/${form.dataset.document}/status`,{status:data.status,manual_review:f.has('manual_review'),version_id:form.dataset.version||null});closeModal();await refresh();toast('Статус сохранён');}
    else if(form.id==='rules-form'){await api('/api/rules',{items:f.getAll('rule'),demo:f.has('demo'),revision:S.data.rules.revision});await refresh();toast('Правила сохранены. Предыдущие отчёты требуют повторной проверки.');}
    else if(form.id==='preferences-form'){await api('/api/preferences',Object.fromEntries(['upload','comment','ai','status','deadline'].map(k=>[k,f.has(k)])));closeModal();await refresh();toast('Настройки уведомлений сохранены');}
  }catch(error){if(errorNode)errorNode.innerHTML=`<div class="error-text" role="alert">${e(error.message)}</div>`;else toast(error.message);}
  finally{if(submit?.isConnected)submit.disabled=false;}
});

document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){closeModal();if(S.mobile){S.mobile=false;render();}}
  const dialog=$('.modal');if(event.key==='Tab'&&dialog){const nodes=$$('button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),a[href]',dialog);const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
});
document.addEventListener('dragstart',event=>{const card=event.target.closest('[data-drag]');if(card&&S.data.user.role==='curator')event.dataTransfer.setData('text/plain',card.dataset.drag);});
document.addEventListener('dragover',event=>{const lane=event.target.closest('.lane');if(lane&&S.data.user.role==='curator'){event.preventDefault();lane.classList.add('drop-target');}});
document.addEventListener('dragleave',event=>{const lane=event.target.closest('.lane');if(lane&&!lane.contains(event.relatedTarget))lane.classList.remove('drop-target');});
document.addEventListener('drop',async event=>{const lane=event.target.closest('.lane');if(!lane)return;event.preventDefault();$$('.drop-target').forEach(l=>l.classList.remove('drop-target'));const id=event.dataTransfer.getData('text/plain');if(!S.data.documents.some(d=>d.id===id))return;if(lane.dataset.status==='ai'){toast('ИИ-проверка запускается загрузкой файла или кнопкой повторной проверки');return;}try{await statusModal(id,lane.dataset.status);}catch(error){toast(error.message);}});
window.addEventListener('popstate',()=>route().catch(error=>toast(error.message)));

async function start() {
  try{await refresh(false);await route();S.model=await api('/api/ai-status');if(S.view==='rules')render();}
  catch(error){$('#app').innerHTML=empty('Не удалось открыть рабочее пространство',error.message,'alert');}
}
setInterval(async()=>{
  if(pollBusy||!S.data||$('.modal')||document.hidden||$('#metadata-form')?.dataset.dirty==='true'||document.activeElement?.closest('form,input,textarea,select'))return;
  pollBusy=true;
  try{
    const before=JSON.stringify([S.data,S.doc]);await refresh(false);
    if(before!==JSON.stringify([S.data,S.doc])){
      const main=$('.main'), scroll=main?.scrollTop||0, board=$('.board')?.scrollLeft||0,versions=$('.version-list')?.scrollLeft||0;
      const previewScroll=$('.text-preview')?.scrollTop||0, laneScroll=Object.fromEntries($$('.lane').map(l=>[l.dataset.status,$('.lane-cards',l)?.scrollTop||0]));render();
      if($('.main'))$('.main').scrollTop=scroll;if($('.board'))$('.board').scrollLeft=board;if($('.version-list'))$('.version-list').scrollLeft=versions;if($('.text-preview'))$('.text-preview').scrollTop=previewScroll;$$('.lane').forEach(l=>{if($('.lane-cards',l))$('.lane-cards',l).scrollTop=laneScroll[l.dataset.status]||0;});
    }
  }catch{/* Keep current work visible during a temporary connection failure. */}finally{pollBusy=false;}
},4000);
start();
