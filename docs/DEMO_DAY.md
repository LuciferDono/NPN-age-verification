# Demo day card

One page. Print it or keep it open. Everything else is in `PRESENTATION_GUIDE.pdf`.

---

## Start the system

Two commands, from the project root. Nothing else is needed and nothing reaches the network.

```
cd web && npm run build && cd ..
NPN_MOCK=0 .venv/Scripts/python.exe -m uvicorn server.main:app --port 8000
```

Open **http://127.0.0.1:8000**

Wait for the first prediction to be slow — the model loads on first request, about 15
seconds. **Do one throwaway prediction before the panel walks in** so the load is already
paid for.

## Check before you present

| check | expected |
|---|---|
| Rail, bottom left | MAE 5.64, Baseline 11.34 |
| Header | NO amber "SYNTHETIC MODEL" badge |
| Header | NO red "RESEARCH DEMO" banner |
| Model evidence tab | charts render, geriatric row in red |

If the synthetic badge is showing, you started without `NPN_MOCK=0`. Stop and restart.

## The run

| # | do | say |
|---|---|---|
| 1 | Upload `samples/child_08.jpg` | True age 8. Reads 9.3, paediatric, rejected for adult trial eligibility. Correct call. |
| 2 | Upload `samples/teen_17.jpg` | **True age 17. It reads 24.2 — wrong.** But the range is 17.5 to 31.5 and crosses the age-18 line. Watch the ladder light that boundary. |
| 3 | **Pause** | This is the case that matters. The model was wrong and the system refused to act. |
| 4 | Review queue | One case waiting, with the rule that routed it. |
| 5 | Enter a reviewer ID, override to 17, submit | A human decides. The original model output is kept, not overwritten. |
| 6 | Audit trail | Every step. Image fingerprint, never the image. |
| 7 | Model evidence | Accuracy, calibration, per-band error with geriatric in red. |

Hold on steps 2 and 3 longer than feels comfortable.

**Do not use `adult_34.jpg` or `senior_72.jpg`.** One is sunglasses in a car, the other is
mislabelled in the source dataset. Both make the model look worse than it is for reasons
that have nothing to do with the model.

## If it breaks

Switch to `docs/demo/demo-manual.mp4`. Say **"let me show you the recorded run"** and carry
on. Do not narrate the failure, do not apologise. The panel only notices if you make it an
event.

## If asked to try it on someone's face

Decline. Say: **"we won't run biometric inference on someone who hasn't consented,
especially in a healthcare framing."** That answer is a point in your favour.

## Numbers, if you blank

| | |
|---|---|
| MAE | 5.64 yr — honest range **5.64 to 6.57** |
| Baseline | 11.34 yr (guessing the average age) |
| Within 5 years | 59.3% |
| Correct band | 66.8% |
| Test set | 47,568 held-out images |
| Best band | adult 4.80 |
| Worst band | geriatric 12.25, and 90+ is 15.95 on 77 images |
| Confidence works | low-confidence predictions are 3.89x worse, monotonic across all 10 deciles |
| Interval honesty | an 80% range contains the truth 79.1% of the time |
| Deferring 15% | error drops 5.64 to 4.99 |
| Fairness | error highest on Black faces in 4 of 5 age bands; worst gap 3.88 yr in 0-17 |
| Routing | 15.7% of Black subjects go to review, against 4.1% for the best-served group |

**Never invent a number.** "I'd have to check" is a complete answer.

## The one sentence

> The model is wrong sometimes. What matters is that it knows when, and stops.
