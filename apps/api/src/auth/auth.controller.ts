import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterResidentDto } from './dto/register-resident.dto';
import { UpdateResidentProfileDto } from './dto/update-resident-profile.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

type AuthenticatedRequest = Request & { user: { userId: string; role: string } };

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get('resident/directory')
  directory() {
    return this.auth.getResidentDirectory();
  }

  @Post('resident/register')
  registerResident(@Body() input: RegisterResidentDto) {
    return this.auth.registerResident(input);
  }

  @Post('resident/login')
  login(@Body() input: LoginDto) {
    return this.auth.login(input);
  }

  @Post('admin/login')
  loginAdmin(@Body() input: LoginDto) {
    return this.auth.loginAdmin(input);
  }

  @UseGuards(JwtAuthGuard)
  @Get('resident/me')
  me(@Req() request: AuthenticatedRequest) {
    return this.auth.me(request.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('resident/me')
  updateResidentProfile(
    @Req() request: AuthenticatedRequest,
    @Body() input: UpdateResidentProfileDto,
  ) {
    return this.auth.updateResidentProfile(request.user.userId, input);
  }

  @UseGuards(JwtAuthGuard)
  @Get('resident/dashboard')
  getResidentDashboard(@Req() request: AuthenticatedRequest) {
    return this.auth.getResidentDashboard(request.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('resident/complaints')
  getComplaints(@Req() request: AuthenticatedRequest) {
    return this.auth.getComplaints(request.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('resident/complaints')
  createComplaint(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateComplaintDto,
  ) {
    return this.auth.createComplaint(request.user.userId, input);
  }

  @UseGuards(JwtAuthGuard)
  @Get('resident/notifications')
  getNotifications(@Req() request: AuthenticatedRequest) {
    return this.auth.getNotifications(request.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('resident/notifications/read-all')
  markAllNotificationsRead(@Req() request: AuthenticatedRequest) {
    return this.auth.markAllNotificationsRead(request.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('resident/notifications/:id/read')
  markNotificationRead(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.auth.markNotificationRead(request.user.userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/me')
  adminMe(@Req() request: AuthenticatedRequest) {
    return this.auth.adminMe(request.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('resident/card/deactivate')
  deactivateMyCard(@Req() request: AuthenticatedRequest) {
    return this.auth.deactivateMyCard(request.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('access-card/deactivate')
  deactivateAccessCard(@Req() request: AuthenticatedRequest) {
    return this.auth.deactivateAccessCard(request.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('access-card/report-misuse')
  reportCardMisuse(
    @Req() request: AuthenticatedRequest,
    @Body('description') description: string,
  ) {
    return this.auth.reportCardMisuse(request.user.userId, description || '');
  }

  // ── Visitor passes ─────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('resident/visitor-passes')
  getVisitorPasses(@Req() request: AuthenticatedRequest) {
    return this.auth.getVisitorPasses(request.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('resident/visitor-passes')
  createVisitorPass(
    @Req() request: AuthenticatedRequest,
    @Body() body: { label?: string },
  ) {
    return this.auth.createVisitorPass(request.user.userId, body.label);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('resident/visitor-passes/:id')
  deleteVisitorPass(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.auth.deleteVisitorPass(request.user.userId, id);
  }
}
