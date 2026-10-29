import { IsArray, IsIn } from "class-validator";
import { USER_PERMISSIONS } from "../user-permissions";

export class UpdateUserPermissionsDto {
  @IsArray()
  @IsIn(USER_PERMISSIONS, { each: true })
  permissions!: string[];
}
