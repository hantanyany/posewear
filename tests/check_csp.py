"""Check the deployable catalog set and the CSP permissions needed to browse and fetch its images."""
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit

def check(root):
    headers = (root / '_headers').read_text()
    policy = re.search(r'Content-Security-Policy:\s*([^\n]+)', headers).group(1)
    directives = {words[0]: set(words[1:]) for part in policy.split(';') if (words := part.split())}
    names = 'poses depths costumes anime portraits expressions hair dynasties scenes lights props furniture'.split()
    origins = set()
    problems = []
    home = (root / 'index.html').read_text()
    footer = re.search(r'<footer class="foot">.*?</footer>', home, re.S)
    index_marker = '<details class="footer-index">'
    if home.count(index_marker) != 1 or not footer or index_marker not in footer[0]:
        problems.append('The category index must appear once in the site footer.')
    if (root / '.posewear-partial').exists():
        problems.append('Local partial build: ' + (root / '.posewear-partial').read_text().replace('\n', ', '))
    def images(node):
        if isinstance(node, list):
            for item in node: images(item)
        if isinstance(node, dict):
            for key, value in node.items():
                if key in {'t','m','i','o'} and isinstance(value, str) and '://' in value:
                    url = urlsplit(value)
                    origins.add(f'{url.scheme}://{url.netloc}')
                else: images(value)
    for name in names:
        files = list((root / 'assets').glob(name+'.*.json'))
        if len(files) != 1:
            problems.append(f'{name}: expected one manifest, found {len(files)}')
            continue
        try:
            data = json.loads(files[0].read_text())
            items = data.get('items') if isinstance(data, dict) else data
            if not isinstance(items, list) or not items: raise ValueError('missing items')
            images(items)
        except (ValueError, OSError) as error:
            problems.append(f'{name}: {error}')
    apps = list((root/'assets').glob('app.*.js'))
    if len(apps) != 1:
        problems.append('Expected one compiled app.js')
    else:
        host = re.search(r"""const AH=['"](https?://[^'"]+)['"]""", apps[0].read_text())
        if host: origins.add(host[1].rstrip('/'))
    for directive in ['img-src','connect-src']:
        allowed = directives.get(directive, set())
        if "'self'" not in allowed: problems.append(f"{directive}: missing 'self'")
        for origin in sorted(origins):
            if origin not in allowed and origin.split(':')[0]+':' not in allowed:
                problems.append(f'{directive}: missing {origin}')
    return problems

if __name__ == '__main__':
    try:
        issues = check(Path(sys.argv[1] if len(sys.argv)>1 else 'dist'))
    except (OSError, AttributeError, ValueError) as error:
        issues = [str(error)]
    if issues:
        sys.exit('FAIL\n'+'\n'.join(issues))
    print('PASS: site footer, 12 populated catalogs and all image and fetch origins.')
