// Runs before the page. It hands the page one small, safe tool: the real location of a dropped file or
// folder. A normal browser never shares this; only Electron can read it (webUtils.getPathForFile).
const { contextBridge, webUtils } = require('electron');

contextBridge.exposeInMainWorld('archiveDesktop', {
  isDesktop: true,
  /** The full path of a File from a drop or a file picker ('' when it has none). */
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch {
      return '';
    }
  },
});
