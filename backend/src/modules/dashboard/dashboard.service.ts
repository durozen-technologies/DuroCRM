import { Injectable } from "@nestjs/common";
import { LeadStage, MeetingStatus, Prisma } from "@prisma/client";
import { Actor, assertActorPermission } from "../../common/authorization/actor-permission";
import { leadScope } from "../../common/authorization/lead-scope";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async pendingCounts(user: Actor) {
    assertActorPermission(user, "dashboard");
    const lead = leadScope(user);
    const [
      tasks,
      meetings,
      callsAndMessages,
      proposalFollowUps,
      proposalResponses,
      negotiationFollowUps,
      negotiationResponses,
    ] = await Promise.all([
      this.prisma.followUp.count({
        where: {
          status: "PENDING",
          type: { in: ["Proposal Follow-up", "Negotiation"] },
          lead,
        },
      }),
      this.prisma.meeting.count({
        where: { status: MeetingStatus.SCHEDULED, lead },
      }),
      this.prisma.callMessage.count({
        where: { status: "PENDING", lead },
      }),
      this.prisma.followUp.count({
        where: { status: "PENDING", type: "Proposal Follow-up", lead },
      }),
      this.prisma.followUp.count({
        where: {
          status: "COMPLETED",
          type: "Proposal Follow-up",
          lead,
          OR: [
            { proposal: { is: { responseSavedAt: null } } },
            {
              proposalId: null,
              lead: { proposals: { some: { responseSavedAt: null } } },
            },
          ],
        },
      }),
      this.prisma.followUp.count({
        where: { status: "PENDING", type: "Negotiation", lead },
      }),
      this.prisma.followUp.count({
        where: {
          status: "COMPLETED",
          type: "Negotiation",
          lead,
          OR: [
            { negotiation: { is: { responseSavedAt: null } } },
            {
              negotiationId: null,
              lead: { negotiations: { some: { responseSavedAt: null } } },
            },
          ],
        },
      }),
    ]);

    const proposals = proposalFollowUps + proposalResponses;
    const negotiations = negotiationFollowUps + negotiationResponses;
    return { tasks, meetings, callsAndMessages, proposals, negotiations };
  }

  async summary(user: Actor) {
    assertActorPermission(user, "dashboard");
    const scope = leadScope(user);
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrow = new Date(todayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const monthStart = new Date(
      todayStart.getFullYear(),
      todayStart.getMonth(),
      1,
    );

    const [
      grouped,
      stageAmounts,
      todaysFollowUpTasks,
      overdueFollowUpTasks,
      todaysCallsAndMessages,
      overdueCallsAndMessages,
      todaysScheduledMeetings,
      overdueScheduledMeetings,
      todaysMeetings,
      todayRevenue,
      weekRevenue,
      monthRevenue,
    ] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ["stage"],
        where: scope,
        _count: { _all: true },
        _sum: { estimatedBudget: true, finalDealValue: true },
      }),
      this.prisma.lead.findMany({
        where: {
          stage: { in: [LeadStage.PROPOSAL, LeadStage.NEGOTIATION] },
          ...scope,
        },
        select: {
          stage: true,
          estimatedBudget: true,
          proposals: {
            select: { finalAmount: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          negotiations: {
            select: {
              negotiatedAmount: true,
              originalProposalAmount: true,
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      }),
      this.prisma.followUp.count({
        where: {
          status: "PENDING",
          type: { not: "Meeting" },
          dueAt: { gte: todayStart, lt: tomorrow },
          lead: scope,
        },
      }),
      this.prisma.followUp.count({
        where: {
          status: "PENDING",
          type: { not: "Meeting" },
          dueAt: { lt: todayStart },
          lead: scope,
        },
      }),
      this.prisma.callMessage.count({
        where: {
          status: "PENDING",
          dueAt: { gte: todayStart, lt: tomorrow },
          lead: scope,
        },
      }),
      this.prisma.callMessage.count({
        where: {
          status: "PENDING",
          dueAt: { lt: todayStart },
          lead: scope,
        },
      }),
      this.prisma.meeting.count({
        where: {
          status: MeetingStatus.SCHEDULED,
          meetingAt: { gte: todayStart, lt: tomorrow },
          lead: scope,
        },
      }),
      this.prisma.meeting.count({
        where: {
          status: MeetingStatus.SCHEDULED,
          meetingAt: { lt: todayStart },
          lead: scope,
        },
      }),
      this.prisma.meeting.count({
        where: {
          meetingAt: { gte: todayStart, lt: tomorrow },
          status: { not: MeetingStatus.CANCELLED },
          lead: scope,
        },
      }),
      this.wonRevenue(todayStart, tomorrow, scope),
      this.wonRevenue(weekStart, tomorrow, scope),
      this.wonRevenue(monthStart, tomorrow, scope),
    ]);

    const byStage = new Map(grouped.map((row) => [row.stage, row]));
    const count = (stage: LeadStage) => byStage.get(stage)?._count._all ?? 0;
    const stageAmountTotals = new Map<LeadStage, Prisma.Decimal>();
    for (const lead of stageAmounts) {
      const latestProposalAmount = lead.proposals[0]?.finalAmount;
      const latestNegotiation = lead.negotiations[0];
      const amount =
        lead.stage === LeadStage.PROPOSAL
          ? latestProposalAmount ?? lead.estimatedBudget
          : latestNegotiation?.negotiatedAmount ??
            latestNegotiation?.originalProposalAmount ??
            latestProposalAmount ??
            lead.estimatedBudget;
      if (amount === null || amount === undefined) continue;

      const currentTotal =
        stageAmountTotals.get(lead.stage) ?? new Prisma.Decimal(0);
      stageAmountTotals.set(lead.stage, currentTotal.plus(amount));
    }
    const pipeline = grouped.map((row) => {
      const amount =
        row.stage === LeadStage.WON
          ? row._sum.finalDealValue ?? new Prisma.Decimal(0)
          : stageAmountTotals.get(row.stage) ??
            row._sum.estimatedBudget ??
            new Prisma.Decimal(0);
      return {
        stage: row.stage,
        count: row._count._all,
        value: String(amount),
        amount,
      };
    });
    const openPipelineValue = pipeline
      .filter(
        (row) =>
          row.stage !== LeadStage.WON && row.stage !== LeadStage.LOST,
      )
      .reduce(
        (total, row) => total.plus(row.amount),
        new Prisma.Decimal(0),
      );

    return {
      metrics: {
        newLeads: count(LeadStage.NEW_LEAD),
        contacted: count(LeadStage.CONTACTED),
        interested: count(LeadStage.INTERESTED),
        todaysMeetings,
        proposals: count(LeadStage.PROPOSAL),
        negotiations: count(LeadStage.NEGOTIATION),
        wonDeals: count(LeadStage.WON),
        lostDeals: count(LeadStage.LOST),
        todaysFollowUps:
          todaysFollowUpTasks +
          todaysCallsAndMessages +
          todaysScheduledMeetings,
        overdueFollowUps:
          overdueFollowUpTasks +
          overdueCallsAndMessages +
          overdueScheduledMeetings,
      },
      revenue: {
        today: String(todayRevenue),
        week: String(weekRevenue),
        month: String(monthRevenue),
        pipeline: String(openPipelineValue),
      },
      pipeline: pipeline.map(({ amount: _amount, ...row }) => row),
    };
  }

  private async wonRevenue(
    start: Date,
    end: Date,
    scope: Prisma.LeadWhereInput,
  ) {
    const result = await this.prisma.lead.aggregate({
      where: {
        stage: LeadStage.WON,
        stageEnteredAt: { gte: start, lt: end },
        ...scope,
      },
      _sum: { finalDealValue: true },
    });
    return result._sum.finalDealValue ?? 0;
  }
}
