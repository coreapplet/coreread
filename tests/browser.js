/* Browser tests — real layout engine, real geometry, real colours.
 *
 * This is the only layer that can catch: controls with zero size, elements
 * covered by other elements, horizontal overflow, broken responsive layout,
 * and insufficient contrast. Static analysis and jsdom cannot see any of it.
 *
 *   npm install && node tests/browser.js
 *
 * Uses whatever Chrome, Edge or Chromium is already installed. Override the
 * path with CHROME_PATH=... if detection fails.
 */

const path = require("path");
const puppeteer = require("puppeteer-core");
const L = require("./lib");

const URL = "file://" + L.APP.replace(/\\/g, "/");

(async () => {
  const exe = L.findBrowser();
  if (!exe) {
    console.error("No Chrome, Edge or Chromium found.");
    console.error("Set CHROME_PATH to a Chromium-family browser and re-run.");
    process.exit(2);
  }

  const R = L.reporter("CoreRead — browser tests\n   engine: " + exe);
  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
           "--force-color-profile=srgb"],
  });

  const errors = [];
  const newPage = async (w = 1440, h = 900) => {
    const p = await browser.newPage();
    await p.setViewport({ width: w, height: h });
    p.on("pageerror", e => errors.push(e.message));
    p.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await p.goto(URL, { waitUntil: "load" });
    await new Promise(r => setTimeout(r, 250));
    return p;
  };
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* ------------------------------------------------------------ 1 */
  R.section("1. INITIAL RENDER");
  let page = await newPage();
  const box = (p, sel) => p.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return { x: r.x, y: r.y, w: r.width, h: r.height,
             display: cs.display, visibility: cs.visibility, opacity: +cs.opacity };
  }, sel);
  const visible = b => b && b.w > 0 && b.h > 0 && b.display !== "none"
                    && b.visibility !== "hidden" && b.opacity > 0;

  R.ok(errors.length === 0, "no JS errors on load" + (errors.length ? ": " + errors[0] : ""));
  R.ok(visible(await box(page, "#welcome")), "welcome screen renders");
  R.ok(!visible(await box(page, "#wrap")), "document pane genuinely hidden (the [hidden] trap)");
  R.ok(visible(await box(page, ".sidebar")), "sidebar renders");
  R.ok(visible(await box(page, ".topbar")), "top bar renders");

  /* ------------------------------------------------------------ 2 */
  R.section("2. AFTER LOADING DOCUMENTS");
  await page.click("#btnDemo");
  await wait(350);
  R.ok(!visible(await box(page, "#welcome")), "welcome screen fully removed, not just layered behind");
  R.ok(visible(await box(page, "#doc")), "document pane visible");
  R.ok((await page.$$("#tree a")).length === 3, "sidebar lists the demo documents");

  /* ------------------------------------------------------------ 3 */
  R.section("3. SIDEBAR COLLAPSE");
  const open = await box(page, "#btnSide");
  R.ok(visible(open), `toggle visible when expanded (${Math.round(open.w)}x${Math.round(open.h)})`);
  await page.click("#btnSide");
  await wait(250);
  const shut = await box(page, "#btnSide");
  R.ok(visible(shut), "toggle STILL visible when collapsed");
  R.ok(shut.w >= 20 && shut.h >= 20, "toggle remains a usable click target");
  R.ok(shut.x >= 0 && shut.x + shut.w <= 1440, "toggle stays inside the viewport");
  await page.click("#btnSide");
  await wait(250);
  R.ok(visible(await box(page, ".sidebar")), "sidebar restored by the same control");

  /* ------------------------------------------------------------ 4 */
  R.section("4. EVERY CONTROL IS REACHABLE");
  const controls = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("button, a[href], input, .tree a")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      // A display:none ANCESTOR does not change a child's computed display,
      // so check reachability too — otherwise controls on the hidden welcome
      // screen are reported as zero-size failures.
      if (el.closest("[hidden]")) continue;
      if (!el.offsetParent && cs.position !== "fixed") continue;
      const r = el.getBoundingClientRect();
      out.push({
        id: el.id || el.className || el.tagName,
        w: Math.round(r.width), h: Math.round(r.height),
        inView: r.top >= 0 && r.left >= 0 && r.right <= innerWidth,
        onTop: (() => {
          const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return t === el || el.contains(t) || (t && t.contains(el));
        })(),
      });
    }
    return out;
  });
  const zero = controls.filter(c => c.w === 0 || c.h === 0);
  const covered = controls.filter(c => c.inView && !c.onTop);
  const outside = controls.filter(c => !c.inView);
  R.ok(zero.length === 0, "no visible control has zero size" + (zero.length ? ": " + zero.map(c => c.id).join(", ") : ""));
  R.ok(covered.length === 0, "no control is covered by another element" + (covered.length ? ": " + covered.map(c => c.id).join(", ") : ""));
  R.ok(outside.length === 0, "no control sits outside the viewport" + (outside.length ? ": " + outside.map(c => c.id).join(", ") : ""));
  R.note(controls.length + " controls checked");

  /* ------------------------------------------------------------ 5 */
  R.section("5. RESPONSIVE LAYOUT");
  for (const [w, h, label] of [[1440, 900, "desktop"], [1024, 768, "laptop"],
                               [820, 1180, "tablet"], [420, 880, "phone"], [320, 720, "small phone"]]) {
    await page.setViewport({ width: w, height: h });
    await wait(220);
    const r = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      doc: Math.round(document.querySelector("#doc").getBoundingClientRect().width),
      toggle: (() => { const b = document.querySelector("#btnSide").getBoundingClientRect();
                       return b.width > 0 && b.height > 0; })(),
    }));
    R.ok(!r.overflow && r.toggle && r.doc > 200,
         `${label.padEnd(12)} ${String(w).padStart(4)}px — no overflow, document ${r.doc}px, toggle usable`);
  }
  await page.setViewport({ width: 1440, height: 900 });
  await page.close();

  /* ------------------------------------------------------------ 6 */
  R.section("6. CONTRAST — every text element, both themes, three screens");
  const AUDIT = `(() => {
    const parse = c => { const m = (c||"").match(/[\\d.]+/g); if (!m) return null;
      return { r:+m[0], g:+m[1], b:+m[2], a: m.length>3 ? parseFloat(m[3]) : 1 }; };
    const srgb = v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); };
    const lum = ({r,g,b}) => 0.2126*srgb(r)+0.7152*srgb(g)+0.0722*srgb(b);
    const blend = (f,b) => ({ r:f.r*f.a+b.r*(1-f.a), g:f.g*f.a+b.g*(1-f.a), b:f.b*f.a+b.b*(1-f.a), a:1 });
    const bgOf = el => { let n = el, bg = {r:255,g:255,b:255,a:1};
      while (n && n !== document.documentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0) { if (c.a === 1) return c; bg = blend(c, bg); }
        n = n.parentElement; }
      const b = parse(getComputedStyle(document.body).backgroundColor);
      return b && b.a === 1 ? b : bg; };
    const out = [];
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const own = [...el.childNodes].filter(n => n.nodeType === 3)
        .map(n => n.textContent.trim()).join(" ").trim();
      if (!own) continue;
      const fg = parse(cs.color); if (!fg) continue;
      const bg = bgOf(el);
      const L1 = lum(fg.a < 1 ? blend(fg, bg) : fg), L2 = lum(bg);
      const ratio = (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
      const size = parseFloat(cs.fontSize);
      const large = size >= 24 || (size >= 18.66 && (parseInt(cs.fontWeight,10)||400) >= 700);
      out.push({ tag: el.tagName.toLowerCase(), id: el.id,
                 cls: (el.className||"").toString().split(/\\s+/)[0],
                 text: own.slice(0,30), ratio: Math.round(ratio*100)/100,
                 need: large ? 3 : 4.5, pass: ratio >= (large ? 3 : 4.5) });
    }
    return out;
  })()`;

  const screens = [
    ["welcome",  async () => {}],
    ["document", async p => { await p.click("#btnDemo"); await wait(350); }],
    ["search",   async p => { await p.click("#btnDemo"); await wait(300);
                              await p.type("#q", "callout"); await wait(350); }],
  ];

  for (const theme of ["light", "dark"]) {
    for (const [name, setup] of screens) {
      const p = await newPage();
      await p.evaluate(t => { try { localStorage.setItem("coreread:theme", JSON.stringify(t)); } catch {} }, theme);
      await p.reload({ waitUntil: "load" });
      await wait(250);
      await setup(p);
      await wait(200);
      const rows = await p.evaluate(AUDIT);
      const bad = rows.filter(r => !r.pass);
      R.ok(bad.length === 0,
        `${theme.padEnd(5)} / ${name.padEnd(8)} — ${rows.length} text elements` +
        (bad.length ? "\n" + bad.map(b =>
          `         ${(b.tag + (b.id ? "#" + b.id : b.cls ? "." + b.cls : "")).padEnd(20)}` +
          `${String(b.ratio).padStart(6)}:1 needs ${b.need}  "${b.text}"`).join("\n") : ""));
      await p.close();
    }
  }

  /* ------------------------------------------------------------ 7 */
  R.section("7. NO ERRORS THROUGHOUT");
  R.ok(errors.length === 0, "no uncaught JS errors" + (errors.length ? ": " + errors.join(" | ") : ""));

  await browser.close();
  process.exit(R.finish("Browser tests"));
})().catch(e => { console.error("HARNESS ERROR:", e); process.exit(1); });
