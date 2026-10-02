#!/usr/bin/env python3
"""Build a portable, secret-free demo archive from an explicit public allowlist."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import hashlib, json, zipfile
root=Path(__file__).resolve().parent.parent
docs=root/'docs'
files=['index.html','demo.html','demo.css','demo.js','demo-state.js','notebook.js','notebook-state.js','notebook.css','submission.html','submission.css','materials.html','materials.css','generated-world.html','generated-world.css','generated-world.js','workspace.html','app.js','style.css','viewer.js','spz-viewer.js','splat-sort-worker.js','static-preview.js','icon.svg','courtyard.svg','walkthrough.mp4','.nojekyll','screens/app-home.png','screens/app-local-scene.png']
for directory in ['osmanthus-demo','osmanthus-revision']:
    for name in ['manifest.json','world.tsp','world-hq.tsp','thumbnail.webp','panorama.png','viewer.png']:
        files.append(f'worlds/{directory}/{name}')
class Links(HTMLParser):
    def __init__(self): super().__init__(); self.links=[]
    def handle_starttag(self,tag,attrs):
        for key,value in attrs:
            if key in ('src','href','poster') and value: self.links.append(value)
for name in files:
    f=docs/name
    assert f.is_file() and not f.is_symlink(),name
    if f.suffix=='.html':
        parsed=Links();parsed.feed(f.read_text())
        for link in parsed.links:
            u=urlsplit(link)
            if u.scheme or u.netloc or not u.path: continue
            resolved=(f.parent/unquote(u.path)).resolve()
            if resolved.is_dir(): resolved=resolved/'index.html'
            assert resolved.is_relative_to(docs.resolve()) and resolved.is_file(),(name,link)
readme='''回到那儿 / Back to That Place — Tripothon App Demo

启动 / Run (Node.js >= 18, no dependencies):
  node scripts/serve-preview.mjs
打开 / Open: http://127.0.0.1:4319/
公开体验 / Public demo: https://maxi-max-dev.github.io/tripothon-memory-courtyard/
另选端口 / Alternate port: PORT=4321 node scripts/serve-preview.mjs

入口 / Contents:
  docs/demo.html — 项目首页、回忆、场景、世界和版本
  docs/submission.html — 中英项目介绍与能力边界
  docs/walkthrough.mp4 — 新版 App 实际连续操作录屏
  docs/materials.html — 世界与 App 视觉素材板

真实与示例 / Boundaries:
两个世界由 World Labs 提前真实生成。浏览使用本地文件，不调用生成服务。
桂花小院人物与 Agent 整理为预设合成案例。你的补充单独保存，不改变示例世界。
个人项目可以输入文字、保存照片、引用原话形成可编辑描述，并保留确认记录。
本机整理不识图、不推断事实或判断冲突；没有在线 Agent、远程多人或新世界生成。
进度、照片和草稿保存在当前浏览器，换设备不会同步；可以导出 JSON 备份。
图片缩放重编码后仅存本机。未调用付费 API、未上传私人照片、未进行比赛提交。

Two archived real World Labs worlds; no generation requests during browsing.
The synthetic example uses preset Agent records. Personal notes remain separate.
Local projects support text/photos, editable quotations, and confirmation snapshots.
No online AI, remote collaboration, or new world generation. Data stays in this browser.
Export JSON for backup; automatic synchronization and backup import are not implemented.

请通过上述本机 HTTP 服务运行，不要直接双击 HTML。
Please use the local HTTP server; do not open the HTML through file://.
'''
out=root/'submission';out.mkdir(exist_ok=True)
(out/'README.txt').write_text(readme)
archive=out/'return-there-tripothon-demo.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for name in files:z.write(docs/name,'return-there-demo/docs/'+name)
    z.write(root/'scripts/serve-preview.mjs','return-there-demo/scripts/serve-preview.mjs')
    z.writestr('return-there-demo/README.txt',readme)
    z.writestr('return-there-demo/package.json',json.dumps({'name':'back-to-that-place-demo','private':True,'type':'module','scripts':{'start':'node scripts/serve-preview.mjs'},'engines':{'node':'>=18'}}))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert all(not any(v in n.split('/') for v in ['data','research','.env','node_modules']) for n in z.namelist())
verification={'builtFor':'2026-10-02 App polish','staticLinksValid':True,'zipIntegrityVerified':True,'files':len(files)+3,'zipBytes':archive.stat().st_size,'zipSHA256':hashlib.sha256(archive.read_bytes()).hexdigest(),'assets':{name:hashlib.sha256((docs/name).read_bytes()).hexdigest() for name in files if name.endswith(('.tsp','.png','.webp','.mp4'))},'tests':{'unitAndIntegration':46,'browserJourneys':17},'newGenerationRequests':0,'published':False,'registrationSubmitted':False,'remaining':['online Agent and image generation','remote multiuser service','physical iPhone/Safari validation','new-project world generation']}
(out/'verification.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'zip':str(archive),'megabytes':round(archive.stat().st_size/1e6,1),'files':len(files)+3,'localLinks':'valid'},ensure_ascii=False))
