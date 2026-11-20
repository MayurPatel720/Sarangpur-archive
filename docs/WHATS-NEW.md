# What's new in the Archive Tracker

A plain-English guide to the latest changes. No technical knowledge needed.

---

## Today at a glance

| What | Where to find it |
|---|---|
| **All five parts of an item's code can be changed** (abbreviation 1, abbreviation 2, number, letter, last 3 digits) | Items tab → click an Archive code → **Only this item** (section 5b) |
| **Code letter M** now exists next to R and D, and admins can add more letters | **Admin → Lists → Item code letters** (section 5b) |
| **Change the code letter for many items at once** | Tick rows → **Bulk edit** → **Code letter** (section 5b) |
| **One right-click menu on both Excel sheets** for column actions, show / hide columns, row height and layout | Right-click anywhere on the Master Excel or a lot's Items tab (section 6c) |
| **Drag a column heading to move it** (grab handle ⠿) and **Save layout** to your account | Both sheets; Save layout is in the right-click menu (section 6c) |
| **Master Excel: every column is editable**, and **columns that lots added** can be shown | Click a cell; right-click → Columns → Added to lots (section 6c) |
| **Export a session (or version) to Excel**, with that session's changes marked | History panel → pick a session → **Export to Excel** (section 7) |
| **Tidier Items toolbar**, plus a **Returned** filter | Top of the Items tab (section 4) |
| **Letters:** intake with Guru, codes from scanned file names, and their own six stages | Register → New intake → Format **Documents** (section 9) |
| **Machines:** company name, repair comment, bill file path, Usage tab and usage types | **Machines** page (section 8) |

### Good to know

- Your saved layout follows you to any computer. If you reload without saving, the saved layout comes back.
- The five code parts are changed in the code window only. They are not separate columns in the sheets.
- On a machine, **Make** and **Version** are gone. Use **Company name** instead.
- The list of what a machine can capture (VHS, Scanner and so on) is managed under **Admin → Lists → Machine usage types**.

---

## 1. Projects are now simple

**What changed:** A project is now just a **name** and a **description**. It is a folder that groups lots together.

- The old project form (owner, contacts, condition, media, photos, coordinator) is gone.
- A project no longer copies its details into the lots. Each lot keeps its own details.
- The project page no longer has "Shared details" or "Add media".

**How to use it**
1. Go to **Projects → New project**, type a name and a description, and press **Create project**.
2. On the project page, find the **Lots** box and press **Add lot**. You get two choices:
   - **Add existing lot…**: search for a lot that is already in the register and add it.
   - **Create new lot**: opens the normal New intake form. When you save, the new lots join this project automatically, and you come back to the project page.

---

## 2. Every intake makes one lot per format

**What changed:** When you register a lot with more than one kind of media (for example Photo and Video), the app now creates **one lot for each format**. Before, it sometimes made a single mixed lot.

- Two rows of the same format (two Photo rows) stay together in one lot.
- Each lot can have its own owner (the person responsible) and its own task.

### Linked lots
Lots saved together from one form are **linked**. Open any of them, go to the **Overview** tab, and you will see a **Linked lots** box listing the other lots from the same form. Click one to open it. This helps when a lot is not inside a project.

Older lots, and intakes with only one format, show no linked lots.

---

## 3. Add items: how many, which sheet, which group

**What changed:** The **Add items** window (Items tab of a lot) is now simpler and more powerful.

- **How many items:** add up to 200 at once.
- **Sheet:** choose which media type of the lot the items belong to (shown only when the lot has more than one).
- **Group:** pick an existing group, or **New group**.
  - A group holds 36 items. If you add more than fit, the rest go into a new group automatically.
  - Leave it on **Last group (continue)** to keep adding where the lot left off.
- The numbers (codes) are given automatically, one after another.

The button is now called **Add items**. The old extra fields (**Selected for digitization**, **Reason**, **File name**) were removed. New items are always selected for digitization, and the file name is filled in later.

---

## 4. Buttons on the Items tab

On a lot's **Items** tab the toolbar has been tidied up:

| Button | What it does |
|---|---|
| **Full screen ▾** | Click the main part for full screen. Click the small arrow for **Full screen**, **Expand all** and **Collapse all**. |
| **Import / Export** (up-and-down arrows icon) | One button with a small menu: **Import from Excel** or **Export to Excel**. |
| **Bulk edit (number)** | Appears when you tick rows. Opens a window to change the same thing on all ticked rows. |
| **Print tags** | Removed. |

**The filter row** has **All**, **Undecided**, **Digitize**, **Discard** and **Returned** (items whose storage choice is Return), then a **Departments** menu to show or hide whole sections. The tools sit on the right: **Set path**, **Import / Export**, then Undo, Redo, History and Changes. Column actions (add, show, hide, row height, layout) moved into the right-click menu, see section 6c.

### Bulk edit window
- Tabs at the top: **Details**, **Decision**, **Digitalization & Storage**, **Logging**.
- Fill only what you want to change. Empty fields are left alone.
- The small **×** next to a field empties that field on all ticked rows.
- Press **Apply to N**. Use **Close** to leave without changing anything.

### Sticky toolbars
These stay on screen while you scroll, so you never have to scroll back up:
- The Items toolbar (filters and buttons).
- The Master Excel toolbar.
- The bottom buttons of the **New intake** form (Back, Cancel, Review, Register lot).

---

## 5. Discard: "Yes and clear code"

**Where:** Items tab, **Discard** column (also in the Bulk edit window).

The Discard dropdown now has a third choice: **Yes and clear code**. Use it when an item is thrown away and its archive code should be released.

When you choose it (the app asks you to confirm first):
1. The row is marked **Discard**.
2. Its archive code is cleared and the row is renamed with the **first three parts of its old code, then DISCARD and a number**. For example an item `NEG-MUM-0176-R-000` becomes **NEG-MUM-R-DISCARD_1**, the next one with the same start **NEG-MUM-R-DISCARD_2**, and so on. Each different start (for example `POS-AHM-R`) counts on its own, across all lots.
3. The row moves to the **end** of its sheet.
4. The old code number is **retired** and will not be used again.

You can undo it (see History below). It cannot be used on an item that is already tagged in MLS, or on the original of a duplicate.

---

## 5b. Changing an item's code letter (R, D, M, P …)

**Where:** Items tab, click an **Archive code**. In the window, the section **Only this item** now has a **Code letter** dropdown.

- A code has five parts: `NEG-MUM-0176-R-000` is **Abbreviation 1**, **Abbreviation 2**, **Number**, **Letter** and **Last 3 digits**. In **Only this item** all five can be changed for one item.
- Changing the abbreviations gives the item the next free number of the new pair if the old number is taken there.
- **R** (original), **D** (duplicate) and **M** exist from the start. An **admin can add more letters** (such as **P**) under **Admin → Lists → Item code letters**. Letters are 1 to 3 capital letters.
- Choosing **D** asks for the **original's code** and then follows the normal "mark as duplicate" steps.
- A duplicate (D) can be given another letter: it is unlinked from its original and gets the next free number.
- Not possible when the item is tagged in MLS or is the original of a duplicate.
- **Many items at once:** tick rows, press **Bulk edit** and choose a **Code letter**. Rows that cannot change are skipped and listed. **D** is not offered in bulk, because it needs an original.

---

## 6. Master Excel: your own columns

**Where:** Master Excel toolbar, the **+ Column** button.

You can add extra columns that appear **only in the Master Excel** (never in a lot's own Items tab). Everyone sees them.

Two kinds:
- **Free text:** you type a value in each row.
- **From the lot:** the app fills it in for you from details already entered at intake, such as owner name, owner phone, owner email, owner place, origin, date received, contact, facilitator or receiver. You cannot type over these.

New columns appear at the right end under **Custom**. You can hide them from the **Columns** menu. Only an admin can remove a column (column menu **⋮ → Remove column**).

---

## 6b. Master Excel: decisions

The **Decision** columns (**Digital**, **Redigital**, **Discard**, **Decision remark**, **Result**) now show in the Master Excel for **All formats** too.

- Click a **Digital / Redigital / Discard** cell and pick **Yes**, **No** or empty. Click **Decision remark** to type.
- The same rules as in the lot apply: once a lot's decision is recorded the cells are locked (a message tells you), and deciding the last item decides the lot.
- Prasadi items have no decision, so they show a dash.
- Every change is recorded in the lot's History, so it can be undone.

---

## 6c. Master Excel and the lot's Excel now match

**One menu for everything about columns (both sheets)**
Right-click anywhere on the sheet, or right-click / click a column heading (or its ⋮). One short menu opens (**Display** opens as a dropdown beside it). The **Columns** dropdown is a button in the toolbar, next to Views on the Master Excel and in the filter row on a lot's Items tab:
- **This column** (when you click a heading): sort (Master Excel), Pin, Hide, Reset width, Show only this column, Delete or Remove for custom columns.
- **Columns** button: + Add a column, tick **whole sections** (departments), search and tick any column to show or hide it. On the Master Excel the same list includes the columns lots added to their own Excel (File Size and so on); tick one and every row shows the value from its own lot.
- **Layout:** **Save layout**, **Undo layout changes** (and, on the lot sheet, Reset column order and pins).
Toolbar buttons: **Columns** (sections and every column), **Lot columns** (Master Excel: columns lots added) and **+ Column**. The right-click menu has the column's own actions, **Display** (row height; on the Master Excel also wrap and the filter row) and Save / Undo layout.

**Master Excel**
- **Everything is editable:** text, dates, numbers, dropdowns and Yes/No cells. The lot's own rules and History apply, so a change can be undone from the lot.

**Lot's Items tab**
- **Import / Export** menu: **Copy all rows** (or **Copy N selected**) to paste into Excel.
- **Drag to move:** every column heading has a grab handle (⠿). Drag a column left or right and drop it (moving a column is by drag only, it is not in the right-click menu). On the lot's sheet a column moves inside its own department.
- **Save layout** (both sheets): right-click and choose **Save layout**. Your changes (order, pins, widths, hidden columns, row height) are a draft until you save. The saved layout is kept on your account, so it follows you to any computer. **Undo layout changes** goes back to the saved one. If you reload without saving, the saved layout comes back.

---

## 7. Version history, Undo and Redo

**Where:** Items tab of a lot, three buttons at the right of the toolbar: **↶** (Undo), **↷** (Redo) and a **clock** (History).

The app now remembers every change made to a lot's sheet, from now on. Nothing is ever deleted from the history.

### Undo and Redo
- **↶ Undo** reverses **your** latest change. Hover over it to see what it will undo.
- **↷ Redo** brings it back.
- Keyboard: **Ctrl+Z** to undo, **Ctrl+Shift+Z** (or **Ctrl+Y**) to redo. (This does not work while you are typing in a cell.)
- After a Bulk edit, a message appears with an **Undo** link for a few seconds.
- A change made in one go (for example a Bulk edit of 200 rows) is **one** step.

### What can be undone
Cell changes, Bulk edits, Excel imports, added items (they are removed again), **Discard: Yes and clear code** (the code comes back), changed codes, reordered rows, and decisions.

### If someone else changed the same cell
The app never overwrites someone's later work. It tells you which rows changed since and stops. You can choose **Do the rest**, which undoes everything else and leaves those rows as they are.

### Reopening a decision
Undoing the change that decided a lot **reopens the decision** and puts the lot back to its earlier stage. This is allowed only if nothing has happened since: it is refused once items have been digitalized, tagged in MLS, or marked returned or discarded.

### See the changes right in the sheet (clock button)

The clock opens a **panel on the right**, and the sheet stays on screen. It works like Google Sheets version history.

- **Sessions:** your work grouped by time (a new session starts after 30 minutes without edits). **Click a session** and the sheet itself switches to how it looked right after it. The cells that session changed are **highlighted**:
  - the cell is drawn **like a code diff**: the **last value in red** with a minus (struck through) and the **new value in green** with a plus, one above the other;
  - a thin **bar at the left edge** of the cell is the color of the person who changed it (the bar above the sheet shows who is which color); **hover** the cell to see who and when;
  - **added rows** are green; **removed rows** are faded and struck through;
  - a bar above the sheet names the session, counts the highlighted cells and shows who is which color.
- **Versions:** press **Save** to give the current sheet a name, for example "Before the Mumbai import". The app also saves one by itself before an Excel import, a large Bulk edit, or a restore. **Click a version** to see the sheet as it was then. The cells that **changed since** that version are highlighted.
- **Find a row:** type an archive code to see who changed that row, when, and from what.
- In the bar above the sheet: **Back to current** leaves the history view, and **Restore this** puts the sheet back to that point (it asks first). Restoring is saved as a **new change**, so a restore can also be undone.
- While you look at the past, the sheet is **read only**.
- **Export to Excel** (in the same bar, also under **Changes**): downloads the sheet you are looking at as an Excel file.
  - Cells that session changed are **green** and bold; the **old value is in the cell's note** (hover or right-click the cell in Excel).
  - Added rows are green and removed rows are red.
  - An extra **Changes** sheet lists every change: item, column, old value, new value, who changed it and when.
  - The file name says what it is, for example `LOT-2026-0676-session-2026-11-19-1432.xlsx`. These files are for reading and sharing, not for importing back.

### Show changes on the normal sheet

Next to the clock there is a **Changes** button. It highlights what changed on the **current** sheet: **Since my last session**, **Today**, or **Since** a saved version. It is off by default. Choose **Off** to switch it off.

**Good to know:** history starts from the day this feature was switched on. Changes made earlier are not in it.

---

## 8. Machines: company, bills, repair comments and usage

- **Add / Edit machine:** there is now a **Company name**. **Make** and **Version** are gone.
- **Report a fault** and **Close repair** have a **Bill file path** box. It works like the Excel's File path: type it, paste it, or drop the file or folder on it.
- **Close repair** also has a **Comment** box. The comment shows in the repair list and in the machine's History.
- **Usage** (new tab on every machine): press **Add usage** and give the **date**, **what it captured** and **how many**. The tab shows every entry, the **total per type** and the **grand total**. The Machines list shows the total next to each machine.
- **What it captured** comes from a list you manage under **Admin → Lists → Machine usage types**: Video (VHS, UMT, MDV and DVC, DVD players, VCD, Hi8, BetaCam, Misc), Audio (Tape Recorder, MDC, Misc), Photo (Scanner, Misc) and Misc (Mix machine). Add more there any time.
- **Mark returned** has an optional **Captured while it was out** block. Each row you add becomes a usage entry dated the return day.

---

## 9. Letters (the Documents format)

A new way to register letters, with their own stages.

**Intake**
- Choose the **Documents** format. The sub-type is fixed as **Letter**. Each row has its own **Guru** (YGJ, PSM or MSM), **Data type** (Physical, Digital or Physical + Digital) and **Quantity**. Rows with different Gurus are saved as **separate lots** (linked to each other), one per Guru.
- The Guru list is under **Admin → Lists → Letter gurus**, so more can be added later.

**No automatic codes**
- After you save, a window lists every letter (one row for each in the Quantity) with **no code**.
- Press **Choose scanned files…** and pick the scanned letters from your computer. The **file name, without .pdf or .jpg, becomes the letter's code**. Many files at once fill the empty rows in name order. **Choose / Change** on a row sets one letter.
- A code that already exists anywhere in the archive, or is picked twice, is refused. Only the file name is used. The browser does not tell the app which folder the file is in.
- The same window opens later from **Items → Set codes from files**, or by clicking a letter's code.
- Letters added later with **Add items** also wait for a file. Setting codes is saved in the lot's History, so it can be undone.

**Stages**
- A letters lot has its own cycle: **Scan & storage → Rewrite → Type → Recheck → Topics → Final edit**. The usual Data entry, Decision, Digitalization and MLS stages do not apply to it.
- The bar at the top of the lot shows where it is. **Move to …** and **Back to …** change the stage, and each move is in the lot's Activity.
- A lot cannot leave **Scan & storage** until every letter has a code.
- Stage names can be renamed in **Admin → Lists → Stages**. The letters stages are not columns of the main pipeline board.

**The letters sheet** shows only the letter's **code**, what it is, a **remark** and the lot columns in the Master Excel. Nothing about decisions, digitalization or storage.

**One thing to know:** after **Final edit** the lot stays at Final edit. There is no "finished" stage yet.

---

## Quick answers

**I cannot see the Undo buttons.** They show on a lot's Items tab. Undo and Redo need permission to edit the lot.

**I pressed Undo and got "Some cells changed since".** Someone edited the same rows after you. Choose **Do the rest** or cancel.

**Where did "Print tags" go?** It was removed from the Items tab.

**Can I undo someone else's change?** Open **History → Sessions**, expand their session and press **Undo this**. The app checks nothing newer was changed on those cells.
