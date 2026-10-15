import type { ProblemDetails } from '@cleitext/shared';
import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';

/**
 * Renders every error as `application/problem+json` (RFC 9457). Unexpected
 * errors become a generic 500: no stack traces or internals in responses.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    let problem: ProblemDetails;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      problem = { title: titleFor(status), status };
      if (typeof body === 'string') {
        problem.detail = body;
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        if (typeof b.message === 'string' && b.message !== problem.title)
          problem.detail = b.message;
        if (Array.isArray(b.errors)) problem.errors = b.errors as ProblemDetails['errors'];
        if (typeof b.retryAfter === 'number')
          void reply.header('Retry-After', String(b.retryAfter));
        // Readiness reports keep their per-dependency checks.
        if (b.checks) (problem as ProblemDetails & { checks?: unknown }).checks = b.checks;
      }
    } else {
      this.logger.error(exception);
      problem = { title: titleFor(500), status: 500 };
    }

    void reply.status(problem.status).type('application/problem+json').send(problem);
  }
}

function titleFor(status: number): string {
  const titles: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    402: 'Payment Required',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    410: 'Gone',
    422: 'Unprocessable Content',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    503: 'Service Unavailable',
  };
  return titles[status] ?? (HttpStatus[status] ? String(HttpStatus[status]) : 'Error');
}

/** Validates a request payload with a shared Zod schema; 400 with details otherwise. */
export function parseBody<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value ?? {});
  if (!result.success) {
    throw new BadRequestException({
      message: 'The request is not valid.',
      errors: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
}
