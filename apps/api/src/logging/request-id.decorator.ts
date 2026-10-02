import type { IncomingMessage } from 'node:http';
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** The request id assigned by `LoggingModule` (`req.id`), for audit events and correlation. */
export const RequestId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined => {
    const id = context.switchToHttp().getRequest<IncomingMessage & { id?: unknown }>().id;
    return typeof id === 'string' ? id : undefined;
  },
);
