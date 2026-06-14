import { SetMetadata } from '@nestjs/common';

export const SUPERVISOR_ONLY_KEY = 'supervisorOnly';
export const SupervisorOnly = () => SetMetadata(SUPERVISOR_ONLY_KEY, true);
