import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { CustomersService } from "./customers.service";

@Controller("customers")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions("customers")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}
  @Get() list(@CurrentUser() user: { sub: string; permissions: string[] }) {
    return this.customers.list(user);
  }
}
