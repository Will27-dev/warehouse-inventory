# Warehouse Inventory

A warehouse inventory app: plain HTML, CSS and JavaScript, no install, no build step needed to run it. Sign-in, quantities, contacts, EWOs, logs, delivery trips, photos and PDFs are shared through Supabase; everything saves on the device first, so it keeps working without signal.

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
| `js/vendor/zxing-embedded.js` | ZXing barcode reader (gzip + base64) for camera scanning in any browser; license in `ZXING-LICENSE.txt` |
| `build.py` | Rebuilds `dist/inventory.html` from the files above: `python3 build.py` |
| `dist/inventory.html` | Single-file build |
| `source-files/` | The original spreadsheet and the two sample inspection forms |
| `inspections-deliveries/` | Collect inspection PDFs here, then upload them (Manage → Inspections & Deliveries → Upload a folder) |
| `delivery-locations/` | Collect Delivery Locations photos here (one folder per button), then upload them (Delivery Locations → Upload a folder) |
| `supabase/setup.sql` | Cloud tables, security rules and storage buckets (run once in the Supabase SQL editor) |
| `supabase/functions/admin-users/` | Server function that lets the owner/admins add, edit and remove people |

## Working on it in VS Code
1. Open the folder (File → Open Folder) and install the recommended extensions when prompted (Prettier, Live Server).
2. Right-click `index.html` → **Open with Live Server**, or just double-click `index.html` to open it in a browser.
3. Edit `index.html`, `css/styles.css` or `js/app.js`, save and refresh the browser. Prettier formats on save.
4. `js/app.js` starts with a table of contents; each major feature has a banner comment you can search for.
5. Run `python3 build.py` to refresh `dist/inventory.html` after changes.

The big files in `js/data/` (one item per line) and `js/vendor/` (wrapped base64 text) are generated or third-party and are not meant to be edited by hand.

## Notes
- Sign-in is the Supabase account (email + password). Add people from Manage → Add/Edit user; roles and permissions live in the cloud. Supabase checks every read and write against the rules in `supabase/setup.sql`.
- A device's first sign-in downloads from the cloud and never overwrites it. On the device that holds older local data, the owner selects **Upload this device's data** in Manage once.
- Still kept per device: tab names, custom tabs, Delivery Locations buttons and hand-added location photos, templates and finished inspection sheets. Use **Back up** to export them.
- Inspection sheets: upload PDF templates under Manage → Templates, then use **Create Inspection Sheet**. Text PDFs and scanned PDFs both work; the two forms in `source-files/` are recognised by their layout and get typed question text.
- Photos and PDFs are in Supabase Storage (private buckets `delivery-photos` and `inspection-pdfs`); signed-in staff can view, the owner and admins upload.
- The pdf.js library files are third-party (Apache-2.0).
