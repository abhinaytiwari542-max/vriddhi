# Phase 26 — Real webhook + reconciliation

Closes the gap `docs/AI-EVAL-REPORT.md` and the Analytics page (Phase 20)
both flagged: Incremental GMV and Recovery Rate needed a customer to
actually pay a recovery link, and nothing in this test-mode environment
had ever simulated that. This phase builds the real receiving end of
that event, not a shortcut around it.

## What's real here

- **`/api/webhooks/razorpay`** verifies the HMAC-SHA256 signature Razorpay
  sends in `X-Razorpay-Signature`, using their own official SDK utility
  (`Razorpay.validateWebhookSignature`) — genuinely exercised, unlike the
  real payment gateway client, because signature verification is pure
  cryptography over a shared secret and doesn't need a live Razorpay
  account to test.
- **`reconcilePaymentLinkPaid()`** marks the `CampaignTarget` PAID, marks
  the underlying abandoned `Order` PAID (the actual recovery), and writes
  a `Payment` row — idempotent by construction (an already-PAID target
  short-circuits before touching anything, and `Payment.razorpayPaymentId`
  is `@unique` at the DB layer as a second line of defense, since Razorpay
  explicitly redelivers webhooks on any non-2xx response).
- **Analytics (`getAnalyticsSnapshot`)** now computes Incremental GMV,
  Recovery Rate, and ROI for real once at least one target has been paid
  — and still honestly reports `measured: false` before that, rather than
  showing a zero that could be mistaken for "measured, and it's zero."

## What's simulated, and why that's still honest

No real customer will ever pay a real Razorpay payment link in this
environment (simulated gateway, no live account — see Phase 12). A
**"Simulate customer payment" button** (Campaigns page, per
`LINK_CREATED` row) constructs a real Razorpay-shaped `payment_link.paid`
payload, signs it with the real webhook secret, and runs it through
**the exact same `processRazorpayWebhook()` function** the live HTTP
route calls — only the origination (a button click instead of Razorpay's
servers) is simulated, the same pattern already used for the payment
gateway itself. Signature verification is not bypassed or mocked for
this path.

## Verified live, not just unit-tested

Ran the full pipeline end to end in the browser: drafted a real
23-target campaign, approved it, executed it (all 23 simulated payment
links created — the Phase 25 check-before-create hardening now runs on
every one of them too), then clicked "Simulate customer payment" on one
target. Confirmed in Postgres directly: the target flipped to `PAID`, its
linked abandoned `Order` flipped to `PAID`, a `Payment` row was created
with the payment id from the signed payload, and a
`payment_link.paid_webhook` audit log entry was written. The Analytics
page immediately showed real numbers: Incremental GMV ₹2,345, Recovery
rate 4.3% (1 of 23 paid), ROI 102.0% — computed from that one real,
webhook-confirmed payment, not asserted.

## Automated coverage

`tests/webhook-reconciliation.test.ts` (7 tests): reconciliation marks
the target/order/payment correctly; a redelivered webhook for an
already-PAID target is a no-op (no duplicate `Payment`); an unknown
reference returns `not_found` without throwing; an invalid signature is
rejected and reconciles nothing (proven with a genuinely wrong
signature, not a mocked check); a tampered body is rejected even though
a signature existed for the original body; a correctly-signed payload is
independently re-verified (the test recomputes the HMAC itself rather
than trusting the helper that produced it) and reconciles end to end
through the same function the real route calls; a non-`payment_link.paid`
event is acknowledged but ignored.

All test data reset to a clean state after the live run (the one paid
order reverted to `CREATED`, its payment/audit rows removed) — the demo
dataset stays canonical for the next viewer.
