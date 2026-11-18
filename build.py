#!/usr/bin/env python3
"""Builds dist/inventory.html: one self-contained file made from index.html,
css/styles.css and every script the page loads. Run:  python3 build.py"""
import re, os
root = os.path.dirname(os.path.abspath(__file__))
# "?v=..." on links in index.html only busts browser caches; the file itself has no query.
def read(p): return open(os.path.join(root, p.split("?")[0]), encoding="utf8").read()
html = read("index.html")
# The live site loads these on first use; the single file needs them inline.
vendor = ["js/vendor/pdfjs-embedded.js", "js/vendor/jbig2-wasm.js", "js/vendor/zxing-embedded.js"]
html = html.replace('<script src="js/app.js', "".join('<script src="%s"></script>\n    ' % v for v in vendor) + '<script src="js/app.js', 1)
# Web-font links stay as links; offline, the single file falls back to system fonts.
html = re.sub(r'<link\s+rel="stylesheet"\s+href="(?!https?:)([^"]+)"\s*/?>',
              lambda m: "<style>\n" + read(m.group(1)) + "</style>", html)
html = re.sub(r'<script\s+src="([^"]+)"\s*></script>',
              lambda m: "<script>\n" + read(m.group(1)) + "\n</script>", html)
os.makedirs(os.path.join(root, "dist"), exist_ok=True)
open(os.path.join(root, "dist", "inventory.html"), "w", encoding="utf8").write(html)
print("wrote dist/inventory.html", len(html), "bytes")
