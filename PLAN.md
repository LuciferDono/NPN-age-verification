# Age Prediction — Cognizant NPN Hackathon Plan

**Domain:** Healthcare · **Team:** 8 · **Slot:** 1 hour, panel present, working demo required
**Dataset:** https://www.kaggle.com/datasets/mariafrenti/age-prediction (facial images)

---

## GATE 0 — verify before lane 2 starts

Dataset age range is **unconfirmed**. Kaggle description says 1–100; a public repo
(`SenorBunBun/age_from_image`) trained on a 20–50 subset. Kaggle pages are JS-rendered
and could not be read.

Run first, before any framing is locked:

```python
# after download+unzip
from pathlib import Path
from collections import Counter
root = Path("data")                      # adjust to actual extract path
print([p.name for p in root.iterdir()])  # folder layout
c = Counter(p.parent.name for p in root.rglob("*.jpg"))
print(sorted(c.items(), key=lambda kv: kv[0]))   # per-age counts
print("total:", sum(c.values()))
```

Branch on the answer:

| Distribution | Clinical framing to use |
|---|---|
| ~20–50 only | Adult-only: clinical-trial eligibility screening, telehealth identity confirmation, consent/insurance age verification. **Do not claim pediatric or geriatric dosage.** |
| 1–100, sparse tails | Full lifespan banding allowed, but MAE is non-uniform per band — the low-confidence review queue becomes load-bearing, not decorative. Report per-band MAE. |

---

## Scope decisions (state these in the deck, don't let them be discovered)

- **Image-only.** Statement lists images/text/voice. No voice or text corpus in hand →
  a second modality is a lane that ships nothing by demo day. Scoped out deliberately.
- **No demographic fairness dashboard.** This dataset carries no skin-tone or ethnicity
  labels. Fabricating that plot is the fastest way to lose the panel. Instead: slice
  residuals by age band (label exists), and name the demographic-bias gap on one slide
  with how you'd close it (external balanced eval set, e.g. FairFace).
- **No training from scratch.** Transfer learning on a pretrained backbone.

---

## What makes this score: the clinical wrapper

A Kaggle notebook that prints MAE is not a demo. The product is the decision path:

```
image → face crop → backbone → age estimate + confidence
      → age band → clinical decision (eligibility / verification outcome)
      → if confidence low: route to manual review queue
      → append to audit log (input hash, prediction, band, reviewer, timestamp)
```

Audit log + review queue are what make this healthcare-plausible rather than a toy —
and they are why lanes 4–7 have real work. The split is designed, not padded.

---

## Stack (boring on purpose)

| Layer | Choice |
|---|---|
Face crop | OpenCV Haar or mediapipe — no new dep beyond one
Backbone | `timm` EfficientNet-B0 or ResNet50, ImageNet pretrained
Head | see below — test both
Serving | FastAPI, one `/predict` + `/review` + `/audit`
UI | Streamlit calling the API
Env | local only, no cloud. Pinned `requirements.txt`.

`# ponytail: Streamlit-only, no FastAPI, if time runs short — costs the audit/review endpoints`

### Head: run both, keep the winner

1. **Scalar regression** — one output, L1/Huber loss. Baseline.
2. **Distribution over age bins** — softmax over bins, soft labels, take expected value.
   Same training loop, different head+loss. Gives a free per-prediction confidence
   (distribution entropy / variance), which is exactly what the review queue needs.

If (2) doesn't beat (1) on MAE, ship (1) and derive confidence from TTA variance instead.

### Metrics to report

- **MAE** (headline)
- **CS@5** — % predictions within 5 years
- **Band accuracy** — correct clinical band, the metric that actually matters downstream
- **Per-age-band residuals** — shows where the model is weak, honestly
- Baseline to beat: predict the train-set mean age. State its MAE. Panels respect a baseline.

---

## 8 lanes

| # | Role | Deliverable | Pairs with |
|---|---|---|---|
1 | Lead / presenter | narrative, Q&A, clock | —
2 | Data | download, face-crop pipeline, splits, **Gate 0 counts**, EDA plots | 3
3 | Model | both heads, training loop, metrics table | 2
4 | Backend | FastAPI `/predict` `/review` `/audit`, model load, SQLite log | 5
5 | Frontend | Streamlit: upload → age, band, confidence, decision, review flag | 4
6 | Integration / demo runner | drives the laptop, owns the happy path end-to-end | 8
7 | Deck + docs | slides, architecture diagram, README, scope-decision slide | 1
8 | QA / fallback | breaks it first, **owns the pre-recorded backup video** | 6

Nobody codes two lanes. Split the train/val early so 3 can't leak test data.

---

## Demo rules (biometric use case — these are not optional)

- **Do not demo on panel members' faces.** Live capture of non-consenting people in a
  healthcare framing hands the panel their first hostile question for free.
- Use a **fixed, pre-vetted held-out sample set**. Seeded. Same result every run.
- **Pre-record the full demo as video.** Wi-Fi, laptop, or API will fail. Lane 8 owns this.
- Fully offline. No cloud inference, no live model download.
- Every one of the 8 answers one Q&A question — panels check whether one person built it.

---

## 1-hour budget

| Min | Segment |
|---|---|
5 | Problem + healthcare stakes (don't re-read the statement, they wrote it) |
5 | Approach + architecture, one diagram |
**25** | **Live demo** |
10 | Results vs dataset: MAE, CS@5, band accuracy, baseline, limits |
15 | Q&A buffer (they overrun here) |

---

## Cut order under time pressure

Drop from the bottom up:

1. Audit log persistence (keep the UI element, mock the store)
2. Distribution head (ship scalar regression)
3. FastAPI layer (collapse into Streamlit)
4. Review queue (keep the confidence display, drop the queue)

Never cut: working demo, backup video, honest metrics table, scope-decision slide.

---

## Expect these questions

- "How do you know it isn't just reading image quality / era of photo?" → held-out split, per-band residuals
- "What's your error on darker skin tones?" → the named-gap slide. Don't bluff.
- "What happens when it's wrong on a real patient?" → review queue + audit log, human in the loop
- "Is this HIPAA-compliant?" → no PHI stored, image hashed not retained, on-prem inference, consent at capture
- "Why not just ask for date of birth?" → the statement's own premise: verification where documents are absent, forged, or intrusive to demand
- "What's your baseline?" → mean-age predictor MAE

---

## Open

- **Demo date** — sets how many of lanes 4–7 are attempted.
- Gate 0 result — blocks lane 2 kickoff, nothing else.
