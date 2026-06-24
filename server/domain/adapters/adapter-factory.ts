/**
 * Adapter Factory
 * Creates and manages execution adapters
 */

import { BaseExecutionAdapter, PlatformType } from "./adapter.interface";
import { logger } from "../../infrastructure/logger/logger";

export class AdapterFactory {
  private static adapters: Map<string, BaseExecutionAdapter> = new Map();

  /**
   * Register an adapter
   */
  static registerAdapter(key: string, adapter: BaseExecutionAdapter): void {
    this.adapters.set(key, adapter);
    logger.info(`[AdapterFactory] Adapter registered: ${key}`, { platform: adapter.platform, framework: adapter.framework });
  }

  /**
   * Get adapter by platform and framework
   */
  static getAdapter(platform: PlatformType, framework?: string): BaseExecutionAdapter | null {
    const key = framework ? `${platform}_${framework}` : platform;

    const adapter = this.adapters.get(key) || this.adapters.get(platform);

    if (!adapter) {
      logger.warn(`[AdapterFactory] Adapter not found: ${key}`);
      return null;
    }

    return adapter;
  }

  /**
   * Get all registered adapters
   */
  static getAllAdapters(): BaseExecutionAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get adapters by platform
   */
  static getAdaptersByPlatform(platform: PlatformType): BaseExecutionAdapter[] {
    return Array.from(this.adapters.values()).filter((adapter) => adapter.platform === platform);
  }

  /**
   * Unregister an adapter
   */
  static unregisterAdapter(key: string): void {
    this.adapters.delete(key);
    logger.info(`[AdapterFactory] Adapter unregistered: ${key}`);
  }

  /**
   * Clear all adapters
   */
  static clearAll(): void {
    this.adapters.clear();
    logger.info(`[AdapterFactory] All adapters cleared`);
  }

  /**
   * List available adapters
   */
  static list(): Array<{ key: string; platform: string; framework: string }> {
    return Array.from(this.adapters.entries()).map(([key, adapter]) => ({
      key,
      platform: adapter.platform,
      framework: adapter.framework,
    }));
  }
}
