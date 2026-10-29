import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { CreateProposalDto } from "./dto/create-proposal.dto";
import { UpdateProposalDto } from "./dto/update-proposal.dto";
import { ProposalsService } from "./proposals.service";

@Controller("proposals")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions("activities")
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  @Get("lead/:leadId/latest")
  latestForLead(
    @Param("leadId") leadId: string,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.proposals.latestAmountForLead(leadId, user);
  }

  @Get() list(@CurrentUser() user: { sub: string; permissions: string[] }) {
    return this.proposals.list(user);
  }
  @Post() create(
    @Body() dto: CreateProposalDto,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.proposals.create(dto, user);
  }
  @Patch(":id") update(
    @Param("id") id: string,
    @Body() dto: UpdateProposalDto,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.proposals.update(id, dto, user);
  }
}
