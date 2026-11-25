# v10 构建后处理：哈希资源、静态详情页、SEO 文件、_headers（由 build.py exec）
SITE=os.environ.get('POSEWEAR_SITE','https://posewear.pages.dev').rstrip('/')  # 部署到自己的域名时改这里
FULL_CATALOG=globals().get('FULL_CATALOG',False)
AH='' if FULL_CATALOG else os.environ.get('POSEWEAR_ASSET_HOST','').rstrip('/')  # 分离部署时缩略图/原图所在站（见 build.py 的 AHOST）
WAT=os.environ.get('POSEWEAR_WA_TOKEN','').strip()  # Cloudflare Web Analytics 站点令牌（公开值，随页面下发）；设了才注入统计脚本并放行其 CSP 域名
def TU(p): return p if p.startswith('http') else (AH+'/'+p if AH else '/'+p)  # 缩略图相对引用
def TS(p): return p if p.startswith('http') else (AH+'/'+p if AH else SITE+'/'+p)  # 缩略图绝对引用（JSON-LD）
h8=lambda b:hashlib.sha256(b if isinstance(b,bytes) else b.encode()).hexdigest()[:10]
os.makedirs(f'{D}/assets',exist_ok=True)
for f in os.listdir(f'{D}/assets'): os.remove(f'{D}/assets/{f}')
A={}
def put(name,data):
  b=data.encode() if isinstance(data,str) else data
  base,ext=name.rsplit('.',1);n=f'assets/{base}.{h8(b)}.{ext}';open(f'{D}/{n}','wb').write(b);A[name]=n;return n
put('poses.json',PJ);put('costumes.json',CJ);put('anime.json',AJ);put('portraits.json',RJ);put('depths.json',DJ)
put('expressions.json',EXJ);put('hair.json',HAJ);put('dynasties.json',DYJ);put('scenes.json',SCJ);put('lights.json',LIJ);put('props.json',PRJ);put('furniture.json',FUJ)
CLIENT_FILES = ['theme.js','style.css','app.js','zip.js','extras.js','image-providers.js','studio.js','history.js','i18n.js','references.js']
for f in CLIENT_FILES:
  if f != 'app.js': put(f,open(f'src/{f}','rb').read())
app=open('src/app.js').read()
if globals().get('PUBLIC_CATALOG'):
  app=app.replace('const LEGACY_IDS={};','const LEGACY_IDS='+json.dumps(LEGACY_IDS,separators=(',',':'))+';')
  app=app.replace('表情图来自 WaveSpeed AI Emotion Gallery，底层头模为 ICT Face Model Light（ICT-FaceKit，© USC Institute for Creative Technologies，MIT）。无身份灰模头，只传神态、不传长相。','表情图基于 ICT FaceKit 头模独立渲染。<a href="/licenses/ict-facekit.txt" rel="license">MIT 许可</a>。')
  if FULL_CATALOG:
    app=app.replace('图片由原站托管、本站不保存，版权归原作者。','版权归原作者。')
  else:
    app=app.replace("const NOTES={expr:", "const NOTES={costume:'<div class=\"dnote-in\"><p>服装参考来自 Shisei（CC0 1.0），可切换角度。<a href=\"https://ai-costume-gallery.pages.dev/\" target=\"_blank\" rel=\"noopener\">浏览原作者图库</a></p></div>',anime:'<div class=\"dnote-in\"><p>原创动画服装参考。<a href=\"https://ai-costume-anime-gallery.pages.dev/\" target=\"_blank\" rel=\"noopener\">浏览原作者图库</a></p></div>',expr:")
    app=app.replace('数据来自 CharaDB（作者 たき AI），标签数据 CC0；图片由原站托管、本站不保存，版权归原作者。','发型参考来自 AI Portrait Gallery（CC0 1.0），图片由原站托管。')
if AH: app=app.replace("const AH='';","const AH="+repr(AH+'/')+";")
for name, asset in A.items():
  if name.endswith('.json'): app=app.replace(repr(name),repr('/'+asset))
put('app.js',app)
idx=open('src/index.html').read()
if globals().get('PUBLIC_CATALOG'):
  idx=idx.replace('href="https://github.com/atuizz/posewear" target="_blank" rel="noopener">GitHub', 'href="https://github.com/hantanyany/posewear" target="_blank" rel="noopener">GitHub')
  idx=idx.replace('<small>© 衣姿 PoseWear</small>', '<small>iyoo 图库 · 基于 PoseWear</small>')
  idx=idx.replace('<strong>安全提醒</strong><p>唯一官网是 posewear.pages.dev，', '<strong>安全提醒</strong><p>此站是 iyoo 图库。上游官网是 posewear.pages.dev，')
  idx=idx.replace('直连时，浏览器将密钥和图片发给填写的地址；启用本站代理后经本站转发。http/https 与任意端口均可。','通过本站转发官方 API。自定义中转建议使用浏览器直连。')
  idx=re.sub(r'(<li><b>图片</b>：).*?</li>',r'\g<1>人像由 AI Portrait Gallery 托管。加载人像时，图片源可以看到请求 IP。</li>' if FULL_CATALOG else r'\g<1>人像和发型由 AI Portrait Gallery 托管。加载图片时，图片源可以看到请求 IP。</li>',idx)
  idx=idx.replace('WaveSpeed AI Emotion Gallery · ICT Face Model Light<span>。表情参考使用 ICT-FaceKit 头模，© USC Institute for Creative Technologies，MIT。</span>', '表情图基于 ICT FaceKit 独立渲染（<a href="/licenses/ict-facekit.txt" rel="license">MIT</a>）')
  if FULL_CATALOG:
    idx=idx.replace('发型与部分动画服装使用原站图片，标签为 CC0，图片版权归原作者。','发型与部分动画服装来自 CharaDB，图片版权归原作者。')
  else:
    idx=re.sub(r'<div class="credit-list">.*?</div></details>', '<div class="credit-list"><p>姿势、深度、服装及其他参考材料来自 Shisei（CC0 1.0）。</p><p>人像和发型来自 AI Portrait Gallery。动画服装为原创 AI 插画。</p><p>表情图基于 ICT FaceKit 独立渲染（<a href="/licenses/ict-facekit.txt" rel="license">MIT</a>）。</p></div></details>',idx,flags=re.S)
for f in CLIENT_FILES:
  idx=idx.replace(f'"{f}"',f'"/{A[f]}"')
idx=idx.replace('href="poses.json"',f'href="/{A["poses.json"]}"')
if WAT: idx=idx.replace('</body>',f'<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{{"token": "{WAT}"}}\'></script></body>')
open(f'{D}/index.html','w').write(idx)
for f in CLIENT_FILES:
  if os.path.exists(f'{D}/{f}'): os.remove(f'{D}/{f}')
sw=open('src/sw.js').read()
version = 'posewear-' + h8(sw + idx + ''.join(A.values()))
sw=sw.replace("'posewear-development'",repr(version))
precache = ['/','/favicon.svg']+['/'+A[f] for f in CLIENT_FILES+['poses.json','depths.json']]
sw=re.sub(r'const PRECACHE = .*?;', 'const PRECACHE = '+json.dumps(precache)+';', sw, count=1)
open(f'{D}/sw.js','w').write(sw)
import base64
inl=re.findall(r'<script>(.*?)</script>',idx,re.S)
SH=' '.join("'sha256-"+base64.b64encode(hashlib.sha256(x.encode()).digest()).decode()+"'" for x in inl)
# ---------- 静态详情页 ----------
for d in ['pose','costume','anime','portrait']:
  if os.path.exists(f'{D}/{d}'): shutil.rmtree(f'{D}/{d}')
THEME_HEAD = f'<meta name="theme-color" content="#ffffff"><script src="/{A["theme.js"]}"></script>'
DARK_TOKENS = 'color-scheme:dark;--paper:#111;--ink:#eee;--muted:#aaa;--surface:#1d1d1d;--surface-hover:#292929;--edge:#333'
CSS = (':root{color-scheme:light;--paper:#fff;--ink:#111;--muted:#606060;--surface:#f5f5f5;--surface-hover:#ececec;--edge:#ededed}'
       ':root[data-theme="dark"]{' + DARK_TOKENS + '}'
       '@media(prefers-color-scheme:dark){:root:not([data-theme]){' + DARK_TOKENS + '}}') + '''body{margin:0;font:15px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--ink);background:var(--paper)}a{color:inherit}
header{display:flex;align-items:center;gap:10px;padding:14px 20px;border-bottom:1px solid var(--edge)}header a{text-decoration:none;font-weight:700;display:flex;align-items:center;gap:8px}
.mk{width:26px;height:26px;color:#ff2442;display:grid;place-items:center}.mk svg{width:26px;height:26px}
main{max-width:1040px;margin:0 auto;padding:24px 20px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:32px}
@media(max-width:760px){main{grid-template-columns:1fr}}
.im img{width:100%;height:auto;border-radius:16px;background:var(--surface);display:block}
h1{font-size:24px;margin:0 0 6px}.mu{color:var(--muted);font-size:13px}.bc{font-size:13px;color:var(--muted);margin-bottom:12px}
.box{background:var(--surface);border-radius:14px;padding:14px 16px;margin:14px 0}.box small{color:var(--muted)}
.go{display:inline-block;background:#d81b3a;color:white;border-radius:999px;padding:10px 22px;text-decoration:none;font-weight:600;margin:6px 8px 6px 0}
.rel{grid-column:1/-1}.rel ul{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px}.rel img{width:100%;height:auto;border-radius:10px;background:var(--surface);display:block}.rel a{text-decoration:none;font-size:13px}
footer{text-align:center;color:var(--muted);font-size:12px;padding:30px 20px;border-top:1px solid var(--edge)}
h1{overflow-wrap:anywhere}
.go.secondary{background:var(--ink);color:var(--paper)}'''
LOGO='<span class="mk"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="6.6" r="4" fill="currentColor"/><path d="M16 13.4 3.4 25.6h25.2z" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linejoin="round"/></svg></span>'
E=lambda s:H.escape(str(s),quote=True)
def page(kind,it,rel):
  P=kind=='pose'
  if kind=='portrait':
    ttl=f"{it['ti']} · 人像脸模参考";img=it['m'];w,h=1080,round(1080*it['h']/it['w']);th=it['t']
    desc=f"{it['sec']} · {it['len']}{'，'+it['st'] if it['st'] else ''}。AI 生成的虚构人物，可作 AI 绘图/视频的人物面部参考，CC0。";meta=f"{it['sec']} · {it['len']} · 编号 {it['no']}";en=it['en']
  elif P:
    ttl=f"{it['zh']} · {it['cat']}姿势参考";img=it['angles'][0]['i'];w,h=900,1200;th=it['angles'][0]['t']
    desc=f"{it['zh']}。{it['line']} · {it['cat']}，共 {len(it['angles'])} 个拍摄角度（{'、'.join(a['zh'] for a in it['angles'])}）。附中英文提示词，可直接用于绘图或出图。"
    meta=f"{it['line']} · {it['cat']} · 编号 {it['no']}";en=f"{it['en']}, {it['lineEn']}"
  else:
    ttl=f"{it['ti']} · {it['cat']}穿搭参考";img=it['m'];w,h=1080,1620;th=it['t']
    desc=it['zh'];meta=f"{it['cat']} · 编号 {it['id']}";en=it['en']
  url=f"{SITE}/{kind}/{it['id']}/"
  ld={"@context":"https://schema.org","@type":"ImageObject","name":ttl,"description":desc,"contentUrl":f"{TS(img)}","thumbnailUrl":f"{TS(th)}","url":url,"width":w,"height":h,"isPartOf":{"@type":"WebSite","name":"衣姿 PoseWear","url":SITE+'/'},"creditText":"AI Pose Gallery / AI Costume Gallery (@giaaibusi)"}
  rl=''.join(f'<li><a href="/{kind}/{r["id"]}/"><img src="{TU(r["angles"][0]["t"] if P else r["t"])}" alt="{E(r["zh"] if P else r["ti"])}" width="{300 if P else 360 if kind=="costume" else 400}" height="{400 if P else 540 if kind=="costume" else 500}" loading="lazy">{E(r["zh"] if P else r["ti"])}</a></li>' for r in rel)
  lab={'pose':'姿势库','costume':'服装库','portrait':'人像库'}[kind]
  return f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{E(ttl)} | 衣姿 PoseWear</title><meta name="description" content="{E(desc[:150])}"><link rel="canonical" href="{url}">
<meta property="og:type" content="article"><meta property="og:title" content="{E(ttl)}"><meta property="og:description" content="{E(desc[:150])}"><meta property="og:image" content="{TS(img)}"><meta property="og:url" content="{url}"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">{THEME_HEAD}<style>{CSS}</style>
<script type="application/ld+json">{json.dumps(ld,ensure_ascii=False)}</script></head><body>
<header><a href="/">{LOGO}衣姿 PoseWear</a></header>
<main><div class="im"><img src="{TU(img)}" alt="{E(ttl)}" width="{w}" height="{h}"></div>
<div><div class="bc"><a href="/">首页</a> › <a href="/#{kind}">{lab}</a> › {E(it.get('cat') or it.get('len'))}</div><h1>{E(it['zh'] if P else it['ti'])}</h1><div class="mu">{E(meta)}</div>
<div class="box"><small>中文描述</small><p>{E(desc)}</p></div><div class="box"><small>英文提示词 · PROMPT</small><p>{E(en)}</p></div>
<a class="go" href="/#{kind}/{it['id']}">在衣姿中打开</a><a class="go secondary" href="/#studio">去试穿</a></div>
<section class="rel"><h2>同类{'姿势' if P else '穿搭' if kind=='costume' else '人像'}</h2><ul>{rl}</ul></section></main>
<footer>{'图片来自 AI Portrait Gallery（作者 @agi_aibusi，CC0 1.0），AI 生成的虚构人物。' if kind=='portrait' else '图片来自 AI Pose Gallery / AI Costume Gallery（原作者 @giaaibusi）'}，中文描述由本站整理。<a href="/">返回首页</a></footer></body></html>'''
open(f'{D}/404.html','w').write(f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>页面不存在 | 衣姿 PoseWear</title><meta name="robots" content="noindex"><link rel="icon" href="/favicon.svg" type="image/svg+xml">{THEME_HEAD}<style>{CSS}
.nf{{max-width:480px;margin:12vh auto;text-align:center;padding:0 20px}}.nf b{{font-size:64px;color:#d81b3a;display:block;line-height:1}}</style></head><body><header><a href="/">{LOGO}衣姿 PoseWear</a></header>
<div class="nf"><b>404</b><h1>这个页面不存在</h1><p class="mu">链接可能写错了，或者内容已经调整。</p><a class="go" href="/">回到首页</a><a class="go secondary" href="/#costume">看看服装库</a></div></body></html>''')
_IMG=" ".join(["'self'","data:","blob:"]+list(DEPTH_ORIGINS)+list(HOTLINK_ORIGINS)+([AH] if AH else []))
CSP=("default-src 'self'; script-src 'self' "+SH+(" https://static.cloudflareinsights.com" if WAT else "")+"; style-src 'self' 'unsafe-inline'; img-src "+_IMG+"; font-src 'self' data:; "
 "connect-src 'self' data: blob: https:; "
 "worker-src 'self'; manifest-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests")
IMM='  Cache-Control: public, max-age=31536000, immutable\n'
if not globals().get('PUBLIC_CATALOG') and os.path.isdir('functions'):
  shutil.rmtree(f'{D}/functions',ignore_errors=True); shutil.copytree('functions',f'{D}/functions')
open(f'{D}/_headers','w').write(f'''/*
  Content-Security-Policy: {CSP}
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
/assets/*
{IMM}/p/*
{IMM}/c/*
{IMM}/a/*
{IMM}/r/*
{IMM}/e/*
{IMM}/y/*
{IMM}/s/*
{IMM}/l/*
{IMM}/t/*
{IMM}/f/*
{IMM}/o/*
{IMM}/icon-*
  Cache-Control: public, max-age=86400
/og.png
  Cache-Control: public, max-age=86400
/sw.js
  Cache-Control: no-cache
/
  Cache-Control: public, max-age=0, must-revalidate
/index.html
  Cache-Control: public, max-age=0, must-revalidate
/pose/*
  Cache-Control: public, max-age=600
/costume/*
  Cache-Control: public, max-age=600
/anime/*
  Cache-Control: public, max-age=600
/portrait/*
  Cache-Control: public, max-age=600
''')
exec(open('seo.py').read())
