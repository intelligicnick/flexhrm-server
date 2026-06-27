import { SetMetadata } from '@nestjs/common';
import { SKIP_CSRF_KEY } from '../../platform/common/platform-metadata.constants';

export const SkipCsrf = () => SetMetadata(SKIP_CSRF_KEY, true);
