# Experiment Plan — Abandoned-Checkout Recovery Campaign

**Status: Proposed. Not run.** This is a design exercise showing how the
recovery-rate assumption baked into the opportunity engine (15–25%, see
`src/backend/lib/services/opportunity-engine.ts`) would actually be
validated against real merchants and real customers — something this
project's test-mode/simulated environment cannot do (see
`docs/AI-EVAL-REPORT.md` and the Analytics page's own "Not yet measured"
labels for why).

## 1. Question

Does sending a targeted, AI-identified, human-approved discount payment
link to a high-intent abandoned-checkout customer recover more revenue
than doing nothing — and is the assumed 15–25% recovery rate anywhere
close to reality?

## 2. Hypothesis

H1: High-intent customers (prior purchaser, abandoned within 48h,
above-median cart value — the same scoring already implemented in
`opportunity-engine.ts`) who receive a ₹100 discount payment link within
1 hour of detection complete a purchase at a meaningfully higher rate
than a matched group who receive nothing.

Null hypothesis: the discount/timing has no effect distinguishable from
merchants' organic recovery rate (customers who return and complete
checkout on their own regardless).

## 3. Design

**Type:** Randomized controlled trial, individual-level randomization
within each merchant (not merchant-level — too few merchants for that to
have power; see §5).

- **Unit of randomization:** the customer's abandoned-checkout instance
  (the same `Opportunity.evidence` row this app already produces).
- **Treatment:** send the recovery discount link (what this app already
  does end-to-end once wired to a real gateway).
- **Control:** no action — the customer is tracked but not contacted.
- **Assignment:** simple randomization, stratified by merchant and by
  the existing intent score (0–3) so treatment/control are balanced on
  the one variable most likely to confound the result.

## 4. Primary and secondary metrics

- **Primary:** conversion rate — treatment group vs. control group,
  measured as "abandoned order reaches PAID status within 7 days."
- **Secondary:** time-to-conversion (does the discount just pull forward
  a purchase that would've happened anyway?), average order value at
  conversion (does the discount cannibalize margin without net revenue
  gain?), and unsubscribe/opt-out rate for the contacted group.
- **Guardrail metric:** support-ticket rate — a discount campaign that
  generates complaints (e.g., customers who already bought elsewhere)
  should stop the experiment regardless of the primary metric.

## 5. Sample size and power

Assuming a baseline organic recovery rate of ~5% (a typical unassisted
cart-abandonment recovery benchmark) and wanting to detect a lift to the
assumed 15% floor of this app's own estimate (a 10-point absolute lift),
at 80% power and α=0.05 two-sided: roughly **340 abandoned checkouts per
arm** (~680 total), using a standard two-proportion z-test sample-size
formula. Given this project's own seed data produces ~40 abandoned
checkouts per synthetic month for one merchant, a real trial would need
either a longer window or multiple participating merchants to reach that
n within a reasonable time — worth stating plainly rather than pretending
one merchant's data would be enough.

## 6. Duration and stopping rule

Run until the pre-registered sample size is reached, with one interim
look at 50% of target n using an O'Brien-Fleming-style spending function
to avoid inflating false-positive risk from peeking. No practical
significance threshold below a 3-point absolute lift, even if
statistically significant — a real discount campaign has a real cost
(the `discountAmount` this app already tracks per target), so "barely
significant" isn't automatically "worth running."

## 7. What would change based on the result

- **Lift ≥ assumed 15% floor, guardrail clean:** the opportunity engine's
  assumption is validated; keep the current 15–25% range, consider
  narrowing it with the observed confidence interval.
- **Lift positive but below 15%:** update `ASSUMED_RECOVERY_RATE_LOW`/`_HIGH`
  in `opportunity-engine.ts` to the observed range rather than leaving a
  benchmark-based guess in production.
- **No detectable lift:** the discount mechanism itself may not be the
  right lever (timing, channel, or discount size might matter more than
  whether a link exists at all) — worth a follow-up experiment on those
  dimensions before concluding the whole opportunity-detection approach
  doesn't work.

## 8. Threats to validity, stated up front

- **Novelty effect:** a merchant's first-ever recovery campaign might
  outperform steady-state usage; a single trial can't distinguish this
  from a durable effect.
- **Selection into the trial:** merchants who opt into testing an AI
  recovery feature may differ systematically from the broader merchant
  base (more digitally engaged, higher AOV) — limits generalizability of
  results beyond similar merchants.
- **Interference between arms:** if treatment and control customers can
  see the same site/ads, a treated customer's purchase could be observed
  by a control customer, contaminating the control group's behavior.
  Individual-level randomization makes this a real (if likely small)
  risk worth monitoring, not individual-vs-cluster-proof by design.
