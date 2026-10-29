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
import { CreateFollowUpDto } from "./dto/create-follow-up.dto";
import { UpdateFollowUpDto } from "./dto/update-follow-up.dto";
import { FollowUpsService } from "./follow-ups.service";

@Controller("follow-ups")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions("activities")
export class FollowUpsController {
  constructor(private readonly followUps: FollowUpsService) {}

  @Get()
  list(
    @Query("scope") scope: string | undefined,
    @Query("search") search: string | undefined,
    @Query("type") type: string | undefined,
    @Query("assignedBdeId") assignedBdeId: string | undefined,
    @Query("status") status: string | undefined,
    @Query("pendingResponse") pendingResponse: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.followUps.list(
      { scope, search, type, assignedBdeId, status, pendingResponse, from, to },
      user,
    );
  }

  @Get("summary")
  summary(@CurrentUser() user: { sub: string; permissions: string[] }) {
    return this.followUps.summary(user);
  }

  @Get("lead/:leadId/pending-proposal")
  pendingProposalForLead(
    @Param("leadId") leadId: string,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.followUps.pendingProposalForLead(leadId, user);
  }

  @Post()
  create(
    @Body() dto: CreateFollowUpDto,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.followUps.create(dto, user);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateFollowUpDto,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.followUps.update(id, dto, user);
  }
}
