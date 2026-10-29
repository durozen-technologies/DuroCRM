import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";
import { USER_PERMISSIONS } from "../user-permissions";

export class UpdateTeamUserDto {
  @IsString()
  @MinLength(1)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsUUID()
  customRoleId?: string;

  @IsOptional()
  @IsArray()
  @IsIn(USER_PERMISSIONS, { each: true })
  permissions?: string[];
}
