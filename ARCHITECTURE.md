# Architecture

Design notes for anyone working on CoreRead, including future-you.

The README explains what the tool does. This explains why it's built the way it is, and which parts are fragile.

---

## Picking this up cold

If you're returning to this after months away, or handing it to someone else:

1. **Read the Core constraint and Known traps sections below.** Between them they explain every non-obvious decision in the codebase. The traps in particular — all seven caused real bugs, and six of them are the kind that pass every text-based check while the rendered page is broken.
2. **Run `node tests/verify.js`.** No install needed. If it passes, the repo is in a known-good state.
3. **Open `CoreRead.html` and read the numbered section headers.** The file is one script in numbered sections; the map is in *Application structure* below.
4. **Before changing any CSS, read Known traps.** Then verify with `npm run test:browser` — it's the only layer that can see rendering. Note the attribution table under *Testing*: most of these were caught by a person looking at the app, not by a suite.

The whole application is one file. There is no framework to learn, no build to run, and no hidden state beyond a handful of preference values in browser storage.

---

## Core constraint

**Everything ships in one HTML file.** No build step, no bundler, no dependencies, no third-party code.

This is not minimalism for its own sake. The tool's entire value is being available instantly and working offline — the moment it needs `npm install` or a CDN, it competes with editors and loses.

Practical consequences:

- CSS and JavaScript are inline. There is no `src/` and nothing to compile.
- The Markdown parser is hand-written (~300 lines). Pulling in `marked` or `markdown-it` would mean either a build step or a CDN. Both are disqualifying.
- Third-party libraries are effectively banned in the app. Dev tooling in `tests/` is exempt — it never ships.
- Any change that introduces a second source file needs a very good reason.

The release workflow enforces this: it fails the build if it finds an external `<script src>`, an external stylesheet, or any `fetch` / `XMLHttpRequest` / `sendBeacon`. The single deliberate exception is documented under *Offline* below.

---

## File layout

```
CoreRead.html              the entire application
CoreRead.vbs               Windows launcher
CoreRead.command           macOS launcher
CoreRead.sh                Linux launcher
build-release.sh           builds the three platform zips
.github/workflows/
  release.yml              builds + publishes on a v* tag
  pages.yml                deploys the demo on push to main
tests/                     dev tooling, never bundled
TESTING.md                 automated suites + manual checklist
```

The launchers all do the same thing: locate `CoreRead.html` next to themselves and open it in a Chromium browser with `--app=file:///...`, which produces a chromeless window with its own taskbar entry. They are the only reason the tool feels like a native app rather than a browser tab.

---

## Application structure

`CoreRead.html` is organised in numbered sections:

| Section | Responsibility |
|---|---|
| 1 | Markdown parser — block scanner, then inline pass |
| 2 | App state (`S`), `localStorage` and `IndexedDB` wrappers |
| 3 | Loading files — folder handle, folder input, demo docs |
| 4 | Sidebar tree |
| 5 | Opening documents, TOC, cross-link resolution, history |
| 6 | Search |
| 7 | TOC scroll-spy |
| 8 | Event wiring |
| 9 | Startup, service worker registration |

### The parser

Two passes. `blocks()` scans line by line for fenced code, headings, tables, blockquotes, lists and paragraphs. `inline()` handles emphasis, code spans, links and images within a line.

Code spans are extracted to placeholders *before* HTML escaping, then restored after. The placeholders are `\u0000<n>\u0000`. This matters: if those sentinels are ever written as raw control bytes rather than escape sequences, the HTML parser replaces them with U+FFFD and the substitution silently breaks. Keep them as `\u0000` escape sequences.

Hard line breaks use `\u0001` as a sentinel for the same reason.

### State that persists

Preferences only, all in the browser's own storage, never in the user's folder:

| Store | Key | Contents |
|---|---|---|
| localStorage | `coreread:theme` | `"light"` or `"dark"` |
| localStorage | `coreread:sidebarHidden` | boolean |
| localStorage | `coreread:last:<folder>` | last document *path* |
| localStorage | `coreread:scroll:<folder>:<doc>` | reading position, in pixels |
| localStorage | `coreread:checks:<folder>:<doc>` | task-list tick state |
| IndexedDB | `dir` | folder handle (a permission token) |

Document text is never written anywhere. It lives in the `S.files` Map and dies with the page.

---

## Known traps

These have all bitten this codebase. Check them before changing CSS.

### 1. Author `display` defeats the `hidden` attribute

The UA stylesheet's `[hidden] { display: none }` loses to *any* author rule that sets `display`. Both `.welcome` and `.wrap` use `display: grid`, so setting `.hidden = true` on them did nothing and the welcome screen rendered on top of every document.

The fix is a single rule near the top of the stylesheet:

```css
[hidden] { display: none !important; }
```

**Do not remove it.** Any new element hidden via the `hidden` attribute depends on it.

### 2. Theme-scoped rules out-specify modifier classes

`[data-theme="dark"] .btn` is specificity (0,2,0). `.btn--ghost` is (0,1,0). The theme rule wins, so in dark mode the ghost button inherited near-black text on a dark background and its label became invisible.

Any modifier that overrides a themed property must match the theme rule's specificity:

```css
.btn--ghost,
[data-theme="dark"] .btn--ghost { color: var(--r-text); }
```

### 3. Collapsing a container that holds its own toggle

The sidebar collapse originally set the grid column to `0`. The toggle button lives in that column, so collapsing it hid the only way to bring the sidebar back — and the state persisted across restarts, making it permanent.

The collapsed state now keeps a 46px rail. **Any collapsible region must leave its own control reachable.**

### 4. Unguarded browser APIs kill the whole script

`matchMedia` was called at top level. On any engine lacking it, that line throws and every subsequent line — including all event wiring — never runs. The app loads and no button works.

Every optional API is now wrapped in `try`/`catch` or a `typeof` check: `matchMedia`, `indexedDB`, `localStorage`, `showDirectoryPicker`.

### 5. A fixed sidebar width breaks narrow viewports

The sidebar was a hard 290px at every width. Below ~500px it crushed the document to under 100px and forced horizontal overflow. Under 700px it is now a fixed-position overlay that starts collapsed and closes itself after a document is chosen.

### 6. Ink that matches the surrounding surface

The header mark was a "CR" monogram whose ink was `#14181A` while the header behind it was `#1A1F21` — **1.07:1**. The letters read as holes punched through to the background rather than text on a badge. Every contrast test passed, because they compare text against *its own* background and never against the surrounding surface.

It is now the same document glyph as the app icon, which also means the in-app mark and the taskbar icon are one thing rather than two. **If you put text inside a coloured badge, check its ink against the surface the badge sits on, not just against the badge.**

### 7. Contrast tokens

`--r-text-faint` is used by keyboard hints, sidebar group headings, the TOC title and the version stamp. It sits on two different backgrounds (`--r-bg` and `--r-bg-sub`), so it must clear 4.5:1 against **both**. Current values are tuned to ~4.6:1 on the tighter of the two. Changing this token requires re-running the contrast test.

---

## Offline

A service worker cannot be inlined — it must be a separate same-origin file — so committing one would break the single-file rule.

`pages.yml` therefore **generates `sw.js` at deploy time**. The repo stays one file; the hosted install gains real offline. The app registers `./sw.js` behind a `location.protocol.startsWith("http")` guard, so opening from disk skips it entirely, where there is no origin and no worker to register.

The cache key embeds the version string and a hash of `CoreRead.html`, so every deploy that changes the app invalidates the old cache automatically. Strategy is cache-first: nothing here is dynamic, so a stale hit is always correct until the key changes.

This is the only network-touching call in the entire app, and it is same-origin and relative. `tests/verify.js` enforces both.

---

## Platform limits

Not bugs. Don't try to fix them.

**Folder access is desktop-Chromium only.** `showDirectoryPicker` is unimplemented in Safari on any OS, in Chrome for Android, and in Firefox everywhere. `webkitdirectory` is desktop-only in practice. Mobile browsers can open individual files but never a folder.

**The permission prompt is unavoidable.** The browser shows "Allow this site to view and copy files?" on every folder grant. The wording is Chrome's blanket phrasing for read access and cannot be customised. After a browser restart the grant is often downgraded to "ask", and re-requesting it requires a user gesture — hence the **Reopen** button rather than a silent retry.

**Code signing is out of scope.** The launchers trigger SmartScreen and Gatekeeper warnings once. Certificates cost roughly $100–400/year (Windows) and $99/year (Apple), which does not pay back for a free tool. The README explains the warning instead.

---

## Release process

```bash
git tag v1.0.0
git push origin v1.0.0
```

That's the whole thing. `release.yml` then:

1. Verifies the inline script parses and the app has no external assets or network calls
2. Runs `build-release.sh`, which stamps the version into `CoreRead.html` and builds three platform zips
3. Publishes a release with all three zips plus the raw `CoreRead.html`

`build-release.sh` rewrites the version stamp in place, so running it locally modifies `CoreRead.html`. That's intentional — it keeps the in-app version and the tag in sync.

`dist/` is gitignored. CI regenerates it; local copies only go stale.

Pushing to `main` separately triggers `pages.yml`, which publishes the app as the site root. `#demo` in the URL loads the built-in sample docs, which is what makes the hosted demo usable without a local folder.

---

## Testing

See [`tests/README.md`](tests/README.md).

Three layers, because no single one is sufficient:

- **Static checks** catch content and structural problems but cannot see rendering
- **jsdom** exercises wiring and state but has no layout engine, and its CSS cascade is unreliable — it reports `display: none` for the `[hidden]` case above, which is the wrong answer
- **Real Chromium** is the only layer that can measure geometry and contrast

Attribution, because it decides where new assertions belong:

| Trap | Found by |
|---|---|
| 1 — `[hidden]` defeated by author `display` | looking at the running app |
| 2 — dark ghost button invisible | looking at the running app |
| 3 — collapse hid its own toggle | looking at the running app |
| 4 — unguarded `matchMedia` | `interaction.js` |
| 5 — fixed sidebar width on phones | `browser.js` |
| 6 — badge ink against the surface behind it | looking at the running app — **the contrast suite passed it** |
| 7 — contrast tokens on two backgrounds | `browser.js`, 34 elements below AA |

Static analysis passed cleanly through all seven. Any significant CSS change should be verified with `npm run test:browser`.

Trap 6 is the one to remember: an automated suite reported success on it. Contrast checks compare text against *its own* background, and that badge's ink was fine against the badge while nearly invisible against the header the badge sat on. A suite only fails on questions someone thought to ask.

---

## Roadmap

### Shipped in v1.0.0

Everything described in the README, plus two things worth calling out because they constrain future changes:

**Installability.** The favicon and the web app manifest are both inline `data:` URIs, so the single-file rule holds. Chrome and Edge install the hosted version as a desktop app with its own icon and window; Android offers add-to-home-screen. Verified with `Page.getAppManifest` and `Page.getInstallabilityErrors` — the manifest parses, both icon entries decode, and there are no blocking installability errors.

Manifest icons as `data:` URIs have patchy historical support, which is why that check exists. The icons must also be **PNG**: Chrome and Edge rasterise manifest icons when creating a Windows shortcut, and an SVG entry silently fails that path and falls back to a letter tile. If you change the icon, re-run `tests/` and confirm the manifest still parses.

**Offline**, as described above.

### Possible next

**Mobile input.** Multi-file selection via `<input type="file" multiple>` so phones can open several documents at once, and 44px minimum tap targets (currently 30px). No folder support — see platform limits.

**Not planned: file association.** Making Windows open `.md` files with CoreRead would require the launcher to read the file itself and pass its contents through the URL fragment, because a browser page cannot accept a file path as a command-line argument. Feasible, but Windows-only and awkward.

**Not planned: code signing.** An Authenticode certificate would replace "Unknown Publisher" on the `.vbs`, at $200–400/year, and would not remove Mark of the Web warnings on files extracted from a downloaded zip. Installing the hosted version as an app avoids the warning entirely and costs nothing.

**Possible later.** Additional formats under the same reader UI — the sidebar-plus-document layout works as well for PDF or EPUB as it does for Markdown. The name was chosen to accommodate this: "CoreRead" describes reading, not Markdown.

**Explicitly rejected.** Native app-store builds via Electron, Tauri or Capacitor. They would gain real folder access on mobile, but cost annual certificate fees, a per-platform build pipeline, store review, and the "one HTML file, no install" property that makes the tool worth having.
