/* Shared helpers for the CoreRead test suite. */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP = path.join(ROOT, "CoreRead.html");

const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const html = () => fs.readFileSync(APP, "utf8");

/* Pull the inline script and stylesheet out of the single-file app. */
function parts() {
  const s = html();
  return {
    src: s,
    css: s.slice(s.indexOf("<style>") + 7, s.indexOf("</style>")),
    js: s.slice(s.indexOf("<script>") + 8, s.lastIndexOf("</script>")),
    body: s.slice(s.indexOf("</style>"), s.indexOf("<script>")),
  };
}

/* Extract the Markdown parser so it can be exercised directly in Node. */
function loadParser() {
  const { js } = parts();
  const a = js.indexOf("function esc(s)");
  const b = js.lastIndexOf("/* ====", js.indexOf("   2. APP STATE"));
  const d0 = js.indexOf("const DEMO_DOCS");
  const d1 = js.indexOf("function loadDemo");
  const tmp = path.join(require("os").tmpdir(), "coreread-parser.js");
  fs.writeFileSync(tmp,
    js.slice(a, b) + "\n" + js.slice(d0, d1) +
    "\nmodule.exports = { renderMarkdown, DEMO_DOCS };\n");
  delete require.cache[tmp];
  return require(tmp);
}

/* Walk every file in the repo except build output and git internals. */
function repoFiles() {
  const out = [];
  (function walk(dir, prefix) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name === "dist" || e.name === ".git" || e.name === "node_modules") continue;
      const full = path.join(dir, e.name);
      const rel = prefix ? prefix + "/" + e.name : e.name;
      if (e.isDirectory()) walk(full, rel);
      else out.push({ rel, full, size: fs.statSync(full).size });
    }
  })(ROOT, "");
  return out;
}

const BINARY = /\.(png|jpe?g|gif|ico|zip|woff2?|ttf|otf|pdf)$/i;
const isText = rel => !BINARY.test(rel);

/* WCAG relative luminance and contrast ratio. */
const srgb = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const luminance = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const contrast = (a, b) => {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

/* Locate an installed Chromium-family browser. Override with CHROME_PATH. */
function findBrowser() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const pf = process.env["ProgramFiles"] || "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const local = process.env["LOCALAPPDATA"] || "";
  const candidates = [
    pf86 + "\\Microsoft\\Edge\\Application\\msedge.exe",
    pf + "\\Microsoft\\Edge\\Application\\msedge.exe",
    pf + "\\Google\\Chrome\\Application\\chrome.exe",
    pf86 + "\\Google\\Chrome\\Application\\chrome.exe",
    local + "\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/microsoft-edge",
  ];
  for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch {} }
  return null;
}

/* Minimal reporter. */
function reporter(title) {
  let pass = 0, fail = 0;
  console.log(title);
  return {
    section: t => console.log("\n" + t),
    ok(cond, msg) {
      console.log("   " + (cond ? "PASS" : "FAIL") + "  " + msg);
      cond ? pass++ : fail++;
      return cond;
    },
    note: msg => console.log("   ....  " + msg),
    finish(label) {
      console.log("\n" + (fail === 0
        ? `${label}: PASSED (${pass} assertions)`
        : `${label}: ${fail} FAILED of ${pass + fail}`));
      return fail;
    },
  };
}

module.exports = {
  ROOT, APP, read, html, parts, loadParser, repoFiles, isText,
  contrast, luminance, findBrowser, reporter,
};
