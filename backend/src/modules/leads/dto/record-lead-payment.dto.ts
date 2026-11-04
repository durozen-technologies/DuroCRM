import { IsNumber, Min } from "class-validator";
import { PaymentFieldsDto } from "./payment-fields.dto";

export class RecordLeadPaymentDto extends PaymentFieldsDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;
}
