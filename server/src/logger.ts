export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

export type Redactor = (text: string) => string;

/** Replaces every configured secret value. Applied to anything leaving the process. */
export function createRedactor(secrets: readonly string[]): Redactor {
  // Logs are serialized before redaction, so also match JSON-escaped secrets.
  // Longest first prevents a shorter secret from exposing the rest of another.
  const values = [...new Set(secrets.filter((s) => s.length >= 4)
    .flatMap((s) => [s, JSON.stringify(s).slice(1, -1)]))]
    .sort((a, b) => b.length - a.length);
  return (text) => values.reduce((out, secret) => out.split(secret).join('[REDACTED]'), text);
}

export function createLogger(redact: Redactor): Logger {
  const write = (level: string, message: string, fields?: Record<string, unknown>) => {
    const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
    (level === 'error' ? process.stderr : process.stdout).write(`${redact(line)}\n`);
  };
  return {
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
  };
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
