"""Explicit live check of installed local Ollama, using synthetic documents only."""
import base64
import http.cookiejar
import json
from pathlib import Path
import tempfile
import threading
import time
import urllib.request

import server


def main():
    with tempfile.TemporaryDirectory() as tmp:
        service=server.create_server(Path(tmp)/'live.db',port=0)
        thread=threading.Thread(target=service.serve_forever,daemon=True);thread.start()
        client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        def call(path,data=None):
            req=urllib.request.Request(f'http://127.0.0.1:{service.server_port}'+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'})
            with client.open(req,timeout=10) as r:return json.load(r)
        try:
            for label,text,parent in [
              ('missing','Наименование документа: План работ.\nОснование подготовки документа: поручение № 7.\nОтветственный исполнитель: Иванов Александр.\nСрок выполнения: не указан.\n','demo-v1'),
              ('complete','Наименование документа: План работ.\nОснование подготовки документа: поручение № 7.\nОтветственный исполнитель: Иванов Александр.\nСрок выполнения: 15 ноября 2026 года.\n',None),
            ]:
                if parent is None:parent=call('/api/documents/demo-1')['versions'][0]['id']
                started=time.monotonic()
                v=call('/api/documents/demo-1/versions',{'filename':label+'.txt','content':base64.b64encode(text.encode()).decode(),'message':'Синтетический эталон '+label,'parent_id':parent})
                while time.monotonic()-started<200:
                    d=call('/api/documents/demo-1')
                    check=next(c for c in d['checks'] if c['id']==v['check_id'])
                    if check['status'] in ['done','error']:break
                    time.sleep(1)
                assert check['status']=='done',check.get('error','timeout')
                statuses=[x['status'] for x in check['result']['items']]
                if label=='missing':assert statuses[3] in ['missing','uncertain'],statuses
                else:assert statuses==['met']*4,statuses
                assert any(n['version_id']==v['id'] and n['category']=='ai' for n in call('/api/bootstrap')['notifications'])
                print(json.dumps({'case':label,'model':check['model'],'seconds':round(time.monotonic()-started,1),'statuses':statuses,'notification':True},ensure_ascii=False),flush=True)
        finally:
            service.workspace.stop.set();service.workspace.wake.set();service.shutdown();service.server_close();thread.join()


if __name__=='__main__':main()
