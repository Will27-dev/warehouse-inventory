#!/usr/bin/env python3
"""Builds dist/inventory.html: one self-contained file made from index.html,
css/styles.css and every script the page loads. Run:  python3 build.py"""
import re, os
root = os.path.dirname(os.path.abspath(__file__))
# "?v=..." on links in index.html only busts browser caches; the file itself has no query.
def read(p): return open(os.path.join(root, p.split("?")[0]), encoding="utf8").read()
html = read("index.html")
html = re.sub(r'<link\s+rel="stylesheet"\s+href="([^"]+)"\s*/?>',
              lambda m: "<style>\n" + read(m.group(1)) + "</style>", html)
html = re.sub(r'<script\s+src="([^"]+)"\s*></script>',
              lambda m: "<script>\n" + read(m.group(1)) + "\n</script>", html)
os.makedirs(os.path.join(root, "dist"), exist_ok=True)
open(os.path.join(root, "dist", "inventory.html"), "w", encoding="utf8").write(html)
print("wrote dist/inventory.html", len(html), "bytes")
