import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { DashboardService } from "../dashboard/dashboard.service";
import { PerformanceService } from "../performance/performance.service";
import { ReportsService } from "../reports/reports.service";
import { UsersService } from "../users/users.service";

type AdminActor = { sub: string; permissions: string[] };

@Controller("admin")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminController {
  constructor(
    private readonly users: UsersService,
    private readonly dashboard: DashboardService,
    private readonly performance: PerformanceService,
    private readonly reports: ReportsService,
  ) {}

  @Get("profile")
  @Permissions("manage_team")
  profile(@CurrentUser() user: AdminActor) {
    return this.users.profile(user.sub);
  }

  @Get("users")
  @Permissions("manage_team")
  usersDirectory() {
    return this.users.list();
  }

  @Get("overview")
  @Permissions("dashboard")
  overview(@CurrentUser() user: AdminActor) {
    return this.dashboard.summary(user);
  }

  @Get("performance")
  @Permissions("reports")
  bdePerformance(
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: AdminActor,
  ) {
    return this.performance.summary(from, to, user);
  }

  @Get("reports/:type")
  @Permissions("reports")
  report(
    @Param("type") type: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: AdminActor,
  ) {
    return this.reports.run(type, from, to, user);
  }
}
