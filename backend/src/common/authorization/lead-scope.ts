import { Prisma } from "@prisma/client";
import { Actor } from "./actor-permission";

export function leadScope(actor: Actor): Prisma.LeadWhereInput {
  if (actor.isCliAdmin) return {};
  return {
    OR: [actor.sub, ...(actor.subordinateUserIds ?? [])].map(
      (userId) => ({ assignedBdeId: userId }),
    ),
  };
}
