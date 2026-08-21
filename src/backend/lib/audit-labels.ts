// Maps machine-readable AuditLog.action strings to the plain-language
// labels the Audit Trail UI shows. Keeping this as a lookup (rather than
// formatting action strings on the fly) means the stored action string can
// stay stable and grep-able while the displayed wording can evolve freely.
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "opportunity.detected": "Opportunity detected",
  "opportunity.updated": "Opportunity re-evaluated",
  "opportunity.narrative_generated": "AI generated recommendation",
  "opportunity.narrative_failed": "AI explanation unavailable",
  "campaign.drafted": "Recovery campaign drafted — awaiting approval",
  "campaign.blocked": "Campaign draft blocked by policy",
  "campaign.approved": "Merchant approved",
  "campaign.rejected": "Merchant rejected",
  "campaign.modified": "Merchant modified and approved",
  "campaign.approval_blocked": "Approval blocked by policy",
  "campaign.modify_blocked": "Modification blocked by policy",
  "campaign.execution.started": "Execution started",
  "campaign.execution_blocked": "Execution blocked by policy",
  "campaign.execution.finished": "Execution finished",
  "campaign.execution.halted": "Execution halted — nothing charged",
  "payment_link.created": "Razorpay payment link created",
  "payment_link.found_existing": "Found an existing payment link before creating a new one",
  "payment_link.failed": "Razorpay payment link failed",
  "payment_link.reconciled": "Checked with Razorpay whether it went through",
  "payment_link.paid_webhook": "Customer paid — confirmed by Razorpay webhook",
  "webhook.signature_invalid": "Rejected a webhook with an invalid signature",
  "cross_sell.detected": "Cross-sell pair detected",
  "cross_sell.updated": "Cross-sell pair re-evaluated",
  "cross_sell.approved": "Merchant approved the cross-sell",
  "cross_sell.rejected": "Merchant rejected the cross-sell",
  "buyer.purchase_proposed": "AI shopper proposed a purchase",
  "buyer.purchase_authorized": "Customer authorized the purchase",
  "buyer.purchase_completed": "Purchase completed through Razorpay",
  "buyer.purchase_cancelled": "Customer cancelled the order",
  "buyer.payment_failed": "Buyer payment failed — nothing charged",
  "duplicate_prevention.campaign_targets_skipped": "Duplicate payment links prevented on retry",
  "duplicate_prevention.buyer_reauthorization_blocked": "Duplicate purchase authorization blocked",
};

export function auditActionLabel(action: string) {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
