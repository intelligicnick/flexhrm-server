import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DeviceAgent, DeviceAgentDocument } from '../../../database/schemas/monitor-device.schema';
import { verifyPassword } from '../../../common/utils/password.util';

@Injectable()
export class AgentAuthGuard implements CanActivate {
  constructor(
    @InjectModel(DeviceAgent.name)
    private readonly deviceAgentModel: Model<DeviceAgentDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = (request.headers.authorization as string | undefined) ?? '';
    const deviceHash = (request.headers['x-device-hash'] as string | undefined)?.trim();
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    if (!deviceHash || !token) {
      throw new UnauthorizedException('Device authentication required.');
    }

    const agent = await this.deviceAgentModel
      .findOne({ deviceHash, status: { $in: ['active', 'pending'] } })
      .select('+authTokenHash')
      .exec();

    if (!agent || !verifyPassword(token, agent.authTokenHash)) {
      throw new UnauthorizedException('Invalid device credentials.');
    }

    if (agent.status === 'revoked') {
      throw new UnauthorizedException('Device has been revoked.');
    }

    request.deviceAgent = agent;
    return true;
  }
}
