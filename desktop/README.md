# Sarangpur Archive desktop

The same website in its own Windows app. The one thing it adds: **drop a file or folder into a File path
cell and the real full path is saved** (for example `E:\saranpur archive\docs`). A normal browser can only
share the name.

## Run it

```bash
cd desktop
npm install
npm start
```

The **Server** menu switches between the production site and `http://localhost:3000` (the choice is kept).

## Make a single .exe to share

```bash
npm run dist
```

The portable app appears in `desktop/dist`. Anyone who opens it gets the same drop-to-path behaviour.

## How it works

`preload.js` gives the page `window.archiveDesktop.pathForFile(file)` using Electron's
`webUtils.getPathForFile`. `src/lib/file-path.ts` (`readDrop`) uses it when it is there and falls back to
paste / base folder in a normal browser.
