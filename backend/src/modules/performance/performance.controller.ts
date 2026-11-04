import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { PerformanceService } from "./performance.service";

@Controller("performance")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions("reports")
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}
  @Get() summary(
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.performance.summary(from, to, user);
  }
}
