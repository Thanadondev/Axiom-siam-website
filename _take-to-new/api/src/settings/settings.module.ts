import { Global, Module } from "@nestjs/common";
import { SettingsService } from "./settings.service";

/** global so OrdersService / MarketService can inject it without re-importing */
@Global()
@Module({
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
