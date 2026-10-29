import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { CreateNegotiationDto } from "./dto/create-negotiation.dto";
import { UpdateNegotiationDto } from "./dto/update-negotiation.dto";
import { NegotiationsService } from "./negotiations.service";

@Controller("negotiations")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions("activities")
export class NegotiationsController {
  constructor(private readonly negotiations: NegotiationsService) {}
  @Get() list(@CurrentUser() user: { sub: string; permissions: string[] }) {
    return this.negotiations.list(user);
  }
  @Post() create(
    @Body() dto: CreateNegotiationDto,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.negotiations.create(dto, user);
  }
  @Patch(":id") update(
    @Param("id") id: string,
    @Body() dto: UpdateNegotiationDto,
    @CurrentUser() user: { sub: string; permissions: string[] },
  ) {
    return this.negotiations.update(id, dto, user);
  }
}
