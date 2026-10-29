import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { CallsMessagesService } from "./calls-messages.service";
import { CompleteCallMessageDto } from "./dto/complete-call-message.dto";
import { CompleteLeadCallDto } from "./dto/complete-lead-call.dto";
import { CreateCallMessageDto } from "./dto/create-call-message.dto";
import { RescheduleCallMessageDto } from "./dto/reschedule-call-message.dto";

@Controller("calls-messages")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions("activities")
export class CallsMessagesController {
  constructor(private readonly callsMessages: CallsMessagesService) {}

  @Get()
  list(
    @Query("status") status: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.callsMessages.list({ status, from, to }, user);
  }

  @Post()
  create(
    @Body() dto: CreateCallMessageDto,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.callsMessages.create(dto, user);
  }

  @Post("complete-lead")
  @Permissions("activities")
  completeLead(
    @Body() dto: CompleteLeadCallDto,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.callsMessages.completeLead(dto, user);
  }

  @Patch(":id/reschedule")
  reschedule(
    @Param("id") id: string,
    @Body() dto: RescheduleCallMessageDto,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.callsMessages.reschedule(id, dto.dueAt, user);
  }

  @Patch(":id/complete")
  complete(
    @Param("id") id: string,
    @Body() dto: CompleteCallMessageDto,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.callsMessages.complete(id, dto, user);
  }
}
