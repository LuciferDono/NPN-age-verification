# Age Verification — Clinical Console

**Register:** product. Design serves the task; the tool should disappear into the work.

## What it is

A clinical console for age verification from a facial image. A clinician uploads a photo
and gets an age estimate, a clinical band, a policy decision, and — when the model is not
confident enough to be trusted alone — a case routed to a human reviewer instead of an
auto-decision.

The model is the small half. The product is the decision path around it:

```
image → age estimate + interval → clinical band → policy decision
      → route to human review when uncertain
      → audit trail (SHA-256 digest only, image never stored)
```

## Who uses it, where

A clinician or verification officer at a workstation, indoors, under bright hospital
lighting, working through a queue of cases. They are in a task, not browsing. They need to
read numbers accurately and decide quickly, and they will be held responsible for the
decision — so the interface has to show its reasoning, not just its answer.

That scene forces a light theme: a dark console under bright clinical lighting fights the
room, and this sits alongside printed lab reports and records terminals, not developer
tools.

## What it must communicate

1. **The estimate**, with its uncertainty attached. Never a bare number.
2. **Why this case was decided the way it was** — the rule that fired, in plain words.
3. **When the system declined to decide alone**, and what a human should look at.
4. **That the numbers on screen are earned** — measured on held-out data, not asserted.

## Non-negotiables

- **Review beats verified and rejected.** An uncertain prediction must never be
  auto-actioned. This is the entire point of the product.
- **No image is ever stored.** Only a SHA-256 digest reaches the database, and a test
  asserts the raw bytes are absent from the file.
- **Honest limits are shown, not buried.** Per-band accuracy is on screen because a single
  headline number would hide that the geriatric band is 2.5× worse than the adult band.
- **A synthetic-model badge appears whenever mock mode is on.** Demoing mock numbers as
  real is the worst available failure.

## Constraints

- Runs fully offline on one machine: one process, one port, one command. No cloud
  inference, no runtime asset fetch, no CDN fonts.
- Three views, no router, no state library. The surface is small on purpose.
- Every numeric is a measurement and must be readable as one: monospace, tabular figures,
  aligned in columns.
