import { AdminSessionPayload } from './common/utils/permissions.util';

declare global {
  namespace Express {
    interface Request {
      user?: AdminSessionPayload;
    }
  }
}

export {};
