// Pre-render every non-text visual: icons, the flat colour grounds, and the diagram
// pieces. CSS gradients and inline SVG do not survive the HTML-to-PowerPoint conversion,
// so anything that is not a div, an image, or a text element has to become a PNG first.
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fs = require("node:fs");
const path = require("node:path");

const OUT = path.join(__dirname, "media");
fs.mkdirSync(OUT, { recursive: true });

const INK = "23282a";
const PAPER = "f4f3ef";
const OCHRE = "b06a12";
const GREEN = "2f6b4f";
const RUST = "a2412f";
const FAINT = "8b918b";

const {
  FaIdCard, FaUserClock, FaTriangleExclamation, FaEye, FaHospital, FaFlask,
  FaPills, FaFileShield, FaBrain, FaChartLine, FaUserDoctor, FaLock,
  FaArrowRight, FaCircleCheck, FaCircleXmark, FaHandshake, FaDatabase,
  FaServer, FaReact, FaPython, FaScaleBalanced, FaMagnifyingGlassChart,
} = require("react-icons/fa6");

async function icon(Component, color, name, size = 512) {
  const svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(Component, { color: `#${color}`, size: String(size) }),
  );
  const file = path.join(OUT, `${name}.png`);
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

// Flat colour fields used as slide grounds. A plain div would work for most of these, but
// as an image the fill is guaranteed edge to edge with no hairline seam at the slide bound.
async function field(hex, name, w = 1600, h = 900) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="#${hex}"/></svg>`;
  const file = path.join(OUT, `${name}.png`);
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

// The band ladder, redrawn for slides. This is the product's signature visual: the
// prediction interval laid on the clinical band scale with the crossed boundary lit.
async function bandLadder(name, { lo, hi, point, straddle }) {
  const W = 1200, H = 240, L = 60, R = 60;
  const span = 100;
  const x = (v) => L + ((W - L - R) * v) / span;
  const edges = [18, 30, 50, 65];
  const labels = [
    ["Paediatric", 0, 18], ["Young adult", 18, 30], ["Adult", 30, 50],
    ["Older adult", 50, 65], ["Geriatric", 65, 100],
  ];

  const bands = labels.map(([t, a, b]) =>
    `<rect x="${x(a)}" y="90" width="${x(b) - x(a)}" height="70" fill="#eeece6"
       stroke="#dedbd2" stroke-width="2"/>
     <text x="${(x(a) + x(b)) / 2}" y="76" text-anchor="middle" font-family="Arial"
       font-size="19" fill="#5c635f">${t}</text>`).join("");

  const crossed = edges.filter((e) => lo < e && e < hi);
  const rules = edges.map((e) =>
    `<line x1="${x(e)}" y1="90" x2="${x(e)}" y2="160" stroke="${
      crossed.includes(e) ? `#${OCHRE}` : "#c3bfb2"}" stroke-width="${
      crossed.includes(e) ? 6 : 2}"/>`).join("");

  const interval = `<rect x="${x(lo)}" y="98" width="${x(hi) - x(lo)}" height="54"
      fill="${straddle ? `#${OCHRE}` : `#${GREEN}`}" opacity="0.20"
      stroke="${straddle ? `#${OCHRE}` : `#${GREEN}`}" stroke-width="4"/>`;

  const marker = `<line x1="${x(point)}" y1="86" x2="${x(point)}" y2="164"
      stroke="#${INK}" stroke-width="5"/>
    <text x="${x(point)}" y="196" text-anchor="middle" font-family="Georgia"
      font-size="30" font-weight="bold" fill="#${INK}">${point}</text>`;

  const axis = [0, 18, 30, 50, 65, 100].map((v) =>
    `<text x="${x(v)}" y="182" text-anchor="middle" font-family="Courier New"
       font-size="18" fill="#8b918b">${v}</text>`).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="100%" height="100%" fill="#${PAPER}"/>
    ${bands}${interval}${rules}${marker}${axis}</svg>`;
  const file = path.join(OUT, `${name}.png`);
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

// One number versus a distribution. The single most important explanatory graphic in the
// deck, so it is drawn rather than described.
async function distributionDiagram(name) {
  const W = 1300, H = 420;
  const bars = [];
  const cx = 34, sigma = 6;
  for (let a = 12; a <= 60; a++) {
    const p = Math.exp(-((a - cx) ** 2) / (2 * sigma ** 2));
    const h = p * 150;
    const x = 700 + (a - 12) * 11.6;
    bars.push(`<rect x="${x}" y="${290 - h}" width="9" height="${h}"
      fill="#${a === cx ? OCHRE : "8b918b"}" opacity="${a === cx ? 1 : 0.55}"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="100%" height="100%" fill="#${PAPER}"/>

    <text x="60" y="60" font-family="Arial" font-size="26" font-weight="bold"
      fill="#${RUST}">A normal model</text>
    <text x="60" y="96" font-family="Arial" font-size="21" fill="#5c635f">outputs one number</text>
    <rect x="60" y="150" width="330" height="140" fill="#ffffff" stroke="#dedbd2" stroke-width="3"/>
    <text x="225" y="245" text-anchor="middle" font-family="Georgia" font-size="86"
      font-weight="bold" fill="#${INK}">34</text>
    <text x="225" y="330" text-anchor="middle" font-family="Arial" font-size="19"
      fill="#a2412f">no idea how sure it is</text>

    <text x="700" y="60" font-family="Arial" font-size="26" font-weight="bold"
      fill="#${GREEN}">Ours</text>
    <text x="700" y="96" font-family="Arial" font-size="21" fill="#5c635f">outputs a probability for every age</text>
    ${bars.join("")}
    <line x1="700" y1="290" x2="1265" y2="290" stroke="#c3bfb2" stroke-width="3"/>
    <text x="700" y="316" font-family="Courier New" font-size="17" fill="#8b918b">12</text>
    <text x="1245" y="316" font-family="Courier New" font-size="17" fill="#8b918b">60</text>
    <text x="982" y="352" text-anchor="middle" font-family="Arial" font-size="19"
      fill="#2f6b4f">estimate, range and confidence, from one pass</text>
    </svg>`;
  const file = path.join(OUT, `${name}.png`);
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

// Architecture. Boxes and arrows, drawn once, so the slide is a picture rather than a list.
async function architecture(name) {
  const W = 1340, H = 520;
  const box = (x, y, w, h, fill, stroke) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${fill}"
       stroke="${stroke}" stroke-width="3"/>`;
  const t = (x, y, s, size, weight, fill, anchor = "middle", fam = "Arial") =>
    `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${fam}"
       font-size="${size}" font-weight="${weight}" fill="${fill}">${s}</text>`;
  const arrow = (x1, y1, x2, y2) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#8b918b"
       stroke-width="3" marker-end="url(#a)"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7"
      markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#8b918b"/></marker></defs>
    <rect width="100%" height="100%" fill="#${PAPER}"/>

    ${box(40, 40, 250, 110, "#ffffff", "#dedbd2")}
    ${t(165, 78, "Browser", 24, "bold", `#${INK}`)}
    ${t(165, 108, "React + TypeScript", 18, "normal", "#5c635f")}
    ${t(165, 132, "4 views, no router", 16, "normal", "#8b918b")}

    ${box(40, 210, 250, 90, "#ffffff", "#dedbd2")}
    ${t(165, 244, "web/dist", 21, "bold", `#${INK}`, "middle", "Courier New")}
    ${t(165, 272, "static build, served by FastAPI", 15, "normal", "#8b918b")}

    ${box(420, 40, 300, 270, "#ffffff", `#${OCHRE}`)}
    ${t(570, 76, "ONE PROCESS, ONE PORT", 15, "bold", `#${OCHRE}`)}
    ${t(570, 112, "FastAPI", 26, "bold", `#${INK}`)}
    ${t(570, 150, "main.py", 17, "normal", "#5c635f", "middle", "Courier New")}
    ${t(570, 172, "single envelope, 5 statuses", 15, "normal", "#8b918b")}
    ${box(445, 195, 250, 45, "#f6ead6", `#${OCHRE}`)}
    ${t(570, 224, "bands.py  decision + routing", 15, "bold", `#${OCHRE}`, "middle", "Courier New")}
    ${box(445, 250, 250, 45, "#eeece6", "#c3bfb2")}
    ${t(570, 279, "store.py  audit, digest only", 15, "bold", "#5c635f", "middle", "Courier New")}

    ${box(850, 40, 240, 120, "#ffffff", "#dedbd2")}
    ${t(970, 76, "ml/predict.py", 20, "bold", `#${INK}`, "middle", "Courier New")}
    ${t(970, 104, "EfficientNet-B0", 17, "normal", "#5c635f")}
    ${t(970, 130, "loaded lazily, 17 MB", 15, "normal", "#8b918b")}

    ${box(850, 200, 240, 100, "#ffffff", "#dedbd2")}
    ${t(970, 234, "SQLite", 20, "bold", `#${INK}`)}
    ${t(970, 262, "audit + review queue", 16, "normal", "#5c635f")}
    ${t(970, 286, "no image bytes, ever", 15, "bold", `#${RUST}`)}

    ${box(1150, 40, 150, 120, "#eeece6", "#c3bfb2")}
    ${t(1225, 78, "checkpoint", 17, "bold", `#${INK}`)}
    ${t(1225, 104, "model.pt", 15, "normal", "#5c635f", "middle", "Courier New")}
    ${t(1225, 126, "metrics.json", 15, "normal", "#5c635f", "middle", "Courier New")}
    ${t(1225, 148, "evidence.json", 15, "normal", "#5c635f", "middle", "Courier New")}

    ${arrow(292, 95, 416, 130)}
    ${arrow(292, 250, 416, 210)}
    ${arrow(722, 110, 846, 100)}
    ${arrow(722, 250, 846, 250)}
    ${arrow(1092, 100, 1146, 100)}

    ${t(670, 400, "Fully offline. No cloud inference, nothing fetched at runtime.", 21, "bold", `#${INK}`)}
    ${t(670, 434, "One command starts everything. There is no second server and no CORS surface.", 18, "normal", "#5c635f")}
  </svg>`;
  const file = path.join(OUT, `${name}.png`);
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

async function main() {
  await Promise.all([
    field(INK, "ground-ink"),
    field(PAPER, "ground-paper"),
    field(OCHRE, "ground-ochre"),

    icon(FaIdCard, FAINT, "ic-idcard"),
    icon(FaUserClock, FAINT, "ic-clock"),
    icon(FaEye, FAINT, "ic-eye"),
    icon(FaTriangleExclamation, OCHRE, "ic-warn"),
    icon(FaHospital, OCHRE, "ic-hospital"),
    icon(FaFlask, OCHRE, "ic-flask"),
    icon(FaPills, OCHRE, "ic-pills"),
    icon(FaFileShield, OCHRE, "ic-shield"),
    icon(FaBrain, OCHRE, "ic-brain"),
    icon(FaChartLine, OCHRE, "ic-chart"),
    icon(FaUserDoctor, OCHRE, "ic-doctor"),
    icon(FaLock, GREEN, "ic-lock"),
    icon(FaCircleCheck, GREEN, "ic-check"),
    icon(FaCircleXmark, RUST, "ic-cross"),
    icon(FaHandshake, OCHRE, "ic-hands"),
    icon(FaDatabase, FAINT, "ic-db"),
    icon(FaServer, FAINT, "ic-server"),
    icon(FaReact, FAINT, "ic-react"),
    icon(FaPython, FAINT, "ic-python"),
    icon(FaScaleBalanced, RUST, "ic-scale"),
    icon(FaMagnifyingGlassChart, OCHRE, "ic-magnify"),

    bandLadder("ladder-teen", { lo: 17.5, hi: 31.5, point: 24.2, straddle: true }),
    bandLadder("ladder-clean", { lo: 30.5, hi: 39.5, point: 34.8, straddle: false }),
    distributionDiagram("diagram-distribution"),
    architecture("diagram-architecture"),
  ]);
  console.log("media written to", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
