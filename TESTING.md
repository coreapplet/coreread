# Testing

Two layers: automated suites you run with one command, and manual checks for the things no headless browser can verify.

Run the automated ones before every commit. Run the manual pass before tagging a release.

---

## Automated

```bash
node tests/verify.js          # no install needed
```

```bash
cd tests && npm install
npm run test:all              # adds interaction + browser
```

See [`tests/README.md`](tests/README.md) for what each layer covers and why three are needed.

| Suite | Command | Assertions | Needs |
|---|---|---|---|
| Static | `node tests/verify.js` | 67 | nothing |
| Interaction | `node tests/interaction.js` | 46 | `npm install` |
| Browser | `node tests/browser.js` | 28 | `npm install` + a Chromium browser |

`browser.js` uses whatever Chrome, Edge or Chromium you already have. Override with `CHROME_PATH=...` if detection fails.

---

## Manual pass

Roughly ten minutes. Everything here is something the automated suites structurally cannot check — real file dialogs, real permission prompts, real OS integration, and whether it actually feels right.

### 1. First run, no folder

Open `CoreRead.html` directly in Chrome or Edge.

- [ ] Welcome screen appears, nothing behind it
- [ ] **Open folder…** and **Try the demo** are both readable
- [ ] "Built by Coreapplet" is orange, not browser-default blue
- [ ] The badge top-left is the document glyph, matching the app icon

### 2. Demo content

Click **Try the demo**.

- [ ] Three documents in the sidebar, `GUIDES` group heading above the nested one
- [ ] Tables render with borders and the right/left column alignment
- [ ] Code blocks show a language label; a **Copy** button appears on hover and works
- [ ] The amber warning callout and the accent note callout look distinct
- [ ] Table of contents on the right, and the current section highlights as you scroll

### 3. Reading position

- [ ] Open **Configuration**, scroll halfway down
- [ ] Click **Welcome to CoreRead**, then click back to **Configuration**
- [ ] It returns to where you were, not the top
- [ ] Press `F5`. Position still restored

### 4. Keyboard only

Put the mouse down for this one.

- [ ] `Ctrl` + `K` focuses search
- [ ] `↓` from the search box moves into the document list
- [ ] `↓` and `↑` walk the list and open each document as you go
- [ ] `Home` / `End` jump to first and last
- [ ] `Enter` opens the focused document
- [ ] `Ctrl` + `B` collapses and expands the sidebar
- [ ] `Ctrl` + `J` toggles the theme
- [ ] `Alt` + `←` / `→` go back and forward
- [ ] Every focused element shows a visible focus ring

### 5. Sidebar collapse

- [ ] Collapse it. The toggle button stays visible in the narrow rail
- [ ] You can reopen with that button alone, no keyboard needed
- [ ] Collapse, close the window, reopen — still collapsed, still reopenable

### 6. Real folder

- [ ] **Open folder…** and pick a folder of your own Markdown
- [ ] Browser asks permission. Grant it
- [ ] Sub-folders appear as group headings, numeric prefixes stripped
- [ ] Cross-links between your documents navigate in-app
- [ ] A link to a file outside the folder appears dimmed
- [ ] Edit a document in your editor, save, press `F5` — the change appears
- [ ] Close the window, reopen — it offers to reopen the same folder

### 7. Search

- [ ] `Ctrl` + `K`, type a word you know appears in several files
- [ ] Results show the filename and a snippet with the term highlighted
- [ ] Clicking a result opens that document
- [ ] `Esc` clears the search and restores the file tree

### 8. Both themes

Do a full pass in each, `Ctrl` + `J` to switch.

- [ ] All text readable — sidebar headings, keyboard hints, the version stamp
- [ ] The badge reads as a document, not a smudge
- [ ] Code blocks, callouts and tables all legible
- [ ] Nothing invisible on the welcome screen

### 9. Narrow window

Drag the window narrow, or use `F12` device emulation.

- [ ] Below roughly 700px the sidebar becomes an overlay and starts closed
- [ ] Picking a document closes the overlay automatically
- [ ] No horizontal scrollbar at any width down to 320px
- [ ] Document text stays readable, tables scroll inside their own box

### 10. Print

- [ ] `Ctrl` + `P`
- [ ] Preview shows only the document — no sidebar, no top bar, no table of contents
- [ ] Code blocks and tables don't split awkwardly across pages

### 11. Launchers

**Windows** — double-click `CoreRead.vbs`

- [ ] Security warning appears once; **Open** runs it
- [ ] Window has no address bar and no tabs
- [ ] It has its own taskbar entry and can be pinned

**macOS** — right-click `CoreRead.command` → **Open**

- [ ] Gatekeeper prompt appears once, then it runs
- [ ] Own Dock entry

**Linux** — `chmod +x CoreRead.sh && ./CoreRead.sh`

- [ ] Opens in a chromeless window

### 12. Install as an app

On the hosted version, not the local file.

- [ ] Install icon appears in the address bar
- [ ] Installing produces the **orange document icon**, not a letter tile
- [ ] It appears in the Start menu / Dock and opens in its own window
- [ ] Uninstalling from OS settings works

### 13. Offline

The point of the service worker. Only works on the hosted version.

- [ ] Open the installed app once while online, so the worker installs
- [ ] `F12` → **Application** → **Service Workers** shows one activated
- [ ] Turn off Wi-Fi, or tick **Offline** in the Network tab
- [ ] Close the app and reopen it — **it still loads**
- [ ] `#demo` still works offline

### 14. Privacy claims

Worth re-checking whenever the app changes, because the README makes these promises.

- [ ] Opened from disk: `F12` → **Network**, use the app for a minute. **Zero requests**, not even the page itself
- [ ] Hosted: exactly one extra request, `sw.js`, same origin. Nothing else, ever
- [ ] `F12` → **Application** → **Local Storage**: only `coreread:theme`, `coreread:sidebarHidden`, `coreread:last:*`, `coreread:scroll:*`, `coreread:checks:*`. No document text anywhere
- [ ] Your Markdown folder is unchanged — no new files, nothing modified, timestamps intact

---

## Before tagging a release

1. `npm run test:all` in `tests/` — all three suites green
2. Manual sections 1–10 at minimum
3. Sections 11–13 if the launchers, manifest or service worker changed
4. Section 14 always — it's what the README promises

If a manual check fails and the automated suites didn't catch it, add a test. That's how the browser suite came to exist.
