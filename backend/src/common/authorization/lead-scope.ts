import { Prisma } from "@prisma/client";
import { Actor } from "./actor-permission";

export function leadScope(_actor: Actor): Prisma.LeadWhereInput {
  return {};
}
