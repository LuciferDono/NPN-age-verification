# Presentation guide

Age Verification — Clinical Console. Eight speakers, one hour, live demo.

Every number here is taken from the repository. Nothing is rounded for effect and nothing
is invented. If you are unsure of a figure mid-answer, say "I'd have to check that" rather
than guessing — one hedged answer costs nothing, one wrong number costs the room's trust.

---

## Timing

| block | who | minutes |
|---|---|---|
| 1. Problem and framing | Lead | 4–5 |
| 2. The dataset | Data | 4–5 |
| 3. Architecture and DLDL | ML-1 | 4–5 |
| 4. Results | ML-1 (continues) | included above |
| 5. Training and trust | ML-2 | 4–5 |
| 6. The decision path | Backend-1 | 4–5 |
| 7. Audit and data handling | Backend-2 | 4–5 |
| 8. The console | Frontend | 4–5 |
| 9. Live demo | Demo driver | 12–14 |
| 10. Q&A | everyone | 10 |

Roughly 36 minutes of speaking, 14 for the demo, 10 for questions. If you overrun, the
demo is the thing that must not be cut — drop depth from your own section instead.

**Everyone answers at least one question in Q&A.** Panels check whether eight people built
this or one person did. If three of us can only say "I did the backend", that shows.

---

## 1. Problem and framing — Lead

**Open with the problem, not the solution.**

- Age verification today means documents, or a human judging by eye. Documents are not
  always available, forgeable, and intrusive to demand. Human judgement is inconsistent.
- In healthcare the consequences are concrete: clinical trial eligibility, consent
  thresholds, age-appropriate dosing. Get it wrong and you have a compliance failure or a
  patient harm, not a bad user experience.

**Then the sentence the whole project rests on:**

> An age estimate on its own is useless in a clinical setting. A number with no indication
> of how much to trust it cannot be acted on.

Give the concrete case: **if the true age is 17 and the model says 20, the average error is
3 years — which sounds small — but the eligibility decision has flipped.** That is the
problem we built for.

**What we built, in one line:** age estimate, then a clinical band, then a policy decision,
and when the model is not confident enough the case goes to a human instead of being
auto-decided. Every step is written to an audit trail.

**Say plainly what we did not build:** the brief mentions voice and other biometrics. The
reference dataset contains only images, so we scoped to images rather than claiming a
second modality we had no data for. That is a deliberate decision, not an omission.

**Hand off:** "Let me hand to [Data] for what we actually trained on."

---

## 2. The dataset — Data

- Kaggle `mariafrenti/age-prediction`. **233,200 face images, ages 1 to 100.** Split by the
  publisher: 185,632 for training, 47,568 held out for testing. Every image is 128×128 and
  already cropped to the face.
- We train on 167,064 of them, holding 10% of the training set back for validation. The
  47,568 test images are never touched during training. That is what makes the numbers you
  will hear later meaningful.

**The verification story — this is your strongest point:**

- Kaggle's description said ages 1 to 100. A public reimplementation of the same dataset
  used only ages 20 to 50. Both were correct: **the archive contains two separate trees**,
  one covering the full lifespan and one covering only adults. We use the full one.
- We did not take that on trust. Before writing any model code we counted every image per
  age, because claiming the model handles children and the elderly on an adults-only
  dataset would be indefensible. The counts are committed in `ml/dataset_census.json`.

**The distribution, and why it matters:**

| band | images | share |
|---|---|---|
| paediatric 0–17 | 8,119 | 4.4% |
| young adult 18–29 | 51,639 | 27.8% |
| adult 30–49 | 93,094 | 50.1% |
| older adult 50–64 | 23,602 | 12.7% |
| geriatric 65+ | 9,178 | 4.9% |

- Half the data is aged 30 to 49. The extremes are thin — and it gets worse further out:
  **all of ages 90 to 100 is 273 images. Age 98 has three.**
- This is why we report accuracy per band rather than as one average. A single figure would
  hide that the model is weakest exactly where the data is thinnest.

**If asked why we did not just collect more elderly images:** we searched. UTKFace, AgeDB,
FairFace, IMDB-WIKI. No public face dataset has meaningful volume above age 85, because
photographs of very old people are rare in the sources these datasets are scraped from.
It is a structural gap, not something we overlooked.

**Hand off:** "[ML-1] will take you through the model itself."

---

## 3 & 4. Architecture, DLDL, and results — ML-1

You have two things to land: what the model is, and how well it does.

### The architecture

- **EfficientNet-B0** as the backbone. 4.1 million parameters — small on purpose.
- **Pretrained on ImageNet**, then fine-tuned on faces. This is transfer learning: the
  model already knows edges, textures and shapes, so we only teach it the age-specific
  part. Training from scratch on 167,000 images would not have worked nearly as well.
- Trained at 224×224 for 12 epochs. Took about 50 minutes on a laptop GPU.

### DLDL — the key design choice

**Say what a normal model does first, so the contrast lands:**

- The obvious approach is to output one number: "this person is 34." We do not do that.
- Instead the model outputs a **probability across all 100 ages** — something like "most
  likely 34, quite possibly 31 or 37, almost certainly not 60."

**Why, in one sentence:** a single number cannot tell you how sure it is, and we needed that
to decide when to involve a human.

**Soft labels — explain it with the example:**

- Normally you train by telling the model "35 is right, every other age is wrong." That
  treats a prediction of 34 as being just as wrong as 70, which is absurd.
- So instead of a single correct answer we give it a **bell curve centred on 35**. Now the
  model is told 34 is nearly right, 36 is nearly right, and 70 is badly wrong.
- This is a published method called **DLDL, Deep Label Distribution Learning** (IJCAI 2018).
  We arrived at it from our own requirements and then found it in the literature — worth
  saying, because it means the choice is defensible rather than improvised.

**What the distribution gives us — three things from one forward pass:**

| we take | and get |
|---|---|
| the average of the distribution | the age estimate |
| its 10th and 90th percentiles | an 80% range |
| how narrow or spread out it is | a confidence score |

A model that outputs one number gives you only the first.

### Results

All on the 47,568 held-out images.

| metric | value | plain meaning |
|---|---|---|
| MAE | **5.64 years** | average error |
| Baseline | 11.34 years | error if you guessed the average age every time |
| CS@5 | 59.3% | within 5 years of the truth |
| Band accuracy | 66.8% | landed in the correct clinical band |

**Say the baseline out loud.** 5.64 against 11.34 means roughly twice as good as guessing.
Without the baseline, "5.64" means nothing to the room.

**IMPORTANT — you must state the range, not just the number.** The honest figure is
**5.64 to 6.57 years**, and here is why:

- The dataset is celebrity photographs, and the publisher split it per image rather than per
  person. **So the same people appear in both the training and test sets** — we checked
  visually, and Michael Caine is in both halves.
- When we exclude test images that closely resemble training images, MAE rises to 6.00, and
  to 6.57 under a stricter cut. So 5.64 is real but flattering.
- We found this ourselves and it is written up in the README.

Say it as: **"5.64 on the published split, and 5.64 to 6.57 once we account for the same
people appearing on both sides. We audited our own benchmark and this is what we found."**
That is a much stronger position than being asked how the split was made.

### Per band — do not skip this

| band | MAE | images |
|---|---|---|
| adult 30–49 | **4.80** | 23,301 |
| young adult 18–29 | 4.98 | 13,121 |
| paediatric 0–17 | 6.20 | 2,937 |
| older adult 50–64 | 7.60 | 5,933 |
| geriatric 65+ | **12.25** | 2,276 |
| of which 90+ | 15.95 | 77 |

**The line to say:** the model is two and a half times worse on elderly faces than on
adults. A single average would have hidden that completely. We report per band so the
weakness is visible rather than buried.

**Hand off:** "[ML-2] will cover how it learned, and whether these numbers can be trusted."

---

## 5. Training and trust — ML-2

**Your opening line, which covers the seam:**

> Those are the numbers. Let me show you how we got them, and then whether you should
> believe them.

### How it trained

- 12 epochs over 167,064 images. Each epoch is one full pass, so roughly 2 million image
  presentations in total.
- **The loss function follows directly from DLDL.** Because the model predicts a
  distribution and the target is a distribution, training means making one match the other.
  We compute cross-entropy against the soft label, which is equivalent to KL-divergence up
  to a constant.
- **Mixed precision** (half precision arithmetic) for speed. Roughly 650 images per second
  on the GPU, about 4.7 minutes per epoch.
- We save a checkpoint only when validation error improves, so the model we ship is the best
  epoch rather than the last one. Best was epoch 7.
- **If asked about problems:** the first run crashed at epoch 3 — Windows ran out of commit
  memory with 12 data loader workers. We dropped to 6, which cost no throughput because the
  loader was already ahead of the GPU, and added a resume flag so a crash costs minutes
  rather than the whole run.

### Why the numbers can be trusted — this is the important half

**Set up the problem first:** any team can show you a low error figure. The question a
clinician should ask is *when is it wrong, and does it know?*

**The pre-registered threshold — lead with this:**

- Before training started, we wrote a pass/fail bar into the code: low-confidence
  predictions must be at least 1.3 times worse than high-confidence ones, and error must
  fall consistently as confidence rises.
- **We wrote it first specifically so we could not adjust it afterwards to flatter
  ourselves.** There is a commit proving the ordering.
- It passed. Low-confidence predictions are **3.89 times worse**, and error falls at
  **every one of ten confidence steps** without exception.

Say the ten numbers if you have the slide: 10.12, 7.85, 6.76, 6.18, 5.47, 5.12, 4.60, 4.02,
3.66, 2.60. Least confident to most confident. Ten out of ten.

**Calibration — a different and stronger claim:**

- The above shows the model *ranks* its errors correctly. Calibration asks something
  harder: when it says 80% confident, is it right 80% of the time?
- Measured on all 47,568 images: at a nominal 80% range, the true age falls inside
  **79.1%** of the time. Worst deviation at any level is **2.4 percentage points**.
- **The line to say:** the uncertainty it reports is the uncertainty it actually has. So the
  range shown on screen means what it says.

**What deferring actually buys:**

- If we send the least confident 15% to a human, error on everything else drops from
  **5.64 to 4.99 years**, about 11.5% better.
- That is the review queue earning its place rather than being decoration.

**If asked whether this is a known technique:** yes — it is called selective prediction, and
the standard way to present it is the risk-coverage curve we show. We are not claiming to
have invented it. What we are claiming is that we pre-registered the bar and measured it
rather than asserting it.

### Honest limits — you own these

**Say them before anyone asks. Volunteering a weakness is strength; being caught by it is
not.**

1. **The headline MAE is optimistic.** Covered above — 5.64 to 6.57. Same people on both
   sides of the split. We cannot fix it: the dataset has no identity labels, so a correct
   per-person split cannot be reconstructed. We can only measure the effect, which we did.
2. **The model is measurably less accurate on Black faces.** Our own data has no ethnicity
   labels, so we tested on UTKFace, which does — 23,684 images, inference only. Comparing
   within age bands to control for the fact that groups differ in age composition:

   | age band | best | worst | gap |
   |---|---|---|---|
   | 0–17 | Asian 1.42 | **Black 5.29** | 3.88 yr |
   | 30–49 | Other 4.75 | **Black 6.71** | 1.96 yr |
   | 50–64 | Other 5.53 | **Black 8.60** | 3.07 yr |
   | 65+ | White 8.45 | **Black 12.01** | 3.56 yr |

   Black subjects carry the highest error in four of five bands. **The paediatric row is the
   serious one** — 3.7 times the error of the best group, in exactly the band containing the
   age-18 threshold.
3. **The system contains this, but does not fix it.** The confidence rule routes **15.7%**
   of Black subjects to a human, against 4.1% for the best-served group. So the cases the
   model handles worst are the ones it most often declines to decide alone — that is the
   queue working. **But say the other half too:** the same people are then subjected to more
   manual review, which is a worse experience even when the decision is better. Adding a
   human does not solve a fairness problem.
4. **Not for clinical use.** Research demonstration. Face-based age estimation carries real
   bias and consent problems and is not a substitute for a documented date of birth.

**Hand off:** "[Backend-1] will show you what happens to a prediction once we have it."

---

## 6. The decision path — Backend-1

You own the part that turns a number into a decision.

**The chain, in order:**

```
image -> age estimate + range -> clinical band -> policy decision
      -> route to a human if uncertain
      -> audit entry
```

**Age bands** — these live in exactly one file, `server/bands.py`, and nothing else in the
codebase is allowed to hardcode an age boundary. Paediatric under 18, young adult 18–29,
adult 30–49, older adult 50–64, geriatric 65+.

**Which bands we use was decided by measurement, not preference.** If the dataset had turned
out to be adults-only, claiming paediatric banding would have been indefensible, so the band
set is set from the dataset census.

**The routing rule — two triggers, and the second is the interesting one:**

1. **Low confidence** — bottom 15% of the validation confidence distribution.
2. **The range crosses a band boundary** — even when the model is confident.

Explain the second with the case from the demo: **the model reads 24 for someone who is
actually 17. Its range is 17.5 to 31.5, which crosses the age-18 line. So band assignment is
not decisive, and it goes to a human — regardless of how confident it was.**

**Why a percentile rather than a fixed confidence cutoff:** a raw threshold like "below 0.3"
means nothing without knowing how this model's confidence is distributed. A percentile is
defined relative to measured behaviour, so the rule holds whatever the calibration curve
looks like.

**The invariant worth stating out loud:**

> Review beats both verified and rejected. An uncertain prediction is never auto-actioned.

That is the entire point of the system, and it is enforced in code rather than being a
policy someone might forget.

**Every response has the same shape.** There are five possible outcomes — success, no face
detected, multiple faces, poor image quality, and service error — and all five return an
identical JSON structure. Failures are defined states with defined screens, not exceptions.
We froze that structure on day one so the frontend could be built against it while the model
was still training.

**Hand off:** "[Backend-2] on what we store, and what we deliberately do not."

---

## 7. Audit trail and data handling — Backend-2

You own the answer to the compliance question, and it is a strong answer.

**Lead with the claim:**

> The image is never stored. Not encrypted, not access-controlled — never written.

**How it works:** the image is hashed into a SHA-256 digest, a 64-character fingerprint, and
then discarded. The digest goes into the audit log; the pixels do not exist after the request
finishes.

**Explain the digest simply if asked:** it is a one-way fingerprint. The same image always
produces the same fingerprint, but you cannot reconstruct the image from it. So we can prove
two requests used the same photograph without keeping the photograph.

**Why this is more than a claim:** `server/store.py` has no function that accepts image
bytes — only a digest string. And one of our tests reads the database file as raw bytes after
a prediction and asserts the original image is not present in it. **It is enforced in code
and verified by a test, rather than promised in a document.**

**What the audit trail does record**, for every prediction and every human decision:

- the request ID
- the image fingerprint
- the age estimate, the band, and the decision
- which rule fired
- who reviewed it, if a human did, and what they decided
- the timestamp

**Why this matters for the domain:** if a decision is challenged six months later, you can
reconstruct exactly what the system saw, what it decided, on what basis, and who signed off
— without having retained anyone's photograph.

**The review queue:** flagged cases land in a queue. A reviewer accepts the estimate or
overrides it with their own figure, and that action is recorded against their ID. **Resolving
a case does not alter the original model output** — we keep both, so the audit trail shows
what the model said and what the human decided.

**If asked about regulation:** the EU AI Act's Article 14 requires that a human overseeing a
high-risk system can detect anomalies and unexpected performance, and specifically guards
against over-relying on the system's output. Our routing rule is exactly that, in code.

**Hand off:** "[Frontend] on how a clinician actually sees all this."

---

## 8. The console — Frontend

You own the surface everything else is judged through.

**Frame the design decision first:**

- This is built as a clinical instrument, not a web app. Reference points were a printed lab
  report and a hospital records terminal.
- Light background, hairline rules instead of cards and shadows, and **exactly one accent
  colour — amber — which means one thing: a human needs to look at this.** It is never
  decorative.
- Every number is set in a monospace font with aligned digits, the way figures line up on a
  printed chart. Reading a measurement wrong because the columns did not align is a real
  failure mode in a clinical setting.
- Built as one process on one port, fully offline. No cloud service, nothing fetched at
  runtime.

**Four screens:**

1. **Verify** — upload, and the assessment.
2. **Review queue** — cases the system declined to decide alone, each showing which rule
   routed it.
3. **Audit trail** — every event, with the fingerprint and no image.
4. **Model evidence** — the accuracy and calibration figures, in the product itself.

**The band ladder — this is the piece to spend your time on:**

- It draws the clinical band scale, lays the prediction range on top of it, and marks the
  estimate.
- **When the range crosses a band boundary, that boundary lights up amber.**
- So the screen does not merely announce that a case went to review — **it shows you why.**
  A clinician can see at a glance that it was the model's uncertainty, not its estimate, that
  made the case undecidable. A number alone cannot communicate that.

**On the evidence screen:** we put our own accuracy figures inside the product, including
the weak ones. The panel showing per-band error displays the geriatric row in red, and the
headline MAE carries the leakage caveat directly beneath it. **A number we know to be
flattering does not get displayed without its caveat.**

**One more detail worth mentioning:** when the service runs with the synthetic model rather
than the real one, a badge reads "SYNTHETIC MODEL — NOT FOR CLINICAL USE" and cannot be
dismissed. Demonstrating mock numbers as real would be the worst failure available to us, so
the interface makes it impossible to do by accident.

**Hand off:** "[Demo driver] will take you through it live."

---

## 9. Live demo — Demo driver

You drive. Nobody else touches the laptop.

**Before you start:** service running, real model loaded, browser at the right zoom, backup
recording open in another window and ready.

**The run, in order:**

| # | action | say |
|---|---|---|
| 1 | Upload `child_08.jpg` | True age 8. Model reads 9.3, paediatric band, and rejected for adult trial eligibility. Correct decision. |
| 2 | Upload `teen_17.jpg` | **True age 17. The model reads 24.2 — it is wrong.** But its range is 17.5 to 31.5, which crosses the age-18 boundary. Watch the ladder light that boundary. It routes to a human instead of deciding. |
| 3 | Pause here | This is the case that matters. The model got it wrong and the system refused to act on it. |
| 4 | Open the review queue | The case is waiting, with the rule that routed it named. |
| 5 | Adjudicate it | Enter a reviewer ID, override to 17, submit. |
| 6 | Open the audit trail | Every step recorded. Image fingerprint, no image. |
| 7 | Open model evidence | The accuracy figures, the calibration curve, per-band error with geriatric in red. |

**Hold on step 2 and 3 longer than feels comfortable.** That single case is the whole
argument. Everything before it earns the right to be believed; everything after it shows what
the system does about being wrong.

**If anything fails:** switch to the recording without apologising or narrating the failure.
Say "let me show you the recorded run" and continue. The panel will not care unless you make
it an event.

**Do not offer to run it on anyone's face.** If asked, decline plainly: biometric inference
on someone who has not consented, in a healthcare framing, is not something we will
demonstrate. That answer is a point in our favour, not an awkward moment.

---

## 10. Questions — everyone

**Answer in your own area. Do not answer over each other.** If a question spans two areas,
one person answers and names who will add to it.

**Likely questions and who takes them:**

| question | who | short answer |
|---|---|---|
| How accurate is it? | ML-1 | 5.64 years on the held-out split, honest range 5.64 to 6.57, against a baseline of 11.34. |
| How do you know it is not just memorising faces? | ML-2 | We checked, and to a degree it is — that is the leakage finding. Here is the measured effect. |
| What about bias? | ML-2 | Measured on UTKFace. Error is highest on Black faces in four of five age bands. Here are the numbers. |
| Is this HIPAA compliant? | Backend-2 | No image is stored. Only a fingerprint, enforced in code and verified by a test. |
| What happens when it is wrong on a real patient? | Backend-1 | It routes to a human before acting. You saw that in the demo. |
| Why not just ask for date of birth? | Lead | That is the brief's own premise — verification where documents are absent, forged, or intrusive to demand. |
| Why such a small model? | ML-1 | It runs offline on one machine. A larger backbone buys accuracy we are not being scored on. |
| Could this be deployed? | Lead | Not as it stands. It is a research demonstration, and the fairness gap alone would need resolving first. |
| Why only images? | Lead | The reference dataset contains only images. A second modality with no data behind it would be a claim, not a feature. |
| What would you do next? | ML-2 | Balanced training data for the fairness gap, an identity-aware split to resolve the leakage range, and conformal prediction for guaranteed coverage. |

**Three rules for Q&A:**

1. **Never invent a number.** "I would have to check" is a complete answer.
2. **Do not defend a weakness we already stated.** If someone raises the fairness gap,
   confirm it and give the figure. Arguing looks worse than the gap does.
3. **Do not oversell.** The strongest thing about this project is that its numbers are
   honest. Undercutting that to sound more impressive is the one unrecoverable mistake.

---

## The one thing everyone should be able to say

If you remember nothing else:

> The model is wrong sometimes. What matters is that it knows when, and stops.
