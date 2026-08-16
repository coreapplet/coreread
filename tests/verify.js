/* Static verification — no dependencies, runs with plain `node`.
 *
 * Covers: repo structure, the single-file invariants the project depends on,
 * CSS trap patterns, parser correctness against the built-in demo docs, and
 * whether the README's claims still match the code.
 *
 *   node tests/verify.js
 */

const fs = require("fs");
const path = require("path");
const L = require("./lib");

const R = L.reporter("CoreRead — static verification");
const { src, css, js, body } = L.parts();
const files = L.repoFiles();
const readme = L.read("README.md");

/* ---------------------------------------------------------------- 1 */
R.section("1. REPO CONTENTS");
R.note(files.length + " files, " + Math.round(files.reduce((n, f) => n + f.size, 0) / 1024) + " KB");
for (const req of ["CoreRead.html", "CoreRead.vbs", "CoreRead.command", "CoreRead.sh",
                   "README.md", "LICENSE", "build-release.sh", ".gitattributes", ".gitignore"]) {
  R.ok(files.some(f => f.rel === req), "present: " + req);
}
R.ok(!files.some(f => f.rel.startsWith("dist/")), "no build output committed");

/* ---------------------------------------------------------------- 2 */
R.section("2. SINGLE-FILE INVARIANTS");
R.ok(!/<script[^>]+src=/.test(src), "no external script tag");
R.ok(!/<link[^>]+stylesheet/.test(src), "no external stylesheet");
R.ok(!/\bfetch\(|XMLHttpRequest|sendBeacon|new WebSocket|new EventSource/.test(js),
     "no fetch / XHR / beacon / socket anywhere in the app");
const swReg = (js.match(/navigator\.serviceWorker\.register/g) || []).length;
R.ok(swReg <= 1, "at most one network-touching call: the same-origin sw.js registration");
R.ok(!/register\(["'](https?:|\/\/)/.test(js), "service worker path is relative, never a remote URL");
R.ok(!/createWritable|showSaveFilePicker|removeEntry/.test(js),
     "no file-writing APIs — the app is read-only by construction");
R.ok((src.match(/<script/g) || []).length === 1, "exactly one script block");
R.ok((src.match(/<style/g) || []).length === 1, "exactly one style block");
// Compile the inline script without running it. A syntax error here is a blank
// page for every user, so the release workflow gates on this check.
let parseErr = null;
try { new Function(js); } catch (e) { parseErr = e.message; }
R.ok(!parseErr, "inline script parses" + (parseErr ? " — " + parseErr : ""));
R.ok(!/[\u0000-\u0008]/.test(src), "no raw control bytes (sentinels must be \\u escapes)");

/* ---------------------------------------------------------------- 3 */
R.section("3. CSS TRAPS");
// (a) author display rules defeat the [hidden] attribute
R.ok(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(css),
     "[hidden] override present — required by .welcome and .wrap");
R.ok(css.indexOf("[hidden]") < css.indexOf(".welcome {"),
     "override declared before the rules it counteracts");

// (b) theme-scoped rules out-specifying modifier classes
const themed = [...css.matchAll(/\[data-theme="dark"\]\s+\.([\w-]+)\s*\{([^}]*)\}/g)];
let clashes = 0;
for (const [, cls, decl] of themed) {
  for (const prop of (decl.match(/([a-z-]+)\s*:/g) || []).map(p => p.replace(":", "").trim())) {
    const mods = [...css.matchAll(new RegExp("\\." + cls + "--[\\w-]+[^{]*\\{([^}]*)\\}", "g"))];
    for (const [whole, mdecl] of mods) {
      if (new RegExp(prop + "\\s*:").test(mdecl) && !whole.includes('[data-theme="dark"]')) {
        console.log("   FAIL  ." + cls + "--* sets " + prop + " but is out-specified by the dark theme rule");
        clashes++;
      }
    }
  }
}
R.ok(clashes === 0, "no modifier class is out-specified by a theme rule");

// (c) a collapsed container must not hide its own toggle
R.ok(!/grid-template-columns:\s*0\s/.test(css), "no grid track collapsed to zero width");
const rail = css.match(/body\.no-side\s+\.app\s*\{[^}]*grid-template-columns:\s*(\d+)px/);
R.ok(rail && Number(rail[1]) >= 40, "collapsed sidebar keeps a rail wide enough for its toggle");

// (d) optional browser APIs must be guarded
const code = js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
for (const api of ["matchMedia", "indexedDB", "localStorage", "showDirectoryPicker"]) {
  const lines = code.split("\n");
  const sites = lines.map((l, i) => new RegExp(api + "\\s*[(.]").test(l) ? i : -1).filter(i => i >= 0);
  const guarded = sites.every(i => {
    const ctx = lines.slice(Math.max(0, i - 4), i + 2).join("\n");
    return /\btry\s*\{[\s\S]*\bcatch\b/.test(lines[i]) || /\btry\s*\{/.test(ctx) ||
           new RegExp("typeof\\s+" + api).test(ctx) ||
           new RegExp("window\\." + api + "\\s*\\)").test(ctx);
  });
  R.ok(sites.length === 0 || guarded, api + " guarded at all " + sites.length + " call site(s)");
}

// (e) every button must be wired and named
const btns = [...body.matchAll(/<button[^>]*id="(\w+)"/g)].map(m => m[1]);
R.ok(btns.every(b => new RegExp('\\$\\("' + b + '"\\)\\.addEventListener').test(js)),
     "all " + btns.length + " buttons have click handlers");
const unnamed = [...body.matchAll(/<button\b[\s\S]*?<\/button>/g)].map(m => m[0]).filter(el =>
  !/aria-label=|title=/.test(el.slice(0, el.indexOf(">") + 1)) &&
  !el.replace(/<[^>]+>/g, "").trim());
R.ok(unnamed.length === 0, "every button has an accessible name");

/* ---------------------------------------------------------------- 3b */
R.section("3b. NO DEAD CSS");
// A design token nobody reads is dead weight in a file whose whole pitch is
// its size. `--r-shadow` shipped unused once; this stops it recurring.
const declaredVars = new Set([...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map(m => m[1]));
const readVars = new Set([...src.matchAll(/var\(\s*(--[\w-]+)/g)].map(m => m[1]));
const deadVars = [...declaredVars].filter(v => !readVars.has(v)).sort();
const ghostVars = [...readVars].filter(v => !declaredVars.has(v)).sort();
R.ok(deadVars.length === 0,
     "every custom property is read somewhere" + (deadVars.length ? " — unused: " + deadVars.join(", ") : ""));
R.ok(ghostVars.length === 0,
     "every var() resolves to a declaration" + (ghostVars.length ? " — missing: " + ghostVars.join(", ") : ""));

/* ---------------------------------------------------------------- 4 */
R.section("4. PARSER vs BUILT-IN DEMO DOCS");
const { renderMarkdown, DEMO_DOCS } = L.loadParser();
const keys = new Set(Object.keys(DEMO_DOCS));
let parseProblems = 0, deadLinks = 0;

for (const [docPath, md] of Object.entries(DEMO_DOCS)) {
  const { html: out, toc } = renderMarkdown(md);
  const count = re => (out.match(re) || []).length;
  const bad = [];
  for (const t of ["table", "tbody", "tr", "ul", "ol", "li", "pre", "blockquote", "p", "code", "a"]) {
    if (count(new RegExp("<" + t + "[ >]", "g")) !== count(new RegExp("</" + t + ">", "g"))) bad.push(t);
  }
  // Drop rendered code blocks first — their contents legitimately contain
  // #, | and backticks, which would otherwise look like unparsed markup.
  const text = out.replace(/<pre[\s\S]*?<\/pre>/g, "").replace(/<[^>]+>/g, "");
  if (/```/.test(text)) bad.push("unparsed fence");
  if (/^\s*\|.*\|/m.test(text)) bad.push("unparsed table");
  if (/^#{1,6}\s/m.test(text)) bad.push("unparsed heading");
  if (/[\u0000\u0001]/.test(out)) bad.push("leftover sentinel");
  if (/<code>undefined<\/code>/.test(out)) bad.push("code placeholder collision");

  // internal links must resolve within the demo set
  const dir = docPath.includes("/") ? docPath.slice(0, docPath.lastIndexOf("/")) : "";
  for (const m of out.matchAll(/data-doc="([^"]+)"/g)) {
    const segs = dir ? dir.split("/") : [];
    decodeURI(m[1]).split("#")[0].replace(/^\.\//, "").split("/").forEach(p => {
      if (p === "..") segs.pop(); else if (p !== "." && p !== "") segs.push(p);
    });
    if (!keys.has(segs.join("/"))) { bad.push("dead link " + m[1]); deadLinks++; }
  }

  R.ok(bad.length === 0, docPath.padEnd(26) +
       "toc:" + String(toc.length).padStart(2) +
       " tbl:" + count(/<table>/g) +
       " code:" + count(/<pre/g) +
       (bad.length ? "  — " + bad.join(", ") : ""));
  if (bad.length) parseProblems++;
}

/* ---------------------------------------------------------------- 5 */
R.section("5. README CLAIMS vs CODE");
const kb = Math.round(Buffer.byteLength(src) / 1024);
const claimed = Number((readme.match(/(\d+)\s*KB/) || [])[1]);
R.ok(Math.abs(kb - claimed) <= 2, `size claim ${claimed} KB vs actual ${kb} KB`);
R.ok(/showDirectoryPicker/.test(js), "claim: File System Access API");
R.ok(/webkitdirectory/.test(src), "claim: folder-input fallback");
R.ok(/@media print/.test(css), "claim: print strips the UI");
R.ok(/DEMO_DOCS/.test(js) && /btnDemo/.test(body), "claim: built-in demo");
R.ok(/#demo/.test(js), "claim: #demo deep link");
R.ok(/class="brand__mark"[^>]*viewBox/.test(body),
     "header mark is the icon glyph, not a monogram");
R.ok(/LS\.get\("scroll:/.test(js) && /LS\.set\("scroll:/.test(js),
     "scroll position is saved and restored per document");
R.ok(/ArrowDown/.test(js) && /"Home"/.test(js) && /"End"/.test(js),
     "sidebar supports arrow / Home / End navigation");
R.ok(/serviceWorker/.test(js) && /location\.protocol\.startsWith\("http"\)/.test(js),
     "service worker registration present and guarded for file://");
for (const [k, re] of [["Ctrl+O", /=== "o"/], ["Ctrl+K", /=== "k"/], ["Ctrl+B", /=== "b"/],
                       ["Ctrl+J", /=== "j"/], ["F5", /"F5"/], ["Alt+arrows", /ArrowLeft/]]) {
  R.ok(re.test(js), "documented shortcut implemented: " + k);
}

/* ---------------------------------------------------------------- 5b */
R.section("5b. STORAGE KEYS");
const storeKeys = [...js.matchAll(/LS\.(?:get|set)\("([\w:]+)/g)].map(m => m[1].split(":")[0]);
const allowed = new Set(["theme", "sidebarHidden", "last", "scroll", "checks"]);
const stray = [...new Set(storeKeys)].filter(k => !allowed.has(k));
R.ok(stray.length === 0,
     "only preference keys are stored (" + [...new Set(storeKeys)].sort().join(", ") + ")" +
     (stray.length ? " — unexpected: " + stray.join(", ") : ""));

/* ---------------------------------------------------------------- 5c */
R.section("5c. README ANCHORS");
// A renamed heading silently breaks its own table of contents. This has
// happened here before (#download outlived the section it pointed at).
const slug = s => s.toLowerCase().replace(/`/g, "").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
const headings = new Set([...readme.matchAll(/^#{1,6}\s+(.+)$/gm)].map(m => slug(m[1])));
for (const a of new Set([...readme.matchAll(/\]\(#([\w-]+)\)/g)].map(m => m[1]))) {
  R.ok(headings.has(a), "#" + a + " resolves to a heading");
}

/* ---------------------------------------------------------------- 5d */
R.section("5d. RELEASE BUNDLE README");
// The README ships inside every zip and gets opened in CoreRead itself, where
// the screenshots aren't present and GitHub's ../../ links mean nothing.
const brs = L.read("build-release.sh");
R.ok(/stage_readme/.test(brs), "README is transformed for the bundle, not copied raw");
R.ok(!/cp\s+CoreRead\.html[^\n]*README\.md/.test(brs), "raw README copy removed from the staging step");
R.ok(/<img src="\\\.github\//.test(brs), "screenshot tags stripped from the bundled README");
R.ok(/REPO="https:\/\/github\.com\/[\w-]+\/[\w-]+"/.test(brs) && /\$ENV\{REPO\}/.test(brs),
     "../../ links rewritten to an absolute repo URL");

/* ---------------------------------------------------------------- 6 */
R.section("6. VERSION CONSISTENCY");
const ver = (src.match(/CoreRead v(\d+\.\d+\.\d+)/) || [, null])[1];
R.ok(!!ver, "in-app version stamp present: v" + ver);
const stamps = new Set();
for (const f of files) {
  if (!L.isText(f.rel)) continue;
  for (const m of fs.readFileSync(f.full, "utf8").matchAll(/CoreRead v(\d+\.\d+\.\d+)/g)) stamps.add(m[1]);
}
R.ok([...stamps].every(v => v === ver), "all version stamps agree (" + [...stamps].join(", ") + ")");

/* ---------------------------------------------------------------- 7 */
R.section("7. GIT CONFIG");
const ga = L.read(".gitattributes"), gi = L.read(".gitignore");
R.ok(/\*\.sh\s+text eol=lf/.test(ga), ".sh forced to LF (CRLF breaks the launcher on Unix)");
R.ok(/\*\.command\s+text eol=lf/.test(ga), ".command forced to LF");
R.ok(/\*\.vbs\s+text eol=crlf/.test(ga), ".vbs forced to CRLF");
R.ok(/\*\.png\s+binary/.test(ga), "images marked binary");
R.ok(/dist\//.test(gi), "dist/ ignored");

process.exit(R.finish("Static verification"));
