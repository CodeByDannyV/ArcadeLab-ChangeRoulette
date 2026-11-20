"""Package the built-in game as an offline HTML file. Uses only the standard library."""
from pathlib import Path
import argparse
import re

ROOT = Path(__file__).resolve().parents[1]
MODULES = ('round', 'network-cases', 'catalog', 'configuration', 'sites', 'coast', 'globe', 'policy', 'assessment', 'session', 'arcade', 'app')


def package(output):
    html = (ROOT / 'index.html').read_text()
    css = (ROOT / 'game/style.css').read_text()
    scripts = []
    for module in MODULES:
        source = (ROOT / 'game' / f'{module}.mjs').read_text()
        scripts.append(re.sub(r'^import .*\n|^export ', '', source, flags=re.MULTILINE))
    script = '\n'.join(scripts)
    if '</script' in script.lower() or '</style' in css.lower():
        raise ValueError('Embedded source contains a closing tag')
    html = html.replace('<link rel="stylesheet" href="./game/style.css">', f'<style>\n{css}</style>')
    html = html.replace('<script type="module" src="./game/app.mjs"></script>', f'<script type="module">\n{script}</script>')
    output.write_text(html)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    package(parser.parse_args().output)
