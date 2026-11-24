"""Load the original PoseWear entries with their locally archived images."""

import json
from collections.abc import Callable
from functools import cache
from pathlib import Path, PurePosixPath
from urllib.parse import quote, urlsplit

ORIGINAL_MEDIA_ORIGINS = {
    'pose': 'https://ai-pose-gallery.pages.dev',
    'depth': 'https://ai-pose-depth-gallery.pages.dev',
    'costume': 'https://ai-costume-gallery.pages.dev',
    'anime': 'https://ai-costume-anime-gallery.pages.dev',
    'charadb': 'https://charadb-2fi.pages.dev',
}


def original_media_url(_source: Path, destination: str) -> str:
    _, folder, relative = destination.split('/', 2)
    return ORIGINAL_MEDIA_ORIGINS[folder] + '/' + quote(relative)


def _read_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def _mark_local_depth_pack(pack: dict) -> None:
    pack['source'] = 'local'
    pack['note'] = pack['note'].replace('图片由原站托管，本站不保存。', '图片由本站提供。')
    for child in pack.get('packs', []):
        _mark_local_depth_pack(child)


def load_original_catalogs(raw: Path, stage: Callable[[Path, str], str], *, source_media=False) -> dict:
    """Stage each referenced source file once and retain the original catalogs' order."""
    raw = raw.resolve()
    index = raw / 'posewear-index'
    poses = _read_json(index / 'poses.json')
    depths = _read_json(index / 'depths.json')
    costumes = _read_json(index / 'costumes.json')
    anime = _read_json(index / 'anime.json')
    hair = _read_json(index / 'hair.json')

    @cache
    def asset(folder: str, relative: str) -> str:
        path = PurePosixPath(relative)
        if path.is_absolute() or '..' in path.parts:
            raise ValueError(f'Invalid original image path: {folder}/{relative}')
        local = raw / folder / path
        if not local.is_file():
            raise FileNotFoundError(f'Original image is missing: {local}')
        return stage(local, (PurePosixPath('original') / folder / path).as_posix())

    def source_rows(folder: str) -> dict:
        return {row['id']: row for row in _read_json(raw / folder / 'data.json')['D']}

    def use_charadb_images(item: dict) -> None:
        for images in item.get('angles', [item]):
            for field in ('t', 'm', 'i', 'o'):
                if not (reference := images.get(field)):
                    continue
                url = urlsplit(reference)
                if url.hostname != 'charadb-2fi.pages.dev':
                    raise ValueError(f'Unexpected CharaDB image origin: {reference}')
                images[field] = asset('charadb', url.path.lstrip('/'))

    for folder, items in [('pose', poses), ('depth', depths['items'])]:
        originals = source_rows(folder)
        for item in items:
            item.pop('ext', None)
            for angle in item['angles']:
                stem = PurePosixPath(urlsplit(angle['i']).path).stem
                source = originals[stem]
                angle['t'] = asset(folder, source['サムネ'])
                angle['i'] = angle['o'] = asset(folder, source['原寸'])

    for folder, items in [('costume', costumes), ('anime', anime)]:
        originals = source_rows(folder)
        for item in items:
            if item.get('ext'):
                use_charadb_images(item)
                continue
            source = originals[item['id']]
            item['t'] = asset(folder, source['サムネ'])
            item['m'] = item['i'] = asset(folder, source['画像'])
            item['o'] = asset(folder, source['原寸'])

    for item in hair:
        use_charadb_images(item)

    if not source_media:
        _mark_local_depth_pack(depths['pack'])
    return {'PJ': poses, 'DJ': depths, 'CJ': costumes, 'AJ': anime, 'HAJ': hair}
