# Tests

Development tooling. Nothing here is bundled into a release — `build-release.sh` copies only the app, one launcher, the README and the LICENSE.

---

## Running them

```bash
cd tests
node verify.js          # no install needed
```

`verify.js` needs nothing but Node. Run it before any commit.

The other two need dependencies:

```bash
cd tests
npm install
npm run test:all
```

`browser.js` uses whatever Chrome, Edge or Chromium you already have installed — it does not download a browser. If detection fails:

```bash
CHROME_PATH="/path/to/chrome" node browser.js
```

On Windows PowerShell:

```powershell
$env:CHROME_PATH="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
node browser.js
```

---

## The three layers

Each catches a class of problem the others structurally cannot.

### `verify.js` — static, zero dependencies

Reads the source as text. Checks repo contents, the single-file invariants (no external assets, no network calls beyond the same-origin worker, no file-writing APIs), known CSS trap patterns, parser output against the built-in demo docs, README claims against the code, that every in-page README anchor still resolves, what the release bundle does to the README, which storage keys the app writes, version consistency, and git line-ending config.

Fast, and the only one that runs anywhere.

### `interaction.js` — jsdom

Loads the real file, executes the real script, then clicks through the app: loads documents, navigates the sidebar, follows cross-links, uses back/forward, collapses and reopens the sidebar, searches and clears, toggles the theme, fires every shortcut.

**jsdom has no layout engine and its CSS cascade is unreliable.** It resolves the `[hidden]` plus `display: grid` case incorrectly, reporting `none` where a real browser reports `grid`. Never put a visibility, geometry or colour assertion here — it will produce a false pass.

### `browser.js` — real Chromium

The only layer that can measure anything visual. Checks that every interactive control has non-zero size, is not covered by another element, and sits inside the viewport. Checks horizontal overflow at five widths from 320px to 1440px. Audits contrast on **every** text element across both themes and three screens.

Slowest, and the one that matters most for CSS changes.

---

## Which to run when

| Change | Run |
|---|---|
| README, docs, workflows | `verify.js` |
| Parser or app logic | `verify.js` + `interaction.js` |
| Any CSS at all | all three — `browser.js` is not optional here |
| Before tagging a release | `npm run test:all` |

---

## Why this exists

Six bugs reached a build of this app. Four were caught by a person looking at the
running app; two by these tests. Every one of the six was invisible to static
analysis:

| Bug | Found by |
|---|---|
| Welcome screen rendered over every document | manual use |
| Collapsing the sidebar hid its own toggle permanently | manual use |
| Ghost button text invisible in dark mode | manual use |
| Header badge ink at 1.07:1 against the surface behind it | manual use — the contrast suite passed it |
| Unguarded `matchMedia` could kill the entire script | `interaction.js` |
| Sidebar crushed documents to 14px on phones | `browser.js` |

The pattern is consistent: text-level checks pass while the rendered page is
broken. That is what `browser.js` is for.

Two of those turned into permanent coverage rather than one-off fixes. The ghost
button prompted a full contrast audit in `browser.js`, which then found **34
further elements** below WCAG AA that nobody had noticed. `browser.js` now
re-checks every text element on three screens in both themes on every run.

The badge is the sharpest lesson, because an automated suite reported success on
it. Contrast checks compare text against *its own* background; that badge's ink
was fine against the badge and near-invisible against the header the badge sat
on. A suite can only fail on a question someone thought to ask.

See [`../ARCHITECTURE.md`](../ARCHITECTURE.md) for the specific CSS traps these guard against.
