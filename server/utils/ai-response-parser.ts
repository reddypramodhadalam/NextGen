/**
 * AI Response JSON Parser
 * ─────────────────────────────────────────────────────────────────────────────
 * Robust extractor that pulls a JSON object out of an LLM response, regardless
 * of whether the model wraps it in:
 *   1. Full markdown fence:    ```json\n{...}\n```
 *   2. Generic markdown fence: ```\n{...}\n```
 *   3. Unclosed fence:         ```json\n{...}
 *   4. Plain JSON:             {...}
 *   5. JSON with prose:        "Here are the tests:\n{...}"
 *   6. Trailing commas:        { "a": 1, }
 *   7. BOM / zero-width chars some models emit
 *
 * Used by every endpoint that round-trips JSON through an LLM (generate-tests,
 * generate-jde-tests, parse-spec, structurer, etc.) so one bug-fix here cascades
 * everywhere.
 */

export class AiResponseParseError extends Error {
  constructor(message: string, public readonly rawContent: string) {
    super(message);
    this.name = "AiResponseParseError";
  }
}

/**
 * Extracts and parses JSON from an LLM response string.
 * @param rawContent The raw content returned by the LLM.
 * @returns The parsed JSON object.
 * @throws AiResponseParseError if no valid JSON can be extracted.
 */
export function parseAiJson<T = any>(rawContent: string): T {
  if (!rawContent || typeof rawContent !== "string") {
    throw new AiResponseParseError("Empty or non-string AI response", String(rawContent));
  }

  let jsonStr = rawContent.trim();

  // Strip BOM and zero-width chars
  jsonStr = jsonStr.replace(/^\uFEFF/, "").replace(/^\u200B+/, "");

  // 1) Try to extract a fenced code block first
  const fencedMatch = jsonStr.match(/```(?:json|javascript|js)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    jsonStr = fencedMatch[1].trim();
  } else if (jsonStr.startsWith("```")) {
    // Unclosed code fence - strip opening
    jsonStr = jsonStr.replace(/^```(?:json|javascript|js)?\s*/i, "").trim();
    jsonStr = jsonStr.replace(/```\s*$/i, "").trim();
  }

  // 2) If still surrounded by prose, find the outermost JSON object
  if (!jsonStr.startsWith("{") && !jsonStr.startsWith("[")) {
    const firstObj = jsonStr.indexOf("{");
    const firstArr = jsonStr.indexOf("[");
    let firstBrace: number;
    if (firstObj === -1) firstBrace = firstArr;
    else if (firstArr === -1) firstBrace = firstObj;
    else firstBrace = Math.min(firstObj, firstArr);

    if (firstBrace >= 0) {
      const closer = jsonStr[firstBrace] === "{" ? "}" : "]";
      const lastBrace = jsonStr.lastIndexOf(closer);
      if (lastBrace > firstBrace) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }
    }
  }

  // 3) First parse attempt
  try {
    return JSON.parse(jsonStr) as T;
  } catch (firstErr) {
    // 4) Attempt repair: remove trailing commas before } or ]
    try {
      const repaired = jsonStr.replace(/,(\s*[}\]])/g, "$1");
      return JSON.parse(repaired) as T;
    } catch (secondErr: any) {
      // 5) Last-ditch: response was truncated mid-stream due to token limit.
      // Salvage the partial JSON by cutting back to the last complete element
      // and sealing open structures — recovers e.g. 12 of 14 test cases instead
      // of discarding the entire AI response and falling back to boilerplate.
      try {
        const salvaged = salvageTruncatedJson(jsonStr);
        if (salvaged) {
          // Re-apply trailing-comma repair to the sealed output before parsing.
          const cleaned = salvaged.replace(/,(\s*[}\]])/g, "$1");
          return JSON.parse(cleaned) as T;
        }
      } catch {
        /* fall through */
      }
      throw new AiResponseParseError(
        `Failed to parse AI JSON: ${secondErr.message}`,
        rawContent.substring(0, 500)
      );
    }
  }
}

/**
 * Attempt to repair JSON that was truncated mid-stream (common with LLM token
 * limits — e.g. a 14-test-case response cut off inside test case #13).
 *
 * Strategy: walk the whole string tracking string-state and the bracket stack.
 * Every time a `}` or `]` closes (outside a string) we record a "safe point":
 * the position right after it plus a snapshot of the brackets still open. When
 * the walk ends inside a truncated structure we rewind to the last safe point —
 * the last fully-complete element — strip any dangling comma, and append the
 * closers needed to seal the snapshot. This recovers every complete test case
 * instead of throwing the entire AI response away and falling back to
 * generic rule-based boilerplate.
 *
 * Returns null if salvage is hopeless (no complete element ever closed).
 */
function salvageTruncatedJson(jsonStr: string): string | null {
  let inString = false;
  let escaped = false;
  const stack: string[] = []; // tracks open { [ characters
  // Last position right after a complete element closed, with the brackets
  // that were still open at that moment.
  let safePos = -1;
  let safeStack: string[] = [];

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{" || ch === "[") {
      stack.push(ch);
    } else if (ch === "}" || ch === "]") {
      stack.pop();
      // A complete value just closed at this depth — record it as safe, but
      // only once we're inside at least one container (don't truncate to "").
      if (stack.length > 0) {
        safePos = i + 1;
        safeStack = [...stack];
      } else {
        // Closed the root container: the whole thing is structurally complete.
        safePos = i + 1;
        safeStack = [];
      }
    }
  }

  // Nothing complete ever closed inside a container — give up.
  if (safePos < 0) return null;

  // If the root already closed cleanly, hand back the substring as-is.
  if (safeStack.length === 0) {
    return jsonStr.substring(0, safePos);
  }

  // Cut to the last complete element and drop any trailing comma / whitespace.
  let working = jsonStr.substring(0, safePos).replace(/[\s,]+$/, "");

  // Seal the still-open brackets, innermost (last-pushed) first.
  for (let i = safeStack.length - 1; i >= 0; i--) {
    working += safeStack[i] === "{" ? "}" : "]";
  }

  return working;
}

/**
 * Safe variant - returns null on parse failure instead of throwing.
 */
export function tryParseAiJson<T = any>(rawContent: string): T | null {
  try {
    return parseAiJson<T>(rawContent);
  } catch {
    return null;
  }
}
