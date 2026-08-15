# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Age estimation from facial images for a healthcare-domain hackathon demo (Cognizant NPN,
3-day build). The model is deliberately the *small* half of the project — the deliverable
is the decision path around it: age estimate → clinical band → policy decision →
human review routing → audit trail. Judge changes by whether that path stays honest, not
by whether MAE moved.

Two things outlive the event and should be protected in any change: the **repo** and the
**demo recording**. Both are portfolio artifacts; the offer at the end of the funnel is not
the point.

## Commands

Windows paths shown (`.venv/Scripts/`); on Linux/macOS use `.venv/bin/`.

```bash
# setup
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
cd web && npm install

# run — ONE process serves API + built frontend on one port
cd web && npm run build          # must run before uvicorn, or / returns 404
.venv/Scripts/python.exe -m uvicorn server.main:app --port 8000

# frontend dev loop (proxies /api to :8000, which must be running)
cd web && npm run dev
```

### Checks

Each module carries its own `assert`-based selfcheck; there is no pytest/vitest harness.

```bash
.venv/Scripts/python.exe server/bands.py       # decision + routing logic
.venv/Scripts/python.exe server/store.py       # audit/queue + no-image-retention
.venv/Scripts/python.exe ml/gate0.py --selfcheck
.venv/Scripts/python.exe tests/test_api.py     # 7 contract tests
cd web && npx tsc -b                           # types only
cd web && node scripts/shots.mjs               # captures docs/shots/*.png (server must be up)
```

Run a single API test by passing a name substring:

```bash
.venv/Scripts/python.exe tests/test_api.py queue      # only test_review_queue_roundtrip
.venv/Scripts/python.exe tests/test_api.py envelope
```

## Architecture

### The frozen contract is the spine

`contract/predict.contract.md` (v1.0.0) was frozen before either lane started so the
frontend could build against mocks while the model trained. Three files must move together
or the freeze is meaningless:

- `contract/predict.contract.md` — prose source of truth
- `web/src/api.ts` — TypeScript mirror
- `tests/test_api.py` — asserts the envelope against the doc, not the implementation

**Every status returns the same envelope.** `no_face`, `multi_face`, `low_quality` and
`error` are first-class states with defined UI, not exceptions. `server/main.py::_envelope`
is the single place the envelope is constructed — new fields go there, never in a handler.

### Decision logic lives in one file

`server/bands.py` owns age bands, clinical policies, and review routing. Nothing else may
hardcode an age boundary. Invariants:

- **Review beats verified and rejected.** An uncertain prediction must never be
  auto-actioned; that is the entire point of the human-in-the-loop path.
- Routing fires on a **percentile** (`REVIEW_PERCENTILE`, bottom 15% of the validation
  confidence distribution) **or** when the prediction interval straddles a band boundary.
  Percentile rather than a raw-confidence cutoff so the rule stays defensible whatever the
  calibration curve looks like on a small validation set.
- `band_for()` clamps out-of-range ages to the outermost band rather than returning `None`
  — an unbanded prediction has no decision path.

### Band set is chosen by measurement, not assumption

`ACTIVE_BAND_SET` in `server/bands.py` must be set from `ml/gate0.py` output, not by hand.
Claiming paediatric or geriatric banding on an adult-only dataset is unsupportable in
front of a panel, so it is gated on evidence.

**Gate 0 is CLEARED — `lifespan`.** The apparent contradiction (Kaggle says 1–100, a public
reimplementation used 20–50) resolved: the dataset ships **two independent trees**,
`age_prediction_up/age_prediction/` (100 age folders) and `20-50/20-50/` (31 age folders),
each with its own train/test split. We use the full-lifespan tree.

Measured counts live in `ml/dataset_census.json`, read from Kaggle's file-tree API via the
Kaggle MCP server — no download needed. Train split: 185,632 images, ages 1–100, under-18
n=8,119 (4.4%), over-64 n=9,178 (4.9%). Reproduce with `python ml/gate0.py --census`;
`python ml/gate0.py data/` re-measures the extracted files and remains the ground truth.

**The 90+ tail is 273 images.** Per-band MAE is mandatory, not optional — a single headline
MAE would hide that the geriatric band is barely supported.

The Kaggle web page is JS-rendered and unreadable by WebFetch. Use the Kaggle MCP tools
(`get_dataset_info`, `list_dataset_tree_files`) instead — do not retry WebFetch on it.

### Image bytes never persist

`server/store.py` accepts a SHA-256 digest string; there is **no code path that takes
bytes**. `main.py::predict` hashes, then `del data`. `tests/test_api.py` asserts the raw
bytes are absent from the sqlite file after a prediction. This is the answer to the HIPAA
question, and it is enforced rather than claimed — keep it that way.

`store._conn()` is a commit-and-close contextmanager. Do not revert to a bare
`sqlite3.connect` used as a context manager: that commits but never closes, leaking a
handle per call and locking the DB file on Windows.

### Mock mode

`NPN_MOCK=1` (the default) returns contract-shaped responses with no model, so the
frontend is never blocked on training. Mock predictions are **deterministic in the image
digest** — same image, same answer, every run, which is also what makes the demo
reproducible. Two digest prefixes are reserved as fixtures: `0` → `no_face`,
`1` → `low_quality`.

The UI shows a `SYNTHETIC MODEL — NOT FOR CLINICAL USE` badge whenever mock is on. Never
remove that badge; demoing mock numbers as real is the worst available failure.

### Model lane (not yet built)

`server/main.py::_load_predictor` lazily imports `ml.predict.Predictor`, so the server
boots with no torch installed. That class must expose `predict(bytes) -> dict` (raw shape,
pre-envelope), `meta()`, `metrics()`, and `calibration()`.

**RTX 50-series (Blackwell, `sm_120`) needs the cu128 wheels.** A plain `pip install torch`
pulls cu124 and dies at runtime with "no kernel image is available for execution on the
device". See the comment block in `requirements.txt`.

Planned and deliberately scoped: distribution-over-age-bins head (soft labels, expected
value) rather than scalar regression, because the distribution gives a per-prediction
confidence that the review queue needs. No head A/B, no hyperparameter search, no second
backbone — cut for time on purpose.

## Frontend conventions

Design brief was *"professional interface, not AI slop."* It is built as a clinical
instrument panel, not a web app. If you touch the UI, hold these:

- **Light clinical paper**, not a dark console. Warm off-white ground (`--color-bg`),
  white panels separated by **hairline rules instead of cards and shadows**.
- **Banned outright:** pure black, any purple or violet, gradients, glow, glassmorphism.
  These are the tells that make an interface read as AI-generated. This is a hard rule.
- **One accent** (ochre, `--color-signal`). It means "a human must look at this." Never
  decorative. Outcome colors are data; if a color is not carrying meaning it comes off.
- Every numeric renders in IBM Plex Mono with tabular numerals so digits column-align.
  Labels and prose are Instrument Sans.
- Fonts are self-hosted via `@fontsource` and imported in `main.tsx`. **Do not switch to a
  CDN font link** — the demo machine runs offline and would fall back to serif in front of
  the panel.
- Design tokens live in `@theme` in `web/src/styles.css`. Add tokens there, don't inline hex.
- No router — three views, `useState` in `App.tsx`. No state library.
- `web/src/BandLadder.tsx` is the differentiating visual: it draws the prediction interval
  on the band scale and lights the crossed boundary, so it *shows* why a case routed to
  review. Keep it explanatory, don't decorate it.

## Demo-day constraints

These are not preferences; they are why the architecture looks like this.

- **One process, one port, one command.** FastAPI serves `web/dist` static, so there is no
  second server and no CORS surface at runtime.
- **Fully offline.** No cloud inference, no runtime asset fetch.
- **No live capture of panel members' faces.** Biometric inference on non-consenting people
  in a healthcare framing is an unforced error. Use the fixed, pre-vetted held-out sample
  set. `samples/` currently holds synthetic placeholders for UI verification only.
- Fallback order under time pressure: audit persistence → distribution head → review queue
  UI. Never cut: working demo, backup recording, honest metrics, scope-decision slide.

## Honest-limits policy

`README.md` states the gaps deliberately (image-only scope, no demographic fairness numbers
because the dataset carries no skin-tone labels, unverified dataset range, not-for-clinical-use).
Do not quietly drop these to make the project look stronger, and do not fabricate a
fairness dashboard the labels cannot support — naming the gap is the defensible position
and costs one slide.

## Other agent configs

A Codex config exists at `~/.codex/config.toml`. If you want its MCP servers, commands,
subagents, or skills available here, reply `/import` to scan and list what's importable,
then `/import --yes=<digest>` with the digest that scan prints. (If `/import` isn't
available on this surface, run `claude import` from a terminal.)
