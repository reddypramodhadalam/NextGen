/**
 * SAP GUI Scripting Engine — AITAS Phase 3
 * Handles SAP GUI for Windows via COM-based scripting API
 * Generates VBScript/PowerShell automation scripts and executes them
 */

import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { getAiClient } from "./ai-client";
import { storage } from "./storage";
import type { TestCase, TestDataParam } from "@shared/schema";
import { sendExecutionNotifications } from "./notifications";

const execAsync = promisify(exec);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SAPGUIConfig {
  systemId: string;             // SAP system ID e.g. "S4H"
  client: string;               // SAP client e.g. "100"
  username: string;
  password: string;
  language?: string;            // e.g. "EN"
  connectionString?: string;    // Full connection string override
  sapGuiPath?: string;          // Path to sapgui.exe
  scriptTimeout?: number;       // Script execution timeout in ms
}

interface SAPGUICommand {
  action: "tcode" | "click" | "type" | "select" | "verify" | "wait" |
          "toolbar" | "menu" | "table_select" | "table_get" | "press_key" |
          "get_text" | "set_text" | "check_statusbar" | "save" | "back" |
          "enter" | "f4_help" | "scroll_table";
  path?: string;                // SAP GUI element path e.g. wnd[0]/usr/ctxtEKKO-LIFNR
  tcode?: string;               // Transaction code e.g. ME21N
  value?: string;
  toolbarButton?: string;       // Toolbar button ID e.g. btn[8] = Save
  menuPath?: string;            // Menu path e.g. "System/User Profile/Own Data"
  tableId?: string;             // Table/grid ID
  row?: number;
  column?: string;
  captureAs?: string;
  description: string;
}

// ─── AI Step Interpreter for SAP GUI ─────────────────────────────────────────

async function interpretSAPGUIStep(
  step: string,
  expected: string,
  currentTcode: string
): Promise<SAPGUICommand[]> {
  const aiClient = await getAiClient();

  const systemPrompt = `You are a SAP GUI scripting expert. Convert test steps to SAP GUI Scripting commands.
SAP GUI uses COM-based scripting with specific element paths.

Return ONLY a JSON array of commands:
[{
  "action": "tcode|click|type|select|verify|wait|toolbar|menu|table_select|table_get|press_key|get_text|set_text|check_statusbar|save|back|enter|f4_help|scroll_table",
  "path": "wnd[0]/usr/ctxtEKKO-LIFNR",
  "tcode": "ME21N",
  "value": "value to enter",
  "toolbarButton": "btn[8]",
  "menuPath": "System/User Profile",
  "tableId": "wnd[0]/usr/tblSAPLMEGATC_TC",
  "row": 0,
  "column": "MATNR",
  "captureAs": "variableName",
  "description": "what this does"
}]

SAP GUI SCRIPTING RULES:
1. Element paths: wnd[window]/container/element
   - wnd[0] = main window, wnd[1] = popup
   - usr = user area, tbar[0] = system toolbar, tbar[1] = application toolbar
   - mbar = menu bar, sbar = status bar
2. Element types in paths:
   - ctxt = text field (ctxtEKKO-LIFNR)
   - txt = text field (txtEKKO-EBELN)
   - btn = button (btn[8])
   - chk = checkbox (chkEKKO-KONNR)
   - rad = radio button
   - cbo = combo box
   - tab = tab strip
   - tbl = table control
   - shell = ALV grid
3. Common toolbar buttons:
   - btn[0] = Enter/Execute
   - btn[3] = Back
   - btn[8] = Save
   - btn[11] = Find
   - btn[15] = First page
   - btn[16] = Previous page
   - btn[17] = Next page
   - btn[18] = Last page
4. Status bar: wnd[0]/sbar/pane[0] — check for success/error messages
5. Transaction navigation: use tcode action
6. F4 help (value help): use f4_help action on field path
7. Table rows: wnd[0]/usr/tblXXX/txtXXX[column,row]
8. ALV grid: wnd[0]/usr/cntlXXX/shellcont/shell

COMMON PATHS:
- Vendor field: wnd[0]/usr/ctxtEKKO-LIFNR
- PO number: wnd[0]/usr/ctxtEKKO-EBELN
- Material: wnd[0]/usr/tblSAPLMEGATC_TC/ctxtMEPO1320-EMATN[0,0]
- Quantity: wnd[0]/usr/tblSAPLMEGATC_TC/txtMEPO1320-MENGE[0,0]
- Plant: wnd[0]/usr/tblSAPLMEGATC_TC/ctxtMEPO1320-WERKS[0,0]
- Status bar message: wnd[0]/sbar/pane[0]

Only return the JSON array.`;

  const userPrompt = `Current T-Code: ${currentTcode}
Step: "${step}"
Expected: "${expected}"`;

  try {
    const response = await aiClient.chat([{ role: "user", content: userPrompt }], systemPrompt);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as SAPGUICommand[];
  } catch (e: any) {
    console.error("[SAP GUI] AI interpretation failed:", e.message);
  }
  return [{ action: "verify", description: step }];
}

// ─── VBScript Generator ───────────────────────────────────────────────────────

function generateVBScript(
  config: SAPGUIConfig,
  commands: SAPGUICommand[],
  captureFile: string
): string {
  const lines: string[] = [];

  lines.push(`' AITAS SAP GUI Test Script`);
  lines.push(`' Generated: ${new Date().toISOString()}`);
  lines.push(``);
  lines.push(`Dim SapGuiAuto, application, connection, session`);
  lines.push(`Dim oCapture`);
  lines.push(``);
  lines.push(`' Connect to SAP GUI`);
  lines.push(`Set SapGuiAuto = GetObject("SAPGUI")`);
  lines.push(`Set application = SapGuiAuto.GetScriptingEngine`);
  lines.push(``);
  lines.push(`' Get or create connection`);
  lines.push(`If application.Connections.Count = 0 Then`);
  lines.push(`  Set connection = application.OpenConnection("${config.connectionString || config.systemId}", True)`);
  lines.push(`Else`);
  lines.push(`  Set connection = application.Connections(0)`);
  lines.push(`End If`);
  lines.push(``);
  lines.push(`Set session = connection.Sessions(0)`);
  lines.push(``);
  lines.push(`' Login if needed`);
  lines.push(`If session.Info.IsLowSpeedConnection = False Then`);
  lines.push(`  On Error Resume Next`);
  lines.push(`  session.findById("wnd[0]/usr/txtRSYST-MANDT").Text = "${config.client}"`);
  lines.push(`  session.findById("wnd[0]/usr/txtRSYST-BNAME").Text = "${config.username}"`);
  lines.push(`  session.findById("wnd[0]/usr/pwdRSYST-BCODE").Text = "${config.password}"`);
  lines.push(`  session.findById("wnd[0]/usr/txtRSYST-LANGU").Text = "${config.language || "EN"}"`);
  lines.push(`  session.findById("wnd[0]").sendVKey 0`);
  lines.push(`  On Error GoTo 0`);
  lines.push(`End If`);
  lines.push(``);
  lines.push(`' Initialize capture dictionary`);
  lines.push(`Set oCapture = CreateObject("Scripting.Dictionary")`);
  lines.push(``);
  lines.push(`' Test Steps`);
  lines.push(`Dim stepResult`);
  lines.push(`stepResult = ""`);
  lines.push(``);

  let stepNum = 0;
  for (const cmd of commands) {
    stepNum++;
    lines.push(`' Step ${stepNum}: ${cmd.description}`);
    lines.push(`On Error Resume Next`);

    switch (cmd.action) {
      case "tcode":
        lines.push(`session.findById("wnd[0]/tbar[0]/okcd").Text = "/${cmd.tcode || cmd.value}"`);
        lines.push(`session.findById("wnd[0]").sendVKey 0`);
        lines.push(`session.utils.waitForIdle()`);
        break;

      case "type":
      case "set_text":
        if (cmd.path && cmd.value !== undefined) {
          lines.push(`session.findById("${cmd.path}").Text = "${cmd.value}"`);
        }
        break;

      case "click":
        if (cmd.path) {
          lines.push(`session.findById("${cmd.path}").Press()`);
          lines.push(`session.utils.waitForIdle()`);
        }
        break;

      case "toolbar":
        if (cmd.toolbarButton) {
          lines.push(`session.findById("wnd[0]/tbar[1]/${cmd.toolbarButton}").Press()`);
          lines.push(`session.utils.waitForIdle()`);
        }
        break;

      case "save":
        lines.push(`session.findById("wnd[0]/tbar[0]/btn[11]").Press()`);
        lines.push(`session.utils.waitForIdle()`);
        break;

      case "back":
        lines.push(`session.findById("wnd[0]/tbar[0]/btn[3]").Press()`);
        lines.push(`session.utils.waitForIdle()`);
        break;

      case "enter":
        lines.push(`session.findById("wnd[0]").sendVKey 0`);
        lines.push(`session.utils.waitForIdle()`);
        break;

      case "press_key":
        const keyMap: Record<string, number> = {
          "Enter": 0, "F1": 112, "F2": 113, "F3": 114, "F4": 115,
          "F5": 116, "F6": 117, "F7": 118, "F8": 119, "F9": 120,
          "F10": 121, "F11": 122, "F12": 123, "Escape": 12,
        };
        const vKey = keyMap[cmd.value || "Enter"] || 0;
        lines.push(`session.findById("wnd[0]").sendVKey ${vKey}`);
        lines.push(`session.utils.waitForIdle()`);
        break;

      case "f4_help":
        if (cmd.path) {
          lines.push(`session.findById("${cmd.path}").SetFocus()`);
          lines.push(`session.findById("wnd[0]").sendVKey 4`);
          lines.push(`session.utils.waitForIdle()`);
        }
        break;

      case "select":
        if (cmd.path && cmd.value) {
          lines.push(`session.findById("${cmd.path}").Key = "${cmd.value}"`);
        }
        break;

      case "table_select":
        if (cmd.tableId && cmd.row !== undefined) {
          lines.push(`session.findById("${cmd.tableId}").SelectedRows = "${cmd.row}"`);
        }
        break;

      case "get_text":
      case "verify":
        if (cmd.path) {
          lines.push(`Dim val${stepNum}`);
          lines.push(`val${stepNum} = session.findById("${cmd.path}").Text`);
          if (cmd.captureAs) {
            lines.push(`oCapture("${cmd.captureAs}") = val${stepNum}`);
          }
          if (cmd.value) {
            lines.push(`If InStr(val${stepNum}, "${cmd.value}") = 0 Then`);
            lines.push(`  stepResult = stepResult & "FAIL:Step${stepNum}:Expected '${cmd.value}' got '" & val${stepNum} & "'" & Chr(10)`);
            lines.push(`End If`);
          }
        }
        break;

      case "check_statusbar":
        lines.push(`Dim sbar${stepNum}`);
        lines.push(`sbar${stepNum} = session.findById("wnd[0]/sbar/pane[0]").Text`);
        if (cmd.captureAs) {
          lines.push(`oCapture("${cmd.captureAs}") = sbar${stepNum}`);
        }
        if (cmd.value) {
          lines.push(`If InStr(sbar${stepNum}, "${cmd.value}") = 0 Then`);
          lines.push(`  stepResult = stepResult & "FAIL:Step${stepNum}:StatusBar expected '${cmd.value}' got '" & sbar${stepNum} & "'" & Chr(10)`);
          lines.push(`End If`);
        }
        break;

      case "menu":
        if (cmd.menuPath) {
          const parts = cmd.menuPath.split("/");
          lines.push(`session.findById("wnd[0]/mbar").FindByName("${parts[0]}", 111).Select()`);
          if (parts[1]) {
            lines.push(`session.findById("wnd[0]/mbar").FindByName("${parts[1]}", 111).Select()`);
          }
          lines.push(`session.utils.waitForIdle()`);
        }
        break;

      case "wait":
        lines.push(`session.utils.waitForIdle()`);
        if (cmd.value) {
          lines.push(`WScript.Sleep ${cmd.value}`);
        }
        break;

      case "scroll_table":
        if (cmd.tableId) {
          lines.push(`session.findById("${cmd.tableId}").VerticalScrollbar.Position = ${cmd.row || 0}`);
        }
        break;
    }

    lines.push(`If Err.Number <> 0 Then`);
    lines.push(`  stepResult = stepResult & "ERROR:Step${stepNum}:" & Err.Description & Chr(10)`);
    lines.push(`  Err.Clear`);
    lines.push(`End If`);
    lines.push(`On Error GoTo 0`);
    lines.push(``);
  }

  // Write results to capture file
  lines.push(`' Write results`);
  lines.push(`Dim fso, f`);
  lines.push(`Set fso = CreateObject("Scripting.FileSystemObject")`);
  lines.push(`Set f = fso.CreateTextFile("${captureFile.replace(/\\/g, "\\\\")}", True)`);
  lines.push(`f.WriteLine "RESULT:" & stepResult`);
  lines.push(`Dim key`);
  lines.push(`For Each key In oCapture.Keys`);
  lines.push(`  f.WriteLine "CAPTURE:" & key & "=" & oCapture(key)`);
  lines.push(`Next`);
  lines.push(`f.Close`);
  lines.push(``);
  lines.push(`WScript.Quit 0`);

  return lines.join("\r\n");
}

// ─── PowerShell Wrapper ───────────────────────────────────────────────────────

function generatePowerShellWrapper(vbsPath: string, timeout: number): string {
  return `
$ErrorActionPreference = "Stop"
$timeout = ${timeout}
$proc = Start-Process -FilePath "cscript.exe" -ArgumentList "//NoLogo", "${vbsPath.replace(/\\/g, "\\\\")}" -PassThru -WindowStyle Hidden
$completed = $proc.WaitForExit($timeout)
if (-not $completed) {
  $proc.Kill()
  Write-Error "SAP GUI script timed out after ${timeout}ms"
  exit 1
}
exit $proc.ExitCode
`.trim();
}

// ─── Main SAP GUI Executor ────────────────────────────────────────────────────

export class SAPGUIExecutor {
  private capturedVars = new Map<string, any>();
  private currentTcode = "";

  async runExecution(
    executionId: string,
    testCases: TestCase[],
    config: SAPGUIConfig,
    testData?: TestDataParam[]
  ): Promise<void> {
    const startTime = Date.now();
    await storage.updateExecution(executionId, { status: "running", startedAt: new Date() });

    let passedTests = 0;
    let failedTests = 0;
    const allLogs: string[] = [];
    const tdMap = new Map<string, string>();
    testData?.forEach((td) => tdMap.set(td.key, td.value));

    try {
      allLogs.push(`[SAP GUI] Starting execution for system ${config.systemId}`);

      for (const testCase of testCases) {
        const result = await this.executeTestCase(testCase, config, tdMap, allLogs);
        await storage.createResult({
          executionId,
          testCaseId: testCase.id,
          status: result.passed ? "passed" : "failed",
          duration: result.duration,
          errorMessage: result.errorMessage || null,
          logs: result.logs,
        });
        if (result.passed) passedTests++;
        else failedTests++;
      }
    } catch (error: any) {
      allLogs.push(`[SAP GUI] Fatal error: ${error.message}`);
      failedTests = testCases.length - passedTests;
    } finally {
      const duration = Date.now() - startTime;
      const finalStatus = failedTests > 0 ? "failed" : "passed";
      await storage.updateExecution(executionId, {
        status: finalStatus, completedAt: new Date(),
        passedTests, failedTests, totalTests: testCases.length,
      });
      const execution = await storage.getExecution(executionId);
      if (execution) {
        const suite = execution.suiteId ? await storage.getTestSuite(execution.suiteId) : null;
        await sendExecutionNotifications({
          executionId, suiteName: suite?.name || "SAP GUI Tests",
          status: finalStatus, totalTests: testCases.length,
          passedTests, failedTests, duration,
          environment: execution.environment || "production",
          targetUrl: `sap://${config.systemId}`,
        });
      }
    }
  }

  private async executeTestCase(
    testCase: TestCase,
    config: SAPGUIConfig,
    tdMap: Map<string, string>,
    globalLogs: string[]
  ): Promise<{ passed: boolean; duration: number; errorMessage?: string; logs: string[] }> {
    const logs: string[] = [];
    const startTime = Date.now();
    let passed = true;
    let errorMessage: string | undefined;

    logs.push(`\n=== SAP GUI TEST: ${testCase.title} ===`);
    const steps = (testCase.steps as { step: string; expected: string }[]) || [];

    // Collect all commands for the test case
    const allCommands: SAPGUICommand[] = [];

    for (let i = 0; i < steps.length; i++) {
      const { step, expected } = steps[i];
      const processedStep = this.replacePlaceholders(step, tdMap);
      const processedExpected = this.replacePlaceholders(expected, tdMap);
      logs.push(`\n--- Step ${i + 1}: ${processedStep} ---`);

      try {
        const commands = await interpretSAPGUIStep(processedStep, processedExpected, this.currentTcode);
        allCommands.push(...commands);

        // Track current tcode
        const tcodeCmd = commands.find((c) => c.action === "tcode");
        if (tcodeCmd?.tcode) this.currentTcode = tcodeCmd.tcode;

        logs.push(`  → ${commands.length} command(s) generated`);
      } catch (error: any) {
        logs.push(`  ✗ Step ${i + 1} AI interpretation failed: ${error.message}`);
      }
    }

    // Generate and execute VBScript
    try {
      const captureFile = join(tmpdir(), `aitas_sap_${Date.now()}.txt`);
      const vbsFile = join(tmpdir(), `aitas_sap_${Date.now()}.vbs`);
      const ps1File = join(tmpdir(), `aitas_sap_${Date.now()}.ps1`);

      const vbsContent = generateVBScript(config, allCommands, captureFile);
      const ps1Content = generatePowerShellWrapper(vbsFile, config.scriptTimeout || 120000);

      await writeFile(vbsFile, vbsContent, "utf8");
      await writeFile(ps1File, ps1Content, "utf8");

      logs.push(`[SAP GUI] Executing VBScript (${allCommands.length} commands)...`);

      try {
        const { stdout, stderr } = await execAsync(
          `powershell.exe -ExecutionPolicy Bypass -File "${ps1File}"`,
          { timeout: (config.scriptTimeout || 120000) + 10000 }
        );

        if (stdout) logs.push(`[SAP GUI] Output: ${stdout.trim()}`);
        if (stderr) logs.push(`[SAP GUI] Stderr: ${stderr.trim()}`);

        // Read capture file
        try {
          const captureContent = await readFile(captureFile, "utf8");
          const lines = captureContent.split("\n");

          for (const line of lines) {
            if (line.startsWith("RESULT:")) {
              const result = line.substring(7).trim();
              if (result && result.includes("FAIL:")) {
                passed = false;
                errorMessage = result.replace(/FAIL:/g, "").replace(/ERROR:/g, "");
                logs.push(`[SAP GUI] Test FAILED: ${errorMessage}`);
              } else if (result && result.includes("ERROR:")) {
                passed = false;
                errorMessage = result.replace(/ERROR:/g, "");
                logs.push(`[SAP GUI] Script ERROR: ${errorMessage}`);
              } else {
                logs.push(`[SAP GUI] Test PASSED`);
              }
            } else if (line.startsWith("CAPTURE:")) {
              const [key, ...valueParts] = line.substring(8).split("=");
              const value = valueParts.join("=").trim();
              this.capturedVars.set(key.trim(), value);
              logs.push(`[SAP GUI] Captured: ${key.trim()} = ${value}`);
            }
          }
        } catch {
          logs.push(`[SAP GUI] Warning: Could not read capture file`);
        }
      } catch (execError: any) {
        // SAP GUI not available — generate script for manual execution
        logs.push(`[SAP GUI] Note: SAP GUI not available on this machine.`);
        logs.push(`[SAP GUI] Generated VBScript saved to: ${vbsFile}`);
        logs.push(`[SAP GUI] Script content preview:`);
        logs.push(vbsContent.substring(0, 500) + "...");
        passed = false;
        errorMessage = "SAP GUI not available — script generated for manual execution";
      }

      // Cleanup temp files
      await Promise.allSettled([
        unlink(vbsFile).catch(() => {}),
        unlink(ps1File).catch(() => {}),
        unlink(captureFile).catch(() => {}),
      ]);
    } catch (error: any) {
      logs.push(`  ✗ Script execution failed: ${error.message}`);
      passed = false;
      errorMessage = error.message;
    }

    globalLogs.push(...logs);
    return { passed, duration: Date.now() - startTime, errorMessage, logs };
  }

  /** Generate a standalone VBScript for a test case (for download/manual use) */
  async generateScript(testCase: TestCase, config: SAPGUIConfig, testData?: TestDataParam[]): Promise<string> {
    const tdMap = new Map<string, string>();
    testData?.forEach((td) => tdMap.set(td.key, td.value));

    const steps = (testCase.steps as { step: string; expected: string }[]) || [];
    const allCommands: SAPGUICommand[] = [];

    for (const { step, expected } of steps) {
      const processedStep = this.replacePlaceholders(step, tdMap);
      const processedExpected = this.replacePlaceholders(expected, tdMap);
      const commands = await interpretSAPGUIStep(processedStep, processedExpected, this.currentTcode);
      allCommands.push(...commands);
    }

    return generateVBScript(config, allCommands, "C:\\temp\\aitas_capture.txt");
  }

  private replacePlaceholders(text: string, tdMap: Map<string, string>): string {
    let result = text;
    tdMap.forEach((v, k) => { result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "gi"), v); });
    return result;
  }
}

export const sapGuiExecutor = new SAPGUIExecutor();
