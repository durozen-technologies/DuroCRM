import {
  Body,
  Controller,
  Delete,
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
import { LeadsService } from "./leads.service";
import { CreateLeadDto, LeadStage } from "./dto/create-lead.dto";
import { CreateActivityDto } from "./dto/create-activity.dto";
import { AssignLeadDto } from "./dto/assign-lead.dto";
import { RecordLeadPaymentDto } from "./dto/record-lead-payment.dto";
import { UpdateLeadDto } from "./dto/update-lead.dto";

@Controller("leads")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get("assignees")
  @Permissions("leads_assign")
  assignees(
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.leads.assignees(user);
  }
  @Get()
  @Permissions(
    "leads_view",
    "leads_edit",
    "leads_assign",
    "pipeline",
  )
  list(
    @Query("stage") stage: LeadStage | undefined,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.leads.list(stage, user);
  }
  @Get(":id")
  @Permissions(
    "leads_view",
    "leads_edit",
    "leads_assign",
    "pipeline",
  )
  get(
    @Param("id") id: string,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.leads.get(id, user);
  }
  @Post()
  @Permissions("leads_create")
  create(
    @Body() dto: CreateLeadDto,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.leads.create(dto, user);
  }
  @Patch(":id/assignee")
  @Permissions("leads_assign")
  assign(
    @Param("id") id: string,
    @Body() dto: AssignLeadDto,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.leads.assign(id, dto.assignedBdeId, user);
  }
  @Post(":id/activities")
  @Permissions("activities")
  addActivity(
    @Param("id") id: string,
    @Body() dto: CreateActivityDto,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.leads.addActivity(id, dto, user);
  }
  @Post(":id/payments")
  @Permissions("leads_edit")
  recordPayment(
    @Param("id") id: string,
    @Body() dto: RecordLeadPaymentDto,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.leads.recordPayment(id, dto, user);
  }
  @Patch(":id/payments/:paymentId")
  @Permissions("leads_edit")
  updatePayment(
    @Param("id") id: string,
    @Param("paymentId") paymentId: string,
    @Body() dto: RecordLeadPaymentDto,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.leads.updatePayment(id, paymentId, dto, user);
  }
  @Patch(":id")
  @Permissions("leads_edit")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.leads.update(id, dto, user);
  }

  @Delete(":id")
  @Permissions("leads_delete")
  delete(
    @Param("id") id: string,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.leads.delete(id, user);
  }
}
