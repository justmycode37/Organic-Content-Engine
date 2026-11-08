/** Error with a stable machine-readable code, rendered by the HTTP layer. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (entity: string, id: string) =>
  new AppError(404, 'not_found', `${entity} ${id} not found`);

export const invalidTransition = (status: string, action: string) =>
  new AppError(409, 'invalid_state', `Cannot ${action} a post in status "${status}"`);
