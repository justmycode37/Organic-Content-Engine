export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export type Redactor = (text: string) => string;

/** Replaces every configured secret value. Applied to anything leaving the Worker. */
export function createRedactor(secrets: readonly string[]): Redactor {
  // Errors are often serialized before they are logged. A secret containing quotes,
  // backslashes, or control characters then appears in JSON-escaped form.
  const values = [...new Set(secrets.filter((s) => s.length >= 4)
    .flatMap((secret) => [secret, JSON.stringify(secret).slice(1, -1)]))]
    .sort((a, b) => b.length - a.length);
  return (text) => values.reduce((out, secret) => out.split(secret).join('[REDACTED]'), text);
}

export function createLogger(redact: Redactor): Logger {
  const write = (level: 'info' | 'warn' | 'error', message: string, fields?: Record<string, unknown>) => {
    console[level === 'info' ? 'log' : level](redact(JSON.stringify({ level, message, ...fields })));
  };
  return {
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
  };
}
