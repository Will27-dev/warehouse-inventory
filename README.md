# Warehouse Inventory (offline)

An offline warehouse inventory app: plain HTML, CSS and JavaScript, no server, no install, no build step needed to run it.

## Run it
- **Split source:** open `index.html` in a browser.
- **One single file:** open `dist/inventory.html` (same app, everything inlined; handy for emailing or copying to another computer).

## Project layout
| Path | What it is |
|---|---|
| `index.html` | Page markup (sidebar, tabs, dialogs, Manage page, inspection panel) |
| `css/styles.css` | All styling |
| `js/app.js` | All application code: tabs, search, quantities, transfers, EWOs, summary, contacts, delivery locations, login and roles, Manage, inspection sheets |
| `js/data/items-data.js` | Item data imported from `source-files/Warehouse_Location_Look_Up.xlsx` (29,532 rows) |
| `js/vendor/pdfjs-embedded.js` | pdf.js library and worker (gzip + base64) used to open PDF templates |
| `js/vendor/jbig2-wasm.js` | pdf.js decoder (gzip + base64) needed for scanned PDFs |
| `build.py` | Rebuilds `dist/inventory.html` from the files above: `python3 build.py` |
| `dist/inventory.html` | Single-file build |
| `source-files/` | The original spreadsheet and the two sample inspection forms |
| `inspections-deliveries/` | Drop PDFs here; they are listed under Manage → Inspections & Deliveries |

## Working on it in VS Code
1. Open the folder (File → Open Folder) and install the recommended extensions when prompted (Prettier, Live Server).
2. Right-click `index.html` → **Open with Live Server**, or just double-click `index.html` to open it in a browser.
3. Edit `index.html`, `css/styles.css` or `js/app.js`, save and refresh the browser. Prettier formats on save.
4. `js/app.js` starts with a table of contents; each major feature has a banner comment you can search for.
5. Run `python3 build.py` to refresh `dist/inventory.html` after changes.

The big files in `js/data/` (one item per line) and `js/vendor/` (wrapped base64 text) are generated or third-party and are not meant to be edited by hand.

## Notes
- Data is stored in the browser (localStorage and IndexedDB). Use **Back up** in the app to export it.
- Passwords are stored as PBKDF2 hashes, never as plain text.
- Inspection sheets: upload PDF templates under Manage → Templates, then use **Create Inspection Sheet**. Text PDFs and scanned PDFs both work; the two forms in `source-files/` are recognised by their layout and get typed question text.
- PDF folder: under Manage → Inspections & Deliveries, select **Choose PDF folder** once and pick `inspections-deliveries/` (or any folder). Every PDF in it, sub-folders included, is listed there and new ones appear within a few seconds. This uses the browser's folder access, so it needs Chrome or Edge; after a browser restart, select **Open folder** once to allow it again. The PDFs stay in the folder and are not copied into the browser.
- The pdf.js library files are third-party (Apache-2.0).
