/**
 * Application Profiles — AITAS
 * Defines per-app-type executor config, locator strategy, wait strategy, and AI prompt hints.
 */

export type AppType =
  | "web"
  | "salesforce"
  | "jde"
  | "sap_fiori"
  | "sap_gui"
  | "dotnet_desktop"
  | "java_desktop"
  | "mobile_ios"
  | "mobile_android"
  | "api_rest"
  | "api_soap"
  | "api_graphql";

export interface AppProfile {
  type: AppType;
  label: string;
  description: string;
  icon: string;
  category: "web" | "erp" | "desktop" | "mobile" | "api";
  executor: "playwright" | "selenium" | "winappdriver" | "appium" | "api" | "sap_gui";
  defaultFramework: string;
  locatorStrategy: string;
  waitStrategy: string;
  authTypes: string[];
  aiPromptHints: string;
  setupNotes: string;
  color: string;
}

export const APP_PROFILES: Record<AppType, AppProfile> = {
  web: {
    type: "web",
    label: "Web Application",
    description: "Standard web apps — React, Angular, Vue, plain HTML",
    icon: "Globe",
    category: "web",
    executor: "playwright",
    defaultFramework: "playwright",
    locatorStrategy: "CSS selectors, XPath, ARIA roles, text content",
    waitStrategy: "networkidle, domcontentloaded, element visibility",
    authTypes: ["basic", "oauth2", "session_cookie"],
    aiPromptHints:
      "Standard HTML elements. Use CSS selectors and ARIA roles. Handle SPAs with networkidle waits.",
    setupNotes: "No special setup required. Works out of the box with Playwright or Selenium.",
    color: "blue",
  },

  salesforce: {
    type: "salesforce",
    label: "Salesforce",
    description: "Salesforce Lightning, Classic, and Experience Cloud",
    icon: "Cloud",
    category: "web",
    executor: "playwright",
    defaultFramework: "playwright",
    locatorStrategy:
      "Shadow DOM piercing, data-component-id, lightning-* tags, slds-* classes",
    waitStrategy:
      "Wait for lightning spinner to disappear, networkidle, custom SF ready check",
    authTypes: ["salesforce_oauth", "saml_sso", "username_password"],
    aiPromptHints:
      "Salesforce Lightning uses Shadow DOM extensively. Use pierce >> selectors in Playwright. " +
      "Elements are inside web components like lightning-button, lightning-input. " +
      "Always wait for .slds-spinner to disappear before interacting. " +
      "Use data-id or title attributes for stable locators.",
    setupNotes:
      "Requires Salesforce Connected App for OAuth. Enable 'Allow OAuth Username-Password Flows' for test accounts. " +
      "Disable MFA for test users or use TOTP bypass.",
    color: "sky",
  },

  jde: {
    type: "jde",
    label: "JD Edwards (Oracle)",
    description: "JDE EnterpriseOne HTML Web Client and AIS REST API",
    icon: "Database",
    category: "erp",
    executor: "selenium",
    defaultFramework: "selenium",
    locatorStrategy:
      "JDE Form IDs (e.g. W01012A), field names (e.g. AN8, DOCO), QBE row selectors",
    waitStrategy:
      "Wait for JDE spinner (id=processingDiv), wait for form title, 120s page load timeout",
    authTypes: ["jde_token", "basic", "sso_saml"],
    aiPromptHints:
      "JDE EnterpriseOne HTML client has unique patterns: " +
      "Forms are identified by IDs like W4210A, P4210. " +
      "Fields use JDE data dictionary names (AN8=Address Book, DOCO=Document Number). " +
      "Grid rows use tr[id^='row'] selectors. " +
      "Always wait for id='processingDiv' to be hidden before next action. " +
      "Toolbar buttons use id='hc_Find', 'hc_OK', 'hc_Cancel'. " +
      "Use AIS REST API for data validation instead of UI queries.",
    setupNotes:
      "JDE AIS Server must be configured. Set AIS_BASE_URL and JDE_TOKEN in environment settings. " +
      "Recommended: use AIS REST API for data setup/teardown, UI for workflow testing.",
    color: "red",
  },

  sap_fiori: {
    type: "sap_fiori",
    label: "SAP Fiori / Web GUI",
    description: "SAP Fiori Launchpad, SAP Web GUI, SAP BTP apps",
    icon: "Layers",
    category: "erp",
    executor: "playwright",
    defaultFramework: "playwright",
    locatorStrategy:
      "data-sap-ui attributes, sap.ui.getCore() JS API, UI5 control IDs, Fiori tile IDs",
    waitStrategy:
      "Wait for sap.ui.getCore().isInitialized(), wait for BusyIndicator to hide, networkidle",
    authTypes: ["saml_sso", "basic", "oauth2", "kerberos"],
    aiPromptHints:
      "SAP Fiori uses SAPUI5 framework. Elements have data-sap-ui attributes. " +
      "Use sap.ui.getCore().byId('elementId') for stable element access via JS. " +
      "Fiori tiles are identified by their app ID. " +
      "Wait for sap.ui.getCore().isInitialized() before interacting. " +
      "OData services at /sap/opu/odata/ can be used for data validation.",
    setupNotes:
      "SAP SSO must be configured. For test accounts, disable SSO or use service user. " +
      "Enable SAP GUI Scripting in SAP system settings (RZ11: sapgui/user_scripting = TRUE).",
    color: "amber",
  },

  sap_gui: {
    type: "sap_gui",
    label: "SAP GUI (Desktop)",
    description: "SAP GUI for Windows — classic desktop client",
    icon: "Monitor",
    category: "desktop",
    executor: "sap_gui",
    defaultFramework: "sap_gui_scripting",
    locatorStrategy:
      "SAP GUI Scripting COM API — session.findById(), T-code navigation, field technical names",
    waitStrategy:
      "session.utils.waitForIdle(), check statusbar for completion messages",
    authTypes: ["sap_logon", "sso_kerberos", "saml"],
    aiPromptHints:
      "SAP GUI Desktop uses COM-based scripting. " +
      "Navigate via T-codes: session.findById('wnd[0]/tbar[0]/okcd').text = 'ME21N'. " +
      "Fields are accessed by their technical path: wnd[0]/usr/ctxtEKKO-LIFNR. " +
      "Use session.utils.waitForIdle() after each action. " +
      "Toolbar buttons: wnd[0]/tbar[1]/btn[8] = Save, btn[3] = Back. " +
      "Status bar: wnd[0]/sbar/pane[0] shows success/error messages.",
    setupNotes:
      "SAP GUI must be installed on the agent machine. " +
      "Enable scripting: SAP GUI Options > Accessibility & Scripting > Enable Scripting. " +
      "SAP system parameter: sapgui/user_scripting = TRUE.",
    color: "orange",
  },

  dotnet_desktop: {
    type: "dotnet_desktop",
    label: ".NET Desktop",
    description: "WinForms, WPF, MAUI, and legacy .NET desktop apps",
    icon: "AppWindow",
    category: "desktop",
    executor: "winappdriver",
    defaultFramework: "winappdriver",
    locatorStrategy:
      "AutomationId, ClassName, Name, XPath for UI Automation tree, AccessibilityId",
    waitStrategy:
      "Implicit wait 10s, explicit wait for element enabled/visible, process ready check",
    authTypes: ["windows_auth", "basic", "active_directory"],
    aiPromptHints:
      "WinForms/WPF apps use Windows UI Automation. " +
      "Best locator: AutomationId (set in designer as Name property). " +
      "Use ClassName for standard controls: Button, TextBox, ComboBox, DataGridView. " +
      "WPF: use AutomationProperties.AutomationId in XAML. " +
      "Handle modal dialogs by switching to new window handle. " +
      "Use Inspect.exe or Accessibility Insights to discover element properties.",
    setupNotes:
      "Install WinAppDriver from Microsoft. Run as Administrator. " +
      "Enable Developer Mode in Windows Settings. " +
      "Agent must run on Windows machine with the target app installed.",
    color: "violet",
  },

  java_desktop: {
    type: "java_desktop",
    label: "Java Desktop",
    description: "Java Swing, AWT, JavaFX desktop applications",
    icon: "Coffee",
    category: "desktop",
    executor: "appium",
    defaultFramework: "appium_java",
    locatorStrategy:
      "Java Accessibility API, component name, class name, Sikuli image recognition",
    waitStrategy:
      "Thread.sleep fallback, wait for component visible, JVM ready check",
    authTypes: ["basic", "ldap", "active_directory"],
    aiPromptHints:
      "Java Swing/AWT apps use Java Accessibility Bridge. " +
      "Enable JAB: Windows Accessibility settings > Java Access Bridge. " +
      "Components identified by: name, class (javax.swing.JButton), role. " +
      "For complex UIs without accessibility IDs, use Sikuli image-based recognition. " +
      "JavaFX apps support fx:id for stable locators.",
    setupNotes:
      "Enable Java Access Bridge: run 'jabswitch -enable' as admin. " +
      "Install Appium with appium-java-driver. " +
      "For Sikuli: install SikuliX and configure image library path.",
    color: "emerald",
  },

  mobile_ios: {
    type: "mobile_ios",
    label: "iOS Mobile",
    description: "Native iOS apps via Appium + XCUITest",
    icon: "Smartphone",
    category: "mobile",
    executor: "appium",
    defaultFramework: "appium_xcuitest",
    locatorStrategy:
      "accessibility id, XPath, class chain, predicate string, iOS class names",
    waitStrategy:
      "Implicit wait 10s, explicit wait for element, app state check",
    authTypes: ["biometric_bypass", "basic", "oauth2"],
    aiPromptHints:
      "iOS apps use XCUITest automation. " +
      "Best locator: accessibility id (set via accessibilityIdentifier in Xcode). " +
      "Use -ios class chain for complex hierarchies: **/XCUIElementTypeButton[`label == 'Login'`]. " +
      "Handle biometric auth by using Appium's biometric enrollment bypass. " +
      "App must be built with DEBUG configuration for testing.",
    setupNotes:
      "Requires macOS with Xcode installed. " +
      "Install Appium: npm install -g appium && appium driver install xcuitest. " +
      "For real devices: configure provisioning profile and device UDID.",
    color: "slate",
  },

  mobile_android: {
    type: "mobile_android",
    label: "Android Mobile",
    description: "Native Android apps via Appium + UIAutomator2",
    icon: "Smartphone",
    category: "mobile",
    executor: "appium",
    defaultFramework: "appium_uiautomator2",
    locatorStrategy:
      "accessibility id, resource-id, XPath, UIAutomator2 selectors, class name",
    waitStrategy:
      "Implicit wait 10s, explicit wait for element, app state check",
    authTypes: ["biometric_bypass", "basic", "oauth2"],
    aiPromptHints:
      "Android apps use UIAutomator2. " +
      "Best locator: resource-id (e.g. com.app.package:id/loginButton). " +
      "Use UIAutomator2 selector: new UiSelector().text('Login'). " +
      "Handle permissions dialogs automatically with Appium capabilities. " +
      "Enable USB debugging on device or use Android emulator.",
    setupNotes:
      "Install Android SDK and set ANDROID_HOME. " +
      "Install Appium: npm install -g appium && appium driver install uiautomator2. " +
      "Enable USB debugging on device. For emulator: use AVD Manager.",
    color: "green",
  },

  api_rest: {
    type: "api_rest",
    label: "REST API",
    description: "RESTful API testing — JSON, XML, form data",
    icon: "Zap",
    category: "api",
    executor: "api",
    defaultFramework: "axios",
    locatorStrategy: "HTTP methods, URL paths, JSON path, response status codes",
    waitStrategy: "Response timeout 30s, retry on 5xx, polling for async operations",
    authTypes: ["bearer_token", "oauth2", "api_key", "basic", "hmac"],
    aiPromptHints:
      "REST API testing. Generate test cases for: " +
      "Happy path (200/201), validation errors (400), auth errors (401/403), not found (404). " +
      "Include request headers, body schema validation, response time assertions. " +
      "Chain requests: login → get token → use token in subsequent calls. " +
      "Validate JSON schema against OpenAPI spec if available.",
    setupNotes:
      "No browser required. Configure base URL and auth in Environment settings. " +
      "Import OpenAPI/Swagger spec for auto-generated test cases.",
    color: "cyan",
  },

  api_soap: {
    type: "api_soap",
    label: "SOAP / Web Services",
    description: "SOAP web services, WSDL-based testing",
    icon: "FileCode",
    category: "api",
    executor: "api",
    defaultFramework: "soap",
    locatorStrategy: "WSDL operations, XPath on XML response, SOAPAction header",
    waitStrategy: "Response timeout 60s, retry on fault responses",
    authTypes: ["ws_security", "basic", "certificate"],
    aiPromptHints:
      "SOAP web service testing. " +
      "Parse WSDL to discover operations and message schemas. " +
      "Generate valid SOAP envelopes for each operation. " +
      "Validate XML response using XPath assertions. " +
      "Handle SOAP faults (faultcode, faultstring). " +
      "WS-Security: add UsernameToken or X.509 certificate to SOAP header.",
    setupNotes:
      "Provide WSDL URL for auto-discovery of operations. " +
      "For WS-Security, configure certificate in Environment settings.",
    color: "purple",
  },

  api_graphql: {
    type: "api_graphql",
    label: "GraphQL API",
    description: "GraphQL queries, mutations, and subscriptions",
    icon: "GitMerge",
    category: "api",
    executor: "api",
    defaultFramework: "graphql",
    locatorStrategy: "GraphQL operations, field paths, error paths",
    waitStrategy: "Response timeout 30s, subscription timeout 60s",
    authTypes: ["bearer_token", "api_key", "oauth2"],
    aiPromptHints:
      "GraphQL API testing. " +
      "Introspect schema to discover queries and mutations. " +
      "Test: successful query, missing required fields, invalid types, auth errors. " +
      "Validate response data structure matches schema. " +
      "Test pagination (first, after cursor). " +
      "Check errors array in response (GraphQL returns 200 even for errors).",
    setupNotes:
      "Provide GraphQL endpoint URL. Enable introspection for auto-discovery. " +
      "Configure auth token in Environment settings.",
    color: "pink",
  },
};

export const APP_PROFILE_CATEGORIES = {
  web: { label: "Web Applications", color: "blue" },
  erp: { label: "ERP Systems", color: "amber" },
  desktop: { label: "Desktop Applications", color: "violet" },
  mobile: { label: "Mobile Applications", color: "green" },
  api: { label: "API & Services", color: "cyan" },
};

export function getProfileByType(type: AppType): AppProfile {
  return APP_PROFILES[type] || APP_PROFILES.web;
}

export function getProfilesByCategory(category: AppProfile["category"]): AppProfile[] {
  return Object.values(APP_PROFILES).filter((p) => p.category === category);
}
