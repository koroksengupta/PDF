# PDF Stitch

Merge, split, edit, sign, fill, watermark and number PDFs **entirely in your browser**. Files are read into memory with
`ArrayBuffer`s and processed by [pdf-lib](https://pdf-lib.js.org/) in a Web Worker. Nothing is
uploaded, and there is no backend.

## How it works

1. **Upload first.** The home screen is a single upload area (or drop files anywhere on the page). Your files are listed with page counts and sizes, and you can add more or remove any.
2. **Choose what to do:** **Merge PDFs** (all files), or pick one file and choose **Edit & sign**, **Split**, **Fill form**, **Watermark** or **Page numbers**.
3. **Work in the tool.** "← Your files" in the header (or the browser's Back button) returns to the file list without losing work in either tool. "Start over" clears everything.

Files exist only in memory, so a reload always starts at the upload screen.

## Features

- **Ingestion:** drag and drop anywhere on the page, or use the file picker, to add many PDFs at once. Each file shows its name, page count and size.
- **Visual canvas:** every file is a card. Expand a card to see lazily rendered page thumbnails (pdf.js).
- **Drag and drop:** reorder whole files by their handle, reorder pages inside a card, drag pages into another card, or drop a page on the bottom zone to split it into a new section. Keyboard dragging (Space, then the arrow keys) is supported.
- **Per-page actions:** rotate left or right (0/90/180/270°, added on top of the page's own rotation), exclude or restore a page, and open a full-size preview (← → R X Esc).
- **Card actions:** rename, rotate all, exclude or include all, reset, move up or down, remove, and sort A–Z.
- **Undo/redo:** Ctrl/⌘+Z and Ctrl/⌘+Shift+Z, 50 steps.
- **Output options:** custom file name (sanitized, default `stitched_document.pdf`), blank separator pages between cards, and footer page numbers (4 formats, left/center/right, start number, font size). Page numbers stay upright at the visual bottom of rotated pages. Separators count toward the numbering but are left blank.
- **Stitching:** a progress bar with phases, cancel support, automatic download, and "Download again" / "Open" afterwards. The result is flagged as out of date once you edit the workspace.

### Split

- **One PDF at a time:** pick it on the home screen, or drop a different one inside the tool. If several are dropped there, the first is used and you're told so.
- **Number of parts:** choose 2 to N parts (N = page count, up to 200). You then get **N − 1 "split after page" inputs**, prefilled with an even split. For example, 3 parts give you 2 page numbers.
- **Live preview:** each part's page range is shown as you type. Invalid entries (empty, out of range, or not after the previous split) are flagged inline, and splitting is blocked until they're fixed.
- **Visual cutting:** pages show in a grid colour-coded by part. Click the gap between two pages to add or remove a cut, and the inputs update to match. "Distribute evenly" resets to equal parts.
- **Output:** a file name prefix (`prefix_part2_p6-30.pdf`) and delivery as **one ZIP** or **separate PDFs**. Download links for each file stay available afterwards, and the result is flagged as out of date when the settings change. Pages keep their original rotation.


### Edit & sign

- Tools: text boxes (wrapping, any size and colour), today's date, signatures, highlights, freehand drawing, boxes, ellipses, sticky notes and images.
- Signatures can be drawn (mouse, finger or stylus), typed in a script font, or uploaded. Drawn signatures are cropped to the ink, and uploaded scans can have their white background removed. Signatures are reusable within the session.
- Select, move (drag or arrow keys), resize from the corner handle (images keep their proportions), delete, and undo/redo.
- Sticky notes are saved as real PDF comments; everything else becomes page content. Placement is rotation-aware, so items land where you put them even on rotated pages.

### Fill form (hidden for now)

> Switched off in `src/lib/features.ts` while it is being improved on the `claude/fill-form` branch.


Reads the PDF's fields (text, multi-line, checkboxes, radio groups, dropdowns, lists), grouped by page and showing required and read-only fields. Only changed fields are written. **Lock the answers** flattens the form. Files without fields point you to Edit & sign instead.

### Watermark

Text (size, bold, colour) or image (PNG/JPEG/any browser-readable image), with opacity, angle, centred or tiled layout, and a page selection (`1-3, 5`). A live preview approximates the result.

### Page numbers

Header or footer, left/center/right, any template using `{n}` and `{total}` (e.g. `Page {n} of {total}`), a first number, font size, colour, and a page selection, e.g. `2-` to skip a cover page.

Every single-file tool offers **Add to files** on its result, so steps can be chained (e.g. watermark, then merge).

### Not included (and why)

- **Requesting signatures from others** needs a server, email delivery and identity checks, which breaks the "nothing leaves your device" design.
- **Certificate-based digital signatures** (PAdES) need a signing certificate and PKCS#7 tooling. Signatures here are visual: an image of your signature placed on the page.
- Text uses the standard Helvetica font, which covers Western European characters; other scripts are replaced with `?` (form filling reports an error instead).

### Robustness

- Errors are reported in toasts. Covered cases: non-PDFs, files that only look like PDFs, corrupted and empty files, password-protected or encrypted files, single files over 250 MB, and workspaces over 1 GB in total.
- Memory: source bytes live outside React state. They are shared by the file list, Merge (including its undo history) and Split, and freed as soon as none of them uses the file. Each thumbnail object URL is revoked when its file leaves the workspace (including undo history), when you clear the workspace, or when the app unmounts. pdf.js documents are destroyed at the same points, and canvases are released right after encoding.
- Performance: thumbnails render only while visible, at most 2 at a time, newest first. Rotation is applied with CSS, so rotating never re-renders a thumbnail. Large PDFs are parsed and merged off the main thread.

### Known limitations

pdf-lib copies page content, annotations and links. It does not merge bookmarks (outlines) or
interactive form fields across documents. Encrypted PDFs must be unlocked before you add them.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine, edits, split, state and file-name unit tests (vitest)
npm run build      # type-check and build to dist/
npm run preview    # serve the production build
```

Stack: React 19, TypeScript, Vite, Tailwind CSS v4, pdf-lib, pdfjs-dist (thumbnails only),
@hello-pangea/dnd, fflate (ZIP output for split) and lucide-react.

### Layout

```
src/
  lib/pdfEngine.ts        pdf-lib wrapper: validation, merge, split, rotation, separators, page numbers
  lib/split.ts            split-point maths: even distribution, validation, ranges, file names
  lib/edits.ts            page numbers, watermarks, annotations/signatures, form read/fill
  lib/geometry.ts         visual ↔ PDF coordinates for rotated pages, page-list parsing
  components/tools/       Edit & sign, Fill form, Watermark, Page numbers (+ shared frame)
  lib/pdfWorkerClient.ts  promise API over the engine worker (with main-thread fallback)
  workers/pdf.worker.ts   runs the engine off the main thread
  lib/thumbnails.ts       pdf.js render queue + object-URL lifecycle
  state/workspace.ts      reducer: cards, pages, rotation/exclusion, undo history, source GC
  hooks/                  ingestion, stitching, thumbnails, toasts
  components/             UI
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/static.yml`.
