import argparse,json,os,shutil,subprocess,depthpack
from costume_text import gen2
import hashlib,re,html as H
from concurrent.futures import ProcessPoolExecutor
from PIL import Image
# 素材目录：默认 ./assets-raw，可用环境变量 POSEWEAR_RAW 指定（见 scripts/fetch-assets.py）
R=os.environ.get('POSEWEAR_RAW','assets-raw'); D='dist'
# 分离部署：设 POSEWEAR_ASSET_HOST 后，缩略图与原图输出到 dist-assets（独立 Pages 站），主站文件数压回免费版上限内；不设则单站构建，行为不变
AHOST=os.environ.get('POSEWEAR_ASSET_HOST','').rstrip('/'); AD='dist-assets'; AROOT=AD if AHOST else D
args = argparse.ArgumentParser(description="Build the PoseWear static site")
args.add_argument('--allow-partial', action='store_true', help="allow missing extension archives for local development")
options = args.parse_args()
ARCHIVES = [f'{kind}/data.json' for kind in ('expression','dynasty','scene','light','prop','furn')] + ['charadb/hair.json','charadb/outfits.json']
missing = []
for archive in ARCHIVES:
  path = os.path.join(R, archive)
  if not os.path.isfile(path):
    missing.append(archive)
    continue
  with open(path) as source:
    items = json.load(source)
  if not isinstance(items, list) or not items:
    missing.append(archive)
if missing and not options.allow_partial:
  args.error("Missing or empty extension archives: " + ", ".join(missing) + ". See AGENTS.md or use --allow-partial for local development.")
if AHOST: os.makedirs(AD,exist_ok=True)
LINE={'全身1人・セクシー系':('全身·性感','full body, solo, sexy'),'全身1人・標準系':('全身·标准','full body, solo'),'上半身1人':('上半身','upper body, solo'),'2人絡み':('双人互动','two people, couple')}
CAT={'寝そべり':'躺卧','セクシー・露骨寄り系':'性感·大胆','立ち':'站姿','座り':'坐姿','かわいい系':'可爱','胸寄せ・谷間強調系':'挤胸·乳沟','膝立ち・四つん這い':'跪立·趴姿','特殊':'特殊','正常位':'正面位','膝立ち':'跪立','横座り・女の子座り':'侧坐·鸭子坐','後背位':'后入位','背面座位':'背面坐位','しゃがみ':'蹲姿','前かがみ':'前倾','顔寄せ系':'贴脸','騎乗位':'骑乘位','立位':'立位','立位密着':'立位贴身','のけぞり・反り':'后仰','ひねり':'扭身','側位':'侧位','座位':'坐位','対面座位':'对面坐位','座位密着':'坐位贴身','密着':'贴身'}
ANG={'正面':('正面','front view'),'上から':('俯拍','high angle, from above'),'下から':('仰拍','low angle, from below'),'横':('侧面','side view'),'斜め':('斜侧','three-quarter view')}
CC={'春':('春季','spring'),'夏':('夏季','summer'),'秋':('秋季','autumn'),'冬':('冬季','winter'),'ランジェリー':('内衣','lingerie'),'パーティ':('派对礼服','party'),'水着':('泳装','swimsuit'),'セクシー':('性感','sexy')}
W=dict(l.split(':') for l in open('words.txt').read().split())
TR={l.split('|')[0]:l.split('|')[1:] for l in open('tr_pose.txt').read().strip().split('\n')}
pd=json.load(open(f'{R}/pose/data.json'))['D']; cd=json.load(open(f'{R}/costume/data.json'))['D']; ad=json.load(open(f'{R}/anime/data.json'))['D']
poses={}
for d in pd:
  k=d['id'].rsplit('_',1)[0]; zh,en=TR[d['ポーズ名']]
  p=poses.setdefault(k,{'id':k,'no':d['ポーズ番号'],'line':LINE[d['系統']][0],'cat':CAT[d['分類']],'ja':d['ポーズ名'],'zh':zh,'en':en,'lineEn':LINE[d['系統']][1],'angles':[]})
  a=ANG[d['アングル']]; p['angles'].append({'zh':a[0],'en':a[1],'t':'p/t/'+d['id']+'.webp','i':'p/i/'+d['id']+'.webp','o':'o/p/'+d['id']+'.png','_src':d})
cos=[{'id':d['id'],'cat':CC[d['カテゴリ']][0],'catEn':CC[d['カテゴリ']][1],'kw':d['キーワード'],**dict(zip(('zh','en','ti'),gen2(d['キーワード'],CC[d['カテゴリ']][1],d['id']))),'t':'c/t/'+os.path.basename(d['サムネ']),'m':'c/m/'+d['id']+'.webp','i':'c/i/'+os.path.basename(d['画像']),'o':'o/c/'+d['id']+'.png','_src':d} for d in cd]
acs=[{'id':d['id'],'cat':CC[d['カテゴリ']][0],'catEn':CC[d['カテゴリ']][1],'kw':d['キーワード'],**dict(zip(('zh','en','ti'),gen2(d['キーワード'],CC[d['カテゴリ']][1],d['id']))),'t':'a/t/'+os.path.basename(d['サムネ']),'m':'a/m/'+d['id']+'.webp','i':'a/i/'+os.path.basename(d['画像']),'o':'o/a/'+d['id']+'.png','_src':d} for d in ad]
# 双人 分类人工复核（看图）
FIX={'pair60_P031':'坐位','pair60_P053':'立位贴身','pair60_P055':'侧位','pair60_P058':'贴脸'}
for k,v in FIX.items(): poses[k]['cat']=v
ADULT_LINES={'双人互动','全身·性感'};ADULT_CATS={'挤胸·乳沟','性感·大胆'};ADULT_COS={'内衣','性感'}
for p in poses.values():
  if p['line'] in ADULT_LINES or p['cat'] in ADULT_CATS: p['a']=1
for c in cos:
  if c['cat'] in ADULT_COS: c['a']=1
for c in acs:
  if c['cat'] in ADULT_COS: c['a']=1
os.makedirs(D,exist_ok=True)
partial_marker = os.path.join(D, '.posewear-partial')
if missing:
  with open(partial_marker, 'w') as marker: marker.write('\n'.join(missing))
elif os.path.exists(partial_marker):
  os.remove(partial_marker)
for f in os.listdir('src'): shutil.copy('src/'+f,D)
J=lambda o:json.dumps(o,ensure_ascii=False,separators=(',',':'))
SRC={}
for p in poses.values():
  for a in p['angles']: SRC[a['i']]=a.pop('_src')
for c in cos: SRC[c['id']]=c.pop('_src')
for c in acs: SRC['anime:'+c['id']]=c.pop('_src')
# 安全内容排在前面（默认落地页无露骨内容）
PL=sorted(poses.values(),key=lambda p:p.get('a',0))
# CharaDB 服装 440 条并入动画服装（元数据自存、图片热链原站，见 scripts/prep-modules.py）
_cdb=f'{R}/charadb/outfits.json'
if os.path.exists(_cdb):
  for d in json.load(open(_cdb)):
    it={'id':d['id'],'cat':d['cat'],'catEn':d['catEn'],'kw':d['kw'],'zh':d['name']+'，'+'、'.join(d['tagsZh'][1:])+'。','en':d['kw'],'ti':d['name'],'t':d['t'],'m':d['m'],'i':d['i'],'o':'','ext':1}
    if d.get('sens'): it['a']=1
    acs.append(it)
PJ=J(PL);CJ=J(cos);AJ=J(acs)

# ---------- 人像库（AI Portrait Gallery，CC0，@agi_aibusi）----------
rt=open(f'{R}/portrait/images.js').read();rd=json.loads(rt[rt.index('['):rt.rindex(']')+1])
rk=open(f'{R}/portrait/ranking.js').read();RK=json.loads(rk[rk.index('{'):rk.rindex('}')+1])
TRP={l.split('|')[0]:l.split('|')[1:] for l in open('tr_portrait.txt').read().strip().split('\n')}
LEN={'ショート':('短发','short hair'),'ミディアム':('中长发','medium-length hair'),'セミロング':('半长发','shoulder-length hair'),'ロング':('长发','long hair')}
SEC={'face':('正脸','front-facing head-and-shoulders portrait, plain light grey background, soft even lighting'),'styling':('生活照','casual selfie-style lifestyle photo, indoor natural light')}
RANK={x:i+1 for i,x in enumerate(RK['top']['総合'])}
RANKC={}
for c,L in RK['top'].items():
  if c!='総合':
    for i,x in enumerate(L):RANKC[x]=i+1
pors=[];seq={}
for d in rd:
  sec=SEC[d['section']];ln=LEN[d['hair']];sz,se=TRP.get(d['style'],['',''])
  seq[d['section']]=seq.get(d['section'],0)+1;no=('F' if d['section']=='face' else 'S')+str(seq[d['section']]).zfill(3)
  zh=f"一位亚洲年轻女性，{ln[0]}{'，'+sz if sz else ''}，{'正面半身肖像，浅灰纯色背景，柔和均匀的光线' if d['section']=='face' else '自拍风生活照，室内自然光'}。作为人物面部参考，保持五官和脸型一致。"
  en=f"young Asian woman, {ln[1]}{', '+se if se else ''}, {sec[1]}, consistent facial features, face reference"
  it={'id':d['id'],'no':no,'sec':sec[0],'len':ln[0],'st':sz,'ti':sz or f"{ln[0]} · {sec[0]}",'zh':zh,'en':en,'ja':d['style'] or d['hair'],'t':'r/t/'+d['id']+'.webp','m':'r/m/'+d['id']+'.webp','i':'r/m/'+d['id']+'.webp','o':'o/r/'+d['id']+'.png','w':d['w'],'h':d['h']}
  if d['id'] in RANK: it['rk']=RANK[d['id']]
  if d['id'] in RANKC: it['rc']=RANKC[d['id']]
  pors.append(it)
RJ=J(pors)

# ---------- 新模块（数据由 scripts/prep-modules.py 从本地档案生成到 assets-raw，构建不访问外网）----------
VM={'front':('正面','front view'),'diag':('斜侧','three-quarter view'),'side':('侧面','side view'),'back':('背面','back view'),'above':('俯视','high angle, from above'),'below':('仰视','low angle, from below'),'eye':('平视','eye-level view'),'tq':('3/4 侧','three-quarter view')}
def _vmod(sub,pre):
  p=f'{R}/{sub}/data.json'
  if not os.path.exists(p): return []
  out=[]
  for it in json.load(open(p)):
    nit={'id':it['id'],'cat':it['cat'],'ti':it['ti'],'zh':it['zh'],'en':it['en'],'ja':it.get('ja',''),'line':it['line'],'lineEn':it['lineEn'],'no':it['id'],
         'angles':[{'zh':VM[v][0],'en':VM[v][1],'t':f'{pre}/t/{it["id"]}_{v}.webp','i':f'{pre}/i/{it["id"]}_{v}.webp','o':f'o/{pre}/{it["id"]}_{v}.webp','_3':f,'_9':f} for v,f in it['views'].items()]}
    nit.update(it.get('extra') or {})
    out.append(nit)
  return out
EXP=_vmod('expression','e'); DYN=_vmod('dynasty','y'); SCE=_vmod('scene','s'); LIG=_vmod('light','l'); PRO=_vmod('prop','t'); FUR=_vmod('furn','f')
_hp=f'{R}/charadb/hair.json'; HAI=json.load(open(_hp)) if os.path.exists(_hp) else []
# 热链图片的源站（CharaDB 等）：post.py 据此放行 CSP 的 img-src/connect-src，
# 否则浏览器会拦截全部热链图片（2026-11-23 发型库全图加载失败的根因）。
def _origins(o):
  s=set()
  def w(x):
    if isinstance(x,dict):
      for v in x.values(): w(v)
    elif isinstance(x,list):
      for v in x: w(v)
    elif isinstance(x,str) and x.startswith('https://'): s.add('/'.join(x.split('/')[:3]))
  w(o); return s
HOTLINK_ORIGINS=set()
for _f in ['charadb/outfits.json','charadb/hair.json']:
  _p=f'{R}/{_f}'
  if os.path.exists(_p): HOTLINK_ORIGINS|=_origins(json.load(open(_p)))
HOTLINK_ORIGINS=sorted(HOTLINK_ORIGINS)
EXJ=J(EXP);DYJ=J(DYN);SCJ=J(SCE);LIJ=J(LIG);PRJ=J(PRO);FUJ=J(FUR);HAJ=J(HAI)
NEWMODS=[('expression',EXP),('dynasty',DYN),('scene',SCE),('light',LIG),('prop',PRO),('furn',FUR)]
def _cnew(sub,items):
  for it in items:
    for a in it['angles']:
      f3,f9=a.pop('_3'),a.pop('_9')
      for src,tier,dst in [(f3,'w300',f'{AROOT}/{a["t"]}'),(f9,'w900',f'{D}/{a["i"]}'),(f9,'w900',f'{AROOT}/{a["o"]}')]:
        if not os.path.exists(dst): shutil.copy(f'{R}/{sub}/files/{tier}/{src}',dst)
if os.path.exists(f'{D}/data.js'): os.remove(f'{D}/data.js')
for a,b in [('costume/thumbs','c/t'),('costume/img','c/i'),('anime/thumbs','a/t'),('anime/img','a/i')]:
  shutil.copytree(f'{R}/{a}',f'{AROOT if b.endswith("/t") else D}/{b}',dirs_exist_ok=True)
os.makedirs(f'{D}/p/i',exist_ok=True)
def cv(d):
  t=f"{AROOT}/p/t/{d['id']}.webp"
  if not os.path.exists(t):
    im=Image.open(f"{R}/pose/{d['サムネ']}").convert('RGB');im.save(t,'WEBP',quality=80,method=6)
  o=f"{AROOT}/o/p/{d['id']}.png"
  if not os.path.exists(o): os.link(f"{R}/pose/{d['原寸']}",o)
  o=f"{D}/p/i/{d['id']}.webp"
  if not os.path.exists(o):
    im=Image.open(f"{R}/pose/{d['原寸']}").convert('RGB'); im.thumbnail((1200,1200)); im.save(o,'WEBP',quality=82)

def cm(d):
  o=f"{D}/c/m/{d['id']}.webp"
  if not os.path.exists(o):
    im=Image.open(f"{R}/costume/{d['画像']}").convert('RGB'); im.thumbnail((1080,1620)); im.save(o,'WEBP',quality=80)
  o=f"{AROOT}/o/c/{d['id']}.png"
  if not os.path.exists(o): os.link(f"{R}/costume/{d['原寸']}",o)
def ca(d):
  o=f"{D}/a/m/{d['id']}.webp"
  if not os.path.exists(o):
    im=Image.open(f"{R}/anime/{d['画像']}").convert('RGB'); im.thumbnail((1080,1620)); im.save(o,'WEBP',quality=80)
  o=f"{AROOT}/o/a/{d['id']}.png"
  if not os.path.exists(o): os.link(f"{R}/anime/{d['原寸']}",o)
def cr(d):
  t=f"{AROOT}/r/t/{d['id']}.webp"
  if not os.path.exists(t): shutil.copy(f"{R}/portrait/{d['thumb']}",t)
  o=f"{D}/r/m/{d['id']}.webp"
  if not os.path.exists(o):
    im=Image.open(f"{R}/portrait/{d['full']}").convert('RGB'); im.thumbnail((1080,1350)); im.save(o,'WEBP',quality=80)
  o=f"{AROOT}/o/r/{d['id']}.png"
  if not os.path.exists(o): os.link(f"{R}/portrait/{d['full']}",o)
for x in ['p/t','c/m','o/p','o/c','a/m','o/a','r/t','r/m','o/r','e/t','e/i','o/e','y/t','y/i','o/y','s/t','s/i','o/s','l/t','l/i','o/l','t/t','t/i','o/t','f/t','f/i','o/f']: os.makedirs(f'{AROOT if x.endswith("/t") or x.startswith("o/") else D}/{x}',exist_ok=True)
if AHOST:
  # 分离模式下缩略图/原图改写到 dist-assets，删掉 dist 里上一轮单站构建残留的旧文件，
  # 否则主站仍含这批文件、文件数压不回 2 万上限（Codex review on PR #4）
  for _d in ['p/t','c/t','a/t','r/t','e/t','y/t','s/t','l/t','t/t','f/t','o']:
    shutil.rmtree(f'{D}/{_d}',ignore_errors=True)
if os.path.exists(f'{AROOT}/p/t'):
  for f in os.listdir(f'{AROOT}/p/t'):
    if f.endswith('.jpg'): os.remove(f'{AROOT}/p/t/{f}')
if AHOST:
  open(f'{AD}/_headers','w').write('/*\n  Cache-Control: public, max-age=31536000, immutable\n  Access-Control-Allow-Origin: *\n/o/*\n  Content-Disposition: attachment\n')
with ProcessPoolExecutor() as ex:
  for convert, records in ((cv,pd),(cm,cd),(ca,ad),(cr,rd)):
    list(ex.map(convert,records))
for _sub,_items in NEWMODS: _cnew(_sub,_items)
# 深度姿势：只解析素材包里的文本，热链包不复制图片（见 depthpack.py）
_dc=depthpack.catalog(); DJ=J(_dc['payload']); DEPTH_ORIGINS=_dc['origins']
if AHOST:
  # 图片自存模式：深度图已全量存入图片域名下的 d/ 前缀（上游 /thumbs/→/d/thumbs/、/img/→/d/img/），
  # 条目地址改走自存，不再热链原站（原站不可用时前端会整批找不到图）；署名用的裸域名链接不在替换范围内。
  DJ=DJ.replace('https://ai-pose-depth-gallery.pages.dev/thumbs/',AHOST+'/d/thumbs/').replace('https://ai-pose-depth-gallery.pages.dev/img/',AHOST+'/d/img/')
for src,rel in _dc['copies']:
  dest=f'{D}/{rel}'; os.makedirs(os.path.dirname(dest),exist_ok=True); shutil.copyfile(src,dest)
exec(open('post.py').read())
print(len(poses),len(cos),len(acs),len(_dc['payload']['items']),'| new:',len(EXP),len(HAI),len(DYN),len(SCE),len(LIG),len(PRO),len(FUR))
