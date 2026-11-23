"""Load and copy the local PoseWear expression catalog."""

from pathlib import Path
import csv
import shutil

SOURCE = Path(__file__).resolve().parents[1] / 'catalog' / 'expressions'
CATEGORIES = {
    'happy': '开心', 'laughing': '大笑', 'sad': '悲伤', 'angry': '愤怒',
    'surprised': '惊讶', 'scared': '恐惧', 'disgusted': '厌恶', 'smug': '得意',
    'flirty': '撩人', 'confused': '困惑', 'tired': '疲惫', 'silly': '搞怪',
    'serious': '严肃', 'shy': '害羞',
}
INTENSITIES = {'subtle': '含蓄', 'strong': '强烈'}
VIEWS = (
    ('front', '正面', 'front view'),
    ('tq', '斜侧', 'three-quarter view'),
)


def build_expressions(output: Path) -> list[dict]:
    images = Path('e/i/ict-v1')
    (output / images).mkdir(parents=True, exist_ok=True)
    (output / 'licenses').mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SOURCE / 'LICENSE', output / 'licenses' / 'ict-facekit.txt')

    catalog = []
    with (SOURCE / 'presets.tsv').open(encoding='utf-8', newline='') as file:
        for preset in csv.DictReader(file, delimiter='\t'):
            item_id = preset['id']
            family = item_id.rsplit('-', 1)[0]
            category = CATEGORIES[family]
            angles = []
            for view, zh, en in VIEWS:
                filename = f'{item_id}_{view}.webp'
                image = images / filename
                shutil.copyfile(SOURCE / 'images' / filename, output / image)
                url = image.as_posix()
                angles.append({'zh': zh, 'en': en, 't': url, 'i': url, 'o': url})
            catalog.append({
                'id': item_id, 'no': item_id, 'ti': preset['title_zh'],
                'zh': preset['description_zh'], 'en': preset['description_en'],
                'ja': preset['title_en'], 'cat': category,
                'line': category, 'lineEn': family, 'emo': category, 'emoEn': family,
                'int': INTENSITIES[preset['intensity']], 'intEn': preset['intensity'],
                'angles': angles,
            })
    return catalog
