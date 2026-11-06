#!/usr/bin/env python3
"""Bundle the studio and its local assets into one offline HTML file."""
import base64
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
html = (root / 'index.html').read_text()
css = (root / 'style.css').read_text()
engine = (root / 'vendor/three.min.js').read_text()
app = (root / 'tree.js').read_text()
assets = {
    p.name: 'data:image/png;base64,' + base64.b64encode(p.read_bytes()).decode()
    for p in sorted((root / 'assets/leaf').glob('*.png'))
}
assert len(assets) == 4, 'Expected four leaf texture maps'
for name, data in assets.items():
    html = html.replace('assets/leaf/' + name, data)
app = app.replace("'assets/leaf/'+file", 'LEAF_ASSETS[file]')
app = app.replace("'assets/leaf/'+b.dataset.map", 'LEAF_ASSETS[b.dataset.map]')
app = 'const LEAF_ASSETS=' + json.dumps(assets) + ';\n' + app
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>')
for name, code in [('vendor/three.min.js', engine), ('tree.js', app)]:
    html = html.replace('<script src="' + name + '"></script>', '<script>' + code.replace('</script', '<\\/script') + '</script>')
license_text = (root / 'vendor/THREE-LICENSE.txt').read_text()
html = html.replace('</head>', '<!-- Three.js license:\n' + license_text + '\n-->\n</head>')
output = root / '.hoplite/artifacts/Arboreal-Tree-Studio.html'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(html)
print(f'{output.relative_to(root)} ({output.stat().st_size:,} bytes)')
