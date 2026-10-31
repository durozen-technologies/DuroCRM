"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiClient, apiClientResponse } from "../../lib/api-client";
import { LEAD_UPDATED_EVENT } from "../../lib/lead-events";
import { notify } from "../../lib/notifications";
import { formatBusinessDateTime, formatEmbeddedDateTimes } from "../../lib/business-time";
import { proposalActivityDescriptionForDisplay } from "../../lib/proposal-activity";
import {
  emptyPaymentDetails,
  PaymentDetailsFields,
  localPaymentDateTimeValue,
  validatePaymentDetails,
  type PaymentDetails,
  type PaymentFieldErrors,
} from "../../components/shared/payment-details-fields";

type Activity = {
  id: string;
  type: string;
  description: string;
  outcome?: string | null;
  nextAction?: string | null;
  contactDate?: string | null;
  contactType?: string | null;
  customerResponse?: string | null;
  expectedTimeline?: string | null;
  requirement?: string | null;
  estimatedBudget?: string | number | null;
  paymentAmount?: string | number | null;
  paymentDate?: string | null;
  paymentStatus?: string | null;
  paymentTotal?: string | number | null;
  paymentBalance?: string | number | null;
  paymentMode?: string | null;
  paymentSender?: string | null;
  paymentReceiver?: string | null;
  paymentTransactionId?: string | null;
  paymentPurpose?: string | null;
  paymentRemarks?: string | null;
  paymentBankName?: string | null;
  paymentCardType?: string | null;
  paymentChequeNumber?: string | null;
  paymentChequeDate?: string | null;
  paymentDepositDate?: string | null;
  paymentClearanceDate?: string | null;
  paymentInstrumentStatus?: string | null;
  paymentOtherMethod?: string | null;
  remarks?: string | null;
  followUpAt?: string | null;
  createdAt: string;
  user?: { fullName: string } | null;
  meeting?: {
    meetingAt: string;
    type: string;
    requirement?: string | null;
    budget?: string | number | null;
    discussionNotes?: string | null;
    nextAction: string;
    followUpAt: string;
  } | null;
};
type LeadDetails = {
  id: string;
  leadNumber: string;
  leadDate: string;
  customerName: string;
  businessName?: string | null;
  mobileNumber: string;
  email?: string | null;
  location?: string | null;
  requirement?: string | null;
  estimatedBudget?: string | number | null;
  finalDealValue?: string | number | null;
  wonService?: string | null;
  paymentStatus?: string | null;
  advanceAmount?: string | number | null;
  paidAmount?: string | number | null;
  confirmedAt?: string | null;
  leadSource: string;
  priority: string;
  stage: string;
  lostReason?: string | null;
  nextAction?: string | null;
  followUpAt?: string | null;
  remarks?: string | null;
  stageEnteredAt: string;
  assignedBde: { fullName: string };
  activities: Activity[];
  proposals?: {
    proposalDate: string;
    serviceProduct: string;
    proposalAmount: string | number;
    discount: string | number;
    tax: string | number;
    finalAmount: string | number;
    customerResponse?: string | null;
    followUpAt?: string | null;
    remarks?: string | null;
    createdAt: string;
  }[];
  negotiations?: {
    expectedTimeline?: string | null;
    customerConcern?: string | null;
  }[];
};

const dateTime = formatBusinessDateTime;
const currency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
const leadDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
const proposalActivityDetails = (
  description: string,
  activity: Activity,
) => {
  const seenLabels = new Set<string>();
  return proposalActivityDescriptionForDisplay(
    description,
    activity.nextAction,
    activity.followUpAt,
  )
    .split(/\r?\n/)
    .map((line, index) => {
      const separator = line.indexOf(": ");
      return separator < 0
        ? index === 0
          ? { label: "Description", value: line }
          : null
        : {
            label: line.slice(0, separator),
            value: line.slice(separator + 2),
          };
    })
    .filter((detail): detail is { label: string; value: string } => {
      if (!detail?.value) return false;
      const normalizedLabel = detail.label.toLowerCase();
      if (
        (normalizedLabel === "next action" && activity.nextAction) ||
        (normalizedLabel === "follow-up" && activity.followUpAt) ||
        seenLabels.has(normalizedLabel)
      ) {
        return false;
      }
      seenLabels.add(normalizedLabel);
      return true;
    });
};
const proposalDetailsFromRecord = (
  proposal: NonNullable<LeadDetails["proposals"]>[number],
) => [
  { label: "Product / service", value: proposal.serviceProduct },
  { label: "Proposal date", value: leadDate(proposal.proposalDate) },
  {
    label: "Proposal amount",
    value: currency(Number(proposal.proposalAmount)),
  },
  { label: "Discount", value: currency(Number(proposal.discount)) },
  { label: "Tax", value: currency(Number(proposal.tax)) },
  { label: "Final amount", value: currency(Number(proposal.finalAmount)) },
  ...(proposal.customerResponse
    ? [{ label: "Customer response", value: proposal.customerResponse }]
    : []),
  ...(proposal.followUpAt
    ? [{ label: "Follow-up", value: dateTime(proposal.followUpAt) }]
    : []),
  ...(proposal.remarks
    ? [{ label: "Remarks", value: proposal.remarks }]
    : []),
];

export function LeadDetail({
  showActivityExport = false,
  backHref = "/leads",
  backLabel = "All leads",
}: {
  showActivityExport?: boolean;
  backHref?: string;
  backLabel?: string;
}) {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [lead, setLead] = useState<LeadDetails | null>(null);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(
    null,
  );
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDetails, setPaymentDetails] =
    useState<PaymentDetails>(emptyPaymentDetails);
  const [paymentFieldErrors, setPaymentFieldErrors] =
    useState<PaymentFieldErrors>({});
  const [paymentAmountError, setPaymentAmountError] = useState("");
  const [editingPayment, setEditingPayment] = useState<Activity | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [exportingActivities, setExportingActivities] = useState<
    "pdf" | "xlsx" | null
  >(null);
  const timelineActivities = lead?.activities ?? [];
  const transactions = timelineActivities
    .filter(
      (activity) =>
        activity.type === "PAYMENT_RECEIVED" &&
        activity.paymentAmount !== null &&
        activity.paymentAmount !== undefined,
    )
    .sort(
      (first, second) =>
        new Date(first.createdAt).getTime() -
          new Date(second.createdAt).getTime() ||
        first.id.localeCompare(second.id),
    );
  const finalDealValue =
    Math.round(Number(lead?.finalDealValue ?? 0) * 100) / 100;
  const paidAmount =
    Math.round(
      Number(
        lead?.paidAmount ??
          (lead?.paymentStatus === "Fully Paid"
            ? finalDealValue
            : lead?.advanceAmount ?? 0),
      ) * 100,
    ) / 100;
  const remainingBalance =
    Math.max(0, Math.round((finalDealValue - paidAmount) * 100) / 100);
  const paymentAmountLimit =
    remainingBalance + Number(editingPayment?.paymentAmount ?? 0);
  const paidBeforeEditedPayment =
    paidAmount - Number(editingPayment?.paymentAmount ?? 0);
  const paymentAmountNumber = Number(paymentAmount);
  const paymentPreviewStatus =
    paymentAmountNumber <= 0 || paymentAmountNumber > paymentAmountLimit
      ? ""
      : paidBeforeEditedPayment + paymentAmountNumber >= finalDealValue
        ? "Fully Paid"
        : paidBeforeEditedPayment === 0
          ? "Advance Payment"
          : "Partial Payment";

  const load = useCallback(async () => {
    try {
      setLead(await apiClient<LeadDetails>(`/leads/${id}`));
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to load this lead.",
        "error",
      );
    }
  }, [id]);

  useEffect(() => {
    if (id) void load();
  }, [id, load]);

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !Number.isFinite(paymentAmountNumber) ||
      paymentAmountNumber <= 0 ||
      paymentAmountNumber > paymentAmountLimit
    ) {
      const message = `Enter a payment amount greater than zero and no greater than ${currency(paymentAmountLimit)}.`;
      setPaymentAmountError(message);
      notify(
        message,
        "error",
      );
      return;
    }
    setPaymentAmountError("");
    const errors = validatePaymentDetails(paymentDetails);
    setPaymentFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      notify("Review the payment details highlighted in the form.", "error");
      return;
    }
    setSavingPayment(true);
    try {
      const { paymentDate, ...modeSpecificFields } = paymentDetails;
      const payload = {
        amount: paymentAmountNumber,
        ...modeSpecificFields,
        paymentDate: paymentDate
          ? new Date(paymentDate).toISOString()
          : undefined,
      };
      await apiClient(
        editingPayment
          ? `/leads/${id}/payments/${editingPayment.id}`
          : `/leads/${id}/payments`,
        {
          method: editingPayment ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      setPaymentAmount("");
      setPaymentDetails(emptyPaymentDetails);
      setPaymentFieldErrors({});
      setPaymentAmountError("");
      setEditingPayment(null);
      setShowPaymentForm(false);
      notify(
        editingPayment
          ? "Payment updated in the activity timeline."
          : "Payment logged to the activity timeline.",
      );
      await load();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to log payment.",
        "error",
      );
    } finally {
      setSavingPayment(false);
    }
  }

  function beginEditPayment(activity: Activity) {
    setEditingPayment(activity);
    setPaymentAmount(String(activity.paymentAmount ?? ""));
    setPaymentDetails({
      ...emptyPaymentDetails,
      paymentMode:
        (activity.paymentMode as PaymentDetails["paymentMode"]) ?? "",
      paymentDate: activity.paymentDate
        ? localPaymentDateTimeValue(new Date(activity.paymentDate))
        : "",
      paymentPurpose: activity.description ?? "",
      paymentRemarks: activity.remarks ?? "",
      paymentSender: activity.paymentSender ?? "",
      paymentReceiver: activity.paymentReceiver ?? "",
      paymentTransactionId: activity.paymentTransactionId ?? "",
      paymentBankName: activity.paymentBankName ?? "",
      paymentCardType:
        (activity.paymentCardType as PaymentDetails["paymentCardType"]) ?? "",
      paymentChequeNumber: activity.paymentChequeNumber ?? "",
      paymentChequeDate: activity.paymentChequeDate?.slice(0, 10) ?? "",
      paymentDepositDate: activity.paymentDepositDate?.slice(0, 10) ?? "",
      paymentClearanceDate: activity.paymentClearanceDate?.slice(0, 10) ?? "",
      paymentInstrumentStatus:
        (activity.paymentInstrumentStatus as PaymentDetails["paymentInstrumentStatus"]) ??
        "",
      paymentOtherMethod: activity.paymentOtherMethod ?? "",
    });
    setPaymentFieldErrors({});
    setPaymentAmountError("");
    setShowPaymentForm(true);
  }

  async function exportActivities(format: "pdf" | "xlsx") {
    if (!lead) return;
    setExportingActivities(format);
    try {
      const response = await apiClientResponse(
        `/exports/lead-activities/${encodeURIComponent(id)}?format=${format}`,
      );
      const file = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = file;
      anchor.download = `${lead.leadNumber}-activity.${format}`;
      anchor.click();
      URL.revokeObjectURL(file);
    } catch (reason) {
      notify(
        reason instanceof Error
          ? reason.message
          : "Unable to export lead activity.",
        "error",
      );
    } finally {
      setExportingActivities(null);
    }
  }

  useEffect(() => {
    const refreshLead = (event: Event) => {
      const { leadId } = (event as CustomEvent<{ leadId: string }>).detail;
      if (leadId === id) void load();
    };
    window.addEventListener(LEAD_UPDATED_EVENT, refreshLead);
    return () => window.removeEventListener(LEAD_UPDATED_EVENT, refreshLead);
  }, [id, load]);

  const stageAge = lead
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(lead.stageEnteredAt).getTime()) / 86400000,
        ),
      )
    : 0;
  if (!lead)
    return (
      <main className="lead-workspace">
        <Link className="detail-back" href={backHref}>
          ← {backLabel}
        </Link>
        <p>Loading lead...</p>
      </main>
    );

  return (
    <main className="lead-workspace">
      <Link className="detail-back" href={backHref}>
        ← {backLabel}
      </Link>
      <header className="detail-header">
        <div>
          <p className="eyebrow">{lead.leadNumber}</p>
          <h1>{lead.customerName}</h1>
          <p className="subtitle">
            {lead.businessName || "Prospective customer"}{" "}
            · {lead.mobileNumber}
          </p>
        </div>
        <div className="detail-header-actions">
          <button
            className="secondary-action"
            disabled={lead.stage !== "WON"}
            onClick={() => setShowTransactions(true)}
            type="button"
          >
            Transactions
          </button>
          <span className={`stage-pill stage-${lead.stage.toLowerCase()}`}>
            {lead.stage.replaceAll("_", " ")}
          </span>
        </div>
      </header>
      <div className="detail-grid">
        <section className="panel detail-main">
          <div className="detail-section-heading">
            <div>
              <h2>{lead.stage === "WON" ? "Deal summary" : "Next action"}</h2>
              <p>
                {lead.stage === "WON"
                  ? "Customer requirement and expected timeline."
                  : "Every active opportunity needs a dated next step."}
              </p>
            </div>
          </div>
          {lead.stage === "WON" ? (
            <dl className="next-action-box">
              <div>
                <dt>Customer requirement</dt>
                <dd>
                  {lead.requirement ||
                    lead.negotiations?.[0]?.customerConcern ||
                    "—"}
                </dd>
              </div>
              <div>
                <dt>Expected timeline</dt>
                <dd>{lead.negotiations?.[0]?.expectedTimeline || "—"}</dd>
              </div>
            </dl>
          ) : (
            <div className="next-action-box">
              <strong>{lead.nextAction || "No next action set"}</strong>
              <span>
                {lead.followUpAt
                  ? `Due ${dateTime(lead.followUpAt)}`
                  : "No follow-up scheduled"}
              </span>
            </div>
          )}
          <div className="detail-section-heading timeline-heading">
            <div className="timeline-heading-copy">
              <h2>Activity timeline</h2>
              <p>
                {lead.stage === "WON"
                  ? `Paid ${currency(paidAmount)} of ${currency(finalDealValue)}; balance ${currency(remainingBalance)}.`
                  : "Customer interactions and updates, newest first."}
              </p>
            </div>
            <div className="timeline-heading-actions">
              {showActivityExport && (
                <>
                  <button
                    className="secondary-action"
                    disabled={exportingActivities !== null}
                    onClick={() => void exportActivities("pdf")}
                    type="button"
                  >
                    {exportingActivities === "pdf"
                      ? "Exporting..."
                      : "Export PDF"}
                  </button>
                  <button
                    className="secondary-action"
                    disabled={exportingActivities !== null}
                    onClick={() => void exportActivities("xlsx")}
                    type="button"
                  >
                    {exportingActivities === "xlsx"
                      ? "Exporting..."
                      : "Export Excel"}
                  </button>
                </>
              )}
              {lead.stage === "WON" && remainingBalance > 0 && (
                <button
                  className="primary"
                  type="button"
                  onClick={() => {
                    setPaymentAmount("");
                    setEditingPayment(null);
                    setPaymentDetails(emptyPaymentDetails);
                    setPaymentFieldErrors({});
                    setShowPaymentForm(true);
                  }}
                >
                  Log payment
                </button>
              )}
            </div>
          </div>
          <div className="activity-timeline">
            {lead.stage === "LOST" && (
              <article className="timeline-item lost-outcome-item">
                <span className="timeline-marker lost-outcome-marker" />
                <div className="timeline-entry lost-outcome-entry">
                  <strong className="lost-outcome-title">Lead marked Lost</strong>
                  <div className="lost-outcome-reason">
                    <span>Lost reason</span>
                    <strong>{lead.lostReason || "Not recorded"}</strong>
                  </div>
                </div>
              </article>
            )}
            {timelineActivities.map((activity) => {
              const isMeetingCompletion = activity.type === "MEETING_COMPLETED";
              const isProposalSent = activity.type === "PROPOSAL_SENT";
              const proposalRecord = isProposalSent
                ? lead.proposals
                    ?.filter((proposal) =>
                      activity.description.includes(proposal.serviceProduct),
                    )
                    .sort(
                      (first, second) =>
                        Math.abs(
                          new Date(first.createdAt).getTime() -
                            new Date(activity.createdAt).getTime(),
                        ) -
                        Math.abs(
                          new Date(second.createdAt).getTime() -
                            new Date(activity.createdAt).getTime(),
                        ),
                    )[0]
                : undefined;
              const proposalDetails = isProposalSent
                ? proposalActivityDetails(activity.description, activity)
                : [];
              const hasProposalInputs =
                proposalDetails.some(
                  ({ label }) => label === "Proposal amount",
                );
              const displayedProposalDetails =
                proposalRecord && !hasProposalInputs
                  ? proposalDetailsFromRecord(proposalRecord).filter(
                      ({ label }) =>
                        label !== "Follow-up" || !activity.followUpAt,
                    )
                  : proposalDetails;
              const contactDate =
                activity.contactDate ??
                (isMeetingCompletion ? activity.meeting?.meetingAt : null);
              const contactType =
                activity.contactType ??
                (isMeetingCompletion ? activity.meeting?.type : null);
              const requirement =
                activity.requirement ??
                (isMeetingCompletion ? activity.meeting?.requirement : null);
              const budget =
                activity.estimatedBudget ??
                (isMeetingCompletion ? activity.meeting?.budget : null);
              const remarks =
                activity.remarks ??
                (isMeetingCompletion
                  ? activity.meeting?.discussionNotes
                  : null);
              const nextAction =
                activity.nextAction ??
                (isMeetingCompletion ? activity.meeting?.nextAction : null);
              const followUpAt =
                activity.followUpAt ??
                (isMeetingCompletion ? activity.meeting?.followUpAt : null);

              return (
                <article className="timeline-item" key={activity.id}>
                  <span className="timeline-marker" />
                  <div className="timeline-entry">
                  <button
                    aria-expanded={expandedActivityId === activity.id}
                    className="timeline-entry-toggle"
                    onClick={() =>
                      setExpandedActivityId((current) =>
                        current === activity.id ? null : activity.id,
                      )
                    }
                    type="button"
                  >
                    <span className="timeline-entry-head">
                      <strong>{activity.type.replaceAll("_", " ")}</strong>
                      <time>
                        {activity.type === "PAYMENT_RECEIVED" &&
                        activity.paymentDate
                          ? dateTime(activity.paymentDate)
                          : dateTime(activity.createdAt)}
                      </time>
                    </span>
                    {!isProposalSent && (
                      <span className="timeline-entry-description">
                        {formatEmbeddedDateTimes(activity.description)}
                      </span>
                    )}
                    <span className="timeline-entry-prompt">
                      {expandedActivityId === activity.id
                        ? "Hide details"
                        : "View details"}
                    </span>
                  </button>
                  {expandedActivityId === activity.id && (
                    <dl className="timeline-event-details">
                      {isProposalSent ? (
                        displayedProposalDetails.map(({ label, value }) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{formatEmbeddedDateTimes(value)}</dd>
                          </div>
                        ))
                      ) : (
                        <div>
                          <dt>Description</dt>
                          <dd>{formatEmbeddedDateTimes(activity.description)}</dd>
                        </div>
                      )}
                      {activity.outcome && (
                        <div>
                          <dt>Outcome</dt>
                          <dd>{activity.outcome}</dd>
                        </div>
                      )}
                      {!isProposalSent && contactDate && (
                        <div>
                          <dt>
                            {isMeetingCompletion
                              ? "Meeting date"
                              : isProposalSent
                                ? "Proposal date"
                                : "Contact date"}
                          </dt>
                          <dd>{leadDate(contactDate)}</dd>
                        </div>
                      )}
                      {!isProposalSent && contactType && (
                        <div>
                          <dt>
                            {isMeetingCompletion
                              ? "Meeting type"
                              : isProposalSent
                                ? "Activity type"
                                : "Contact type"}
                          </dt>
                          <dd>{contactType}</dd>
                        </div>
                      )}
                      {activity.customerResponse && (
                        <div>
                          <dt>Customer response</dt>
                          <dd>{activity.customerResponse}</dd>
                        </div>
                      )}
                      {requirement && (
                        <div>
                          <dt>Requirement</dt>
                          <dd>{requirement}</dd>
                        </div>
                      )}
                      {budget !== null && budget !== undefined && (
                        <div>
                          <dt>
                            {isMeetingCompletion
                              ? "Budget"
                              : "Estimated budget"}
                          </dt>
                          <dd>{currency(Number(budget))}</dd>
                        </div>
                      )}
                      {activity.paymentAmount !== null &&
                        activity.paymentAmount !== undefined && (
                          <>
                            {activity.paymentDate && (
                              <div>
                                <dt>Payment date</dt>
                                <dd>{dateTime(activity.paymentDate)}</dd>
                              </div>
                            )}
                            <div>
                              <dt>Payment received</dt>
                              <dd>
                                {currency(Number(activity.paymentAmount))}
                              </dd>
                            </div>
                            {activity.paymentStatus && (
                              <div>
                                <dt>Payment status</dt>
                                <dd>{activity.paymentStatus}</dd>
                              </div>
                            )}
                            {activity.paymentMode && (
                              <div>
                                <dt>Payment mode</dt>
                                <dd>{activity.paymentMode}</dd>
                              </div>
                            )}
                            {activity.paymentSender && (
                              <div>
                                <dt>Sender</dt>
                                <dd>{activity.paymentSender}</dd>
                              </div>
                            )}
                            {activity.paymentReceiver && (
                              <div>
                                <dt>Receiver</dt>
                                <dd>{activity.paymentReceiver}</dd>
                              </div>
                            )}
                            {activity.paymentTransactionId && (
                              <div>
                                <dt>Transaction / reference ID</dt>
                                <dd>{activity.paymentTransactionId}</dd>
                              </div>
                            )}
                            {activity.paymentBankName && (
                              <div>
                                <dt>Bank</dt>
                                <dd>{activity.paymentBankName}</dd>
                              </div>
                            )}
                            {activity.paymentCardType && (
                              <div>
                                <dt>Card type</dt>
                                <dd>{activity.paymentCardType}</dd>
                              </div>
                            )}
                            {activity.paymentChequeNumber && (
                              <div>
                                <dt>Cheque number</dt>
                                <dd>{activity.paymentChequeNumber}</dd>
                              </div>
                            )}
                            {activity.paymentChequeDate && (
                              <div>
                                <dt>Cheque date</dt>
                                <dd>{leadDate(activity.paymentChequeDate)}</dd>
                              </div>
                            )}
                            {activity.paymentDepositDate && (
                              <div>
                                <dt>Deposit date</dt>
                                <dd>{leadDate(activity.paymentDepositDate)}</dd>
                              </div>
                            )}
                            {activity.paymentClearanceDate && (
                              <div>
                                <dt>Clearance date</dt>
                                <dd>{leadDate(activity.paymentClearanceDate)}</dd>
                              </div>
                            )}
                            {activity.paymentInstrumentStatus && (
                              <div>
                                <dt>Cheque status</dt>
                                <dd>{activity.paymentInstrumentStatus}</dd>
                              </div>
                            )}
                            {activity.paymentOtherMethod && (
                              <div>
                                <dt>Payment method</dt>
                                <dd>{activity.paymentOtherMethod}</dd>
                              </div>
                            )}
                            {activity.remarks && (
                              <div>
                                <dt>Payment remarks</dt>
                                <dd>{activity.remarks}</dd>
                              </div>
                            )}
                            {activity.paymentTotal !== null &&
                              activity.paymentTotal !== undefined && (
                                <div>
                                  <dt>Total paid</dt>
                                  <dd>
                                    {currency(Number(activity.paymentTotal))}
                                  </dd>
                                </div>
                              )}
                            {activity.paymentBalance !== null &&
                              activity.paymentBalance !== undefined && (
                                <div>
                                  <dt>Remaining balance</dt>
                                  <dd>
                                    {currency(Number(activity.paymentBalance))}
                                  </dd>
                                </div>
                              )}
                          </>
                        )}
                      {activity.expectedTimeline && (
                        <div>
                          <dt>Expected timeline</dt>
                          <dd>{activity.expectedTimeline}</dd>
                        </div>
                      )}
                      {remarks && (
                        <div>
                          <dt>Remarks</dt>
                          <dd>{remarks}</dd>
                        </div>
                      )}
                      {nextAction && (
                        <div>
                          <dt>Next action</dt>
                          <dd>{nextAction}</dd>
                        </div>
                      )}
                      {followUpAt && (
                        <div>
                          <dt>Follow-up</dt>
                          <dd>{dateTime(followUpAt)}</dd>
                        </div>
                      )}
                      <div>
                        <dt>Recorded by</dt>
                        <dd>
                          {activity.user?.fullName || lead.assignedBde.fullName}
                        </dd>
                      </div>
                    </dl>
                  )}
                  </div>
                </article>
              );
            })}
            {timelineActivities.length === 0 && (
              <p className="empty-list">No activity has been recorded yet.</p>
            )}
          </div>
        </section>
        <aside className="detail-aside">
          <section className="panel detail-facts">
            <h2>Lead details</h2>
            <dl>
              <div>
                <dt>Lead date</dt>
                <dd>{leadDate(lead.leadDate)}</dd>
              </div>
              <div>
                <dt>Assigned user</dt>
                <dd>{lead.assignedBde.fullName}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>
                  <span
                    className={`priority priority-${lead.priority.toLowerCase()}`}
                  >
                    {lead.priority}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Lead source</dt>
                <dd>{lead.leadSource}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{lead.location || "—"}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{lead.email || "—"}</dd>
              </div>
              <div>
                <dt>Requirement</dt>
                <dd>{lead.requirement || "—"}</dd>
              </div>
              <div>
                <dt>Remarks</dt>
                <dd>{lead.remarks || "—"}</dd>
              </div>
              <div>
                <dt>Estimated budget</dt>
                <dd>
                  {lead.estimatedBudget
                    ? currency(Number(lead.estimatedBudget))
                    : "—"}
                </dd>
              </div>
              {lead.stage === "WON" && (
                <>
                  <div>
                    <dt>Service / project</dt>
                    <dd>{lead.wonService || "—"}</dd>
                  </div>
                  <div>
                    <dt>Final deal value</dt>
                    <dd>
                      {lead.finalDealValue
                        ? currency(Number(lead.finalDealValue))
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Payment status</dt>
                    <dd>{lead.paymentStatus || "—"}</dd>
                  </div>
                  <div>
                    <dt>Advance amount</dt>
                    <dd>
                      {lead.advanceAmount == null
                        ? "—"
                        : currency(Number(lead.advanceAmount))}
                    </dd>
                  </div>
                  <div>
                    <dt>Confirmed date</dt>
                    <dd>
                      {lead.confirmedAt ? dateTime(lead.confirmedAt) : "—"}
                    </dd>
                  </div>
                </>
              )}
              <div>
                <dt>Days in stage</dt>
                <dd>
                  {stageAge} {stageAge === 1 ? "day" : "days"}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
      {showTransactions && lead.stage === "WON" && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowTransactions(false);
            }
          }}
        >
          <section
            className="lead-modal transaction-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lead-transactions-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{lead.leadNumber}</p>
                <h2 id="lead-transactions-title">Transactions</h2>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label="Close transactions"
                onClick={() => setShowTransactions(false)}
              >
                ×
              </button>
            </div>
            <dl className="payment-balance-summary transaction-summary">
              <div>
                <dt>Payments</dt>
                <dd>{transactions.length}</dd>
              </div>
              <div>
                <dt>Total received</dt>
                <dd>{currency(paidAmount)}</dd>
              </div>
              <div>
                <dt>Remaining balance</dt>
                <dd>{currency(remainingBalance)}</dd>
              </div>
            </dl>
            <div className="transaction-list-wrap">
              {transactions.map((transaction) => {
                const recordedAt = transaction.createdAt;
                return (
                  <article className="transaction-record" key={transaction.id}>
                    <header className="transaction-record-header">
                      <div className="transaction-record-meta">
                        <div className="transaction-record-tags">
                          <span className="transaction-mode">
                            {transaction.paymentMode || "Payment"}
                          </span>
                          <span
                            className={`transaction-status-pill${transaction.paymentStatus === "Fully Paid" ? " is-complete" : ""}`}
                          >
                            {transaction.paymentStatus || "Status unavailable"}
                          </span>
                        </div>
                        <time dateTime={recordedAt}>
                          Logged {dateTime(recordedAt)}
                        </time>
                      </div>
                      <div className="transaction-record-amount">
                        <span>Amount received</span>
                        <strong>
                          {currency(Number(transaction.paymentAmount))}
                        </strong>
                      </div>
                    </header>
                    <dl className="transaction-details">
                      <div>
                        <dt>Sender</dt>
                        <dd>{transaction.paymentSender || "—"}</dd>
                      </div>
                      <div>
                        <dt>Receiver</dt>
                        <dd>{transaction.paymentReceiver || "—"}</dd>
                      </div>
                      <div>
                        <dt>Transaction ID</dt>
                        <dd>{transaction.paymentTransactionId || "—"}</dd>
                      </div>
                      <div>
                        <dt>Purpose</dt>
                        <dd>{transaction.description || "—"}</dd>
                      </div>
                      {transaction.paymentBankName && (
                        <div>
                          <dt>Bank</dt>
                          <dd>{transaction.paymentBankName}</dd>
                        </div>
                      )}
                      {transaction.paymentCardType && (
                        <div>
                          <dt>Card type</dt>
                          <dd>{transaction.paymentCardType}</dd>
                        </div>
                      )}
                      {transaction.paymentChequeNumber && (
                        <div>
                          <dt>Cheque number</dt>
                          <dd>{transaction.paymentChequeNumber}</dd>
                        </div>
                      )}
                      {transaction.paymentInstrumentStatus && (
                        <div>
                          <dt>Instrument status</dt>
                          <dd>{transaction.paymentInstrumentStatus}</dd>
                        </div>
                      )}
                      <div>
                        <dt>Total paid</dt>
                        <dd>
                          {transaction.paymentTotal == null
                            ? "—"
                            : currency(Number(transaction.paymentTotal))}
                        </dd>
                      </div>
                      <div>
                        <dt>Balance after payment</dt>
                        <dd>
                          {transaction.paymentBalance == null
                            ? "—"
                            : currency(Number(transaction.paymentBalance))}
                        </dd>
                      </div>
                      <div>
                        <dt>Recorded by</dt>
                        <dd>{transaction.user?.fullName || "—"}</dd>
                      </div>
                    </dl>
                    <footer className="transaction-record-footer">
                      <span>Payment entry</span>
                      <button
                        className="lead-edit"
                        type="button"
                        onClick={() => beginEditPayment(transaction)}
                      >
                        Edit payment
                      </button>
                    </footer>
                  </article>
                );
              })}
              {transactions.length === 0 && (
                <p className="empty-list">No payment transactions recorded yet.</p>
              )}
            </div>
          </section>
        </div>
      )}
      {showPaymentForm && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowPaymentForm(false);
          }}
        >
          <section
            className="lead-modal payment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="log-payment-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">WON DEAL PAYMENT</p>
                <h2 id="log-payment-title">
                  {editingPayment ? "Edit payment" : "Log payment"}
                </h2>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label="Close"
                onClick={() => setShowPaymentForm(false)}
              >
                ×
              </button>
            </div>
            <form
              className="lead-form payment-form"
              noValidate
              onSubmit={recordPayment}
            >
              <dl className="form-wide payment-balance-summary">
                <div>
                  <dt>Final deal value</dt>
                  <dd>{currency(finalDealValue)}</dd>
                </div>
                <div>
                  <dt>Already paid</dt>
                  <dd>{currency(paidAmount)}</dd>
                </div>
                <div>
                  <dt>{editingPayment ? "Maximum payment amount" : "Remaining balance"}</dt>
                  <dd>{currency(editingPayment ? paymentAmountLimit : remainingBalance)}</dd>
                </div>
              </dl>
              <label className="form-wide">
                Payment received
                <span className="payment-input">
                  <span>₹</span>
                  <input
                    autoFocus
                    required
                    min="0.01"
                    max={paymentAmountLimit}
                    step="0.01"
                    type="number"
                    value={paymentAmount}
                    aria-invalid={Boolean(paymentAmountError)}
                    onChange={(event) => {
                      setPaymentAmount(event.target.value);
                      setPaymentAmountError("");
                    }}
                    placeholder="Enter amount"
                  />
                </span>
                {paymentAmountError && (
                  <small className="payment-field-error" role="alert">
                    {paymentAmountError}
                  </small>
                )}
              </label>
              <div className="form-wide payment-details-grid">
                <PaymentDetailsFields
                  details={paymentDetails}
                  onChange={setPaymentDetails}
                  errors={paymentFieldErrors}
                />
              </div>
              <div className="form-wide payment-status-preview">
                <span>Payment status after this entry</span>
                <strong
                  className={
                    paymentPreviewStatus === "Fully Paid" ? "is-fully-paid" : ""
                  }
                >
                  {paymentPreviewStatus ||
                    "Enter an amount within the remaining balance"}
                </strong>
              </div>
              <div className="form-footer">
                <p>
                  Payment status and balance are calculated from the final deal
                  value. Proof is stored as a secure URL reference.
                </p>
                <div>
                  <button
                    className="secondary-action"
                    disabled={savingPayment}
                    type="button"
                    onClick={() => setShowPaymentForm(false)}
                  >
                    Cancel
                  </button>
                  <button className="primary" disabled={savingPayment}>
                    {savingPayment ? "Saving..." : "Save payment"}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
