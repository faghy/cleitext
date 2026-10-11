import { BREACHED_PASSWORD_MESSAGE, isBreachedPassword } from '@cleitext/db';
import { BadRequestException } from '@nestjs/common';

/** Refuses a new password found in lists of breached passwords (ASVS V6), on the given field. */
export function assertPasswordNotBreached(password: string, field = 'password'): void {
  if (isBreachedPassword(password)) {
    throw new BadRequestException({
      message: BREACHED_PASSWORD_MESSAGE,
      errors: [{ path: field, message: BREACHED_PASSWORD_MESSAGE }],
    });
  }
}
