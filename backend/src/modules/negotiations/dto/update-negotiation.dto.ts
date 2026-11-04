import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from "class-validator";
import { PaymentFieldsDto } from "../../leads/dto/payment-fields.dto";

export class UpdateNegotiationDto extends PaymentFieldsDto {
  @IsOptional() @IsString() @Matches(/\S/) customerResponse?: string;
  @IsOptional() @IsIn(["Won", "Lost"]) nextAction?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() lostReason?: string;
  @IsOptional() @IsString() @Matches(/\S/) expectedTimeline?: string;
  @IsOptional()
  @IsIn(["Advance Payment", "Partial Payment", "Fully Paid", "Not Paid"])
  paymentStatus?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) advanceAmount?: number;
}