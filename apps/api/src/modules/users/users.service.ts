import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { CurrentUserDto } from './dto/update-me.dto.js';

const publicUserSelection = {
  id: true,
  email: true,
  displayName: true,
  emailVerifiedAt: true,
} as const;

type PublicUserRecord = {
  id: string;
  email: string;
  displayName: string;
  emailVerifiedAt: Date | null;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(subject: string): Promise<CurrentUserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: subject },
      select: publicUserSelection,
    });
    if (user === null) {
      throw new UnauthorizedException({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'The access token is invalid or expired.',
      });
    }
    return this.toCurrentUser(user);
  }

  async updateMe(subject: string, displayName: string): Promise<CurrentUserDto> {
    const user = await this.prisma.user.update({
      where: { id: subject },
      data: { displayName },
      select: publicUserSelection,
    });
    return this.toCurrentUser(user);
  }

  private toCurrentUser(user: PublicUserRecord): CurrentUserDto {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerified: user.emailVerifiedAt !== null,
      hasHousehold: false,
    };
  }
}
