import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuthService } from "./auth.service";
import {
  RegisterSchema,
  LoginSchema,
  VerifyEmailSchema,
  RequestResetSchema,
  ResetPasswordSchema,
  UpdateProfileSchema,
  AddressSchema,
  AddressUpdateSchema,
  type RegisterDto,
  type LoginDto,
  type VerifyEmailDto,
  type RequestResetDto,
  type ResetPasswordDto,
  type UpdateProfileDto,
  type AddressDto,
  type AddressUpdateDto,
} from "./auth.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { Public, CurrentUser, type AuthUser } from "./decorators";

const REFRESH_COOKIE = "axiom_rt";
const cookieOpts = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api/v1/auth",
  maxAge: 30 * 86400 * 1000,
};

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  register(@Body(new ZodValidationPipe(RegisterSchema)) dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post("verify-email")
  verify(@Body(new ZodValidationPipe(VerifyEmailSchema)) dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Public()
  @Post("login")
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.auth.login(dto);
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts);
    return { accessToken, user };
  }

  @Public()
  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rt = req.cookies?.[REFRESH_COOKIE];
    const { accessToken, refreshToken } = await this.auth.refresh(rt);
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOpts);
    return { accessToken };
  }

  @Public()
  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: cookieOpts.path });
    return result;
  }

  @Public()
  @Post("request-reset")
  requestReset(@Body(new ZodValidationPipe(RequestResetSchema)) dto: RequestResetDto) {
    return this.auth.requestReset(dto.email);
  }

  @Public()
  @Post("reset-password")
  resetPassword(@Body(new ZodValidationPipe(ResetPasswordSchema)) dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("profile")
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) dto: UpdateProfileDto,
  ) {
    return this.auth.updateProfile(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get("addresses")
  addresses(@CurrentUser() user: AuthUser) {
    return this.auth.listAddresses(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("addresses")
  addAddress(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(AddressSchema)) dto: AddressDto,
  ) {
    return this.auth.createAddress(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("addresses/:id")
  editAddress(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(AddressUpdateSchema)) dto: AddressUpdateDto,
  ) {
    return this.auth.updateAddress(user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete("addresses/:id")
  removeAddress(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.auth.deleteAddress(user.id, id);
  }
}
