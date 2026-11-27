import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../auth/decorators";
import { NotifyService } from "./notify.service";

@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotifyController {
  constructor(private readonly notify: NotifyService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notify.list(user.id);
  }

  @Get("unread-count")
  unread(@CurrentUser() user: AuthUser) {
    return this.notify.unreadCount(user.id);
  }

  @Post("read")
  readAll(@CurrentUser() user: AuthUser) {
    return this.notify.markRead(user.id);
  }

  @Post(":id/read")
  readOne(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.notify.markRead(user.id, id);
  }
}
