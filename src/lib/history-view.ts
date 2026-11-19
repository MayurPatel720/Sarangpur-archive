/** Shared by the Items tab, the History panel and the highlight legend (see src/server/lots/history.ts getHistoryView). */

/** What the sheet is showing instead of the current state: the lot right after a session, or at a saved version. */
export type HistView = { mode: 'session'; sessionId: string } | { mode: 'version'; versionId: string };

/** "Show changes" on the current sheet: since the caller's last session, today, or since a saved version (its id). */
export type ShowChanges = 'last' | 'today' | (string & {});

/** One colour per person who changed something (like Google Sheets). */
export const HISTORY_COLORS = ['#2563eb', '#d97706', '#059669', '#db2777', '#7c3aed', '#0891b2'] as const;

export const colorOfActor = (actors: { id: string }[], id: string): string => {
  const i = actors.findIndex((a) => a.id === id);
  return HISTORY_COLORS[(i < 0 ? 0 : i) % HISTORY_COLORS.length]!;
};
