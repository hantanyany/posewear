"""Recover the authorized media pack from a prior external-image deployment."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import time
from urllib.parse import unquote, urlsplit
from urllib.request import Request, urlopen

FOLDERS = {
    'ai-pose-gallery.pages.dev': 'pose',
    'ai-pose-depth-gallery.pages.dev': 'depth',
    'ai-costume-gallery.pages.dev': 'costume',
    'ai-costume-anime-gallery.pages.dev': 'anime',
    'charadb-2fi.pages.dev': 'charadb',
}
CATALOGS = ('poses', 'depths', 'costumes', 'anime', 'hair')


def read_url(url):
    for attempt in range(4):
        try:
            request = Request(url, headers={'User-Agent': 'PoseWear authorized Pages migration'})
            with urlopen(request, timeout=35) as response:
                return response.read()
        except OSError:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


def media_files(site):
    index = read_url(site).decode()
    app_path, = re.findall(r'<script src="(/assets/app\.[0-9a-f]+\.js)"', index)
    app = read_url(site + app_path).decode()
    files = {}
    for catalog in CATALOGS:
        catalog_path, = set(re.findall(r"'/assets/" + catalog + r"\.[0-9a-f]+\.json'", app))
        items = json.loads(read_url(site + catalog_path.strip("'")))
        if isinstance(items, dict):
            items = items['items']
        for item in items:
            for image in [item, *item.get('angles', [])]:
                for field in ('t', 'm', 'i', 'o'):
                    if not (url := image.get(field)):
                        continue
                    parsed = urlsplit(url)
                    name = PurePosixPath(unquote(parsed.path).lstrip('/'))
                    if (parsed.scheme != 'https' or parsed.netloc not in FOLDERS or parsed.query
                            or '..' in name.parts or name.suffix.lower() not in ('.jpg', '.png', '.webp')):
                        raise ValueError(f'Unexpected original image URL: {url}')
                    relative = PurePosixPath('original', FOLDERS[parsed.netloc], name)
                    if files.setdefault(relative.as_posix(), url) != url:
                        raise ValueError(f'Conflicting URLs for {relative}')
    return files


def fingerprint(root):
    digest = hashlib.sha256()
    for path in sorted((root / 'original').rglob('*')):
        if path.is_file():
            relative = path.relative_to(root).as_posix()
            digest.update(relative.encode() + b'\0' + hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()


def seed(site, output, expected):
    if not re.fullmatch(r'https://[0-9a-f]{8}\.posewear-iyoo\.pages\.dev', site):
        raise ValueError('Provide the immutable URL of a previous posewear-iyoo deployment')
    files = media_files(site)
    if not files:
        raise ValueError('The deployment has no original media URLs')

    def download(job):
        relative, url = job
        path = output / relative
        data = read_url(url)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    with ThreadPoolExecutor(max_workers=8) as pool:
        for count, _ in enumerate(pool.map(download, files.items()), 1):
            if count % 1500 == 0 or count == len(files):
                print(f'{count}/{len(files)} images downloaded', flush=True)
    if fingerprint(output) != expected:
        raise ValueError('Downloaded media differs from the local authorized archive')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--site')
    parser.add_argument('--sha256')
    args = parser.parse_args()
    if args.site and args.sha256:
        seed(args.site, args.output, args.sha256)
    elif not args.site and not args.sha256:
        print(fingerprint(args.output))
    else:
        parser.error('--site and --sha256 must be used together')
