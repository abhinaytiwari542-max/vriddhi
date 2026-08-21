# Failure-Handling Demo

A walkthrough of what happens when a payment-link execution fails partway
through a campaign — one of the two demo moments (alongside the approval
gate) most worth showing in an interview, since it's where "the AI can
suggest but can't spend" becomes "the system doesn't silently corrupt
state when something breaks."

## What's being demonstrated

`executeApprovedCampaign()` (`src/backend/lib/services/campaign-execution.ts`)
processes `CampaignTarget`s one at a time, in order, and **stops at the
first failure** rather than continuing past it or rolling back what
already succeeded. Before concluding a failure means nothing happened, it
reconciles directly with the gateway (`findPaymentLinkByReference`) — a
timeout doesn't prove the request never landed. A retry is not a special
code path; it's the same function called again, and it structurally can't
touch a target that already reached `LINK_CREATED`/`PAID` (checked in
code, and backed by a DB-level `@@unique(campaignId, customerId)`
constraint as an independent second line of defense — see
`tests/db-constraints.test.ts`).

## Reproducing it live

1. `npm run dev`, visit `/opportunities`, click "Draft recovery campaign"
   on the abandoned-checkout card.
2. On `/campaigns`, click Approve.
3. Check the "Simulate a mid-campaign failure (demo of failure handling)"
   box, then click "Execute campaign."
4. The campaign halts partway through with the literal "ACTION FAILED"
   screen: the reason, a safety checklist (no duplicate transaction / no
   additional charge / action recorded in the audit trail), and a
   "Retry remaining N" button.
5. Click Retry (without the failure checkbox this time) — only the
   untouched targets are processed; everything already `LINK_CREATED`
   stays exactly as it was.

## What was actually measured, not just claimed (Phase 14)

A real 22-target campaign was executed with a failure injected at index
11. Result: 11 links created, 1 target marked `FAILED`, 10 left `PENDING`,
a real `Failure` row written, and a `payment_link.reconciled` audit entry
recording `{foundOnGateway: false}` — confirming the halt only happened
after checking with the gateway, not on the timeout alone.

After clicking Retry, only the remaining 10 targets were processed. The
verification didn't stop at "it returned ok: true" — the 11 pre-halt
`razorpayPaymentLinkId` values were diffed byte-for-byte against their
post-retry values and were **identical**, and the final campaign held
exactly 22 unique payment links, not 23. That diff (not just a status
check) is the actual evidence that retry has zero side effect on
already-completed work.

## Automated coverage of the same guarantee

`tests/campaign-execution.test.ts` reproduces this mechanically on every
test run: injects a failure at a chosen index, asserts the exact
created/failed/pending split, retries, and diffs every pre-halt
`razorpayPaymentLinkId` against its post-retry value — the same
byte-for-byte check described above, now enforced continuously rather
than a one-time manual observation. See `docs/PHASE-21-TESTING.md`.

## The buyer-side mirror of this same idea

`completeBuyerPurchase()` (`src/backend/lib/services/buyer-checkout.ts`)
applies the identical philosophy to the reversed-direction agent: a
simulated payment failure leaves the Order in `CREATED` status with
**zero** Payment rows (not even a `FAILED`-status one) — the customer can
retry the exact same order, and the retry-then-success path was verified
to write exactly one Payment row, no duplicate from the earlier failed
attempt (Phase 18/19, and `tests/buyer-checkout.test.ts`).
