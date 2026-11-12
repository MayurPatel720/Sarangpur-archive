# What's new in the Archive Tracker

A plain-English guide to the latest changes. No technical knowledge needed.

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

The old extra fields (**Selected for digitization**, **Reason**, **File name**) were removed. New items are always selected for digitization, and the file name is filled in later.

---

## 4. Buttons on the Items tab

On a lot's **Items** tab the toolbar has been tidied up:

| Button | What it does |
|---|---|
| **Full screen ▾** | Click the main part for full screen. Click the small arrow for **Full screen**, **Expand all** and **Collapse all**. |
| **Import / Export** (up-and-down arrows icon) | One button with a small menu: **Import from Excel** or **Export to Excel**. |
| **Bulk edit (number)** | Appears when you tick rows. Opens a window to change the same thing on all ticked rows. |
| **Print tags** | Removed. |

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
2. Its archive code is cleared and the row is renamed **discard-1**, then **discard-2**, **discard-3** and so on.
3. The row moves to the **end** of its sheet.
4. The old code number is **retired** and will not be used again.

You can undo it (see History below). It cannot be used on an item that is already tagged in MLS, or on the original of a duplicate.

---

## 6. Master Excel: your own columns

**Where:** Master Excel toolbar, the **+ Column** button.

You can add extra columns that appear **only in the Master Excel** (never in a lot's own Items tab). Everyone sees them.

Two kinds:
- **Free text:** you type a value in each row.
- **From the lot:** the app fills it in for you from details already entered at intake, such as owner name, owner phone, owner email, owner place, origin, date received, contact, facilitator or receiver. You cannot type over these.

New columns appear at the right end under **Custom**. You can hide them from the **Columns** menu. Only an admin can remove a column (column menu **⋮ → Remove column**).

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

### The History window (clock button)
Three tabs:
- **Sessions:** your work grouped by time. A new session starts after 30 minutes without edits. Open a session to see each change; press **Cells** to see the old and new values. You can **Undo this**, **Undo session**, or look at the **Sheet before this**.
- **Versions:** press **Save version** to give the current sheet a name, for example "Before the Mumbai import". The app also saves a version by itself before an Excel import, a large Bulk edit, or a restore. **Compare / Restore** shows exactly what would change (how many rows and cells) before you confirm.
- **Find a row:** type an archive code to see who changed that row, when, and from what.

Restoring is saved as a **new change**, so a restore can also be undone.

**Good to know:** history starts from the day this feature was switched on. Changes made earlier are not in it.

---

## Quick answers

**I cannot see the Undo buttons.** They show on a lot's Items tab. Undo and Redo need permission to edit the lot.

**I pressed Undo and got "Some cells changed since".** Someone edited the same rows after you. Choose **Do the rest** or cancel.

**Where did "Print tags" go?** It was removed from the Items tab.

**Can I undo someone else's change?** Open **History → Sessions**, expand their session and press **Undo this**. The app checks nothing newer was changed on those cells.
