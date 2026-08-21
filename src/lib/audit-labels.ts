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
  "payment_link.created": "Razorpay payment link created",
  "payment_link.failed": "Razorpay payment link failed",
};

export function auditActionLabel(action: string) {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
