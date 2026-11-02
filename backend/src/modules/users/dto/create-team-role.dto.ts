import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";
import { USER_PERMISSIONS } from "../user-permissions";

export class CreateTeamRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @IsArray()
  @ArrayUnique()
  @IsIn(USER_PERMISSIONS, { each: true })
  permissions!: string[];

  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  subordinateRoleIds!: string[];
}
