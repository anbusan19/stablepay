type KycStatus = "pending" | "verified" | "flagged";
type WorkerType = "employee" | "contractor" | "freelancer";

const KYC_STYLES: Record<KycStatus, string> = {
  pending:  "bg-amber-50  text-amber-700  border-amber-200",
  verified: "bg-emerald-50 text-emerald-700 border-emerald-200",
  flagged:  "bg-red-50    text-red-700    border-red-200",
};

const KYC_DOT: Record<KycStatus, string> = {
  pending:  "bg-amber-400",
  verified: "bg-emerald-500",
  flagged:  "bg-red-500",
};

export function KycBadge({ status }: { status: KycStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${KYC_STYLES[status]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${KYC_DOT[status]}`} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

const WORKER_TYPE_STYLES: Record<WorkerType, string> = {
  employee:   "bg-blue-50   text-blue-700   border-blue-200",
  contractor: "bg-purple-50 text-purple-700 border-purple-200",
  freelancer: "bg-teal-50   text-teal-700   border-teal-200",
};

export function WorkerTypeBadge({ type }: { type: WorkerType }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${WORKER_TYPE_STYLES[type]}`}
    >
      {type.charAt(0).toUpperCase() + type.slice(1)}
    </span>
  );
}
