/**
 * Logger
 * Centralized logging with structured output
 */

export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  FATAL = "FATAL",
}

export interface LogEntry {
  level: LogLevel;
  timestamp: Date;
  message: string;
  context?: Record<string, any>;
  error?: Error;
}

export class Logger {
  private static minLevel = LogLevel.DEBUG;
  private static handlers: Array<(entry: LogEntry) => void> = [];

  static {
    // Add default console handler
    Logger.addHandler((entry) => {
      const timestamp = entry.timestamp.toISOString();
      const context = entry.context ? JSON.stringify(entry.context) : "";
      const errorStr = entry.error ? `\n${entry.error.stack}` : "";

      const message = `[${timestamp}] ${entry.level}: ${entry.message} ${context}${errorStr}`;

      switch (entry.level) {
        case LogLevel.DEBUG:
          console.debug(message);
          break;
        case LogLevel.INFO:
          console.info(message);
          break;
        case LogLevel.WARN:
          console.warn(message);
          break;
        case LogLevel.ERROR:
          console.error(message);
          break;
        case LogLevel.FATAL:
          console.error(message);
          break;
      }
    });
  }

  static addHandler(handler: (entry: LogEntry) => void): void {
    this.handlers.push(handler);
  }

  static setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  private static log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    const levelOrder: Record<LogLevel, number> = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 1,
      [LogLevel.WARN]: 2,
      [LogLevel.ERROR]: 3,
      [LogLevel.FATAL]: 4,
    };

    if (levelOrder[level] < levelOrder[this.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      level,
      timestamp: new Date(),
      message,
      context,
      error,
    };

    this.handlers.forEach((handler) => {
      try {
        handler(entry);
      } catch (error) {
        console.error("Handler failed:", error);
      }
    });
  }

  static debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  static info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context);
  }

  static warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context);
  }

  static error(message: string, context?: Record<string, any>, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  static fatal(message: string, context?: Record<string, any>, error?: Error): void {
    this.log(LogLevel.FATAL, message, context, error);
  }
}

export const logger = Logger;
