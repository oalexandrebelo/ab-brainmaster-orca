import pathlib
import re
import subprocess
import sys
import tempfile

source, destination = map(pathlib.Path, sys.argv[1:3])
if destination.exists():
    raise SystemExit('Refusing to overwrite an ISO')
with tempfile.TemporaryDirectory(prefix='ab-iso-menu-') as temporary:
    tree = pathlib.Path(temporary)
    subprocess.run(['xorriso', '-osirrox', 'on', '-indev', str(source), '-extract', '/', str(tree)], check=True)
    mappings = []
    for path in sorted(tree.rglob('*.cfg')):
        text = path.read_text(errors='strict')
        updated = re.sub(r'(?m)^(\s*(?:append|linux|linuxefi)\s+[^\n]*\bboot=live\b[^\n]*)$', r'\1 ab.acceptance=1', text)
        if updated != text:
            path.write_text(updated)
            mappings.extend(['-map', str(path), '/' + str(path.relative_to(tree))])
    if not mappings:
        raise SystemExit('No live boot entries were found; refusing an untestable CI ISO')
    subprocess.run(['xorriso', '-indev', str(source), '-outdev', str(destination), '-boot_image', 'any', 'replay', *mappings], check=True)
