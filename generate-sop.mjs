import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, Header, Footer,
  SimpleField, NumberFormat, ShadingType, VerticalAlign } from 'docx';
import fss from 'fs';
const R='CC0000',BL='0066CC',TL='006666',LG='F5F7FA',MG='D0D8E4',DG='444444';
const TX='1A1A2E',WH='FFFFFF',SC='006633',F='Calibri';
function PB(){return new Paragraph({children:[new TextRun('')],pageBreakBefore:true})}
function SP(){return new Paragraph({children:[new TextRun('')],spacing:{after:120}})}
function H1(t){return new Paragraph({children:[new TextRun({text:t,font:F,bold:true,size:40,color:R})],heading:HeadingLevel.HEADING_1,spacing:{before:480,after:200},border:{bottom:{style:BorderStyle.SINGLE,size:6,color:R,space:4}}})}
function H2(t){return new Paragraph({children:[new TextRun({text:t,font:F,bold:true,size:32,color:BL})],heading:HeadingLevel.HEADING_2,spacing:{before:360,after:160},border:{bottom:{style:BorderStyle.SINGLE,size:2,color:MG,space:2}}})}
function H3(t){return new Paragraph({children:[new TextRun({text:t,font:F,bold:true,size:26,color:TL})],heading:HeadingLevel.HEADING_3,spacing:{before:240,after:100}})}
function BD(t){return new Paragraph({children:[new TextRun({text:t,font:F,size:22,color:TX})],spacing:{after:120,before:60}})}
function BUL(t,lv){lv=lv||0;return new Paragraph({children:[new TextRun({text:t,font:F,size:22,color:TX})],bullet:{level:lv},spacing:{after:80,before:40}})}
function ST(n,t,d){
  var runs=[new TextRun({text:'Step '+n+': ',font:F,bold:true,size:22,color:R}),new TextRun({text:t,font:F,bold:true,size:22,color:TX})];
  if(d) runs.push(new TextRun({text:'  — '+d,font:F,size:20,color:DG,italics:true}));
  return new Paragraph({children:runs,spacing:{after:120,before:120},indent:{left:360},shading:{type:ShadingType.SOLID,color:'FFF8F8',fill:'FFF8F8'},border:{left:{style:BorderStyle.THICK,size:8,color:R,space:4}}});
}
function TIP(t){return new Paragraph({children:[new TextRun({text:'TIP:  ',font:F,bold:true,size:20,color:SC}),new TextRun({text:t,font:F,size:20,color:TX})],spacing:{after:100,before:100},indent:{left:360},shading:{type:ShadingType.SOLID,color:'F0FFF4',fill:'F0FFF4'},border:{left:{style:BorderStyle.THICK,size:8,color:SC,space:4}}})}
function WN(t){return new Paragraph({children:[new TextRun({text:'WARNING:  ',font:F,bold:true,size:20,color:R}),new TextRun({text:t,font:F,size:20,color:TX,italics:true})],spacing:{after:100,before:100},indent:{left:360},shading:{type:ShadingType.SOLID,color:'FFF0F0',fill:'FFF0F0'},border:{left:{style:BorderStyle.THICK,size:8,color:R,space:4}}})}
function NT(t){return new Paragraph({children:[new TextRun({text:'NOTE:  ',font:F,bold:true,size:20,color:BL}),new TextRun({text:t,font:F,size:20,color:TX,italics:true})],spacing:{after:100,before:100},indent:{left:360},shading:{type:ShadingType.SOLID,color:'F0F8FF',fill:'F0F8FF'},border:{left:{style:BorderStyle.THICK,size:8,color:BL,space:4}}})}
function mkTbl(headers,rows,cw){
  function hCell(h,i){return new TableCell({children:[new Paragraph({children:[new TextRun({text:h,font:F,bold:true,size:20,color:WH})],alignment:AlignmentType.CENTER,spacing:{after:60,before:60}})],shading:{type:ShadingType.SOLID,color:R,fill:R},width:{size:cw?cw[i]:Math.floor(9000/headers.length),type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER})}
  function bCell(cell,ci,ri,row){return new TableCell({children:[new Paragraph({children:[new TextRun({text:String(cell),font:F,size:20,color:TX})],spacing:{after:60,before:60}})],shading:{type:ShadingType.SOLID,color:ri%2===0?LG:WH,fill:ri%2===0?LG:WH},width:{size:cw?cw[ci]:Math.floor(9000/row.length),type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER})}
  var hRow=new TableRow({children:headers.map(function(h,i){return hCell(h,i)}),tableHeader:true});
  var bRows=rows.map(function(row,ri){return new TableRow({children:row.map(function(c,ci){return bCell(c,ci,ri,row)})})});
  var widths=cw||headers.map(function(){return Math.floor(9000/headers.length)});
  return new Table({columnWidths:widths,rows:[hRow].concat(bRows),width:{size:9000,type:WidthType.DXA},margins:{top:80,bottom:80,left:120,right:120},borders:{top:{style:BorderStyle.SINGLE,size:4,color:R},bottom:{style:BorderStyle.SINGLE,size:4,color:R},left:{style:BorderStyle.SINGLE,size:4,color:R},right:{style:BorderStyle.SINGLE,size:4,color:R},insideH:{style:BorderStyle.SINGLE,size:2,color:MG},insideV:{style:BorderStyle.SINGLE,size:2,color:MG}}});
}
function mkHdr(){
  function noB(){return {top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}}}
  var c1=new TableCell({children:[new Paragraph({children:[new TextRun({text:'BAXTER',font:F,bold:true,size:28,color:R}),new TextRun({text:'  |  AITAS Platform',font:F,size:22,color:BL,bold:true})]})],width:{size:5500,type:WidthType.DXA},borders:noB()});
  var c2=new TableCell({children:[new Paragraph({children:[new TextRun({text:'Standard Operating Procedure',font:F,size:18,color:DG,italics:true})],alignment:AlignmentType.RIGHT})],width:{size:3500,type:WidthType.DXA},borders:noB()});
  return new Header({children:[new Table({columnWidths:[5500,3500],rows:[new TableRow({children:[c1,c2]})],width:{size:9000,type:WidthType.DXA},borders:{top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.SINGLE,size:4,color:R},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE},insideH:{style:BorderStyle.NONE},insideV:{style:BorderStyle.NONE}}})]});
}
function mkFtr(){
  function noB(){return {top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}}}
  function topB(){return {top:{style:BorderStyle.SINGLE,size:4,color:R},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}}}
  var c1=new TableCell({children:[new Paragraph({children:[new TextRun({text:'CONFIDENTIAL',font:F,size:16,color:R,bold:true})]})],width:{size:3500,type:WidthType.DXA},borders:topB()});
  var c2=new TableCell({children:[new Paragraph({children:[new TextRun({text:'SOP-AITAS-001  |  Rev 1.0  |  Baxter  |  2025',font:F,size:16,color:DG})],alignment:AlignmentType.CENTER})],width:{size:2000,type:WidthType.DXA},borders:topB()});
  var c3=new TableCell({children:[new Paragraph({children:[new TextRun({text:'Page ',font:F,size:16,color:DG}),new SimpleField({instruction:'PAGE',cachedValue:'1'})],alignment:AlignmentType.RIGHT})],width:{size:3500,type:WidthType.DXA},borders:topB()});
  return new Footer({children:[new Table({columnWidths:[3500,2000,3500],rows:[new TableRow({children:[c1,c2,c3]})],width:{size:9000,type:WidthType.DXA},borders:{top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE},insideH:{style:BorderStyle.NONE},insideV:{style:BorderStyle.NONE}}})]});
}
// DOCUMENT CONTENT
var children = [];
var C = children;
function p(x){C.push(x)}
p(new Paragraph({children:[new TextRun('')],spacing:{before:1800,after:80}}));
p(new Paragraph({children:[new TextRun({text:'BAXTER',font:F,bold:true,size:80,color:R})],alignment:AlignmentType.CENTER,spacing:{after:60}}));
p(new Paragraph({children:[new TextRun({text:'International Inc.',font:F,size:32,color:DG})],alignment:AlignmentType.CENTER,spacing:{after:360}}));
p(new Paragraph({children:[new TextRun({text:'Standard Operating Procedure',font:F,size:28,color:DG,italics:true})],alignment:AlignmentType.CENTER,spacing:{after:80}}));
p(new Paragraph({children:[new TextRun({text:'AITAS Platform',font:F,bold:true,size:80,color:TX})],alignment:AlignmentType.CENTER,spacing:{after:80}}));
p(new Paragraph({children:[new TextRun({text:'How to Use the AI-Powered Test Automation System',font:F,bold:true,size:36,color:BL})],alignment:AlignmentType.CENTER,spacing:{after:80}}));
p(new Paragraph({children:[new TextRun({text:'A Step-by-Step Guide for All Users — Layman Friendly',font:F,size:26,color:DG,italics:true})],alignment:AlignmentType.CENTER,spacing:{after:600}}));
p(new Paragraph({border:{top:{style:BorderStyle.SINGLE,size:4,color:R},bottom:{style:BorderStyle.SINGLE,size:4,color:R}},children:[new TextRun({text:'SOP: SOP-AITAS-001   |   Version 1.0   |   CONFIDENTIAL   |   June 2025',font:F,bold:true,size:22,color:R})],alignment:AlignmentType.CENTER,spacing:{before:200,after:200}}));
p(PB()); p(H1('SOP Document Information'));
p(mkTbl(['Field','Details'],[['SOP Title','How to Use AITAS — AI-Powered Test Automation System'],['SOP Number','SOP-AITAS-001'],['Version','1.0'],['Status','APPROVED'],['Owner','Baxter QA Engineering'],['Effective Date','June 2025'],['Applicability','All QA Engineers, Testers, Reviewers and Managers']],[2800,6200]));
p(SP()); p(NT('This SOP is written so that ANY user — regardless of technical background — can follow it. If you can send an email and browse the internet, you can use AITAS.'));
p(PB()); p(H1('Table of Contents'));
var tocItems=[['1','Purpose and Scope','4'],['2','Before You Start','5'],['3','Logging In','6'],['4','Creating Tests with AI','7'],['5','Managing Your Test Repository','10'],['6','Running Tests','12'],['7','Reviewing AI Content (Governance)','15'],['8','Using the Knowledge Hub','17'],['9','CI/CD Pipeline Integration','19'],['10','Autonomous Test Agents','21'],['11','Reading Reports and Analytics','23'],['12','Troubleshooting','25'],['13','Frequently Asked Questions','27'],['14','Quick Reference Card','29']];
tocItems.forEach(function(item){p(new Paragraph({children:[new TextRun({text:item[0]+'  '+item[1],font:F,size:22,color:TX}),new TextRun({text:'  ..................  ',font:F,size:22,color:MG}),new TextRun({text:item[2],font:F,size:22,color:BL,bold:true})],spacing:{after:80,before:40},indent:{left:item[0].includes('.')?400:0}}))});
// SECTION 1
p(PB()); p(H1('1. Purpose and Scope'));
p(H2('1.1 What is this SOP for?'));
p(BD('This Standard Operating Procedure (SOP) tells you exactly how to use the AITAS platform to create, run, and review automated software tests. Think of it as a recipe book — follow the steps in order and you will get the right result.'));
p(BD('You do NOT need to know how to code to use AITAS. The AI does the hard work for you.'));
p(H2('1.2 Who should use this SOP?'));
p(mkTbl(['Your Job Role','What You Can Do in AITAS'],[['QA Engineer','Create test suites, generate test cases with AI, run tests, view results'],['QA Reviewer','Review and approve AI-generated test cases, provide e-signature'],['QA Manager','View dashboards, coverage reports, export compliance documentation'],['Developer','View execution results, set up CI/CD triggers, view API test results'],['Admin','Manage users, configure platform settings, manage environments']],[3500,5500]));
p(H2('1.3 Scope'));
p(BUL('This SOP covers: creating tests, running tests, reviewing AI results, using the Knowledge Hub, CI/CD setup, and compliance controls.'));
p(BUL('This SOP does NOT cover: server installation, database administration, or writing custom code.'));
// SECTION 2 — PREREQUISITES
p(PB()); p(H1('2. Before You Start — What You Need'));
p(H2('2.1 Requirements'));
p(BUL('A web browser — Google Chrome or Microsoft Edge recommended.'));
p(BUL('Your AITAS username and password — provided by your Admin.'));
p(BUL('The URL of your AITAS instance — e.g., https://aitas.baxter.com.'));
p(BUL('The URL of the application you want to test.'));
p(BUL('Optional: a requirements document in Word, PDF, or PowerPoint format.'));
p(H2('2.2 What AITAS Does For You'));
p(BD('Think of AITAS as a very smart QA assistant that:'));
p(BUL('Reads your requirements and writes test cases automatically — in seconds.'));
p(BUL('Runs those tests on any application: SAP, Salesforce, websites, APIs, mobile.'));
p(BUL('Fixes broken tests automatically when something changes on the screen.'));
p(BUL('Records a video of every test so you can see exactly what happened.'));
p(BUL('Keeps a cryptographically signed record of everything for compliance.'));
// SECTION 3 — LOGIN
p(PB()); p(H1('3. Logging In'));
p(ST('1','Open your browser','Go to the AITAS URL, e.g., https://aitas.baxter.com'));
p(ST('2','Enter your Username and Password','Your username is your Baxter email. Contact Admin if you forgot your password.'));
p(ST('3','Click the Sign In button','You will be taken to the AITAS Dashboard.'));
p(ST('4','Check the Dashboard','You should see: total test cases, recent executions, agent status, and quick actions.'));
p(TIP('Bookmark the AITAS URL. Your session stays active for 8 hours.'));
p(WN('Do NOT share your password. Your login is your electronic identity — all actions are logged against your account.'));
// SECTION 4 — CREATING TESTS
p(PB()); p(H1('4. Creating Test Cases with AI'));
p(BD('This is the most powerful feature. Instead of writing test steps manually, you describe what you want to test in plain English and the AI creates complete test cases in seconds.'));
p(H2('4.1 Step-by-Step: Generate Tests'));
p(ST('1','Click AI Generator in the left navigation','This opens the Test Case Generator page.'));
p(ST('2','Select your Application Type','Choose: Web Application, SAP Fiori, SAP GUI, Salesforce, Oracle JDE, REST API, or Mobile.'));
p(ST('3','Select your Target Environment','Choose: Development, Staging, or Production. Always use Staging unless told otherwise.'));
p(ST('4','Type your requirement in the text box','Plain English only. Example: Users must be able to log in using email and password. Invalid passwords show an error. After 5 failures, the account locks.'));
p(ST('5','Click Generate Test Cases','The AI thinks for 5 to 15 seconds and displays the generated test cases.'));
p(ST('6','Review the generated test cases','Each shows: a title, preconditions, step-by-step actions, and expected results.'));
p(ST('7','Click Save to Repository','Saves all generated test cases to your repository in a new or existing test suite.'));
p(NT('The AI typically generates 4 to 8 test cases per requirement, covering the main scenario plus edge cases and error conditions.'));
p(H2('4.2 Understanding Each Test Case Field'));
p(mkTbl(['Field','What It Means','Example'],[['Title','Short name for the test','TC-001: Login with valid credentials'],['Priority','How important this test is','HIGH, MEDIUM, or LOW'],['Preconditions','What must be true before starting','User account must exist'],['Steps','Exact actions to perform','1. Go to login page  2. Enter email  3. Click Login'],['Expected Result','What should happen','User is redirected to the Dashboard'],['Status','Whether ready to run','DRAFT (needs review) or APPROVED']],[2000,3000,4000]));
p(H2('4.3 Script Generation'));
p(BD('From any test case, AITAS can generate executable automation scripts. Click the Generate Script button on any test case.'));
p(mkTbl(['Framework','Languages Supported'],[['Playwright','TypeScript, JavaScript, Python, Java, C#'],['Selenium WebDriver','TypeScript, JavaScript, Python, Java, C#'],['Puppeteer','TypeScript, JavaScript'],['Cypress','TypeScript, JavaScript']],[2500,6500]));
p(PB()); p(H1('5. Managing Your Test Repository'));
p(H2('5.1 Viewing Test Suites'));
p(ST('1','Click Repository in the left navigation','See all test suites (groups of related test cases).'));
p(ST('2','Click on a suite name to expand it','See all test cases inside that suite.'));
p(ST('3','Click on a test case to view details','Shows all steps, expected results, and status.'));
p(H2('5.2 Editing a Test Case'));
p(ST('1','Open the test case you want to edit','Click its title in the repository list.'));
p(ST('2','Click the Edit button (pencil icon)','The test case fields become editable.'));
p(ST('3','Make your changes','Update steps, expected results, preconditions, or priority.'));
p(ST('4','Click Save Changes','Your changes are stored immediately.'));
p(WN('If the system is in VALIDATED mode, editing any test case resets it to DRAFT status. A reviewer must re-approve it before it can run. This is a legal compliance requirement.'));
p(H2('5.3 Test Priority Guide'));
p(BUL('CRITICAL: Must pass before any release. Blocks deployment if it fails.'));
p(BUL('HIGH: Core functionality. Should always pass.'));
p(BUL('MEDIUM: Important but not a release blocker.'));
p(BUL('LOW: Edge cases and nice-to-have tests.'));
p(H2('5.4 Creating a Test Suite Manually'));
p(ST('1','Click Repository then click New Suite','The Create Test Suite dialog opens.'));
p(ST('2','Enter a name and description','Example name: Login and Authentication Tests'));
p(ST('3','Add tags','Tags help organize suites. Example: authentication, regression, smoke'));
p(ST('4','Click Create Suite','The suite is created and ready for test cases.'));
p(PB()); p(H1('6. Running Tests — Execution'));
p(BD('Running tests in AITAS is as simple as clicking a button. AITAS handles all the automation in the background.'));
p(H2('6.1 Running a Test Suite'));
p(ST('1','Go to Executions in the left navigation','Click the Executions menu item.'));
p(ST('2','Click New Execution or Run Tests','The execution setup dialog opens.'));
p(ST('3','Select the Test Suite','Choose from the dropdown list of available suites.'));
p(ST('4','Select the Target URL','Enter the application URL, or pick from saved environments.'));
p(ST('5','Select the Framework','Playwright (recommended for web), Selenium, SAP Fiori, Salesforce, REST API, or Mobile.'));
p(ST('6','Select the Environment','Choose: Development, Staging, or Production.'));
p(ST('7','Click Start Execution','Tests begin running. A live progress bar and real-time status appear for each test.'));
p(ST('8','Watch results in real time','Each test shows: Running (spinning), Passed (green), Failed (red), or Skipped (grey).'));
p(ST('9','When finished, click View Report','Opens the detailed execution report with screenshots, videos, and analytics.'));
p(TIP('You can navigate away while tests run — AITAS continues in the background. Return to Executions to check progress.'));
p(H2('6.2 Understanding Test Statuses'));
p(mkTbl(['Status','What It Means','What To Do'],[['PASSED (green)','Test ran and got the expected result','Nothing — great!'],['FAILED (red)','Test ran but result was unexpected','Click the test to see the error and screenshot. Check if it is a real bug.'],['HEALED (orange)','Test failed, AI fixed it, re-ran successfully','Check the AI Healer page to confirm the fix is correct.'],['SKIPPED (grey)','Test did not run (previous failure blocked it)','Investigate why earlier tests failed.'],['RUNNING (blue)','Currently executing','Wait for completion.']],[2000,3500,3500]));
p(H2('6.3 Evidence Captured Automatically'));
p(BD('For every test execution, AITAS automatically captures the following evidence:'));
p(BUL('A screenshot at each individual test step.'));
p(BUL('A full video recording of the entire test run.'));
p(BUL('Network request logs showing every API call the application made.'));
p(BUL('Performance metrics: page load time, LCP, FID, and CLS scores.'));
p(NT('All evidence is stored securely and linked to the execution record. In VALIDATED mode, evidence must be reviewed before upload to an external quality system.'));
p(PB()); p(H1('7. Reviewing AI-Generated Content (Governance)'));
p(BD('If your system is in VALIDATED mode — required for pharmaceutical and GxP compliance — all AI-generated content must be reviewed and approved by a human before execution.'));
p(H2('7.1 Why Is Review Required?'));
p(BD('In regulated environments, you must be able to prove that a qualified human verified the AI output before it was used in testing. This is the same principle as a doctor reviewing an AI diagnosis before treating a patient.'));
p(H2('7.2 Finding Tests Awaiting Review'));
p(ST('1','Click Governance in the left navigation','The governance dashboard opens.'));
p(ST('2','Look at the Pending Review section','A list of DRAFT test cases waiting for human approval.'));
p(ST('3','Click on a test case to review it','The full test case content opens.'));
p(H2('7.3 Approving a Test Case'));
p(ST('1','Read every step and expected result carefully','Ask yourself: Does this test accurately reflect the requirement?'));
p(ST('2','If the test case is correct, click Approve','A dialog box opens for your electronic signature.'));
p(ST('3','Type your full legal name in the signature box','This IS your legal electronic signature under 21 CFR Part 11. It is binding.'));
p(ST('4','Click Confirm Signature','The test case status changes to APPROVED and is ready for execution.'));
p(ST('5','If the test case is incorrect, click Reject','Enter a comment explaining what is wrong. The QA team will be notified.'));
p(WN('Your electronic signature is legally binding. Only sign test cases you have personally read and verified. Never sign content you have not reviewed.'));
p(TIP('Use Bulk Review to approve multiple test cases at once. Select them with checkboxes, then click Bulk Approve.'));
p(PB()); p(H1('8. Using the AI Knowledge Hub'));
p(BD('The Knowledge Hub is like teaching AITAS about your specific application. Upload your documentation and AITAS will use that knowledge to generate much more accurate, application-specific test cases.'));
p(H2('8.1 What Can You Upload?'));
p(mkTbl(['File Type','Extension','What Gets Extracted'],[['PowerPoint Presentation','.pptx or .ppt','All slide text, bullet points, tables, and speaker notes'],['PDF Document','.pdf','All text, tables, and structured content from every page'],['Word Document','.docx or .doc','Headings, paragraphs, tables, and lists'],['Image or Screenshot','.png .jpg .jpeg','Text recognized via AI OCR — great for ERP screen captures'],['Website or SharePoint','URL starting with https://','Web page text, headings, and tables extracted live']],[2800,1800,4400]));
p(H2('8.2 Uploading a Document'));
p(ST('1','Click Knowledge Hub in the left navigation','The Knowledge Hub dashboard opens.'));
p(ST('2','Click Upload Document or drag-and-drop your file','The upload dialog opens.'));
p(ST('3','Select the Application','Choose: JDE, SAP, Salesforce, or Custom. Helps the AI categorize the knowledge.'));
p(ST('4','Select the Module','Choose the business area: Procurement, Finance, HR, etc.'));
p(ST('5','Click Upload and Process','AITAS processes the document through 6 stages: Uploading, Extracting, AI Structuring, Validating, Indexing, Ready.'));
p(ST('6','Wait for the status to show READY','Usually 30 seconds to 2 minutes depending on file size.'));
p(ST('7','Now generate tests as normal','Go to AI Generator. AITAS will automatically use your uploaded knowledge to improve test quality.'));
p(TIP('Upload your system design documents, user manuals, process guides, and training materials. The more context you give AITAS, the better the generated tests.'));
p(NT('Large PDF files over 100 pages may take up to 5 minutes to process. You will receive a notification when complete.'));
p(PB()); p(H1('9. Connecting AITAS to Your CI/CD Pipeline'));
p(H2('9.1 What is CI/CD? (Simple Explanation)'));
p(BD('Imagine every time a developer saves code, a robot automatically runs all your tests within minutes and tells you if anything broke. That is CI/CD. AITAS connects to that robot.'));
p(H2('9.2 Setting Up a GitHub Integration'));
p(ST('1','Go to CI/CD in the left navigation','The CI/CD configuration page opens.'));
p(ST('2','Click New Webhook','The webhook creation form opens.'));
p(ST('3','Enter a name','Example: GitHub Production Deploy'));
p(ST('4','Select Provider','Choose: GitHub, GitLab, Jenkins, or Azure DevOps.'));
p(ST('5','Select the Test Suite to run when triggered','Choose from your available suites.'));
p(ST('6','Choose Trigger Events','Select: push, pull_request, or tag (on release).'));
p(ST('7','Click Save','AITAS displays a Webhook URL and a Secret Token.'));
p(ST('8','Go to your GitHub repository Settings then Webhooks','Open GitHub in another browser tab.'));
p(ST('9','Click Add webhook','Paste the Webhook URL into Payload URL.'));
p(ST('10','Paste the Secret Token into Secret field','Select application/json as Content Type.'));
p(ST('11','Select your trigger event then click Add webhook','Done. Every code push now auto-triggers AITAS tests.'));
p(NT('AITAS posts test results back to GitHub as a commit status (pass or fail badge) so your team can see at a glance whether the build is healthy.'));
p(PB()); p(H1('10. Setting Up Autonomous Test Agents'));
p(BD('An autonomous agent is a robot QA tester that never sleeps. It runs your tests automatically on a schedule — every 15 minutes, every hour, or continuously — and alerts you if anything breaks.'));
p(H2('10.1 Creating an Agent'));
p(ST('1','Go to Agents in the left navigation','The agent management page opens.'));
p(ST('2','Click New Agent','The agent configuration form opens.'));
p(ST('3','Enter a name','Example: Login-Monitor-Production'));
p(ST('4','Enter the Target URL','The URL of the application to monitor. Example: https://app.baxter.com'));
p(ST('5','Select a Test Suite to run','Choose the suite you want the agent to execute.'));
p(ST('6','Set the Schedule Interval in minutes','15 means every 15 minutes. 60 means hourly. Leave blank for continuous.'));
p(ST('7','Enable Self-Healing','Keep ON. The AI will fix broken tests automatically.'));
p(ST('8','Enable Notify on Failure','Keep ON. You receive Slack or email alerts when tests start failing.'));
p(ST('9','Click Save and Start Agent','The agent appears with a GREEN status and begins monitoring immediately.'));
p(TIP('Start with 60-minute intervals for non-critical apps. Use 15-minute intervals for business-critical systems like login and checkout.'));
p(PB()); p(H1('11. Reading Reports and Analytics'));
p(H2('11.1 Execution Reports'));
p(ST('1','Go to Reports in the navigation','The reports list shows all past executions.'));
p(ST('2','Click on an execution to see the detailed report','The report shows overall pass rate, duration, and individual results.'));
p(BD('Each report contains: pass rate percentage, total duration of the run, per-test status with screenshots, video recording, network logs, and performance metrics.'));
p(H2('11.2 Coverage Matrix'));
p(ST('1','Go to Coverage in the navigation','The coverage matrix opens.'));
p(BD('The matrix shows which requirements are covered by tests and which are not. Red rows have 0% coverage and need new test cases. Green rows are fully covered.'));
p(H2('11.3 Performance Dashboard'));
p(ST('1','Go to Performance in the navigation','Core Web Vitals trends appear as charts.'));
p(mkTbl(['Metric','Full Name','Good Score','What It Measures'],[['LCP','Largest Contentful Paint','Under 2.5 seconds','How fast the main content loads'],['FID','First Input Delay','Under 100ms','How fast the page responds to the first user click'],['CLS','Cumulative Layout Shift','Under 0.1','How stable the page layout is (things not jumping around)'],['FCP','First Contentful Paint','Under 1.8 seconds','When the first content appears on screen'],['TTFB','Time to First Byte','Under 800ms','How fast the server responds']],[1200,2800,1800,3200]));
p(H2('11.4 Exporting Reports'));
p(mkTbl(['Format','Best For','How to Get It'],[['HTML','Sharing with team via email — formatted, readable','Click Export then choose HTML'],['JSON','System integrations, feeding into dashboards or BI tools','Click Export then choose JSON'],['JUnit XML','CI/CD systems — GitHub and GitLab can read this format','Click Export then choose JUnit XML'],['CSV','Spreadsheets — import into Excel for custom analysis','Click Export then choose CSV']],[1500,4000,3500]));
p(PB()); p(H1('12. Troubleshooting Common Issues'));
p(mkTbl(['Problem','Most Likely Cause','How to Fix It'],[['Cannot log in','Wrong password or account locked','Click Forgot Password or contact your AITAS Admin'],['AI generates irrelevant tests','Requirement was too vague','Be more specific. Include field names, expected values, and error conditions.'],['DRAFT status blocks execution','System is in VALIDATED mode','A reviewer must approve the test case first. See Section 7.'],['Test fails but the app works fine','UI selector changed after an app update','Go to AI Healer page and apply the suggested automatic fix.'],['Knowledge Hub stuck on INGESTING','Large file or AI service is slow','Wait up to 5 minutes. If still stuck, delete and re-upload the file.'],['Webhook not triggering tests','Secret token mismatch or wrong URL','Check the Webhook URL and Secret Token in CI/CD settings.'],['Agent shows OFFLINE status','Server restart or connection lost','Go to Agents, click the agent, then click Restart Agent.'],['Screenshots missing from report','Test URL not accessible from AITAS server','Check the URL is reachable from the server network.'],['Test passed locally but fails in CI','Different environment or data','Check the environment configuration and test data settings.'],['Report shows 0 tests','Suite selected but no test cases inside','Add test cases to the suite first, then re-run.']],[3500,2800,2700]));
p(PB()); p(H1('13. Frequently Asked Questions'));
p(H3('Q: Do I need to know how to code to use AITAS?'));
p(BD('A: No. AITAS is designed for non-coders. You describe what you want to test in plain English, and AITAS writes the automation code for you. You can view the generated code, but you never have to touch it.'));
p(H3('Q: What happens if the AI generates a wrong test case?'));
p(BD('A: In VALIDATED mode, all AI content requires human review before it runs. You can reject incorrect test cases with a comment explaining what is wrong. In non-validated mode, you can edit or delete any test case at any time.'));
p(H3('Q: How is AITAS different from writing tests in Selenium or Playwright yourself?'));
p(BD('A: Manual test writing takes days per test suite and requires coding skills. With AITAS, you get 10 to 20 test cases in under a minute from plain-English requirements. When the application changes and tests break, AITAS fixes them automatically instead of requiring a developer to update selectors.'));
p(H3('Q: Is my data safe in AITAS?'));
p(BD('A: Yes. AITAS uses PBKDF2-SHA256 password hashing with 100,000 iterations, secure session cookies with httpOnly and sameSite flags, role-based access control, and full SHA-256 signed audit logging. Test data and screenshots are stored in your own database — nothing is sent to third parties except AI prompts to OpenAI.'));
p(H3('Q: Can AITAS test our SAP system?'));
p(BD('A: Yes. AITAS has dedicated executors for SAP Fiori (web-based) and SAP GUI (desktop). It can also test Salesforce CRM, Oracle JDE, and any REST or SOAP API. Contact your AITAS Admin to configure the SAP connection.'));
p(H3('Q: What is the difference between VALIDATED and NON-VALIDATED mode?'));
p(BD('A: VALIDATED mode is for regulated environments such as pharmaceutical or medical device software (GxP, 21 CFR Part 11). Every AI-generated test must be reviewed and e-signed by a human before it can run. NON-VALIDATED mode is for development and research environments where tests can be generated and run immediately without review.'));
p(H3('Q: How do I add a new user to AITAS?'));
p(BD('A: Only Admins can add users. Go to Admin then Users then Invite User. Enter the email address, assign a role (Admin, Tester, or Viewer), and click Invite. The user receives an invitation email.'));
p(H3('Q: What does self-healing mean?'));
p(BD('A: When a test fails because the application changed (for example, a button moved to a new location on the page), AITAS uses GPT-4o AI to look at the error, understand what went wrong, and automatically update the test to work with the new page layout. You are notified and can review the fix.'));
p(PB()); p(H1('14. Quick Reference Card'));
p(H2('Daily Workflow'));
p(ST('1','Log in to AITAS','Go to your AITAS URL and enter your credentials.'));
p(ST('2','Check the Dashboard','Review agent status, recent failures, and coverage score.'));
p(ST('3','Review pending approvals','Go to Governance and approve any DRAFT test cases.'));
p(ST('4','Check last run test results','Go to Executions and review the latest execution.'));
p(ST('5','Investigate any failures','Click on failed tests to see screenshots and error messages.'));
p(ST('6','Generate new tests if needed','Go to AI Generator for any new or changed requirements.'));
p(H2('Status Colour Guide'));
p(mkTbl(['Colour','What It Means'],[['Green','Passed, Active, Approved, Healthy'],['Red','Failed, Blocked, Rejected, Critical error'],['Orange','Warning, AI Healing in progress, Attention needed'],['Blue','Currently Running, Informational, Draft state'],['Grey','Skipped, Offline, Not applicable']],[3000,6000]));
p(H2('Page Navigation Guide'));
p(mkTbl(['Page Name','Where to Find It','What to Use It For'],[['Dashboard','Home icon or AITAS logo','Overview of everything — start here every day'],['AI Generator','Left nav: AI Generator','Create new tests from requirements'],['Repository','Left nav: Repository','Browse, edit, and manage all test cases and suites'],['Executions','Left nav: Executions','Run tests and see live progress'],['AI Healer','Left nav: AI Healer','Review and apply AI-suggested test fixes'],['Agents','Left nav: Agents','Set up and monitor automated background agents'],['CI/CD','Left nav: CI/CD','Connect to GitHub, GitLab, Jenkins'],['Knowledge Hub','Left nav: KB Hub','Upload documents and manage enterprise knowledge'],['Coverage','Left nav: Coverage','See which requirements have test coverage'],['Reports','Left nav: Reports','View and export test execution reports'],['Governance','Left nav: Governance','Review, approve, and sign test cases'],['Admin','Left nav: Admin','Manage users, roles, and system settings']],[2500,3000,3500]));
p(NT('Keep this SOP accessible. If you are unsure about any step, contact your QA Lead or AITAS Admin before proceeding.'));
p(SP());
var doc = new Document({
  creator: 'Baxter International QA Engineering',
  title: 'AITAS Standard Operating Procedure SOP-AITAS-001',
  description: 'Step-by-step guide for using the AITAS platform',
  sections: [{
    properties: {page:{margin:{top:1080,right:1080,bottom:1080,left:1080},pageNumbers:{start:1,formatType:NumberFormat.DECIMAL}}},
    headers: {default: mkHdr()},
    footers: {default: mkFtr()},
    children: children,
  }],
});
Packer.toBuffer(doc).then(function(buf){
  fss.writeFileSync('AITAS_SOP.docx', buf);
  console.log('SUCCESS: AITAS_SOP.docx generated!');
}).catch(function(err){console.error('ERROR:', err)});
