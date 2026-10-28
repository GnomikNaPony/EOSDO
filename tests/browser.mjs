import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';

const temp=await mkdtemp(join(tmpdir(),'eosdo-ui-'));
const service=spawn('.venv/bin/python',['server.py','--port','8771','--db',join(temp,'ui.sqlite3')],{stdio:['ignore','pipe','pipe']});
let browser;const errors=[];
const started=new Promise((resolve,reject)=>{service.stdout.on('data',d=>{if(String(d).includes('http://'))resolve();});service.once('error',reject);service.once('exit',code=>reject(new Error('server exited '+code)));});
const stage=name=>console.log('UI:',name);
try {
  await started;
  await mkdir('test-results',{recursive:true});
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',locale:'ru-RU'});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:8771');
  await page.getByRole('heading',{name:'Все документы',exact:true}).waitFor();
  assert.equal(await page.locator('.document-table tbody tr').count(),8);
  await page.screenshot({path:'test-results/01-register.png',fullPage:true});
  await page.locator('#search').fill('ДЕМО-102');
  assert.equal(await page.locator('.document-table tbody tr').count(),1);
  await page.locator('#search').fill('');
  await page.locator('#filter-from').fill('2025-01-01');await page.locator('#filter-to').fill('2027-12-31');
  assert.equal(await page.locator('.document-table tbody tr').count(),8);
  stage('registry, search and multi-year dates');

  await page.getByRole('button',{name:'Создать проект документа',exact:true}).click();
  await page.locator('#new-title').fill('Учебный документ для проверки интерфейса');
  await page.locator('#new-due').fill('2026-12-15');
  await page.getByRole('button',{name:'Создать документ',exact:true}).click();
  await page.getByRole('heading',{name:'Учебный документ для проверки интерфейса',exact:true}).waitFor();
  const documentId=new URLSearchParams(new URL(page.url()).hash.slice(1)).get('document');
  assert(documentId);
  const incomplete='Наименование документа: План работ.\nОснование подготовки документа: поручение № 7.\nОтветственный исполнитель: Иванов Александр.\nСрок выполнения: не указан.\n';
  const complete=incomplete.replace('не указан','15 декабря 2026 года');
  async function upload(content,message,name){
    await page.locator('.detail-header [data-action=upload]').click();
    await page.locator('#version-file').setInputFiles({name,mimeType:'text/plain',buffer:Buffer.from(content)});
    await page.locator('#version-message').fill(message);
    await page.getByRole('button',{name:'Загрузить и проверить',exact:true}).click();
    await page.locator('.modal').waitFor({state:'hidden'});
    // The real local model runs here; this is not a mocked report.
    await page.locator('.check-item').first().waitFor({timeout:200000});
  }
  await upload(incomplete,'Первая редакция','plan-v1.txt');
  assert(await page.getByText('Не заполнено',{exact:true}).count()>0);
  await page.screenshot({path:'test-results/02-ai-report.png',fullPage:true});
  stage('real upload, local AI finding and report');
  await page.locator('[data-tab=versions]').click();
  await page.locator('#document-text').waitFor();
  const downloadEvent=page.waitForEvent('download');await page.getByRole('link',{name:'Скачать',exact:true}).click();
  const download=await downloadEvent;assert.equal(download.suggestedFilename(),'plan-v1.txt');
  await upload(complete,'Указан конкретный срок','plan-v2.txt');
  assert.equal(await page.locator('.check-item .chip.met').count(),4);
  await page.locator('[data-tab=versions]').click();
  assert.equal(await page.locator('.version-item').count(),2);
  await page.locator('[data-action=diff]').click();await page.locator('.diff .added').first().waitFor();
  assert((await page.locator('.diff').textContent()).includes('15 декабря'));
  await page.getByRole('button',{name:'Закрыть окно',exact:true}).click();
  await page.locator('.version-item').last().click();
  assert((await page.locator('#document-text').textContent()).includes('не указан'));
  await page.locator('#document-text').evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);});
  await page.locator('[data-action=comment-selection]').click();
  await page.locator('#comment-text').fill('Уточнить срок и подтвердить исправление в новой редакции');
  await page.getByRole('button',{name:'Добавить замечание',exact:true}).last().click();
  await page.locator('.modal').waitFor({state:'hidden'});
  await page.locator('.comment').waitFor();
  assert((await page.locator('.comment').textContent()).includes('v1'));
  stage('second version, original download, diff and anchored remark');

  await page.locator('#demo-user').selectOption('author');await page.locator('.user-picker .avatar').filter({hasText:'АИ'}).waitFor();
  await page.getByRole('heading',{name:'Все документы',exact:true}).waitFor();
  await page.locator(`[data-open="${documentId}"]`).first().click();await page.locator('[data-tab=comments]').click();
  assert.equal(await page.getByRole('button',{name:'Подтвердить устранение',exact:true}).count(),0);
  await page.locator('.reply-form input').fill('Исправлено во второй версии');await page.locator('.reply-form button').click();
  await page.getByText('Исправлено во второй версии',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Исправлено',exact:true}).click();await page.getByText('Исправлено · на проверке',{exact:true}).waitFor();
  await page.locator('#demo-user').selectOption('curator');await page.locator('.user-picker .avatar').filter({hasText:'ЕК'}).waitFor();
  await page.getByRole('heading',{name:'Все документы',exact:true}).waitFor();await page.locator(`[data-open="${documentId}"]`).first().click();
  await page.locator('[data-action=status]').click();await page.locator('#new-status').selectOption('approved');await page.getByRole('button',{name:'Сохранить статус',exact:true}).click();
  await page.locator('.modal .error-text').waitFor();assert((await page.locator('.modal .error-text').textContent()).includes('обязательных замечаний'));
  await page.getByRole('button',{name:'Закрыть окно',exact:true}).click();await page.locator('[data-tab=comments]').click();
  await page.getByRole('button',{name:'Подтвердить устранение',exact:true}).click();await page.getByText('Закрыто куратором',{exact:true}).waitFor();
  await page.locator('[data-action=status]').click();await page.locator('#new-status').selectOption('approved');await page.getByRole('button',{name:'Сохранить статус',exact:true}).click();
  await page.locator('.modal').waitFor({state:'hidden'});await page.locator('.detail-meta .chip.approved').waitFor();
  await page.locator('[data-tab=versions]').click();await page.locator('#toast').waitFor({state:'hidden'});await page.screenshot({path:'test-results/03-versions.png',fullPage:true});
  stage('author reply, independent closure and approval gate');

  await page.locator('[data-tab=links]').click();await page.locator('[data-action=add-link]').click();
  await page.locator('#link-search').fill('ДЕМО-101');await page.locator('[data-link-target=demo-1]').click();
  await page.locator('.detail-main [data-open=demo-1]').waitFor();
  await page.locator('[data-nav=kanban]').click();
  const approvedCard=page.locator(`.lane[data-status=approved] [data-drag="${documentId}"]`);await approvedCard.waitFor();
  await page.screenshot({path:'test-results/04-kanban.png',fullPage:true});
  const dataTransfer=await page.evaluateHandle(()=>new DataTransfer());
  await approvedCard.dispatchEvent('dragstart',{dataTransfer});await page.locator('.lane[data-status=done]').dispatchEvent('drop',{dataTransfer});
  await page.locator('#new-status').waitFor();assert.equal(await page.locator('#new-status').inputValue(),'done');
  await page.getByRole('button',{name:'Сохранить статус',exact:true}).click();await page.locator('.modal').waitFor({state:'hidden'});
  await page.locator(`.lane[data-status=done] [data-drag="${documentId}"]`).waitFor();
  stage('linked documents and persisted kanban movement');

  await page.locator('[data-nav=notifications]').click();assert(await page.locator('.notification.unread').count()>0);
  await page.getByRole('button',{name:'Прочитать все',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.notification.unread').length===0);
  await page.getByRole('button',{name:'Настроить',exact:true}).click();await page.locator('input[name=deadline]').uncheck();await page.getByRole('button',{name:'Сохранить настройки',exact:true}).click();await page.locator('.modal').waitFor({state:'hidden'});
  await page.reload();await page.locator('.notification').first().waitFor();
  await page.getByRole('button',{name:'Настроить',exact:true}).click();assert.equal(await page.locator('input[name=deadline]').isChecked(),false);await page.getByRole('button',{name:'Закрыть окно',exact:true}).click();
  stage('notifications, read state and saved preferences');

  await page.locator('[data-nav=rules]').click();await page.locator('input[name=rule]').first().fill('Указано полное наименование документа');await page.getByRole('button',{name:'Сохранить правила',exact:true}).click();
  await page.getByText(/Редакция 2 ·/).waitFor();
  await page.locator('#toast').waitFor({state:'hidden'});await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'test-results/05-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Открыть навигацию',exact:true}).click();
  await page.locator('[data-nav=kanban]').click();await page.locator('.board').waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'test-results/06-mobile-kanban.png',fullPage:true});
  stage('editable rules and mobile navigation without page overflow');
  assert.deepEqual(errors,[],'browser JavaScript errors');
  console.log('PASS: complete browser workflow, local AI, roles, versioning, notifications, kanban, 390px layout.');
} finally {
  if(browser)await browser.close();
  const stopped=new Promise(resolve=>service.once('exit',resolve));service.kill('SIGTERM');await stopped;
  await rm(temp,{recursive:true,force:true});
}
