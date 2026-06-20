import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OAuth2Client } from 'google-auth-library';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from './auth-user';
import { AppUser } from './user.entity';

type AccessTokenPayload = AuthenticatedUser & {
  exp: number;
};

@Injectable()
export class AuthService {
  private readonly googleClient = new OAuth2Client();

  constructor(
    @InjectRepository(AppUser)
    private readonly users: Repository<AppUser>,
  ) {}

  getGoogleClientId() {
    return process.env.GOOGLE_CLIENT_ID ?? '';
  }

  async signInWithGoogle(credential: string) {
    const clientId = this.getGoogleClientId();
    if (!clientId) {
      throw new ServiceUnavailableException(
        'GOOGLE_CLIENT_ID não está configurado no servidor.',
      );
    }

    const ticket = await this.googleClient.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const profile = ticket.getPayload();
    const email = profile?.email?.toLowerCase();

    if (!profile?.sub || !email || !profile.email_verified) {
      throw new UnauthorizedException('Não foi possível validar sua conta Google.');
    }
    this.ensureAdminEmail(email);

    const name = profile.name?.trim() || email.split('@')[0];
    const avatarUrl = profile.picture ?? null;
    let user = await this.users.findOneBy({ googleId: profile.sub });

    if (user) {
      user.email = email;
      user.name = name;
      user.avatarUrl = avatarUrl;
    } else {
      user = this.users.create({
        googleId: profile.sub,
        email,
        name,
        avatarUrl,
      });
    }

    const savedUser = await this.users.save(user);
    const authenticatedUser = this.toAuthenticatedUser(savedUser);
    return {
      token: this.signAccessToken(authenticatedUser),
      user: authenticatedUser,
    };
  }

  verifyAccessToken(token: string): AuthenticatedUser {
    const [header, encodedPayload, signature, ...rest] = token.split('.');
    if (!header || !encodedPayload || !signature || rest.length) {
      throw new UnauthorizedException('Sessão inválida.');
    }

    const expectedSignature = this.sign(`${header}.${encodedPayload}`);
    const supplied = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new UnauthorizedException('Sessão inválida.');
    }

    try {
      const payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as AccessTokenPayload;
      if (
        !Number.isInteger(payload.id) ||
        !payload.email ||
        !payload.name ||
        !payload.exp ||
        payload.exp <= Math.floor(Date.now() / 1000)
      ) {
        throw new Error('Invalid token payload');
      }
      return {
        id: payload.id,
        email: payload.email,
        name: payload.name,
        avatarUrl: payload.avatarUrl ?? null,
      };
    } catch {
      throw new UnauthorizedException('Sessão inválida ou expirada.');
    }
  }

  private ensureAdminEmail(email: string) {
    const allowedEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    if (!allowedEmails.length) {
      throw new ServiceUnavailableException(
        'ADMIN_EMAILS não está configurado no servidor.',
      );
    }
    if (!allowedEmails.includes(email)) {
      throw new UnauthorizedException('Esta conta Google não tem acesso ao sistema.');
    }
  }

  private signAccessToken(user: AuthenticatedUser) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
      'base64url',
    );
    const payload = Buffer.from(
      JSON.stringify({
        ...user,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
      }),
    ).toString('base64url');
    return `${header}.${payload}.${this.sign(`${header}.${payload}`)}`;
  }

  private sign(value: string) {
    const secret = process.env.AUTH_JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException(
        'AUTH_JWT_SECRET deve ter pelo menos 32 caracteres.',
      );
    }
    return createHmac('sha256', secret).update(value).digest('base64url');
  }

  private toAuthenticatedUser(user: AppUser): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };
  }
}
