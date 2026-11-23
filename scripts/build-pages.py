#!/usr/bin/env python3
"""Build the Pages edition from redistributable assets and original-source links."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlsplit
import datetime
import hashlib
import html as H
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
sys.path.insert(0, str(ROOT))

CACHE = Path('.catalog-cache')
OUTPUT = Path('dist')
SHISEI_REV = '6e22358bab73c51eeae0615030635ace199169f8'
PORTRAIT_SITE = 'https://ai-portrait-gallery.pages.dev'
WAVE_SITE = 'https://wavespeed.ai/free-tools/ai-emotion-gallery'
WAVE_MEDIA = 'https://static.wavespeed.ai/media/images'
VIEWS = {
    'front': ('正面', 'front view'), 'diag': ('斜侧', 'three-quarter view'),
    'side': ('侧面', 'side view'), 'back': ('背面', 'back view'),
    'above': ('俯视', 'high angle'), 'below': ('仰视', 'low angle'),
    'eye': ('平视', 'eye level'), 'tq': ('斜侧', 'three-quarter view'),
}
POSE_CATEGORIES = {
    '座り': '坐姿', '立ち': '站姿', '膝立ち': '跪立', '寝そべり': '躺卧',
    '横座り・女の子座り': '侧坐·鸭子坐', 'しゃがみ': '蹲姿',
    '前かがみ': '前倾', 'のけぞり・反り': '后仰', 'ひねり': '扭身',
    'かわいい系': '可爱', '膝立ち・四つん這い': '跪立',
}
SERIES = {
    'std': ('全身·标准', 'full body, solo'), 'upper': ('上半身', 'upper body, solo'),
    'sexy': ('全身·性感', 'full body, solo'), 'duo': ('双人互动', 'two people'),
}
OUTFIT_CATEGORIES = {
    'MD': '春季', 'AC': '春季', 'WE': '派对礼服', 'FN': '派对礼服',
    'FM': '秋季', 'SP': '夏季', 'WK': '秋季', 'WH': '冬季',
    'IN': '夏季', 'LG': '冬季', 'FS': '派对礼服',
}
SEASONS = {'春季': 'spring', '夏季': 'summer', '秋季': 'autumn',
           '冬季': 'winter', '派对礼服': 'party', '泳装': 'swimwear'}
CATEGORIES = {
    'scenes': {'IN': '室内', 'UR': '城市', 'NT': '自然', 'HF': '历史奇幻', 'ST': '影棚'},
    'lights': {'TD': '时段', 'SN': '空间', 'AR': '艺术', 'PO': '人像光位', 'FX': '特效'},
    'props': {'MU': '乐器', 'CN': '民族器物', 'HD': '手持日用'},
    'furniture': {'SE': '坐具', 'TB': '桌案', 'CN': '中式', 'PL': '影棚结构'},
}


def fetch(url, path):
    if not path.is_file():
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + '.part')
        subprocess.run(['curl', '-fsSL', '--retry', '3', '--max-time', '45',
                        '-o', str(tmp), url], check=True)
        tmp.replace(path)
    return path


def shisei_root():
    if source := os.environ.get('POSEWEAR_SHISEI'):
        return Path(source).resolve()
    source = CACHE / f'shisei-{SHISEI_REV[:10]}'
    if not source.is_dir():
        archive = fetch(f'https://codeload.github.com/wquguru/shisei/tar.gz/{SHISEI_REV}',
                        CACHE / f'shisei-{SHISEI_REV[:10]}.tar.gz')
        shutil.unpack_archive(archive, CACHE)
        (CACHE / f'shisei-{SHISEI_REV}').rename(source)
    return source


def copy_asset(source, target):
    dest = OUTPUT / target
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, dest)
    return target


def angles(root, directory, prefix, item_id, files):
    result = []
    for key, (zh, en) in VIEWS.items():
        if not (name := files.get(key)):
            continue
        if not all((root / directory / layer / name).is_file() for layer in ('w300', 'w900')):
            continue
        thumb = copy_asset(root / directory / 'w300' / name, f'{prefix}/t/{item_id}_{key}.webp')
        full = copy_asset(root / directory / 'w900' / name, f'{prefix}/i/{item_id}_{key}.webp')
        result.append({'zh': zh, 'en': en, 't': thumb, 'i': full, 'o': full})
    return result


def pose_assets(root, metadata):
    translations = dict((parts[0], parts[1]) for line in Path('tr_pose.txt').read_text().splitlines()
                        if len(parts := line.split('|')) >= 2)
    result, depth = [], []
    catalog = json.loads(metadata.read_text())
    for item in catalog:
        item_id = item['id']
        line, line_en = SERIES[item['series']]
        cat = POSE_CATEGORIES.get(item['class_jp'], '其他')
        name = translations.get(item['name_jp'], f'{cat} · {item_id}')
        base = {'id': item_id, 'no': item_id, 'line': line, 'lineEn': line_en,
                'cat': cat, 'zh': name, 'en': item['desc_en'], 'ja': item['name_jp']}
        if item['rating'] != 'general' or item['series'] in ('sexy', 'duo'):
            base['a'] = 1
        if views := angles(root, 'line', 'p', item_id, item['views']):
            result.append({**base, 'angles': views})
        if views := angles(root, 'depth', 'd', item_id, item.get('maps', {})):
            depth.append({**base, 'angles': views, 'lineJa': '', 'catJa': item['class_jp'],
                          'credit': 'Shisei · CC0 1.0', 'site': 'https://shisei.indaloop.app/'})
    return sorted(result, key=lambda x: x.get('a', 0)), depth


def outfit_assets(root, metadata):
    catalog = json.loads(metadata.read_text())
    retired = set(catalog.get('retired', []))
    main, dynasty = [], []
    for item in catalog['items']:
        item_id = item['id']
        if item_id in retired:
            continue
        if item['cat'] == 'HC':
            views = angles(root, 'costume/grey', 'y', item_id, item['views'])
            if views:
                dynasty.append({'id': item_id, 'no': item_id, 'ti': item['name_zh'],
                                'zh': item['name_zh'], 'en': item['desc_en'], 'ja': item['name_ja'],
                                'cat': '历代服饰', 'line': item['era_zh'], 'lineEn': item['era_en'],
                                'era': item['era_zh'], 'eraEn': item['era_en'], 'angles': views})
            continue
        name = next((item['views'][x] for x in VIEWS if item['views'].get(x)), None)
        if not name:
            continue
        views = angles(root, 'costume/grey', 'c', item_id, {'front': name})
        if not views:
            continue
        image = views[0]
        cat = OUTFIT_CATEGORIES[item['cat']]
        entry = {'id': item_id, 'cat': cat, 'catEn': SEASONS[cat], 'ti': item['name_zh'],
                 'zh': item['name_zh'], 'en': item['desc_en'], 'kw': item['desc_en'].lower(),
                 't': image['t'], 'm': image['i'], 'i': image['i'], 'o': image['o']}
        if item['rating'] != 'general':
            entry['a'] = 1
        main.append(entry)
    return main, dynasty


def anime_assets():
    items = []
    for index, line in enumerate(Path('catalog/anime.tsv').read_text().splitlines(), 1):
        category, zh, en = line.split('\t')
        item_id = f'AW{index:02}'
        image = copy_asset(Path(f'catalog/anime/{item_id}.png'), f'a/i/{item_id}.png')
        items.append({'id': item_id, 'cat': category, 'catEn': SEASONS[category], 'ti': zh,
                      'zh': zh, 'en': en, 'kw': en, 't': image, 'm': image, 'i': image, 'o': image})
    return items


def extra_assets(root, library, directory, prefix):
    catalog = json.loads((root / 'data' / (library + '.json')).read_text())
    retired = set(catalog.get('retired', []))
    result = []
    for item in catalog['items']:
        item_id = item['id']
        if item_id in retired:
            continue
        views = angles(root / 'images', directory, prefix, item_id, item['views'])
        if not views:
            continue
        entry = {'id': item_id, 'no': item_id, 'ti': item['name_zh'], 'zh': item['name_zh'],
                 'en': item['desc_en'], 'ja': item['name_ja'], 'cat': CATEGORIES[library][item['cat']],
                 'line': item['group_zh'], 'lineEn': item['group_en'], 'angles': views}
        for key in ('setting', 'light'):
            if item.get(key):
                entry[key] = item[key]
        if dims := item.get('dims'):
            entry['dims'] = f"{dims['w']}×{dims['d']}×{dims['h']} cm"
            if dims.get('seat'):
                entry['dims'] += f"，座高 {dims['seat']} cm"
        result.append(entry)
    return result


def portrait_assets(metadata, ranking):
    text = metadata.read_text()
    entries = json.loads(text[text.index('['):text.rindex(']') + 1])
    text = ranking.read_text()
    tops = json.loads(text[text.index('{'):text.rindex('}') + 1])['top']
    popular = {item_id: n for n, item_id in enumerate(tops['総合'], 1)}
    lengths = {'ショート': ('短发', 'short hair'), 'ミディアム': ('中长发', 'medium hair'),
               'セミロング': ('半长发', 'shoulder-length hair'), 'ロング': ('长发', 'long hair')}
    styles = dict((parts[0], parts[1:]) for line in Path('tr_portrait.txt').read_text().splitlines()
                  if len(parts := line.split('|')) == 3)
    portraits, hair = [], {}
    count = {'face': 0, 'styling': 0}
    for item in entries:
        section = item['section']
        face = section == 'face'
        count[section] += 1
        length, length_en = lengths[item['hair']]
        style, style_en = styles.get(item['style'], ('', ''))
        name = style or length
        name_en = (length_en + (', ' + style_en if style_en else ''))
        sec = '正脸' if face else '生活照'
        thumb = f"{PORTRAIT_SITE}/{item['thumb']}"
        full = f"{PORTRAIT_SITE}/{item['full']}"
        entry = {'id': item['id'], 'no': f"{'F' if face else 'S'}{count[section]:03}",
                 'sec': sec, 'len': length, 'st': style, 'ti': style or f'{length} · {sec}',
                 'zh': f'成年亚洲女性，{name}，{sec}。', 'en': f'adult Asian woman, {name_en}, '
                 + ('front-facing portrait, soft even light' if face else 'casual lifestyle portrait'),
                 'ja': item['style'] or item['hair'], 't': thumb, 'm': full, 'i': full, 'o': full,
                 'w': item['w'], 'h': item['h']}
        if item['id'] in popular:
            entry['rk'] = popular[item['id']]
        portraits.append(entry)
        if face and (length, style) not in hair:
            hair[length, style] = {**entry, 'cat': length, 'ti': name, 'zh': name,
                                   'en': name_en, 'kw': name_en}
    return portraits, list(hair.values())


def expression_assets():
    sys.path.insert(0, str(ROOT / 'scripts'))
    from importlib import import_module
    names = import_module('prep-modules')
    groups = list(names.EMO_ZH)

    def page(group):
        html = fetch(f'{WAVE_SITE}/{group}', CACHE / f'expression/{group}.html').read_text()
        for chunk in re.findall(r'self\.__next_f\.push\((.*?)\)</script>', html, re.S):
            values = json.loads(chunk)
            if len(values) > 1 and isinstance(values[1], str):
                match = re.search(r'"initial":\[\{"id":', values[1])
                if match:
                    return json.JSONDecoder().raw_decode(values[1][match.start() + 10:])[0]
        raise ValueError(f'WaveSpeed catalog unavailable for {group}')

    with ThreadPoolExecutor(max_workers=4) as pool:
        metadata = {item['id']: item for group in pool.map(page, groups) for item in group}
    if len(metadata) != len(names.NAME_ZH):
        raise ValueError(f'WaveSpeed catalog has {len(metadata)} expressions, expected {len(names.NAME_ZH)}')

    def prepare(item):
        item_id = item['id']
        emotion = item['category']
        intensity = item['intensity']
        views = []
        for key, filename in zip(('front', 'tq'), item['img']):
            if not re.fullmatch(r'[a-f0-9-]+\.webp', filename):
                raise ValueError(f'Invalid expression asset: {filename}')
            source = fetch(f'{WAVE_MEDIA}/{filename}', CACHE / 'expression/images' / filename)
            image = copy_asset(source, f'e/i/{item_id}_{key}.webp')
            zh, en = VIEWS[key]
            views.append({'zh': zh, 'en': en, 't': image, 'i': image, 'o': image})
        return {'id': item_id, 'no': item_id, 'ti': names.NAME_ZH[item_id],
                'zh': names.DESC_ZH[item_id], 'en': item['desc'] or names.DESC_EN_FILL[item_id],
                'ja': item['name'], 'cat': names.EMO_ZH[emotion], 'line': names.EMO_ZH[emotion],
                'lineEn': emotion, 'emo': names.EMO_ZH[emotion], 'emoEn': emotion,
                'int': names.INT_ZH[intensity], 'intEn': intensity, 'angles': views}

    with ThreadPoolExecutor(max_workers=4) as pool:
        return list(pool.map(prepare, sorted(metadata.values(), key=lambda x: int(x['id'].rsplit('-', 1)[1]))))


def main():
    os.environ.setdefault('POSEWEAR_SITE', 'https://posewear-iyoo.pages.dev')
    root = shisei_root()
    portrait_meta = fetch(f'{PORTRAIT_SITE}/data/images.js', CACHE / 'portrait/images.js')
    ranking = fetch(f'{PORTRAIT_SITE}/data/ranking.js', CACHE / 'portrait/ranking.js')
    data_path = root / 'data'
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    shutil.copytree('src', OUTPUT)
    copy_asset(Path('LICENSE'), 'LICENSE')
    copy_asset(root / 'LICENSE-images', 'licenses/shisei-cc0.txt')
    copy_asset(root / 'NOTICE', 'licenses/shisei-notice.txt')

    PL, depth = pose_assets(root / 'images', data_path / 'catalog.json')
    cos, DYN = outfit_assets(root / 'images', data_path / 'costumes.json')
    acs = anime_assets()
    pors, HAI = portrait_assets(portrait_meta, ranking)
    EXP = expression_assets()
    SCE = extra_assets(root, 'scenes', 'scene/plain', 's')
    LIG = extra_assets(root, 'lights', 'light/plain', 'l')
    PRO = extra_assets(root, 'props', 'prop/grey', 't')
    FUR = extra_assets(root, 'furniture', 'furniture/grey', 'f')
    pack = {'site': 'https://shisei.indaloop.app/', 'siteName': 'Shisei', 'author': 'wquguru',
            'authorUrl': 'https://github.com/wquguru', 'unofficial': 'CC0 1.0',
            'note': '深度图来自 Shisei，示意人物为虚构模型。'}
    catalogs = {
        'PJ': PL, 'CJ': cos, 'AJ': acs, 'RJ': pors, 'DJ': {'pack': pack, 'items': depth},
        'EXJ': EXP, 'HAJ': HAI, 'DYJ': DYN, 'SCJ': SCE, 'LIJ': LIG, 'PRJ': PRO, 'FUJ': FUR,
    }
    empty = [name for name, value in catalogs.items() if not value]
    if empty or not depth:
        raise ValueError(f'Empty catalogs: {empty or ["depth"]}')

    namespace = dict(globals(), D=str(OUTPUT), PL=PL, cos=cos, acs=acs, pors=pors,
                     poses={item['id']: item for item in PL}, PUBLIC_CATALOG=True,
                     HOTLINK_ORIGINS=[PORTRAIT_SITE], DEPTH_ORIGINS=[],
                     CATALOG_DATES={k: datetime.date.fromtimestamp(p.stat().st_mtime).isoformat()
                                    for k, p in {'pose': data_path / 'catalog.json',
                                                 'costume': data_path / 'costumes.json',
                                                 'anime': Path('catalog/anime.tsv'),
                                                 'portrait': portrait_meta}.items()},
                     **{k: json.dumps(v, ensure_ascii=False, separators=(',', ':')) for k, v in catalogs.items()})
    exec(compile(Path('post.py').read_text(), 'post.py', 'exec'), namespace)
    files = [p for p in OUTPUT.rglob('*') if p.is_file()]
    if len(files) > 20_000 or any(p.stat().st_size > 25 * 1024**2 for p in files):
        raise ValueError('Build exceeds Cloudflare Pages Free static asset limits')
    print(f'{len(files):,} files, {sum(p.stat().st_size for p in files) / 1024**2:.1f} MiB')
    print({k: len(v) if isinstance(v, list) else len(v['items']) for k, v in catalogs.items()})


if __name__ == '__main__':
    main()
