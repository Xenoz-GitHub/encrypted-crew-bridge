type Subsystem = 'MCP' | 'Browser' | 'Extension' | 'Crypto' | 'Filesystem';

interface LogEntry {
  timestamp: string;
  level: string;
  subsystem: Subsystem;
  message: string;
  data?: unknown;
}

const MAX_LOG_ENTRIES = 200;
const logBuffer: LogEntry[] = [];

function formatTime(): string {
  return new Date().toISOString();
}

function log(subsystem: Subsystem, level: string, message: string, data?: unknown): void {
  const timestamp = formatTime();
  const prefix = `[${timestamp}] [${subsystem}]`;
  const line = data ? `${prefix} ${message} ${JSON.stringify(data)}` : `${prefix} ${message}`;
  process.stderr.write(`[${level}] ${line}\n`);

  logBuffer.push({ timestamp, level, subsystem, message, data });
  if (logBuffer.length > MAX_LOG_ENTRIES) {
    logBuffer.shift();
  }
}

export function logInfo(subsystem: Subsystem, message: string, data?: unknown): void {
  log(subsystem, 'INFO', message, data);
}

export function logWarn(subsystem: Subsystem, message: string, data?: unknown): void {
  log(subsystem, 'WARN', message, data);
}

export function logError(subsystem: Subsystem, message: string, data?: unknown): void {
  log(subsystem, 'ERROR', message, data);
}

export function getRecentLogs(count = 50): LogEntry[] {
  return logBuffer.slice(-count);
}
