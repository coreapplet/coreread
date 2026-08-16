/* Interaction tests — drives the app in jsdom.
 *
 * Loads the real file, runs the real script, then clicks through the UI the
 * way a person does. Catches wiring, state and navigation bugs.
 *
 *   npm install && node tests/interaction.js
 *
 * Note: jsdom has no layout engine, and its CSS cascade is not reliable —
 * it resolves the [hidden] + `display:grid` case incorrectly. Anything about
 * geometry, visibility or colour belongs in browser.js, not here.
 */

const fs = require("fs");
const { JSDOM } = require("jsdom");
const L = require("./lib");

const R = L.reporter("CoreRead — interaction tests (jsdom)");

(async () => {
  const dom = new JSDOM(fs.readFileSync(L.APP, "utf8"), {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://coreread.test/CoreRead.html",
  });
  const { window } = dom;
  const doc = window.document;
  const $ = id => doc.getElementById(id);
  const click = el => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const key = (k, mod = true) => doc.dispatchEvent(new window.KeyboardEvent("keydown",
    { key: k, ctrlKey: mod, bubbles: true, cancelable: true }));
  const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

  const errors = [];
  window.addEventListener("error", e => errors.push(e.message));
  window.onerror = m => errors.push(m);

  await tick();

  R.section("1. INITIAL STATE");
  R.ok(!$("welcome").hasAttribute("hidden"), "welcome screen shown on load");
  R.ok($("wrap").hasAttribute("hidden"), "document pane hidden on load");
  R.ok($("btnDemo") && $("btnOpen2") && $("btnSide"), "primary controls exist");
  R.ok(errors.length === 0, "no JS errors on load" + (errors.length ? ": " + errors[0] : ""));

  R.section("2. LOADING DOCUMENTS");
  click($("btnDemo"));
  await tick();
  R.ok($("welcome").hasAttribute("hidden"), "welcome hidden after load");
  R.ok(!$("wrap").hasAttribute("hidden"), "document pane shown after load");
  const links = [...doc.querySelectorAll("#tree a")];
  R.ok(links.length === 3, "sidebar lists 3 documents (got " + links.length + ")");
  R.ok(/Welcome to CoreRead/.test($("doc").textContent), "first document rendered");
  R.ok(doc.querySelectorAll("#toc a").length >= 2, "table of contents built");
  R.ok(doc.querySelector("#doc table") !== null, "table rendered");

  R.section("3. NAVIGATION");
  const cfg = links.find(a => /Configuration/i.test(a.textContent));
  R.ok(!!cfg, "Configuration listed");
  click(cfg);
  await tick();
  R.ok(/Configuration/.test($("doc").querySelector("h1").textContent), "sidebar click opens the document");
  R.ok(cfg.classList.contains("is-active"), "active document highlighted");
  R.ok(doc.querySelectorAll("#doc pre").length === 2, "code blocks rendered");
  R.ok(doc.querySelectorAll("#doc blockquote").length === 3, "callouts rendered");
  R.ok(doc.querySelector("#doc .cr-copy") !== null, "copy button attached to code blocks");

  R.section("4. NESTED FOLDERS AND TASK LISTS");
  const guide = links.find(a => /Writing docs/i.test(a.textContent));
  R.ok(!!guide, "nested guides/ document listed");
  R.ok(doc.querySelector(".tree__group") !== null, "sub-folder heading rendered");
  click(guide);
  await tick();
  const checks = [...doc.querySelectorAll(".cr-check")];
  R.ok(checks.length === 4, "task checkboxes rendered (got " + checks.length + ")");
  R.ok(checks[0].checked === true, "pre-ticked task restored");

  R.section("5. CROSS-DOCUMENT LINKS");
  const back = doc.querySelector("#doc a[data-doc]");
  R.ok(!!back, "cross-link present");
  click(back);
  await tick();
  R.ok(/Welcome to CoreRead/.test($("doc").textContent), "relative ../ link resolves and navigates");

  R.section("6. HISTORY");
  R.ok(!$("btnBack").disabled, "back enabled after navigating");
  click($("btnBack"));
  await tick();
  R.ok(/Writing docs/i.test($("doc").querySelector("h1").textContent), "back returns to the previous document");
  click($("btnFwd"));
  await tick();
  R.ok(/Welcome to CoreRead/.test($("doc").textContent), "forward works");

  R.section("7. SIDEBAR STATE");
  click($("btnSide"));
  await tick();
  R.ok(doc.body.classList.contains("no-side"), "collapses");
  R.ok(doc.body.contains($("btnSide")), "toggle remains in the DOM when collapsed");
  click($("btnSide"));
  await tick();
  R.ok(!doc.body.classList.contains("no-side"), "reopens via the same control");

  R.section("8. SEARCH");
  const q = $("q");
  q.value = "callout";
  q.dispatchEvent(new window.Event("input", { bubbles: true }));
  await tick(200);
  const hits = doc.querySelectorAll("#tree .hit");
  R.ok(hits.length > 0, "returns results (" + hits.length + ")");
  R.ok(doc.querySelector("#tree mark") !== null, "term highlighted in snippets");
  click(hits[0]);
  await tick();
  R.ok(/Configuration/.test($("doc").textContent), "clicking a hit opens the document");
  q.value = "";
  q.dispatchEvent(new window.Event("input", { bubbles: true }));
  await tick(200);
  R.ok(doc.querySelectorAll("#tree a").length === 3, "clearing search restores the tree");

  R.section("9. THEME AND SHORTCUTS");
  const before = doc.documentElement.dataset.theme;
  click($("btnTheme"));
  await tick();
  R.ok(doc.documentElement.dataset.theme !== before, "theme toggles");
  click($("btnSide")); await tick();
  key("k"); await tick();
  R.ok(!doc.body.classList.contains("no-side"), "Ctrl+K force-reopens a collapsed sidebar");
  key("b"); await tick();
  R.ok(doc.body.classList.contains("no-side"), "Ctrl+B collapses");
  key("b"); await tick();
  R.ok(!doc.body.classList.contains("no-side"), "Ctrl+B expands");

  R.section("10. SCROLL POSITION MEMORY");
  click(cfg);
  await tick();
  $("main").scrollTop = 250;
  $("main").dispatchEvent(new window.Event("scroll"));
  await tick(500);
  click(links.find(a => /Welcome/i.test(a.textContent)));
  await tick();
  click(cfg);
  await tick();
  R.ok($("main").scrollTop > 0, "returning to a document restores its scroll position");
  R.ok(/scroll:/.test(JSON.stringify(Object.keys(window.localStorage))) ||
       window.localStorage.length > 0, "position persisted to storage");

  R.section("11. SIDEBAR KEYBOARD NAVIGATION");
  const tree = [...doc.querySelectorAll("#tree a")];
  tree[0].focus();
  const arrow = (el, k) => el.dispatchEvent(new window.KeyboardEvent("keydown",
    { key: k, bubbles: true, cancelable: true }));
  arrow(doc.activeElement, "ArrowDown");
  await tick();
  R.ok(doc.activeElement === tree[1], "ArrowDown moves to the next document");
  arrow(doc.activeElement, "ArrowUp");
  await tick();
  R.ok(doc.activeElement === tree[0], "ArrowUp moves back");
  arrow(doc.activeElement, "End");
  await tick();
  R.ok(doc.activeElement === tree[tree.length - 1], "End jumps to the last document");
  arrow(doc.activeElement, "Home");
  await tick();
  R.ok(doc.activeElement === tree[0], "Home jumps to the first");
  $("q").focus();
  $("q").dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
  await tick();
  R.ok(doc.activeElement && doc.activeElement.closest("#tree"),
       "ArrowDown from the search box enters the document list");

  R.section("12. SERVICE WORKER REGISTRATION IS GUARDED");
  R.ok(/location\.protocol\.startsWith\("http"\)/.test(fs.readFileSync(L.APP, "utf8")),
       "registration is skipped on file:// where no worker can exist");
  R.ok(errors.length === 0, "no error from the service worker guard");

  R.section("13. NO RUNTIME ERRORS");
  R.ok(errors.length === 0, "no uncaught errors during the run"
       + (errors.length ? ": " + errors.join(" | ") : ""));

  process.exit(R.finish("Interaction tests"));
})().catch(e => { console.error("HARNESS ERROR:", e); process.exit(1); });
