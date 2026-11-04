import { Controller, Get, UseGuards } from "@nestjs/common";
import { Actor } from "../../common/authorization/actor-permission";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { DashboardService } from "./dashboard.service";
@Controller("dashboard")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}
  @Get("pending-counts")
  pendingCounts(@CurrentUser() user: Actor) {
    return this.dashboard.pendingCounts(user);
  }
  @Get("summary") summary(@CurrentUser() user: Actor) {
    return this.dashboard.summary(user);
  }
}
