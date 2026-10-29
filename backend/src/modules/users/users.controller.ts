import {
  Body,
  Delete,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Actor } from "../../common/authorization/actor-permission";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserStatusDto } from "./dto/update-user-status.dto";
import { UpdateTeamUserDto } from "./dto/update-team-user.dto";
import { UpdateTeamUserPasswordDto } from "./dto/update-team-user-password.dto";
import { CreateTeamRoleDto } from "./dto/create-team-role.dto";
import { UpdateUserPermissionsDto } from "./dto/update-user-permissions.dto";
import { UsersService } from "./users.service";

@Controller("users")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions("manage_team")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("roles")
  roles() {
    return this.users.listTeamRoles();
  }

  @Post("roles")
  createRole(@Body() dto: CreateTeamRoleDto) {
    return this.users.createTeamRole(dto.name);
  }

  @Patch("roles/:id")
  updateRole(@Param("id") id: string, @Body() dto: CreateTeamRoleDto) {
    return this.users.updateTeamRole(id, dto.name);
  }

  @Delete("roles/:id")
  deleteRole(@Param("id") id: string) {
    return this.users.deleteTeamRole(id);
  }

  @Patch(":id/permissions")
  updateUserPermissions(
    @Param("id") id: string,
    @Body() dto: UpdateUserPermissionsDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.users.updateUserPermissions(id, dto.permissions, actor);
  }

  @Get()
  list(
    @Query("page") page: string | undefined,
    @Query("pageSize") pageSize: string | undefined,
    @Query("search") search: string | undefined,
    @CurrentUser() actor: Actor,
  ) {
    if (page !== undefined || pageSize !== undefined || search !== undefined) {
      const parsedPage = Number(page);
      const parsedPageSize = Number(pageSize);
      return this.users.listTeamPage(
        Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
        Number.isInteger(parsedPageSize) && parsedPageSize > 0
          ? Math.min(parsedPageSize, 100)
          : 20,
        search?.trim() || undefined,
        actor.sub,
      );
    }
    return this.users.list();
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(":id/status")
  setActive(
    @Param("id") id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.users.setActive(id, dto.isActive, actor.sub);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateTeamUserDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.users.updateTeamUser(id, dto, actor);
  }

  @Patch(":id/password")
  updatePassword(
    @Param("id") id: string,
    @Body() dto: UpdateTeamUserPasswordDto,
    @CurrentUser() actor: Actor,
  ) {
    return this.users.updateTeamUserPassword(id, dto.password, actor.sub);
  }

  @Delete(":id")
  delete(@Param("id") id: string, @CurrentUser() actor: Actor) {
    return this.users.deleteTeamUser(id, actor.sub);
  }
}
