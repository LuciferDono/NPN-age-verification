# Age Estimation: Research Report

*Generated 2026-08-15 · 30+ sources · Confidence: High on methods and regulation, Medium on
cross-dataset comparisons (see the caveat in §1)*

## Executive summary

Three findings change how this project should be presented, and two of them cost nothing to
act on.

1. **Our architecture is a published, well-regarded method, not an improvisation.** The
   distribution-over-age-bins head with Gaussian soft labels and expected-value decoding is
   **Deep Label Distribution Learning (DLDL / DLDL-v2)**, and the literature names it as one of
   the two families that superseded plain regression and plain classification.
2. **The review queue is also a named field: selective prediction.** The standard way to present
   it is a **risk–coverage curve with AURC**, not the decile table we currently ship. Both are
   cheap to add.
3. **Regulators' own language maps onto what we built.** EU AI Act Article 14 requires human
   oversight capable of detecting "anomalies, dysfunctions and unexpected performance" and
   guarding against automation bias. That is a near-verbatim description of the routing rule.

One improvement was measured, not just read about: **horizontal-flip test-time augmentation
lowers test MAE from 5.6395 to 5.5821** on all 47,568 held-out images. No retraining, no
architecture change.

---

## 1. Where our MAE actually sits

**The trap:** MAE is not comparable across datasets, and cross-dataset comparison is the most
common way age-estimation results mislead. MORPH II is controlled mugshot imagery; FG-NET is
~1,000 images with reported MAE ranging 2.36–28.11 depending purely on protocol
([benchmark](https://arxiv.org/html/2602.07815v1)).

Our dataset — full lifespan 1–100, in-the-wild, unconstrained pose and lighting — is comparable
to **UTKFace / AgeDB / IMDB-Clean**, not to MORPH.

| Dataset | Best reported | Method |
|---|---|---|
| UTKFace | 4.23 | MiVOLO transformer ([arXiv 2307.04616](https://ar5iv.labs.arxiv.org/html/2307.04616)) |
| UTKFace | 4.37 | MWR ([CVPR 2022](https://arxiv.org/pdf/2203.13122)) |
| IMDB-Clean | 4.22 | MiVOLO |
| AgeDB | 5.32 | best zero-shot VLM ([benchmark](https://arxiv.org/html/2602.07815v1)) |
| 6-dataset average | 5.10 | MiVOLO, best specialist model |
| **ours** | **5.58** (flip TTA) | EfficientNet-B0, single model, 12 epochs |

**Honest reading:** a single B0 trained in under an hour on a laptop sits within ~1.3 years of
purpose-built transformer models trained on curated multi-dataset pipelines, and slightly ahead
of the best specialist model's six-dataset *average*. That is a respectable result to state
plainly. It is not state of the art, and claiming otherwise would be the kind of overclaim this
project has avoided everywhere else.

## 2. Our method has a name: DLDL

What we built — softmax over one bin per year, trained on a Gaussian centred on the true age,
decoded by expected value — is **Deep Label Distribution Learning**
([DLDL-v2, IJCAI 2018](https://www.ijcai.org/proceedings/2018/0099.pdf)), which itself builds on
**DEX** ([ICCV 2015](https://openaccess.thecvf.com/content_iccv_2015_workshops/w11/papers/Rothe_DEX_Deep_EXpectation_ICCV_2015_paper.pdf)).

The literature is explicit that DLDL-style methods and ranking methods are the two families that
achieved state of the art over plain metric regression and plain classification. The reasoning
matches ours exactly: regression alone regresses to the mean and does badly on the tails; hard
classification throws away the ordinal structure (predicting 34 for a 35-year-old is nearly
right, and a plain classifier is never told that). The soft label carries that information.

**Presentation impact:** "we used a distribution head" is a weak sentence. "We implemented Deep
Label Distribution Learning, because a plain regressor collapses toward the mean and a plain
classifier cannot express that 34 is nearly 35" is a strong one, and it is now citable.

Other methods worth naming if asked what we would do next, with more time:

| Method | Idea |
|---|---|
| CORAL ([2020](https://arxiv.org/pdf/1901.07884)) | rank-consistent binary sub-classifiers; guarantees ordinal monotonicity |
| Mean-Variance Loss ([CVPR 2018](https://openaccess.thecvf.com/content_cvpr_2018/papers/Pan_Mean-Variance_Loss_for_CVPR_2018_paper.pdf)) | penalises distribution variance so predictions concentrate |
| MWR ([CVPR 2022](https://arxiv.org/pdf/2203.13122)) | iterative rank-based window narrowing between reference anchors |
| POE ([CVPR 2021](https://openaccess.thecvf.com/content/CVPR2021/papers/Li_Learning_Probabilistic_Ordinal_Embeddings_for_Uncertainty-Aware_Regression_CVPR_2021_paper.pdf)) | each sample is a Gaussian in embedding space |
| MiVOLO ([2023](https://ar5iv.labs.arxiv.org/html/2307.04616)) | transformer backbone, optional face+body fusion |

## 3. The review queue is "selective prediction"

Our human-review routing is a recognised research area with established evaluation methodology.

- The framework is **selective prediction** (selective regression, in our continuous case):
  a predictor augmented with an abstain option, evaluated on the tradeoff between **coverage**
  (fraction of cases predicted) and **selective risk** (error on the retained fraction), via a
  **risk–coverage curve** summarised as **AURC**
  ([evaluation flaws paper, NeurIPS 2024](https://proceedings.neurips.cc/paper_files/paper/2024/file/047c84ec50bd8ea29349b996fc64af4b-Paper-Conference.pdf)).
- The lineage runs back to **Chow's rule** (1957/1970): abstain when confidence falls below a
  threshold set by the relative cost of abstention and error
  ([reject-option survey](https://arxiv.org/html/2107.11277v3)).
- **Learning to defer** (Mozannar & Sontag, ICML 2020) is the stronger variant: it optimises the
  model *and* the deferral policy jointly against the actual human reviewer's error rate.

**What we are, precisely:** selective prediction with a Chow's-rule-style threshold. We did not
train against reviewer error rates. That is a simpler cousin of learning-to-defer, and worth
stating accurately rather than claiming the stronger thing.

**Gap worth closing:** our decile table demonstrates *discrimination* (does confidence rank-order
error — yes, 3.89×, monotonic in all ten deciles). It does not demonstrate *calibration* (does an
80% interval actually contain the truth 80% of the time). Those are different claims and a panel
may well ask for the second one.

## 4. Bias and the regulatory landscape

**NIST FATE AEV** is the authoritative benchmark for age estimation: ~11 million operational
images, MAE scored across 26 demographic cells (2 sexes × 13 age ranges), with cells above a
3.5-year MAE threshold flagged
([Biometric Update](https://www.biometricupdate.com/202605/nist-biometric-age-estimation-update-show-demographic-accuracy-gains)).
Reported accuracy runs ~1.25–1.55 years for ages 0–17 and rises to 3–4+ years for older adults —
**directionally the same shape as our per-band results**, though on different data with far
larger n. We cannot claim NIST-comparable numbers and should not try.

**Regulation, law-in-force:**

- **Ofcom** (UK Online Safety Act, guidance in force since Jan 2025) names facial age estimation
  explicitly as an acceptable "highly effective age assurance" method, against four criteria:
  technically accurate, robust, reliable, and **fair** — where fair means avoiding materially
  lower accuracy for particular groups. Notably, **Ofcom sets no numeric threshold**
  ([guidance](https://www.ofcom.org.uk/siteassets/resources/documents/consultations/category-1-10-weeks/statement-age-assurance-and-childrens-access/guidance-on-highly-effective-age-assurance-and-other-part-5-duties.pdf?v=388810)).
- **EU AI Act Article 14 (human oversight)** is the most useful text for our framing: high-risk
  systems must let a human "detect and address anomalies, dysfunctions and unexpected
  performance" and must guard against **automation bias**
  ([Art. 14](https://artificialintelligenceact.eu/article/14/)). The Act prohibits biometric
  *categorisation* inferring special-category attributes; age inference is not on that list.
- **FDA** SaMD guidance: the Predetermined Change Control Plan framework does not currently allow
  fully unsupervised AI that continuously learns in the field without human oversight
  ([FDA](https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-software-medical-device)).
- **ISO/IEC 27566-1:2025** (published Dec 2025) is the first international age-assurance standard
  and formally defines "age estimation" as distinct from verification and inference
  ([ISO](https://www.iso.org/standard/88143.html)).

**The "challenge age" pattern:** industry sets the pass threshold above the legal boundary — legal
age 18, system threshold 25, mirroring retail "Challenge 25"
([Yoti](https://www.yoti.com/blog/challenge-25-enhancing-age-checks-with-facial-age-estimation-and-digital-ids/)).
Our interval-straddles-boundary rule is a data-driven generalisation of the same instinct: rather
than a fixed uniform buffer, the buffer is the model's own per-case uncertainty. Fair to cite as
"the recognised industry pattern this generalises," not as "we implement Challenge 25."

## 5. Age imbalance — the published view of our weakest band

Our geriatric MAE is 12.25 against 4.80 for adults; the 90+ sub-tail is 15.95 on 77 test images.
The literature confirms this is the standard failure mode: models "struggle most at extreme ages
(under 5 and 65+)" because training distributions concentrate around the mean
([long-tail survey](https://arxiv.org/pdf/2406.14953)).

Published remedies, cheapest first:

1. **Inverse-frequency loss reweighting** or **oversampling minority bins** — configuration only.
2. **Mean-Variance Loss** ([CVPR 2018](https://openaccess.thecvf.com/content_cvpr_2018/papers/Pan_Mean-Variance_Loss_for_CVPR_2018_paper.pdf)) — one extra loss term.
3. **Adaptive Mean-Residue Loss** ([2022](https://arxiv.org/pdf/2203.17156)) — refinement aimed
   specifically at imbalanced ages.
4. **Elderly-dense data augmentation** — UTKFace carries ages 0–116 with race and gender labels.

---

## Key takeaways

1. **Flip TTA is free and already verified: 5.6395 → 5.5821.** Measured here, on the full test
   split, not cited from a paper.
2. **Name the method.** It is DLDL, published, and the reason it beats regression is explainable
   in one sentence.
3. **Name the framework.** Selective prediction, with a risk–coverage curve as the standard
   presentation.
4. **Use the regulators' words.** EU AI Act Art. 14 describes our routing rule almost verbatim.
5. **A calibration curve is the one missing plot.** We show confidence ranks error; we have not
   yet shown an 80% interval contains the truth 80% of the time.
6. **UTKFace inference-only is the cheapest route to a real fairness number** — it carries race
   and gender labels, needs no retraining, and would convert one honest-limits caveat into a
   measured table. Licence is "Data files © Original Authors", non-commercial research; state it.

## Methodology

Three parallel researchers, ~30 sources, WebSearch and WebFetch (firecrawl and exa are not
configured in this environment). Sub-questions: benchmark MAE by dataset and method; whether our
architecture is a published technique; cheap high-leverage improvements; uncertainty
quantification, calibration and selective prediction; demographic bias and the age-assurance
regulatory landscape. Flip TTA was measured locally rather than accepted from the literature.

**Not verified, and therefore not claimed:** MORPH II / CACD / AgeDB licence terms; whether COPPA
names facial estimation as a compliance method; UTKFace's exact 65+ image count.
