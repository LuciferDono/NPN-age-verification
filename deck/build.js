/**
 * Build the presentation deck.
 *
 *   node build.js
 *
 * Slides are generated as HTML then converted with html2pptx so positions come from a real
 * browser layout rather than hand-computed coordinates. One shared stylesheet keeps 28
 * slides on the same grid; the alternative is 28 files drifting apart.
 *
 * Palette is the product's own: the console runs on warm paper with a single ochre accent
 * meaning "a human must look at this", and the deck reuses it so both read as one artifact.
 * Weighting is inverted for projection — deep ink grounds for titles, sections and impact
 * slides, paper for content.
 */
const fs = require("node:fs");
const path = require("node:path");
const pptxgen = require("pptxgenjs");
// Copied from the pptx skill into this directory: the upstream module requires playwright
// and sharp relative to its own location, which has no node_modules of its own.
const html2pptx = require("./html2pptx.js");

const SLIDES = path.join(__dirname, "slides");
const MEDIA = path.join(__dirname, "media");
const SHOTS = path.join(__dirname, "..", "docs", "shots");
fs.mkdirSync(SLIDES, { recursive: true });

const INK = "#23282a", DIM = "#5c635f", FAINT = "#8b918b";
const PAPER = "#f4f3ef", WHITE = "#fffefc", LINE = "#dedbd2";
const OCHRE = "#b06a12", WASH = "#f6ead6", GREEN = "#2f6b4f", RUST = "#a2412f";

const CSS = `
html { background: ${PAPER}; }
body { width: 720pt; height: 405pt; margin: 0; padding: 0; display: flex;
       font-family: Arial, Helvetica, sans-serif; color: ${INK}; background: ${PAPER}; }
.pad { margin: 24pt 40pt; width: 640pt; }
.dark { background: ${INK}; color: ${WHITE}; }
h1 { font-family: Georgia, serif; font-size: 40pt; margin: 0 0 10pt 0; line-height: 1.1;
     font-variant-numeric: lining-nums; font-feature-settings: "lnum" 1; }
h2 { font-family: Georgia, serif; font-size: 26pt; margin: 0 0 5pt 0; line-height: 1.15;
     font-variant-numeric: lining-nums; font-feature-settings: "lnum" 1; }
h3 { font-size: 15pt; margin: 0 0 4pt 0; letter-spacing: 0.5pt; text-transform: uppercase; }
h4 { font-size: 13pt; margin: 0 0 3pt 0; }
p  { font-size: 12.5pt; line-height: 1.45; margin: 0 0 6pt 0; }
.lede { font-size: 16pt; line-height: 1.45; color: ${DIM}; }
.kicker { font-size: 12pt; letter-spacing: 1.6pt; text-transform: uppercase;
          color: ${OCHRE}; margin: 0 0 8pt 0; font-weight: bold; }
.small { font-size: 10.5pt; color: ${FAINT}; }
.mono { font-family: 'Courier New', monospace; }
ul { font-size: 13pt; line-height: 1.55; margin: 0 0 6pt 0; padding-left: 15pt; }
li { margin-bottom: 5pt; }
.rule { background: ${OCHRE}; height: 4pt; width: 74pt; margin: 0 0 11pt 0; }
.card { background: ${WHITE}; border: 1.5pt solid ${LINE}; padding: 11pt; }
.cardw { background: ${WASH}; border: 1.5pt solid ${OCHRE}; padding: 11pt; }
.big { font-family: Georgia, serif; font-size: 52pt; margin: 0; line-height: 1;
       font-variant-numeric: lining-nums; font-feature-settings: "lnum" 1; }
.huge { font-family: Georgia, serif; font-size: 76pt; margin: 0; line-height: 1;
        font-variant-numeric: lining-nums; font-feature-settings: "lnum" 1; }
.row { display: flex; gap: 13pt; }
`;

function page(body, opts = {}) {
  const cls = opts.dark ? "pad dark" : "pad";
  const bodyStyle = opts.dark ? `background: ${INK};` : "";
  return `<!DOCTYPE html><html><head><style>${CSS}</style></head>
<body style="${bodyStyle}"><div class="${cls}">${body}</div></body></html>`;
}

// Full-bleed variant: the ground image covers the slide and content floats on top.
function bleed(body, ground) {
  return `<!DOCTYPE html><html><head><style>${CSS}
  body { position: relative; }
  .bg { position: absolute; left: 0; top: 0; width: 720pt; height: 405pt; }
  .fg { position: absolute; left: 40pt; top: 24pt; width: 640pt; }
  </style></head><body>
  <img class="bg" src="../media/${ground}">
  <div class="fg">${body}</div></body></html>`;
}

// Relative to the generated HTML in slides/, not absolute: an absolute Windows path
// becomes a malformed file URL ("/C:/...") by the time pptxgenjs tries to read the media.
const img = (f, style) => `<img src="../media/${f}" style="${style}">`;
const shot = (f, style) => `<img src="../../docs/shots/${f}" style="${style}">`;

// ── slide definitions ────────────────────────────────────────────────────────
const deck = [];
const add = (name, html) => {
  const file = path.join(SLIDES, `${name}.html`);
  fs.writeFileSync(file, html);
  deck.push({ name, file });
};

// 1 — title
add("01-title", bleed(`
  <div style="height: 46pt;"></div>
  <p style="font-size: 12pt; letter-spacing: 2pt; color: ${OCHRE}; font-weight: bold; margin: 0 0 16pt 0;">COGNIZANT NPN &nbsp;·&nbsp; HEALTHCARE</p>
  <h1 style="font-size: 46pt; color: ${WHITE}; margin: 0 0 10pt 0;">Age Verification</h1>
  <h1 style="font-size: 42pt; color: ${OCHRE}; margin: 0 0 18pt 0;">that knows when it is wrong</h1>
  <div style="background: ${OCHRE}; height: 4pt; width: 110pt; margin: 0 0 22pt 0;"></div>
  <p style="font-size: 15pt; color: #b8bfba; margin: 0;">Age estimation from a facial image, wrapped in a clinical decision path</p>
  <p style="font-size: 15pt; color: #b8bfba; margin: 0;">with human review, calibrated uncertainty, and an audit trail that stores no image.</p>
`, "ground-ink.png"));

// 2 — the problem today
add("02-problem", page(`
  <p class="kicker">The problem</p>
  <h2>Age verification today is documents, or a guess</h2>
  <div class="rule"></div>
  <div class="row" style="margin-bottom: 14pt;">
    <div class="card" style="width: 190pt;">
      ${img("ic-idcard.png", "width: 26pt; height: 26pt; margin-bottom: 6pt;")}
      <h4>Documents</h4>
      <p class="small">Not always available. Forgeable. Intrusive to demand, and excludes people who have none.</p>
    </div>
    <div class="card" style="width: 190pt;">
      ${img("ic-eye.png", "width: 26pt; height: 26pt; margin-bottom: 6pt;")}
      <h4>Human judgement</h4>
      <p class="small">Inconsistent between assessors, and inconsistent for the same assessor across a shift.</p>
    </div>
    <div class="card" style="width: 190pt;">
      ${img("ic-clock.png", "width: 26pt; height: 26pt; margin-bottom: 6pt;")}
      <h4>Time</h4>
      <p class="small">Manual checks do not scale to a queue, and the cost lands on the patient waiting.</p>
    </div>
  </div>
  <div class="cardw">
    <p style="margin: 0;"><b>In healthcare the consequences are concrete:</b> clinical trial eligibility, consent
    thresholds, age-appropriate dosing. Getting it wrong is a compliance failure or a patient harm,
    not a poor user experience.</p>
  </div>
`));

// 3 — why a bare number fails
add("03-bare-number", bleed(`
  <div style="height: 6pt;"></div>
  <p style="font-size: 12pt; letter-spacing: 1.6pt; color: ${OCHRE}; font-weight: bold; margin: 0 0 12pt 0;">THE PART EVERYONE MISSES</p>
  <h1 style="font-size: 30pt; color: ${WHITE}; margin: 0 0 18pt 0;">An age estimate on its own cannot be acted on</h1>
  <div class="row">
    <div style="width: 300pt; background: #2f3538; border: 1.5pt solid #3d4448; padding: 13pt;">
      <p style="color: #b8bfba; font-size: 13pt; margin: 0 0 8pt 0;">True age</p>
      <p class="huge" style="color: ${WHITE}; font-size: 46pt;">17</p>
      <p style="color: #b8bfba; font-size: 13pt; margin: 10pt 0 0 0;">Model says</p>
      <p class="huge" style="color: ${OCHRE}; font-size: 46pt;">20</p>
    </div>
    <div style="width: 320pt; padding: 13pt;">
      <p style="color: ${WHITE}; font-size: 15pt; margin: 0 0 12pt 0;">Average error: <b>3 years.</b> Sounds small.</p>
      <p style="color: ${OCHRE}; font-size: 19pt; font-weight: bold; margin: 0 0 12pt 0;">But the eligibility decision has flipped.</p>
      <p style="color: #b8bfba; font-size: 13pt; margin: 0;">A minor has just been classified as an adult. Accuracy metrics
      call this a near miss. A clinician calls it a failure.</p>
      <p style="color: #b8bfba; font-size: 13pt; margin: 8pt 0 0 0;">The useful question is not <i>how accurate is it</i>, but <b style="color: ${WHITE};">does it know when to stop</b>.</p>
    </div>
  </div>
`, "ground-ink.png"));

// 4 — proposed solution
add("04-solution", page(`
  <p class="kicker">Proposed solution</p>
  <h2>A decision path, not a prediction</h2>
  <div class="rule"></div>
  <p class="lede" style="margin-bottom: 14pt;">The model is the small half. What makes it usable is what happens to the number afterwards.</p>
  <div class="row" style="margin-bottom: 12pt;">
    <div class="card" style="width: 118pt;"><p class="small mono" style="color: ${OCHRE}; margin: 0 0 4pt 0;">STEP 1</p><h4>Estimate</h4><p class="small">Age, plus a range and a confidence score.</p></div>
    <div class="card" style="width: 118pt;"><p class="small mono" style="color: ${OCHRE}; margin: 0 0 4pt 0;">STEP 2</p><h4>Clinical band</h4><p class="small">Paediatric through geriatric, five bands.</p></div>
    <div class="card" style="width: 118pt;"><p class="small mono" style="color: ${OCHRE}; margin: 0 0 4pt 0;">STEP 3</p><h4>Policy decision</h4><p class="small">Verified, rejected, or undecidable.</p></div>
    <div class="cardw" style="width: 118pt;"><p class="small mono" style="color: ${OCHRE}; margin: 0 0 4pt 0;">STEP 4</p><h4>Human review</h4><p class="small">When uncertain, a person decides instead.</p></div>
    <div class="card" style="width: 118pt;"><p class="small mono" style="color: ${OCHRE}; margin: 0 0 4pt 0;">STEP 5</p><h4>Audit trail</h4><p class="small">Every step recorded. No image stored.</p></div>
  </div>
  <div class="cardw">
    <p style="margin: 0;"><b>The invariant, enforced in code:</b> review beats both verified and rejected.
    An uncertain prediction is never auto-actioned. That is the entire point of the system.</p>
  </div>
`));

// 5 — section: engine
add("05-sec-engine", bleed(`
  <div style="height: 104pt;"></div>
  <p style="font-size: 13pt; letter-spacing: 2.4pt; color: ${OCHRE}; font-weight: bold; margin: 0 0 14pt 0;">PART ONE</p>
  <h1 style="font-size: 46pt; color: ${WHITE}; margin: 0;">How the engine works</h1>
  <p style="font-size: 15pt; color: #b8bfba; margin: 14pt 0 0 0;">The model, the distribution it predicts, and the rule that sends a case to a human.</p>
`, "ground-ink.png"));

// 6 — the model
add("06-model", page(`
  <p class="kicker">The model</p>
  <h2>EfficientNet-B0, fine-tuned</h2>
  <div class="rule"></div>
  <div class="row">
    <div style="width: 306pt;">
      <ul>
        <li><b>4.1 million parameters.</b> Small on purpose, so the whole system runs offline on one laptop.</li>
        <li><b>Pretrained on ImageNet, then fine-tuned on faces.</b> The network already knows edges, texture and shape, so we only teach it the age-specific part.</li>
        <li><b>224 x 224 input, 12 epochs</b>, about 50 minutes on a laptop GPU.</li>
        <li>Training from scratch on 167,000 images would have been far worse. Transfer learning is the reason a small model works here.</li>
      </ul>
    </div>
    <div style="width: 300pt;">
      <div class="card" style="margin-bottom: 10pt;">
        <h3 style="color: ${OCHRE};">Why not something bigger</h3>
        <p class="small" style="margin: 0;">A larger backbone buys accuracy we are not scored on, and costs the offline
        guarantee we are. The bottleneck in this problem is not model capacity, it is knowing when the answer
        is untrustworthy.</p>
      </div>
      <div class="card">
        <h3 style="color: ${OCHRE};">Verified on the hardware</h3>
        <p class="small mono" style="margin: 0;">654 img/s &nbsp;·&nbsp; 4.7 min/epoch<br>17 MB checkpoint &nbsp;·&nbsp; 24 ms per prediction</p>
      </div>
    </div>
  </div>
`));

// 7 — DLDL, the core idea
add("07-dldl", page(`
  <p class="kicker">The key design choice</p>
  <h2>Predict a distribution, not a number</h2>
  <div class="rule" style="margin-bottom: 12pt;"></div>
  ${img("diagram-distribution.png", "width: 600pt; height: 194pt; margin-bottom: 9pt;")}
  <div class="cardw">
    <p style="margin: 0;">This is a published method: <b>Deep Label Distribution Learning</b> (DLDL, IJCAI 2018). We arrived
    at it from our own requirements and then found it in the literature, so the choice is defensible rather than improvised.</p>
  </div>
`));

// 8 — soft labels
add("08-soft-labels", page(`
  <p class="kicker">How it trains</p>
  <h2>Soft labels: 34 is nearly right</h2>
  <div class="rule"></div>
  <div class="row">
    <div class="card" style="width: 306pt;">
      <h3 style="color: ${RUST};">The naive way</h3>
      <p>Tell the model <b>"35 is correct, every other age is wrong."</b></p>
      <p class="small">A prediction of 34 is then penalised exactly as hard as a prediction of 70. The model is never
      told that age has an order, so it cannot learn to be close.</p>
    </div>
    <div class="cardw" style="width: 306pt;">
      <h3 style="color: ${GREEN};">What we do</h3>
      <p>Give it a <b>bell curve centred on 35.</b></p>
      <p class="small">Now 34 and 36 are nearly right, 40 is somewhat wrong, and 70 is badly wrong. The ordering of
      age is built into the training signal itself.</p>
    </div>
  </div>
  <div class="card" style="margin-top: 12pt;">
    <p style="margin: 0;"><b>The loss follows directly from this.</b> Because both the prediction and the target are
    distributions, training means making one match the other. We compute cross-entropy against the soft label,
    which equals KL-divergence up to a constant.</p>
  </div>
`));

// 9 — three outputs
add("09-three-outputs", page(`
  <p class="kicker">What the distribution buys</p>
  <h2>Three numbers from one forward pass</h2>
  <div class="rule"></div>
  <div class="row" style="margin-bottom: 14pt;">
    <div class="card" style="width: 196pt;">
      <p class="small mono" style="color: ${OCHRE};">TAKE THE AVERAGE</p>
      <p class="big" style="font-size: 40pt;">24.2</p>
      <h4>The age estimate</h4>
      <p class="small" style="margin: 0;">Expected value across all 100 age bins.</p>
    </div>
    <div class="card" style="width: 196pt;">
      <p class="small mono" style="color: ${OCHRE};">TAKE THE PERCENTILES</p>
      <p class="big" style="font-size: 34pt;">17.5&ndash;31.5</p>
      <h4>An 80% range</h4>
      <p class="small" style="margin: 0;">The 10th and 90th percentile of the same curve.</p>
    </div>
    <div class="card" style="width: 196pt;">
      <p class="small mono" style="color: ${OCHRE};">TAKE THE SPREAD</p>
      <p class="big" style="font-size: 40pt;">0.32</p>
      <h4>A confidence score</h4>
      <p class="small" style="margin: 0;">How concentrated the curve is, normalised.</p>
    </div>
  </div>
  <div class="cardw">
    <p style="margin: 0;">A model that outputs a single number gives you only the first of these. The other two are
    what the review queue runs on, and there is no way to bolt them on afterwards without ensembles or
    a second model.</p>
  </div>
`));

// 10 — routing rule
add("10-routing", page(`
  <p class="kicker">The routing rule</p>
  <h2>Two ways a case reaches a human</h2>
  <div class="rule"></div>
  <div class="row" style="margin-bottom: 12pt;">
    <div class="cardw" style="width: 306pt;">
      <h3 style="color: ${OCHRE};">1 &nbsp; Low confidence</h3>
      <p style="margin: 0 0 6pt 0;">Bottom <b>15%</b> of the validation confidence distribution.</p>
      <p class="small" style="margin: 0;">A percentile, not a fixed cutoff. "Below 0.3" is meaningless without knowing how
      this model's confidence is actually distributed, so the rule is defined against measured behaviour.</p>
    </div>
    <div class="cardw" style="width: 306pt;">
      <h3 style="color: ${OCHRE};">2 &nbsp; The range crosses a boundary</h3>
      <p style="margin: 0 0 6pt 0;">Even when the model is <b>confident</b>.</p>
      <p class="small" style="margin: 0;">A confident estimate sitting on the age-18 line is still not decisive. This asks
      whether the uncertainty threatens the decision, not merely whether it exists.</p>
    </div>
  </div>
  ${img("ladder-teen.png", "width: 600pt; height: 120pt;")}
  <p class="small" style="text-align: center; margin: 2pt 0 0 0;">Estimate 24.2, range 17.5 to 31.5, crossing the boundaries at 18 and 30.</p>
`));

// 11 — worked example
add("11-example", page(`
  <p class="kicker">A worked example</p>
  <h2>The model is wrong, and the system holds</h2>
  <div class="rule" style="margin-bottom: 10pt;"></div>
  <div class="row">
    ${shot("02-verify-teen_17.png", "width: 316pt; height: 197pt; border: 1.5pt solid " + LINE + ";")}
    <div style="width: 298pt;">
      <div class="row" style="margin-bottom: 6pt;">
        <div class="card" style="width: 137pt;">
          <p class="small mono" style="color: ${FAINT}; margin: 0;">TRUE AGE</p>
          <p class="big" style="font-size: 26pt; margin: 0;">17</p>
        </div>
        <div class="card" style="width: 137pt;">
          <p class="small mono" style="color: ${FAINT}; margin: 0;">MODEL READS</p>
          <p class="big" style="font-size: 26pt; color: ${RUST}; margin: 0;">24.2</p>
        </div>
      </div>
      <div class="cardw">
        <p class="small mono" style="color: ${OCHRE}; margin: 0;">OUTCOME</p>
        <h4 style="color: ${OCHRE}; margin: 2pt 0;">Routed to review</h4>
        <p class="small mono" style="margin: 0;">interval_straddles_band_boundary</p>
        <p class="small" style="margin: 4pt 0 0 0;">Masked, in profile. A genuine miss.</p>
      </div>
    </div>
  </div>
  <div class="cardw" style="margin-top: 8pt;">
    <p style="margin: 0;"><b>It got a minor wrong by seven years and refused to act on it.</b> On a randomly chosen held-out image, not a staged case.</p>
  </div>
`));

// 12 — section: applications
add("12-sec-apps", bleed(`
  <div style="height: 104pt;"></div>
  <p style="font-size: 13pt; letter-spacing: 2.4pt; color: ${OCHRE}; font-weight: bold; margin: 0 0 14pt 0;">PART TWO</p>
  <h1 style="font-size: 46pt; color: ${WHITE}; margin: 0;">Where this is used</h1>
  <p style="font-size: 15pt; color: #b8bfba; margin: 14pt 0 0 0;">Healthcare settings where an age boundary carries a clinical or legal consequence.</p>
`, "ground-ink.png"));

// 13 — healthcare applications
add("13-applications", page(`
  <p class="kicker">Healthcare applications</p>
  <h2>Four settings, one shared property</h2>
  <div class="rule"></div>
  <div class="row" style="margin-bottom: 12pt;">
    <div class="card" style="width: 148pt;">
      ${img("ic-flask.png", "width: 24pt; height: 24pt; margin-bottom: 5pt;")}
      <h4>Trial eligibility</h4>
      <p class="small" style="margin: 0;">Screening candidates against an age-bounded protocol, where enrolling
      outside the range invalidates the arm.</p>
    </div>
    <div class="card" style="width: 148pt;">
      ${img("ic-pills.png", "width: 24pt; height: 24pt; margin-bottom: 5pt;")}
      <h4>Dosing bands</h4>
      <p class="small" style="margin: 0;">Paediatric, adult and geriatric dosing differ. The band matters more
      than the exact year.</p>
    </div>
    <div class="card" style="width: 148pt;">
      ${img("ic-shield.png", "width: 24pt; height: 24pt; margin-bottom: 5pt;")}
      <h4>Consent thresholds</h4>
      <p class="small" style="margin: 0;">Whether a patient can consent for themselves, or needs a guardian
      present.</p>
    </div>
    <div class="card" style="width: 148pt;">
      ${img("ic-doctor.png", "width: 24pt; height: 24pt; margin-bottom: 5pt;")}
      <h4>Telehealth intake</h4>
      <p class="small" style="margin: 0;">Confirming an age claim remotely when no document is available at
      point of contact.</p>
    </div>
  </div>
  <div class="cardw">
    <p style="margin: 0;"><b>What they share:</b> the decision is a band, not a year, and an error near a boundary is far
    more costly than the same error in the middle of a band. That is precisely the shape our routing rule
    is built around.</p>
  </div>
`));

// 14 — section: engineering
add("14-sec-eng", bleed(`
  <div style="height: 104pt;"></div>
  <p style="font-size: 13pt; letter-spacing: 2.4pt; color: ${OCHRE}; font-weight: bold; margin: 0 0 14pt 0;">PART THREE</p>
  <h1 style="font-size: 46pt; color: ${WHITE}; margin: 0;">How it is built</h1>
  <p style="font-size: 15pt; color: #b8bfba; margin: 14pt 0 0 0;">Stack, architecture, and the path a single request takes end to end.</p>
`, "ground-ink.png"));

// 15 — tech stack
add("15-stack", page(`
  <p class="kicker">Tech stack</p>
  <h2>Deliberately boring</h2>
  <div class="rule"></div>
  <div class="row" style="margin-bottom: 11pt;">
    <div class="card" style="width: 196pt;">
      ${img("ic-brain.png", "width: 22pt; height: 22pt; margin-bottom: 5pt;")}
      <h3 style="color: ${OCHRE};">Machine learning</h3>
      <p class="small mono" style="margin: 0;">PyTorch 2.11 (cu128)<br>timm &mdash; EfficientNet-B0<br>OpenCV &mdash; face detection<br>Pillow</p>
    </div>
    <div class="card" style="width: 196pt;">
      ${img("ic-server.png", "width: 22pt; height: 22pt; margin-bottom: 5pt;")}
      <h3 style="color: ${OCHRE};">Backend</h3>
      <p class="small mono" style="margin: 0;">Python 3.13<br>FastAPI + Uvicorn<br>SQLite, stdlib sqlite3<br>no ORM</p>
    </div>
    <div class="card" style="width: 196pt;">
      ${img("ic-react.png", "width: 22pt; height: 22pt; margin-bottom: 5pt;")}
      <h3 style="color: ${OCHRE};">Frontend</h3>
      <p class="small mono" style="margin: 0;">React 19 + TypeScript<br>Vite, Tailwind v4<br>self-hosted fonts<br>no router, no state lib</p>
    </div>
  </div>
  <div class="cardw">
    <p style="margin: 0 0 5pt 0;"><b>What we deliberately did not add:</b> no ORM, no state library, no router, no charting
    library. Three views and three small plots do not justify the dependencies, and every dependency is
    something that can fail offline on demo day.</p>
    <p class="small" style="margin: 0;">Testing is assert-based selfchecks per module plus a 7-test contract suite. No pytest.</p>
  </div>
`));

// 16 — architecture
add("16-architecture", page(`
  <p class="kicker">System architecture</p>
  <h2>One process, one port</h2>
  <div class="rule" style="margin-bottom: 12pt;"></div>
  ${img("diagram-architecture.png", "width: 632pt; height: 245pt;")}
`));

// 17 — workflow
add("17-workflow", page(`
  <p class="kicker">End to end</p>
  <h2>What happens to one image</h2>
  <div class="rule"></div>
  <div class="row" style="margin-bottom: 7pt;">
    <div class="card" style="width: 148pt;"><p class="mono small" style="color: ${OCHRE}; margin: 0;">01</p><h4>Upload</h4><p class="small" style="margin: 0;">Multipart POST. Type and size checked before anything else runs.</p></div>
    <div class="card" style="width: 148pt;"><p class="mono small" style="color: ${OCHRE}; margin: 0;">02</p><h4>Hash, then discard</h4><p class="small" style="margin: 0;">SHA-256 taken. The pixels are freed and never written to disk.</p></div>
    <div class="card" style="width: 148pt;"><p class="mono small" style="color: ${OCHRE}; margin: 0;">03</p><h4>Detect and crop</h4><p class="small" style="margin: 0;">No face found means predict on the full frame and force review, never reject.</p></div>
    <div class="card" style="width: 148pt;"><p class="mono small" style="color: ${OCHRE}; margin: 0;">04</p><h4>Infer</h4><p class="small" style="margin: 0;">Distribution over 100 ages. Decoded to estimate, range, confidence.</p></div>
  </div>
  <div class="row">
    <div class="card" style="width: 148pt;"><p class="mono small" style="color: ${OCHRE}; margin: 0;">05</p><h4>Band and policy</h4><p class="small" style="margin: 0;">bands.py maps the estimate to a clinical band and a decision.</p></div>
    <div class="cardw" style="width: 148pt;"><p class="mono small" style="color: ${OCHRE}; margin: 0;">06</p><h4>Route</h4><p class="small" style="margin: 0;">Uncertain or boundary-crossing cases enter the review queue.</p></div>
    <div class="card" style="width: 148pt;"><p class="mono small" style="color: ${OCHRE}; margin: 0;">07</p><h4>Audit</h4><p class="small" style="margin: 0;">Digest, estimate, band, decision, rule and timestamp recorded.</p></div>
    <div class="card" style="width: 148pt;"><p class="mono small" style="color: ${OCHRE}; margin: 0;">08</p><h4>Respond</h4><p class="small" style="margin: 0;">One envelope shape, whatever the outcome. Five defined statuses.</p></div>
  </div>
  <div class="card" style="margin-top: 7pt;">
    <p class="small" style="margin: 0;"><b>Every status returns the same JSON structure</b> &mdash; success, no face, multiple faces, poor quality, service error. Frozen on day one so the frontend could be built while the model trained.</p>
  </div>
`));

// 18 — section: results
add("18-sec-results", bleed(`
  <div style="height: 104pt;"></div>
  <p style="font-size: 13pt; letter-spacing: 2.4pt; color: ${OCHRE}; font-weight: bold; margin: 0 0 14pt 0;">PART FOUR</p>
  <h1 style="font-size: 46pt; color: ${WHITE}; margin: 0;">Results and evaluation</h1>
  <p style="font-size: 15pt; color: #b8bfba; margin: 14pt 0 0 0;">All figures measured on 47,568 images the model never saw during training.</p>
`, "ground-ink.png"));

// 19 — headline results
add("19-headline", page(`
  <p class="kicker">Held-out performance</p>
  <h2>Twice as good as guessing</h2>
  <div class="rule"></div>
  <div class="row" style="margin-bottom: 13pt;">
    <div class="cardw" style="width: 148pt;">
      <p class="small mono" style="color: ${OCHRE}; margin: 0;">MEAN ABS. ERROR</p>
      <p class="big" style="font-size: 42pt; margin: 3pt 0;">5.64</p>
      <p class="small" style="margin: 0;">years</p>
    </div>
    <div class="card" style="width: 148pt;">
      <p class="small mono" style="color: ${FAINT}; margin: 0;">BASELINE</p>
      <p class="big" style="font-size: 42pt; margin: 3pt 0; color: ${DIM};">11.34</p>
      <p class="small" style="margin: 0;">guess the average age</p>
    </div>
    <div class="card" style="width: 148pt;">
      <p class="small mono" style="color: ${FAINT}; margin: 0;">WITHIN 5 YEARS</p>
      <p class="big" style="font-size: 42pt; margin: 3pt 0;">59.3<span style="font-size: 22pt;">%</span></p>
      <p class="small" style="margin: 0;">CS@5</p>
    </div>
    <div class="card" style="width: 148pt;">
      <p class="small mono" style="color: ${FAINT}; margin: 0;">CORRECT BAND</p>
      <p class="big" style="font-size: 42pt; margin: 3pt 0;">66.8<span style="font-size: 22pt;">%</span></p>
      <p class="small" style="margin: 0;">the decision that matters</p>
    </div>
  </div>
  <div class="cardw">
    <p style="margin: 0 0 5pt 0;"><b>The honest figure is a range: 5.64 to 6.57 years.</b></p>
    <p class="small" style="margin: 0;">The dataset is celebrity photography and the publisher split it per image rather
    than per person, so the same faces appear in both halves &mdash; we confirmed it visually. Excluding test images
    that closely resemble training images moves the figure to 6.00, then 6.57. We found this ourselves and
    published it rather than quoting the flattering number.</p>
  </div>
`));

// 20 — per band (chart placeholder)
add("20-perband", page(`
  <p class="kicker">Accuracy is not uniform</p>
  <h2>Per-band error, and why we report it</h2>
  <div class="rule"></div>
  <div class="row">
    <div style="width: 250pt;">
      <p>A single average hides the shape of the failure. Ours is worst exactly where the training data is
      thinnest.</p>
      <div class="card" style="margin-bottom: 8pt;">
        <p class="small" style="margin: 0;"><b>Geriatric is 2.5x worse than adult.</b> The 90+ sub-band, on 77 test
        images, is 15.95 years.</p>
      </div>
      <div class="cardw">
        <p class="small" style="margin: 0;">This is not a defect we hid and were caught on. It is on the results screen
        inside the product, with the geriatric row in red.</p>
      </div>
    </div>
    <div id="bands" class="placeholder" style="width: 366pt; height: 236pt;"></div>
  </div>
`));

// 21 — confidence works
add("21-confidence", page(`
  <p class="kicker">Does confidence mean anything</p>
  <h2>Error falls at every confidence step</h2>
  <div class="rule"></div>
  <div class="row">
    <div id="deciles" class="placeholder" style="width: 366pt; height: 232pt;"></div>
    <div style="width: 250pt;">
      <div class="cardw" style="margin-bottom: 8pt;">
        <h3 style="color: ${OCHRE};">Pre-registered</h3>
        <p class="small" style="margin: 0;">We wrote the pass mark into the code <b>before training started</b>, so it could
        not be adjusted afterwards to flatter us. There is a commit proving the order.</p>
      </div>
      <div class="card" style="margin-bottom: 8pt;">
        <p class="small" style="margin: 0;">Bar to clear: low-confidence predictions at least <b>1.3x</b> worse, and error
        falling consistently.</p>
      </div>
      <div class="card">
        <p class="small mono" style="color: ${GREEN}; margin: 0;">RESULT</p>
        <p style="margin: 3pt 0 0 0;"><b>3.89x worse</b>, and monotonic across <b>all ten</b> deciles.</p>
      </div>
    </div>
  </div>
`));

// 22 — calibration
add("22-calibration", page(`
  <p class="kicker">A stronger claim than ranking</p>
  <h2>An 80% range is right 79.1% of the time</h2>
  <div class="rule"></div>
  <div class="row">
    <div style="width: 250pt;">
      <p class="small">Ranking errors correctly is one thing. <b>Calibration</b> asks something harder: when the model
      says 80% confident, is it right 80% of the time?</p>
      <div class="card" style="margin-bottom: 8pt;">
        <p class="small" style="margin: 0;">Measured across all 47,568 images. Worst deviation at any confidence
        level: <b>2.4 percentage points.</b></p>
      </div>
      <div class="cardw">
        <p class="small" style="margin: 0;"><b>So the range shown on screen means what it says.</b> The uncertainty it
        reports is the uncertainty it has.</p>
      </div>
    </div>
    <div id="calib" class="placeholder" style="width: 366pt; height: 232pt;"></div>
  </div>
`));

// 23 — value of deferring
add("23-deferring", page(`
  <p class="kicker">Does the queue earn its place</p>
  <h2>Deferring 15% cuts error by 11.5%</h2>
  <div class="rule"></div>
  <div class="row">
    <div id="rc" class="placeholder" style="width: 366pt; height: 232pt;"></div>
    <div style="width: 250pt;">
      <p class="small">Send the least confident cases to a human and measure what happens to the error on
      everything the system still decides by itself.</p>
      <div class="row" style="margin-bottom: 8pt;">
        <div class="card" style="width: 118pt;">
          <p class="small mono" style="color: ${FAINT}; margin: 0;">ALL CASES</p>
          <p class="big" style="font-size: 28pt; margin: 2pt 0 0 0;">5.64</p>
        </div>
        <div class="cardw" style="width: 118pt;">
          <p class="small mono" style="color: ${OCHRE}; margin: 0;">DEFER 15%</p>
          <p class="big" style="font-size: 28pt; margin: 2pt 0 0 0; color: ${OCHRE};">4.99</p>
        </div>
      </div>
      <div class="card">
        <p class="small" style="margin: 0;">This is the standard presentation for <b>selective prediction</b>. The dashed
        line is the oracle bound, which is what a perfect ranking of the errors would achieve.</p>
      </div>
    </div>
  </div>
`));

// 24 — the console
add("24-console", page(`
  <p class="kicker">In the product, not just the deck</p>
  <h2>The evidence screen</h2>
  <div class="rule" style="margin-bottom: 10pt;"></div>
  ${shot("05-model-evidence.png", "width: 458pt; height: 286pt; border: 1.5pt solid " + LINE + ";")}
  <div style="width: 158pt; margin-left: 10pt; display: inline-block; vertical-align: top;">
    <div class="cardw">
      <p class="small" style="margin: 0;">Our own accuracy figures ship <b>inside the product</b>, including the ones that do
      not flatter us. The headline MAE carries its caveat directly beneath it, and the geriatric row renders
      in red.</p>
    </div>
  </div>
`));

// 25 — fairness
add("25-fairness", page(`
  <p class="kicker">The finding we did not want</p>
  <h2>The model is less accurate on Black faces</h2>
  <div class="rule"></div>
  <div class="row">
    <div style="width: 236pt;">
      <p class="small">Our own data has no ethnicity labels, so we tested on <b>UTKFace</b>, which does &mdash; 23,684
      images, inference only.</p>
      <p class="small">Groups differ in age composition, and young faces are easier, so raw per-group error is
      confounded. Comparing <b>within age bands</b> removes it.</p>
      <div class="card">
        <p class="small" style="margin: 0;">Black subjects carry the highest error in <b>four of five</b> bands. The
        paediatric row is the serious one: <b>3.7x</b> the best group, in exactly the band holding the age-18
        threshold.</p>
      </div>
    </div>
    <div id="fair" class="placeholder" style="width: 380pt; height: 236pt;"></div>
  </div>
`));

// 26 — containment
add("26-containment", page(`
  <p class="kicker">What the system does about it</p>
  <h2>Containment, and its cost</h2>
  <div class="rule"></div>
  <div class="row" style="margin-bottom: 12pt;">
    <div class="cardw" style="width: 306pt;">
      ${img("ic-check.png", "width: 22pt; height: 22pt; margin-bottom: 5pt;")}
      <h3 style="color: ${GREEN};">The queue does catch it</h3>
      <p class="small" style="margin: 0 0 5pt 0;">Routing fires on <b>15.7%</b> of Black subjects, against 7.8% White and
      4.1% for the best-served group.</p>
      <p class="small" style="margin: 0;">The routing order matches the error order exactly, so the cases the model
      serves worst are the ones it most often declines to decide alone.</p>
    </div>
    <div class="card" style="width: 306pt; border-color: ${RUST};">
      ${img("ic-scale.png", "width: 22pt; height: 22pt; margin-bottom: 5pt;")}
      <h3 style="color: ${RUST};">But it is not a fix</h3>
      <p class="small" style="margin: 0 0 5pt 0;">The same people are then <b>disproportionately subjected to manual
      review</b>, which is a worse experience even when the decision is better.</p>
      <p class="small" style="margin: 0;">A system that is less accurate for one group and also slower for that group
      has not solved its fairness problem by adding a human.</p>
    </div>
  </div>
  <div class="card">
    <p style="margin: 0;">Correcting it properly needs training data balanced across skin tones, which the reference
    dataset cannot provide. <b>We are reporting a measured limitation, not a solved problem.</b></p>
  </div>
`));

// 27 — honest limits
add("27-limits", page(`
  <p class="kicker">Honest limits</p>
  <h2>Stated by us, not discovered by you</h2>
  <div class="rule"></div>
  <div class="row" style="margin-bottom: 10pt;">
    <div class="card" style="width: 306pt;">
      <h4 style="color: ${RUST};">The headline MAE is optimistic</h4>
      <p class="small" style="margin: 0;">5.64 to 6.57. Same people on both sides of the split. Unfixable on this
      dataset: no identity labels exist, so a per-person split cannot be reconstructed.</p>
    </div>
    <div class="card" style="width: 306pt;">
      <h4 style="color: ${RUST};">Demographic gap, measured</h4>
      <p class="small" style="margin: 0;">Highest error on Black faces in four of five age bands. Contained by the
      review queue, not corrected.</p>
    </div>
  </div>
  <div class="row" style="margin-bottom: 10pt;">
    <div class="card" style="width: 306pt;">
      <h4 style="color: ${RUST};">Image only</h4>
      <p class="small" style="margin: 0;">The brief also lists voice and other biometrics. The reference dataset has
      neither, so a second modality was scoped out rather than faked.</p>
    </div>
    <div class="card" style="width: 306pt;">
      <h4 style="color: ${RUST};">The 90+ tail is 273 images</h4>
      <p class="small" style="margin: 0;">No public face dataset has real volume above 85. It is a structural gap in
      the field, not an oversight in our search.</p>
    </div>
  </div>
  <div class="cardw">
    <p style="margin: 0;"><b>Not for clinical use.</b> This is a research demonstration. Face-based age estimation carries
    real bias and consent problems and is not a substitute for a documented date of birth.</p>
  </div>
`));

// 28 — what next
add("28-next", page(`
  <p class="kicker">Given more time</p>
  <h2>What we would do next</h2>
  <div class="rule"></div>
  <div class="row" style="margin-bottom: 11pt;">
    <div class="card" style="width: 196pt;">
      <p class="small mono" style="color: ${OCHRE}; margin: 0;">FIRST</p>
      <h4>Resolve the leakage range</h4>
      <p class="small" style="margin: 0;">An identity-tuned face embedding would separate "same person" from
      "similar-looking face of the same age", turning 5.64 to 6.57 into a single number.</p>
    </div>
    <div class="card" style="width: 196pt;">
      <p class="small mono" style="color: ${OCHRE}; margin: 0;">SECOND</p>
      <h4>Balanced training data</h4>
      <p class="small" style="margin: 0;">The only real fix for the demographic gap. Needs a corpus balanced across
      skin tones, which means new data collection, not resampling.</p>
    </div>
    <div class="card" style="width: 196pt;">
      <p class="small mono" style="color: ${OCHRE}; margin: 0;">THIRD</p>
      <h4>Conformal prediction</h4>
      <p class="small" style="margin: 0;">Upgrades "empirically 79.1% coverage" to a distribution-free guarantee,
      retrofittable to the trained model with a calibration set.</p>
    </div>
  </div>
  <div class="card">
    <p style="margin: 0;"><b>One thing we would not do:</b> chase a lower headline MAE. The bottleneck in this problem is
    not accuracy, and a system that is confidently wrong is more dangerous than one that is slightly less
    precise and knows it.</p>
  </div>
`));

// 29 — conclusion
add("29-conclusion", bleed(`
  <div style="height: 34pt;"></div>
  <p style="font-size: 12pt; letter-spacing: 2pt; color: ${OCHRE}; font-weight: bold; margin: 0 0 18pt 0;">IN CLOSING</p>
  <h1 style="font-size: 38pt; color: ${WHITE}; margin: 0 0 10pt 0;">The model is wrong sometimes.</h1>
  <h1 style="font-size: 38pt; color: ${OCHRE}; margin: 0 0 26pt 0;">What matters is that it knows when, and stops.</h1>
  <div class="row">
    <div style="width: 200pt;">
      <p style="color: ${WHITE}; font-size: 13pt; margin: 0 0 3pt 0;"><b>Built</b></p>
      <p style="color: #b8bfba; font-size: 12pt; margin: 0;">Trained model, clinical decision path, review queue, audit
      trail, four-view console. One offline process.</p>
    </div>
    <div style="width: 200pt;">
      <p style="color: ${WHITE}; font-size: 13pt; margin: 0 0 3pt 0;"><b>Measured</b></p>
      <p style="color: #b8bfba; font-size: 12pt; margin: 0;">Accuracy, per-band error, calibration, selective
      prediction, and demographic fairness. All on held-out data.</p>
    </div>
    <div style="width: 200pt;">
      <p style="color: ${OCHRE}; font-size: 13pt; margin: 0 0 3pt 0;"><b>Disclosed</b></p>
      <p style="color: #b8bfba; font-size: 12pt; margin: 0;">Every limitation above, including the two we found by
      auditing our own benchmark rather than waiting to be asked.</p>
    </div>
  </div>
`, "ground-ink.png"));

// ── charts ───────────────────────────────────────────────────────────────────
const CHARTS = {
  "20-perband": (pptx, slide, ph) => slide.addChart(pptx.charts.BAR, [{
    name: "MAE (years)",
    labels: ["Adult\n30-49", "Young adult\n18-29", "Paediatric\n0-17", "Older adult\n50-64", "Geriatric\n65+", "90+"],
    values: [4.80, 4.98, 6.20, 7.60, 12.25, 15.95],
  }], {
    ...ph, barDir: "col", showLegend: false,
    showTitle: true, title: "Mean absolute error by clinical band", titleFontSize: 11,
    showCatAxisTitle: false, showValAxisTitle: true, valAxisTitle: "MAE (years)",
    valAxisMinVal: 0, valAxisMaxVal: 18, valAxisMajorUnit: 4,
    showDataTableKeys: false, dataLabelPosition: "outEnd", showValue: true,
    dataLabelFontSize: 10, dataLabelColor: "23282a",
    catAxisLabelFontSize: 9, valAxisLabelFontSize: 9,
    chartColors: ["2f6b4f", "2f6b4f", "b06a12", "b06a12", "a2412f", "a2412f"],
  }),

  "21-confidence": (pptx, slide, ph) => slide.addChart(pptx.charts.BAR, [{
    name: "MAE (years)",
    labels: ["1\nleast", "2", "3", "4", "5", "6", "7", "8", "9", "10\nmost"],
    values: [10.12, 7.85, 6.76, 6.18, 5.47, 5.12, 4.60, 4.02, 3.66, 2.60],
  }], {
    ...ph, barDir: "col", showLegend: false,
    showTitle: true, title: "MAE by confidence decile", titleFontSize: 11,
    showCatAxisTitle: true, catAxisTitle: "Confidence decile",
    showValAxisTitle: true, valAxisTitle: "MAE (years)",
    valAxisMinVal: 0, valAxisMaxVal: 11, valAxisMajorUnit: 2,
    catAxisLabelFontSize: 8, valAxisLabelFontSize: 9,
    chartColors: ["b06a12", "8b918b", "8b918b", "8b918b", "8b918b", "8b918b", "8b918b", "8b918b", "8b918b", "2f6b4f"],
  }),

  "22-calibration": (pptx, slide, ph) => slide.addChart(pptx.charts.LINE, [
    { name: "Measured", labels: ["50%", "60%", "70%", "80%", "90%", "95%"], values: [52.4, 61.3, 70.3, 79.1, 88.2, 93.1] },
    { name: "Perfect", labels: ["50%", "60%", "70%", "80%", "90%", "95%"], values: [50, 60, 70, 80, 90, 95] },
  ], {
    ...ph, lineSize: 3, lineSmooth: false,
    lineDataSymbol: "circle", lineDataSymbolSize: 7,
    showTitle: true, title: "Stated confidence vs actual coverage", titleFontSize: 11,
    showLegend: true, legendPos: "b", legendFontSize: 9,
    showCatAxisTitle: true, catAxisTitle: "Stated confidence level",
    showValAxisTitle: true, valAxisTitle: "Actual coverage (%)",
    valAxisMinVal: 45, valAxisMaxVal: 100, valAxisMajorUnit: 10,
    catAxisLabelFontSize: 9, valAxisLabelFontSize: 9,
    chartColors: ["23282a", "2f6b4f"],
  }),

  "23-deferring": (pptx, slide, ph) => slide.addChart(pptx.charts.LINE, [
    { name: "Our confidence", labels: ["20%", "40%", "60%", "85%", "100%"], values: [2.78, 3.55, 4.16, 4.99, 5.64] },
    { name: "Oracle bound", labels: ["20%", "40%", "60%", "85%", "100%"], values: [0.55, 1.24, 2.05, 3.72, 5.64] },
  ], {
    ...ph, lineSize: 3, lineSmooth: true,
    lineDataSymbol: "circle", lineDataSymbolSize: 6,
    showTitle: true, title: "Error on auto-decided cases as coverage rises", titleFontSize: 11,
    showLegend: true, legendPos: "b", legendFontSize: 9,
    showCatAxisTitle: true, catAxisTitle: "Coverage (share decided without a human)",
    showValAxisTitle: true, valAxisTitle: "MAE (years)",
    valAxisMinVal: 0, valAxisMaxVal: 6, valAxisMajorUnit: 2,
    catAxisLabelFontSize: 9, valAxisLabelFontSize: 9,
    chartColors: ["23282a", "8b918b"],
  }),

  "25-fairness": (pptx, slide, ph) => slide.addChart(pptx.charts.BAR, [
    { name: "Black", labels: ["0-17", "18-29", "30-49", "50-64", "65+"], values: [5.29, 4.02, 6.71, 8.60, 12.01] },
    { name: "Best in band", labels: ["0-17", "18-29", "30-49", "50-64", "65+"], values: [1.42, 3.27, 4.75, 5.53, 8.45] },
  ], {
    ...ph, barDir: "col", barGrouping: "clustered",
    showTitle: true, title: "MAE within age band, controlling for age composition", titleFontSize: 10,
    showLegend: true, legendPos: "b", legendFontSize: 9,
    showCatAxisTitle: true, catAxisTitle: "Age band",
    showValAxisTitle: true, valAxisTitle: "MAE (years)",
    valAxisMinVal: 0, valAxisMaxVal: 14, valAxisMajorUnit: 4,
    catAxisLabelFontSize: 9, valAxisLabelFontSize: 9,
    chartColors: ["a2412f", "8b918b"],
  }),
};

// ── build ────────────────────────────────────────────────────────────────────
async function main() {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "LuciferDono";
  pptx.title = "Age Verification — Clinical Console";
  pptx.subject = "Cognizant NPN — healthcare age estimation with human review";

  for (const { name, file } of deck) {
    const { slide, placeholders } = await html2pptx(file, pptx, { tmpDir: __dirname });
    if (CHARTS[name]) {
      if (!placeholders.length) throw new Error(`${name}: chart defined but no placeholder found`);
      CHARTS[name](pptx, slide, placeholders[0]);
    }
    console.log(`  ${name}${CHARTS[name] ? "  + chart" : ""}`);
  }

  const out = path.join(__dirname, "..", "docs", "NPN-Age-Verification.pptx");
  await pptx.writeFile({ fileName: out });
  console.log(`\n${deck.length} slides -> ${out}`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
