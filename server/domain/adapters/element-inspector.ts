/**
 * Element Inspector - Finds elements even in iframes with fallbacks
 */

import { Page, Frame } from "playwright";
import { logger } from "../../infrastructure/logger";

export class ElementInspector {
  /**
   * Find element with iframe support
   */
  static async findElement(
    page: Page,
    locator: string,
    timeout: number = 10000
  ): Promise<{ element: any; frame: Frame; locator: string } | null> {
    const startTime = Date.now();

    // Try 1: Direct element on main page
    try {
      const element = await this.findInFrame(page, locator, timeout);
      if (element) {
        logger.info(`[ElementInspector] Found element on main page`);
        return { element, frame: page.mainFrame(), locator };
      }
    } catch (e) {
      logger.debug(`[ElementInspector] Not on main page`);
    }

    // Try 2: Search in all iframes
    const iframes = page.frames();
    for (const frame of iframes) {
      if (frame === page.mainFrame()) continue;

      try {
        logger.info(`[ElementInspector] Searching in iframe: ${frame.name()}`);
        const element = await this.findInFrame(frame, locator, timeout);
        if (element) {
          logger.info(`[ElementInspector] Found element in iframe: ${frame.name()}`);
          return { element, frame, locator };
        }
      } catch (e) {
        logger.debug(`[ElementInspector] Not found in iframe: ${frame.name()}`);
      }
    }

    // Try 3: Try common fallback locators
    const fallbacks = this.generateFallbackLocators(locator);
    for (const fallbackLocator of fallbacks) {
      if (Date.now() - startTime > timeout) break;

      try {
        // Try main page
        const element = await this.findInFrame(page, fallbackLocator, 3000);
        if (element) {
          logger.info(`[ElementInspector] Found with fallback: ${fallbackLocator}`);
          return { element, frame: page.mainFrame(), locator: fallbackLocator };
        }
      } catch (e) {
        // Try iframes
        for (const frame of iframes) {
          if (frame === page.mainFrame()) continue;
          try {
            const element = await this.findInFrame(frame, fallbackLocator, 3000);
            if (element) {
              logger.info(`[ElementInspector] Found with fallback in iframe: ${fallbackLocator}`);
              return { element, frame, locator: fallbackLocator };
            }
          } catch (e) {
            // Continue
          }
        }
      }
    }

    logger.warn(`[ElementInspector] Element not found after all attempts`);
    return null;
  }

  /**
   * Find element in specific frame
   */
  private static async findInFrame(
    frameOrPage: Frame | Page,
    locator: string,
    timeout: number
  ): Promise<any> {
    try {
      // Convert xpath to playwright locator
      const playwrightLocator = this.xpathToPlaywright(locator);
      const element = frameOrPage.locator(playwrightLocator);

      await element.waitFor({ state: "visible", timeout });
      return element;
    } catch (e) {
      throw new Error(`Element not found: ${locator}`);
    }
  }

  /**
   * Generate fallback locators
   */
  private static generateFallbackLocators(locator: string): string[] {
    const fallbacks: string[] = [];

    // Extract button text if present
    const textMatch = locator.match(/contains\(text\(\),\s*['"](.*?)['"]\)/);
    if (textMatch) {
      fallbacks.push(`//*[contains(text(), '${textMatch[1]}')]`);
      fallbacks.push(`//button[contains(., '${textMatch[1]}')]`);
      fallbacks.push(`//a[contains(., '${textMatch[1]}')]`);
    }

    // Extract ID if present
    const idMatch = locator.match(/@id='([^']+)'/);
    if (idMatch) {
      fallbacks.push(`//*[@id='${idMatch[1]}']`);
      fallbacks.push(`//input[@id='${idMatch[1]}']`);
      fallbacks.push(`//button[@id='${idMatch[1]}']`);
    }

    // Extract name if present
    const nameMatch = locator.match(/@name='([^']+)'/);
    if (nameMatch) {
      fallbacks.push(`//*[@name='${nameMatch[1]}']`);
      fallbacks.push(`//input[@name='${nameMatch[1]}']`);
    }

    // Generic fallbacks
    fallbacks.push(`//input`);  // First input
    fallbacks.push(`//button`); // First button
    fallbacks.push(`//*`);      // Any element

    return fallbacks;
  }

  /**
   * Convert XPath to Playwright locator
   */
  private static xpathToPlaywright(xpath: string): string {
    // Playwright uses xpath directly
    return xpath;
  }

  /**
   * Wait for iframe to load
   */
  static async waitForIframe(page: Page, timeout: number = 5000): Promise<Frame | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const frames = page.frames();
      if (frames.length > 1) {
        logger.info(`[ElementInspector] Iframe detected`);
        return frames[frames.length - 1];  // Return newest frame
      }

      await page.waitForTimeout(100);
    }

    logger.warn(`[ElementInspector] No iframe found within timeout`);
    return null;
  }

  /**
   * Detect all interactive elements on page
   */
  static async detectElements(page: Page): Promise<Array<{
    type: string;
    locator: string;
    text?: string;
    id?: string;
    name?: string;
  }>> {
    const elements: any[] = [];

    try {
      // Buttons
      const buttons = await page.$$eval("button", (els) =>
        els.map((el: any) => ({
          type: "button",
          text: el.textContent?.trim(),
          id: el.id,
          name: el.name,
          xpath: this.getXPath(el),
        }))
      );
      elements.push(...buttons);

      // Inputs
      const inputs = await page.$$eval("input", (els) =>
        els.map((el: any) => ({
          type: "input",
          placeholder: el.placeholder,
          id: el.id,
          name: el.name,
          xpath: this.getXPath(el),
        }))
      );
      elements.push(...inputs);

      // Selects
      const selects = await page.$$eval("select", (els) =>
        els.map((el: any) => ({
          type: "select",
          id: el.id,
          name: el.name,
          xpath: this.getXPath(el),
        }))
      );
      elements.push(...selects);

      // Links
      const links = await page.$$eval("a", (els) =>
        els.map((el: any) => ({
          type: "link",
          text: el.textContent?.trim(),
          href: el.href,
          xpath: this.getXPath(el),
        }))
      );
      elements.push(...links);

      return elements;
    } catch (error) {
      logger.error(`[ElementInspector] Error detecting elements`, { error });
      return [];
    }
  }

  /**
   * Get XPath of element (runs in browser context)
   */
  private static getXPath(element: any): string {
    if (element.id !== "") {
      return `//*[@id='${element.id}']`;
    }
    if (element.name !== "") {
      return `//*[@name='${element.name}']`;
    }

    let paths = [];
    for (; element && element.nodeType !== 9; element = element.parentNode) {
      let index = 0;
      for (let sibling = element.previousSibling; sibling; sibling = sibling.previousSibling) {
        if (sibling.nodeType === 1 && sibling.nodeName.toLowerCase() === element.nodeName.toLowerCase()) {
          index++;
        }
      }

      const tagName = element.nodeName.toLowerCase();
      const pathIndex = index ? `[${index + 1}]` : "";
      paths.unshift(`${tagName}${pathIndex}`);
    }

    return paths.length > 0 ? `/${paths.join("/")}` : "";
  }

  /**
   * Check if element is clickable
   */
  static async isClickable(element: any): Promise<boolean> {
    try {
      const boundingBox = await element.boundingBox();
      return !!(boundingBox && boundingBox.width > 0 && boundingBox.height > 0);
    } catch {
      return false;
    }
  }

  /**
   * Wait for element to be clickable
   */
  static async waitForClickable(
    page: Page,
    locator: string,
    timeout: number = 10000
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const element = page.locator(locator);
        const boundingBox = await element.boundingBox();

        if (boundingBox && boundingBox.width > 0 && boundingBox.height > 0) {
          logger.info(`[ElementInspector] Element is clickable`);
          return true;
        }
      } catch (e) {
        // Element not found yet
      }

      await page.waitForTimeout(100);
    }

    logger.warn(`[ElementInspector] Element not clickable within timeout`);
    return false;
  }
}
