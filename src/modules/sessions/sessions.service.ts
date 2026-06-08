import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SESSION_DURATION_MS } from '../../common/constants/permissions.constants';
import { generateToken } from '../../common/utils/password.util';
import { AdminSessionPayload } from '../../common/utils/permissions.util';
import { Session, SessionDocument } from '../../database/schemas/session.schema';

@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(Session.name) private readonly sessionModel: Model<SessionDocument>,
  ) {}

  async createSession(
    username: string,
    role: string,
    locations: string[],
  ): Promise<string> {
    const token = generateToken();
    const now = new Date();
    await this.sessionModel.create({
      token,
      username,
      role: role || 'admin',
      locations: Array.isArray(locations) ? locations : [],
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
    });
    return token;
  }

  async validateToken(token: string): Promise<AdminSessionPayload | null> {
    const session = await this.sessionModel.findOne({
      token,
      expiresAt: { $gt: new Date() },
    });
    if (!session) return null;
    return {
      token: session.token,
      username: session.username,
      role: session.role || 'admin',
      locations: session.locations || [],
    };
  }

  async destroySession(token: string): Promise<void> {
    await this.sessionModel.deleteOne({ token });
  }

  async destroyAllForUser(username: string): Promise<void> {
    await this.sessionModel.deleteMany({ username });
  }

  async purgeExpired(): Promise<number> {
    const result = await this.sessionModel.deleteMany({
      expiresAt: { $lte: new Date() },
    });
    return result.deletedCount ?? 0;
  }
}
