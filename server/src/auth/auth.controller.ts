import { Body, Controller, Get, Header, Post, UseGuards } from '@nestjs/common';
import type { AuthenticatedUser } from './auth-user';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';

type GoogleLoginBody = {
  credential?: string;
  accessToken?: string;
  access_token?: string;
};

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('config')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  @Header('Pragma', 'no-cache')
  getConfig() {
    return { googleClientId: this.authService.getGoogleClientId() };
  }

  @Post('google')
  signInWithGoogle(@Body() body: GoogleLoginBody) {
    const accessToken = body.accessToken ?? body.access_token;
    if (accessToken) {
      return this.authService.signInWithGoogleAccessToken(accessToken);
    }
    return this.authService.signInWithGoogle(body.credential ?? '');
  }

  @Get('me')
  @UseGuards(AuthGuard)
  getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
