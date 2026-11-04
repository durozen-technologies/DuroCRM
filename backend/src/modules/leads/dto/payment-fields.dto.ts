import { Transform } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from "class-validator";

const EmptyStringToUndefined = () =>
  Transform(({ value }) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  );

export class PaymentFieldsDto {
  @IsOptional()
  @IsIn(["Cash", "UPI", "Bank Transfer", "Card", "Cheque", "Other"])
  paymentMode?: string;

  @IsOptional() @IsDateString() paymentDate?: string;
  @IsOptional() @IsString() paymentPurpose?: string;
  @IsOptional() @IsString() paymentRemarks?: string;

  @IsOptional() @IsString() paymentSender?: string;
  @IsOptional() @IsString() paymentReceiver?: string;
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  @Length(1, 100)
  paymentTransactionId?: string;
  @IsOptional() @IsString() paymentBankName?: string;

  @IsOptional()
  @EmptyStringToUndefined()
  @IsIn(["Debit", "Credit"])
  paymentCardType?: string;

  @IsOptional() @IsString() paymentChequeNumber?: string;
  @IsOptional() @EmptyStringToUndefined() @IsDateString() paymentChequeDate?: string;
  @IsOptional() @EmptyStringToUndefined() @IsDateString() paymentDepositDate?: string;
  @IsOptional() @EmptyStringToUndefined() @IsDateString() paymentClearanceDate?: string;

  @IsOptional()
  @EmptyStringToUndefined()
  @IsIn(["Issued", "Deposited", "Cleared", "Bounced"])
  paymentInstrumentStatus?: string;

  @IsOptional() @IsString() paymentOtherMethod?: string;
}
