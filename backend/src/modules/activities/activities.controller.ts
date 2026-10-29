import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { ActivitiesService } from "./activities.service";

@Controller("activities")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions("activities")
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}
  @Get() list(
    @Query("type") type: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("search") search: string | undefined,
    @Query("category") category: string | undefined,
    @Query("page") page: string | undefined,
    @Query("pageSize") pageSize: string | undefined,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    const requestedPage = Number(page);
    const requestedPageSize = Number(pageSize);
    return this.activities.list(
      type,
      from,
      to,
      search?.trim() || undefined,
      category,
      Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
      Number.isInteger(requestedPageSize) && requestedPageSize > 0
        ? Math.min(requestedPageSize, 100)
        : 20,
      user,
    );
  }
}
