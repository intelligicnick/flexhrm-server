import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PlatformSession,
  PlatformSessionDocument,
} from '../schemas/platform-session.schema';

export interface PlatformSessionPayload {
  username: string;
  token: string;
  expiresAt: Date;
}

@Injectable()
export class PlatformSessionService {
  constructor(
    @InjectModel(PlatformSession.name)
    private readonly sessionModel: Model<PlatformSessionDocument>,
  ) {}

  async create(username: string, token: string, expiresAt: Date): Promise<void> {
    await this.sessionModel.create({ username, token, expiresAt });
  }

  async validate(token: string | undefined): Promise<PlatformSessionPayload | null> {
    if (!token?.trim()) return null;

    const session = await this.sessionModel.findOne({ token }).lean();
    if (!session || session.expiresAt <= new Date()) {
      if (session) await this.sessionModel.deleteOne({ token });
      return null;
    }

    return {
      username: session.username,
      token: session.token,
      expiresAt: session.expiresAt,
    };
  }

  async destroy(token: string): Promise<void> {
    await this.sessionModel.deleteOne({ token });
  }
}
