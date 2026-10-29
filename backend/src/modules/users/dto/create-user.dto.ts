import {
  IsEmail,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";
import { USER_PERMISSIONS } from "../user-permissions";

export class CreateUserDto {
  @IsString()
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(10)
  password!: string;

  @IsUUID()
  customRoleId!: string;

  @IsOptional()
  @IsArray()
  @IsIn(USER_PERMISSIONS, { each: true })
  permissions?: string[];
}
