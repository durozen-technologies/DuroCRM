import { Prisma } from "@prisma/client";
import { Actor } from "./actor-permission";

export function teamScope(actor: Actor): Prisma.UserWhereInput {
  if (actor.isCliAdmin) return {};
  return {
    OR: [actor.sub, ...(actor.subordinateUserIds ?? [])].map((id) => ({ id })),
  };
}
