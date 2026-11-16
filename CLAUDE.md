# Warehouse Inventory: project instructions

## Plugins to use in this project
- **ponytail** (`ponytail:ponytail`, level `full`): use for every code change here. Smallest complete change, reuse what is already in `js/app.js`, no new dependencies or abstractions nobody asked for.
- **frontend-design** (`frontend-design:frontend-design`): load before any UI or visual work (new screens, layout changes, restyling, components). Keep the existing Soft Bento look (Mint & Coral palette, dark canvas, rounded cards, pill buttons) unless asked to change it.

## Project basics
- Plain HTML/CSS/JS, no build step to run: `index.html`, `css/styles.css`, `js/app.js`. `python build.py` rebuilds `dist/inventory.html` after changes.
- Bump the `?v=` tag on the script/style links in `index.html` whenever `js/app.js` or `css/styles.css` changes, so browsers load the new files.
- Cloud: Supabase project `mkovvhsceckubkdxuemi` (setup in `supabase/`). Only the publishable key belongs in website code.
- Show changes on desktop and phone before pushing; push to GitHub (`main`, GitHub Pages) only when asked.
