import { Global, Module } from "@nestjs/common";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { PermissionsGuard } from "./permissions.guard";

@Global()
@Module({
  providers: [JwtAuthGuard, PermissionsGuard],
  exports: [JwtAuthGuard, PermissionsGuard],
})
export class GuardsModule {}
