import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AiController } from "./ai.controller";
import { AiPatternsService } from "./ai-patterns.service";

/** AI helpers for the designers (Claude): pattern recipes from a customer's words */
@Module({ imports: [JwtModule.register({})], controllers: [AiController], providers: [AiPatternsService] })
export class AiModule {}
