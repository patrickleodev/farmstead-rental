import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from './auth-user';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';

type GoogleLoginBody = {
  credential: string;
};

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('config')
  getConfig() {
    return { googleClientId: this.authService.getGoogleClientId() };
  }

  @Post('google')
  signInWithGoogle(@Body() body: GoogleLoginBody) {
    return this.authService.signInWithGoogle(body.credential);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
