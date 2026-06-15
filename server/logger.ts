import * as fs from "fs";
import * as path from "path";

// Log levels
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Current log level - change this to filter console output
// Set to DEBUG to see everything, INFO for normal, WARN/ERROR for minimal
const CONSOLE_LOG_LEVEL = LogLevel.INFO;

// Disable colors for cleaner output (set to true if you see weird characters)
const DISABLE_COLORS = true;

// Always write everything to file regardless of console level
const LOG_FILE = path.join(process.cwd(), "execution.log");

// Color codes for console (only used if DISABLE_COLORS is false)
const colors = DISABLE_COLORS ? {
  reset: "",
  bright: "",
  dim: "",
  red: "",
  green: "",
  yellow: "",
  blue: "",
  magenta: "",
  cyan: "",
} : {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function getTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: string, category: string, message: string): string {
  return `[${getTimestamp()}] [${level}] [${category}] ${message}`;
}

function writeToFile(formattedMessage: string): void {
  try {
    fs.appendFileSync(LOG_FILE, formattedMessage + "\n");
  } catch (e) {
    // Silently fail if we can't write to file
  }
}

class Logger {
  private category: string;

  constructor(category: string) {
    this.category = category;
  }

  debug(message: string, ...args: any[]): void {
    const fullMessage = args.length > 0 ? `${message} ${JSON.stringify(args)}` : message;
    const formatted = formatMessage("DEBUG", this.category, fullMessage);
    writeToFile(formatted);
    
    if (CONSOLE_LOG_LEVEL <= LogLevel.DEBUG) {
      console.log(`${colors.dim}${formatted}${colors.reset}`);
    }
  }

  info(message: string, ...args: any[]): void {
    const fullMessage = args.length > 0 ? `${message} ${JSON.stringify(args)}` : message;
    const formatted = formatMessage("INFO", this.category, fullMessage);
    writeToFile(formatted);
    
    if (CONSOLE_LOG_LEVEL <= LogLevel.INFO) {
      console.log(`${colors.cyan}${formatted}${colors.reset}`);
    }
  }

  success(message: string, ...args: any[]): void {
    const fullMessage = args.length > 0 ? `${message} ${JSON.stringify(args)}` : message;
    const formatted = formatMessage("SUCCESS", this.category, fullMessage);
    writeToFile(formatted);
    
    if (CONSOLE_LOG_LEVEL <= LogLevel.INFO) {
      console.log(`${colors.green}${colors.bright}${formatted}${colors.reset}`);
    }
  }

  warn(message: string, ...args: any[]): void {
    const fullMessage = args.length > 0 ? `${message} ${JSON.stringify(args)}` : message;
    const formatted = formatMessage("WARN", this.category, fullMessage);
    writeToFile(formatted);
    
    if (CONSOLE_LOG_LEVEL <= LogLevel.WARN) {
      console.warn(`${colors.yellow}${formatted}${colors.reset}`);
    }
  }

  error(message: string, ...args: any[]): void {
    const fullMessage = args.length > 0 ? `${message} ${JSON.stringify(args)}` : message;
    const formatted = formatMessage("ERROR", this.category, fullMessage);
    writeToFile(formatted);
    
    if (CONSOLE_LOG_LEVEL <= LogLevel.ERROR) {
      console.error(`${colors.red}${colors.bright}${formatted}${colors.reset}`);
    }
  }

  // Special method for execution tracking - always visible and highlighted
  execution(message: string): void {
    const formatted = formatMessage("EXEC", this.category, message);
    writeToFile(formatted);
    console.log(`${colors.magenta}${colors.bright}${formatted}${colors.reset}`);
  }
}

// Factory function to create loggers for different categories
export function createLogger(category: string): Logger {
  return new Logger(category);
}

// Clear the log file (call at server startup)
export function clearLogFile(): void {
  try {
    fs.writeFileSync(LOG_FILE, `=== AITAS Execution Log - Started ${getTimestamp()} ===\n\n`);
  } catch (e) {
    console.error("Could not clear log file:", e);
  }
}

// Get the log file path
export function getLogFilePath(): string {
  return LOG_FILE;
}
