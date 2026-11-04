import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { ReportsService } from "./reports.service";

@Controller("reports")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("user-options")
  @Permissions("reports")
  userOptions(@CurrentUser() user: { sub: string; permissions: string[] }) {
    return this.reports.userOptions(user);
  }

  @Get("monthly-summary")
  @Permissions("reports")
  monthlySummary(
    @Query("month") month: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.reports.monthlySummary(month, user, from, to);
  }

  @Get(":type")
  @Permissions("reports")
  run(
    @Param("type") type: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("assignedUserId") assignedUserId: string | undefined,
    @Query("stage") stage: string | undefined,
    @Query("status") status: string | undefined,
    @Query("category") category: string | undefined,
    @Query("lostReason") lostReason: string | undefined,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.reports.run(type, from, to, user, {
      assignedUserId,
      stage,
      status,
      category,
      lostReason,
    });
  }
}
