import { Injectable } from "@nestjs/common";
import { LeadStage } from "@prisma/client";
import { Actor, assertActorPermission } from "../../common/authorization/actor-permission";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: Actor) {
    assertActorPermission(user, "customers");
    return this.prisma.lead.findMany({
      where: { stage: LeadStage.WON },
      include: { assignedBde: { select: { id: true, fullName: true } } },
      orderBy: { stageEnteredAt: "desc" },
    });
  }
}
