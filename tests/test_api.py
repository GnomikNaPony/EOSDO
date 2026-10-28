"""HTTP-level contracts against disposable databases and synthetic files."""
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import http.cookiejar
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

import server


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.path=Path(self.tmp.name)/"test.db"
        self.http=server.create_server(self.path,port=0,worker=False)
        self.thread=threading.Thread(target=self.http.serve_forever,daemon=True)
        self.thread.start()
        self.url=f"http://127.0.0.1:{self.http.server_port}"
        self.clients={name:urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())) for name in ["curator","author","other"]}
        for name in self.clients:
            self.call("/api/demo-session",{"user_id":name},user=name)

    def tearDown(self):
        self.http.workspace.stop.set()
        self.http.shutdown()
        self.http.server_close()
        self.thread.join()
        self.tmp.cleanup()

    def call(self,path,data=None,user="curator",method=None,expected=200,headers=None):
        raw=None if data is None else json.dumps(data).encode()
        req=urllib.request.Request(self.url+path,data=raw,method=method or ("POST" if data is not None else "GET"),headers={"Content-Type":"application/json",**(headers or {})})
        try:
            response=self.clients[user].open(req,timeout=10)
        except urllib.error.HTTPError as exc:
            response=exc
        self.assertEqual(response.code,expected,response.read().decode() if response.code!=expected else "")
        body=response.read()
        return json.loads(body) if "json" in response.headers.get("Content-Type","") else body

    def upload(self,content=b"Document version 2",parent="demo-v1",expected=200,user="author"):
        return self.call("/api/documents/demo-1/versions",{"filename":"test.txt","content":base64.b64encode(content).decode(),"message":"Changed content","parent_id":parent},user=user,expected=expected)

    def test_original_versions_download_and_restart(self):
        original=self.call("/api/versions/demo-v1/file",user="author")
        content="Наименование: новая редакция\nТочный исходный файл.\n".encode()
        uploaded=self.upload(content)
        detail=self.call("/api/documents/demo-1")
        self.assertEqual([v["number"] for v in detail["versions"]],[2,1])
        v=detail["versions"][0]
        self.assertEqual(v["sha256"],hashlib.sha256(content).hexdigest())
        self.assertEqual(v["parent_id"],"demo-v1")
        self.assertEqual(self.call(f'/api/versions/{uploaded["id"]}/file'),content)
        self.assertEqual(self.call('/api/versions/demo-v1/file'),original)
        reopened=server.Workspace(self.path)
        with reopened.db() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM versions WHERE document_id='demo-1'").fetchone()[0],2)
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE versions SET content=? WHERE id=?",(b"overwrite",v["id"]))

    def test_duplicate_and_stale_parent_do_not_create_versions(self):
        self.upload()
        self.upload(parent="demo-v1",expected=409)
        d=self.call('/api/documents/demo-1')
        self.upload(parent=d['versions'][0]['id'],expected=409)
        self.assertEqual(len(self.call('/api/documents/demo-1')['versions']),2)

    def test_concurrent_uploads_have_one_winner(self):
        # Separate clients, same parent; BEGIN IMMEDIATE serializes the comparison and insert.
        def upload(content):
            req=urllib.request.Request(self.url+'/api/documents/demo-1/versions',data=json.dumps({'filename':'parallel.txt','content':base64.b64encode(content).decode(),'message':'parallel','parent_id':'demo-v1'}).encode(),headers={'Content-Type':'application/json'})
            try:
                with urllib.request.urlopen(req) as r:return r.status
            except urllib.error.HTTPError as exc:return exc.code
        with ThreadPoolExecutor(2) as pool:
            statuses=list(pool.map(upload,[b'first',b'second']))
        self.assertEqual(sorted(statuses),[200,409])

    def test_roles_and_notifications_are_scoped(self):
        self.call('/api/documents/demo-1',user='other',expected=403)
        self.call('/api/versions/demo-v1/file',user='other',expected=403)
        self.call('/api/documents/demo-1/status',{'status':'review','version_id':'demo-v1'},user='author',expected=403)
        self.call('/api/rules',{'items':['Rule'],'revision':1},user='author',expected=403)
        ns=self.call('/api/bootstrap',user='author')['notifications']
        self.assertTrue(all(n['user_id']=='author' for n in ns))
        foreign=self.call('/api/bootstrap',user='curator')['notifications'][0]['id']
        self.call('/api/notifications/read',{'id':foreign},user='author')
        self.assertEqual(self.call('/api/bootstrap',user='curator')['notifications'][0]['read'],0)

    def test_personal_favorites_and_link_access(self):
        self.call('/api/documents/demo-1/favorite',{},user='author')
        curator_doc=next(d for d in self.call('/api/bootstrap')['documents'] if d['id']=='demo-1')
        author_doc=next(d for d in self.call('/api/bootstrap',user='author')['documents'] if d['id']=='demo-1')
        self.assertTrue(curator_doc['favorite'])
        self.assertFalse(author_doc['favorite'])
        self.call('/api/documents/demo-1/links',{'target_id':'demo-8'})
        self.assertEqual(len(self.call('/api/documents/demo-1')['links']),1)
        self.assertEqual(self.call('/api/documents/demo-1',user='author')['links'],[])

    def test_remark_version_reply_and_independent_closure(self):
        c=self.call('/api/comments',{'document_id':'demo-1','version_id':'demo-v1','text':'Укажите срок','anchor':'Предлагается подготовить материалы','severity':'blocking'})['id']
        self.call(f'/api/comments/{c}/reply',{'text':'Будет исправлено'},user='author')
        self.call(f'/api/comments/{c}/status',{'status':'closed','version_id':'demo-v1'},user='author',expected=403)
        self.call(f'/api/comments/{c}/status',{'status':'addressed','version_id':'demo-v1'},user='author')
        self.call(f'/api/comments/{c}/status',{'status':'closed','version_id':'demo-v1'})
        new=self.upload()['id']
        detail=self.call('/api/documents/demo-1')
        comment=next(x for x in detail['comments'] if x['id']==c)
        self.assertEqual(comment['version_id'],'demo-v1')
        self.assertEqual(comment['replies'][0]['text'],'Будет исправлено')
        self.call(f'/api/comments/{c}/status',{'status':'open','version_id':'demo-v1'},expected=409)
        self.call(f'/api/comments/{c}/status',{'status':'open','version_id':new})

    def test_comment_anchor_must_exist(self):
        self.call('/api/comments',{'document_id':'demo-1','version_id':'demo-v1','text':'Remark','anchor':'made-up text'},expected=409)
        self.call('/api/comments',{'document_id':'demo-1','version_id':'demo-v2','text':'Wrong document'},expected=400)

    def test_approval_requires_file_closed_remarks_and_review(self):
        self.call('/api/documents/demo-1/status',{'status':'approved','version_id':'demo-v1','manual_review':True},expected=409)
        self.call('/api/comments/demo-c0/status',{'status':'closed','version_id':'demo-v1'})
        self.call('/api/documents/demo-1/status',{'status':'approved','version_id':'demo-v1'},expected=409)
        self.call('/api/documents/demo-1/status',{'status':'approved','version_id':'demo-v1','manual_review':True})
        self.call('/api/documents/demo-1/status',{'status':'done','version_id':'demo-v1','manual_review':True})
        self.upload()
        d=self.call('/api/documents/demo-1')
        self.assertEqual(d['status'],'ai')
        self.assertIsNone(d['approved_version'])

    def test_rules_revision_invalidation_and_snapshot(self):
        first=self.upload()
        self.call('/api/rules',{'items':['Указан ответственный'],'revision':1,'demo':False})
        self.call('/api/rules',{'items':['Other'],'revision':1},expected=409)
        d=self.call('/api/documents/demo-1')
        self.assertEqual(d['checks'][0]['rules_revision'],1)
        self.assertEqual(len(d['checks'][0]['rules']['items']),4)
        self.assertEqual(self.call('/api/documents/demo-5')['status'],'review')
        self.call(f'/api/versions/{first["id"]}/check',{},expected=409)

    def test_validation_and_atomicity(self):
        self.call('/api/documents',{'title':'','type':'Отчёт','due':'2026-11-01'},expected=400)
        self.call('/api/documents',{'title':'Test','type':'Отчёт','due':'2026-02-30'},expected=400)
        self.call('/api/documents',[],expected=400)
        self.call('/api/rules',{'items':[],'revision':1},expected=400)
        self.call('/api/documents/demo-1/versions',{'filename':'evil.exe','content':'AA==','message':'test','parent_id':'demo-v1'},expected=400)
        self.upload(b'',expected=413)
        self.assertEqual(len(self.call('/api/documents/demo-1')['versions']),1)
        self.call('/api/preferences',{},headers={'Origin':'https://foreign.example'},expected=403)

    def test_actual_20mb_upload_boundary(self):
        accepted=self.upload(b'x'*server.MAX_FILE)
        self.upload(b'y'*(server.MAX_FILE+1),parent=accepted['id'],expected=413)
        with self.http.workspace.db() as db:
            self.assertEqual(db.execute("SELECT size FROM versions WHERE id=?",(accepted['id'],)).fetchone()[0],20*1024*1024)
            self.assertEqual(db.execute("SELECT count(*) FROM versions WHERE document_id='demo-1'").fetchone()[0],2)

    def test_preferences_and_reminder_deduplication(self):
        self.call('/api/preferences',{'upload':False,'deadline':False})
        self.upload()
        ns=self.call('/api/bootstrap')['notifications']
        self.assertFalse(any(n['category']=='upload' for n in ns))
        with self.http.workspace.db() as db:
            self.http.workspace.reminders(db)
            n=db.execute("SELECT count(*) FROM notifications").fetchone()[0]
            self.http.workspace.reminders(db)
            self.assertEqual(db.execute("SELECT count(*) FROM notifications").fetchone()[0],n)

    def test_worker_failure_is_visible_and_not_success(self):
        v=self.upload()['id']
        def fail(*args): raise urllib.error.URLError('Synthetic offline model')
        self.http.workspace.ask_model=fail
        self.run_worker_once()
        d=self.call('/api/documents/demo-1')
        self.assertEqual(d['checks'][0]['status'],'error')
        self.assertIn('Ollama',d['checks'][0]['error'])
        self.assertIsNone(d['checks'][0]['result'])
        self.assertEqual(self.call(f'/api/versions/{v}/file'),b'Document version 2')
        self.assertTrue(any(n['category']=='ai' for n in self.call('/api/bootstrap')['notifications']))

    def run_worker_once(self):
        original_notify=self.http.workspace.notify
        def stop_after_result(*args,**kwargs):
            result=original_notify(*args,**kwargs)
            if args[4]=='ai':self.http.workspace.stop.set()
            return result
        self.http.workspace.notify=stop_after_result
        self.http.workspace.worker()

    def test_old_check_cannot_move_new_version_or_approval(self):
        v1=self.upload()['id']
        v2=self.upload(b'New current content',parent=v1)['id']
        with self.http.workspace.db() as db:
            db.execute("UPDATE documents SET status='revision' WHERE id='demo-1'")
        self.http.workspace.ask_model=lambda text,rules:{'items':[{'index':0,'rule':'fixture','status':'missing','reason':'fixture','quote':''}]}
        self.run_worker_once()
        d=self.call('/api/documents/demo-1')
        self.assertEqual(d['status'],'revision')
        self.assertEqual(d['versions'][0]['id'],v2)
        self.assertEqual(d['checks'][0]['status'],'queued')


    def template(self):
        # Dialogue example: recurring memo, correspondence case, ordered approval/signing.
        return {'format':'eosdo-personal-template','version':1,'name':'Моя служебная записка','config':{
            'type':'Служебная записка','title':'О предоставлении материалов','summary':'Подготовить перечень материалов',
            'priority':'high','due_days':7,'case_id':'demo-correspondence','recipients':['curator','other'],
            'route':[{'kind':'review','user_id':'other','days':2},{'kind':'sign','user_id':'curator','days':1}]}}

    def test_personal_templates_roundtrip_acl_and_revision(self):
        payload=self.template()
        template_id=self.call('/api/templates',payload,user='author')['id']
        self.assertEqual(self.call('/api/templates/'+template_id,user='author'),payload)
        for user in ['curator','other']:
            self.assertEqual(self.call('/api/bootstrap',user=user)['templates'],[])
            self.call('/api/templates/'+template_id,user=user,expected=404)
            self.call('/api/templates',{**payload,'id':template_id,'revision':1},user=user,expected=404)
            self.call('/api/templates/'+template_id+'/delete',{'revision':1},user=user,expected=404)
        self.call('/api/templates',{**payload,'id':template_id,'revision':1,'name':'Изменено'},user='author')
        self.call('/api/templates',{**payload,'id':template_id,'revision':1},user='author',expected=409)
        self.call('/api/templates/'+template_id+'/delete',{'revision':1},user='author',expected=409)
        self.assertEqual(self.call('/api/templates/'+template_id,user='author')['name'],'Изменено')
        with server.Workspace(self.path).db() as db:
            self.assertEqual(db.execute('SELECT revision FROM personal_templates WHERE id=?',(template_id,)).fetchone()[0],2)
        self.call('/api/templates/'+template_id+'/delete',{'revision':2},user='author')
        self.assertEqual(self.call('/api/bootstrap',user='author')['templates'],[])

    def test_template_validation_and_import_whitelist(self):
        payload=self.template()
        for config in [{'case_id':'real-unknown'},{'recipients':['ghost']},{'recipients':['author','author']},
                       {'due_days':True},{'due_days':0},{'due_days':366},{'due_days':1.5},
                       {'route':[{'kind':'review','user_id':'curator','days':0}]},
                       {'route':payload['config']['route'][::-1]}, {'route':[payload['config']['route'][0]]*21}]:
            self.call('/api/templates',{**payload,'config':{**payload['config'],**config}},expected=400)
        self.call('/api/templates',{**payload,'version':2},expected=400)
        self.call('/api/templates',{**payload,'config':None},expected=400)
        self.call('/api/templates',{**payload,'name':''},expected=400)
        self.assertEqual(self.call('/api/bootstrap')['templates'],[])
        payload['config'].update(owner_id='other',status='approved',approved_version='demo-v1',content='not a file')
        template_id=self.call('/api/templates',payload)['id']
        exported=self.call('/api/templates/'+template_id)
        for key in ['owner_id','status','approved_version','content']:
            self.assertNotIn(key,exported['config'])
        copy_id=self.call('/api/templates',exported,user='other')['id']
        self.assertNotEqual(template_id,copy_id)
        self.assertEqual(self.call('/api/templates/'+copy_id,user='other'),exported)

    def test_profile_persistence_atomicity_and_multitab_conflict(self):
        profile=self.template()['config']
        doc=self.call('/api/documents',{**profile,'due':'2026-12-15','owner_id':'author'},user='author')['id']
        first=self.call('/api/documents/'+doc,user='author')
        for key in ['case_id','recipients','route']: self.assertEqual(first[key],profile[key])
        self.assertEqual(first['status'],'new')
        self.assertEqual(first['versions'],[])
        update={**profile,'title':'Сохранено в первой вкладке','due':'2026-12-16','profile_revision':first['profile_revision']}
        self.call('/api/documents/'+doc,{**profile,'due':'2026-12-16'},user='author',method='PATCH',expected=409)
        self.call('/api/documents/'+doc,update,user='author',method='PATCH')
        self.call('/api/documents/'+doc,{**update,'title':'Устаревший текст'},user='author',method='PATCH',expected=409)
        self.assertEqual(self.call('/api/documents/'+doc,user='author')['title'],'Сохранено в первой вкладке')
        count=len(self.call('/api/bootstrap')['documents'])
        self.call('/api/documents',{**profile,'due':'2026-12-15','case_id':'unknown'},expected=400)
        self.assertEqual(len(self.call('/api/bootstrap')['documents']),count)
        self.call('/api/documents/'+doc,user='other',expected=403) # Addressing is not permission.
        with server.Workspace(self.path).db() as db:
            saved=server.Workspace(self.path).detail(db,doc,server.USER_MAP['author'])
            self.assertEqual(saved['route'],profile['route'])
            self.assertEqual(saved['profile_revision'],2)

    def test_old_documents_get_empty_profile_without_changes(self):
        before=self.call('/api/documents/demo-1')
        self.assertEqual(before['profile_revision'],0)
        self.assertEqual(before['case_id'],'')
        with self.http.workspace.db() as db:
            baseline=[tuple(x) for x in db.execute('SELECT id,sha256,content FROM versions ORDER BY id')]
        for _ in range(2): server.Workspace(self.path)
        after=self.call('/api/documents/demo-1')
        self.assertEqual(before,after)
        with self.http.workspace.db() as db:
            self.assertEqual([tuple(x) for x in db.execute('SELECT id,sha256,content FROM versions ORDER BY id')],baseline)

    def test_template_capacity_and_inclusive_day_bounds(self):
        payload=self.template()
        payload['config']['due_days']=365
        payload['config']['route']=[{'kind':'review','user_id':'curator','days':1}]*20
        for n in range(50):self.call('/api/templates',{**payload,'name':f'Личный {n}'},user='author')
        self.call('/api/templates',payload,user='author',expected=400)
        self.assertEqual(len(self.call('/api/bootstrap',user='author')['templates']),50)
        self.assertEqual(len(self.call('/api/bootstrap',user='curator')['templates']),0)


class ExtractionTests(unittest.TestCase):
    def test_pdf_text_and_scanned_pdf(self):
        from pypdf import PdfWriter
        from pypdf.generic import NameObject, DictionaryObject, DecodedStreamObject
        writer=PdfWriter();page=writer.add_blank_page(width=300,height=300)
        blank=io.BytesIO();writer.write(blank)
        with self.assertRaisesRegex(ValueError,'текстового слоя'):
            server.extract_text('scan.pdf',blank.getvalue())
        font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
        page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):font})})
        content=DecodedStreamObject();content.set_data(b'BT /F1 12 Tf 10 100 Td (Document title: Test plan) Tj ET')
        page[NameObject('/Contents')]=writer._add_object(content)
        out=io.BytesIO();writer.write(out)
        self.assertIn('Document title: Test plan',server.extract_text('text.pdf',out.getvalue()))

    def test_docx_and_xlsx(self):
        from docx import Document
        from openpyxl import Workbook
        doc=Document();doc.add_paragraph('Ответственный: Иванов');doc.add_table(rows=1,cols=1).cell(0,0).text='Срок: 2026-11-01'
        stream=io.BytesIO();doc.save(stream)
        text=server.extract_text('sample.docx',stream.getvalue())
        self.assertIn('Ответственный: Иванов',text)
        self.assertIn('Срок: 2026-11-01',text)
        wb=Workbook();wb.active.append(['Наименование','План']);out=io.BytesIO();wb.save(out)
        self.assertIn('Наименование | План',server.extract_text('sample.xlsx',out.getvalue()))

    def test_empty_corrupt_and_large_text(self):
        for name,content in [('x.docx',b'not a zip'),('x.pdf',b'not a PDF'),('x.txt',b''),('x.txt',b'x'*(server.MAX_TEXT+1))]:
            with self.subTest(name=name),self.assertRaises(Exception):server.extract_text(name,content)
        self.assertEqual(server.extract_text('x.txt','Пример'.encode('cp1251')),'Пример')


class ModelContractTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.app=server.Workspace(Path(self.tmp.name)/'model.db',seed=False)

    def tearDown(self):self.tmp.cleanup()

    def response(self,items):
        return io.BytesIO(json.dumps({'message':{'content':json.dumps({'items':items})}}).encode())

    def test_unverified_quote_becomes_uncertain(self):
        response=self.response([{'index':0,'status':'met','reason':'Found','quote':'Invented citation'}])
        with patch('server.urllib.request.urlopen',return_value=response):
            result=self.app.ask_model('Actual source text',['A required field'])
        self.assertEqual(result['items'][0]['status'],'uncertain')
        self.assertEqual(result['items'][0]['quote'],'')

    def test_incomplete_report_and_context_overflow_are_not_success(self):
        with patch('server.urllib.request.urlopen',return_value=self.response([])):
            with self.assertRaisesRegex(ValueError,'неполный отчёт'):
                self.app.ask_model('Source',['A required field'])
        with patch('server.urllib.request.urlopen') as network:
            with self.assertRaisesRegex(ValueError,'контекста'):
                self.app.ask_model('я'*20000,['A required field'])
            network.assert_not_called()


if __name__=='__main__':unittest.main()
