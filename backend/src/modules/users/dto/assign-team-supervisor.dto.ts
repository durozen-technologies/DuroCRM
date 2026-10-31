import { IsOptional, IsUUID } from "class-validator";

export class AssignTeamSupervisorDto {
  @IsOptional()
  @IsUUID()
  supervisorId?: string | null;
}
