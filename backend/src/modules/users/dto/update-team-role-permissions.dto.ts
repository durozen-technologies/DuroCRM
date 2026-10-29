import { ArrayUnique, IsArray, IsIn } from "class-validator";
import { TEAM_ROLE_PERMISSIONS } from "../team-role-permissions";

export class UpdateTeamRolePermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsIn(TEAM_ROLE_PERMISSIONS, { each: true })
  permissions!: string[];
}
