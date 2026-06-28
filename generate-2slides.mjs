import pptxgen from 'pptxgenjs';
const prs = new pptxgen();
prs.layout = 'LAYOUT_WIDE';

const C = {
  dark:'07111E', navy:'050D18', card:'0C1C2E', border:'1A3050',
  cyan:'00E5FF', blue:'0096C7', green:'06D6A0', purple:'8B5CF6',
  orange:'F59E0B', yellow:'FCD34D', pink:'F43F5E', teal:'22D3EE',
  white:'FFFFFF', gray:'6B8299', light:'B8CCE0', gold:'FFB700',
  lblue:'1E3A5F', dblue:'0A1828',
};
function bg(s,c){s.addShape('rect',{x:0,y:0,w:'100%',h:'100%',fill:{type:'solid',color:c||C.dark},line:{type:'none'}});}
function rx(s,x,y,w,h,fc,bc,r){s.addShape('roundRect',{x,y,w,h,rectRadius:r||0.07,fill:{type:'solid',color:fc||C.card},line:{color:bc||C.border,pt:1}});}
function bx(s,x,y,w,h,fc,bc){s.addShape('rect',{x,y,w,h,fill:{type:'solid',color:fc||C.card},line:{color:bc||C.border,pt:1}});}
function tx(s,t,x,y,w,h,sz,c,bold,wrap,al){s.addText(t,{x,y,w,h,fontSize:sz||9,color:c||C.white,fontFace:'Calibri',bold:!!bold,wrap:!!wrap,align:al||'left',valign:'middle'});}
function arr(s,x,y,w,h,c,dir){
  const sh=dir==='down'?'downArrow':dir==='left'?'leftArrow':'rightArrow';
  s.addShape(sh,{x,y,w,h,fill:{type:'solid',color:c||C.gray},line:{type:'none'}});
}

// ═══════════════════════════════════════════════════════════
//  SLIDE 1 — ARCHITECTURE DIAGRAM
// ═══════════════════════════════════════════════════════════
(function(){
  const s = prs.addSlide();
  bg(s,'050D18');

  bx(s,0,0,13.33,0.3,'0A1828',C.cyan);
  tx(s,'AITAS — Complete System Architecture  |  5 Layers: Browser → API Server → Executors+KB Pipeline → Data Layer → External Services',0.12,0,13,0.3,10,C.cyan,true);

  // ── LAYER A: BROWSER ────────────────────────────────────────────
  bx(s,0.06,0.33,13.21,0.72,'091A2C',C.cyan);
  tx(s,'A  BROWSER — React 18 SPA + Vite + TypeScript + TanStack Query + shadcn/ui + Tailwind CSS + Framer Motion',0.12,0.33,12,0.2,8,C.cyan,true);
  ['Dashboard','AI Generator','Repository','Executions','Agents','AI Healer','CI/CD','Coverage','Reports','Performance','KB Hub','Governance','Admin','Settings'].forEach((p,i)=>{
    rx(s,0.12+i*0.938,0.55,0.88,0.44,'0D2540',C.blue,0.05);
    tx(s,p,0.12+i*0.938,0.55,0.88,0.44,6.5,C.teal,false,true,'center');
  });

  arr(s,6.36,1.05,0.52,0.2,C.cyan,'down');
  tx(s,'HTTPS / REST JSON + WebSocket',4.4,1.05,4.5,0.2,7,C.gray,false,false,'center');

  // ── LAYER B: API SERVER ────────────────────────────────────────
  bx(s,0.06,1.28,13.21,1.44,'081E12',C.green);
  tx(s,'B  API SERVER — Express.js v5 + Node.js 24 + TypeScript + Zod Validation + Passport.js + PBKDF2 Auth + Sessions',0.12,1.29,12,0.2,8,C.green,true);

  const row1=[['Auth Layer',C.pink,'1A0A15'],['REST Routes',C.blue,'0A1520'],['Zod Validate',C.cyan,'0A1E28'],
    ['Session Mgr',C.purple,'140A28'],['RBAC Guards',C.yellow,'201A08'],['Audit Logger',C.orange,'201008'],
    ['Health Monitor',C.green,'0A1E12'],['Notifications',C.teal,'0A1E22'],['Enterprise Auth',C.pink,'1A0A15']];
  row1.forEach((m,i)=>{
    rx(s,0.12+i*1.454,1.52,1.35,0.44,m[2],m[1],0.05);
    tx(s,m[0],0.12+i*1.454,1.52,1.35,0.44,7.5,m[1],true,true,'center');
  });

  const row2=[['AI Client GPT-4o',C.purple,'140A28'],['AI Test Executor',C.green,'0A1E12'],['AI Self Healer',C.pink,'1A0A15'],
    ['Test Scheduler',C.yellow,'201A08'],['CI/CD Engine',C.orange,'201008'],['Report Analytics',C.teal,'0A1E22'],
    ['Coverage Matrix',C.blue,'0A1520'],['Perf Benchmark',C.cyan,'0A1E28'],['Visual Regression',C.purple,'140A28']];
  row2.forEach((m,i)=>{
    rx(s,0.12+i*1.454,2.0,1.35,0.44,m[2],m[1],0.05);
    tx(s,m[0],0.12+i*1.454,2.0,1.35,0.44,7.5,m[1],true,true,'center');
  });

  arr(s,6.36,2.48,0.52,0.2,C.green,'down');
  tx(s,'IStorage Interface + AI calls + Executor dispatch',4.2,2.48,5.0,0.2,7,C.gray,false,false,'center');

  // ── LAYER C LEFT: EXECUTORS ────────────────────────────────────
  bx(s,0.06,2.72,6.48,1.26,'1A0E05',C.orange);
  tx(s,'C-LEFT  EXECUTOR ADAPTERS',0.12,2.73,3.5,0.2,8,C.orange,true);
  const execs=[['Playwright',C.blue],['Puppeteer',C.cyan],['Selenium',C.orange],
    ['SAP Fiori',C.purple],['SAP GUI',C.blue],['Salesforce',C.teal],
    ['Oracle JDE',C.orange],['Appium iOS/Android',C.green],['WinAppDriver',C.blue],
    ['REST API',C.yellow],['GraphQL',C.green],['SOAP/WSDL',C.gray]];
  execs.forEach((e,i)=>{
    rx(s,0.12+(i%4)*1.58,2.95+(Math.floor(i/4)*0.3),1.5,0.26,C.dblue,e[1],0.04);
    tx(s,e[0],0.14+(i%4)*1.58,2.95+(Math.floor(i/4)*0.3),1.48,0.26,7,e[1],false,false,'left');
  });

  // ── LAYER C RIGHT: KB PIPELINE ─────────────────────────────────
  bx(s,6.6,2.72,6.69,1.26,'0A1E2C',C.cyan);
  tx(s,'C-RIGHT  AI KNOWLEDGE HUB — Extract → Structure → Validate → Store → Vector Index (RAG)',6.66,2.73,6.5,0.2,8,C.cyan,true);
  const pipe=[['Upload PDF/PPTX/DOCX/IMG/URL',C.blue],['Extract: ExtractedUnit[] per page/slide',C.teal],
    ['AI Structure: CanonicalKnowledge[] GPT-4o',C.purple],['Validate: anti-hallucination checks',C.green],
    ['Store: structured_knowledge DB table',C.yellow],['Vector Index: embedding + TF-IDF hybrid RAG',C.gold]];
  pipe.forEach((p,i)=>{
    rx(s,6.66+(i%3)*2.2,2.95+(Math.floor(i/3)*0.44),2.12,0.38,'0A1828',p[1],0.05);
    tx(s,(i+1)+'. '+p[0],6.72+(i%3)*2.2,2.95+(Math.floor(i/3)*0.44),2.0,0.38,7,p[1],false,true,'left');
  });

  arr(s,6.36,4.0,0.52,0.2,C.purple,'down');

  // ── LAYER D: DATA LAYER ────────────────────────────────────────
  bx(s,0.06,4.24,13.21,0.56,'12082A',C.purple);
  tx(s,'D  DATA LAYER — Drizzle ORM + IStorage Interface (PostgreSQL prod / SQLite dev, fully swappable)',0.12,4.24,9,0.2,8,C.purple,true);
  const dbs=[['PostgreSQL 15',C.blue,'0A1030'],['SQLite Dev',C.teal,'0A1E28'],['Vector Index',C.gold,'1E1808'],
    ['Redis Sessions',C.orange,'201008'],['Audit Log (immutable)',C.pink,'1A0A15'],
    ['Review Records',C.yellow,'201A08'],['Evidence Reviews',C.green,'0A1E12'],['pg-simple Sessions',C.purple,'140A28']];
  dbs.forEach((d,i)=>{
    rx(s,0.12+i*1.634,4.47,1.55,0.28,d[2],d[1],0.04);
    tx(s,d[0],0.12+i*1.634,4.47,1.55,0.28,7,d[1],true,true,'center');
  });

  // ── LAYER E: EXTERNAL ─────────────────────────────────────────
  bx(s,0.06,4.82,13.21,0.52,'101A08',C.gold);
  tx(s,'E  EXTERNAL SERVICES',0.12,4.83,2.5,0.2,8,C.gold,true);
  const ext=[['OpenAI GPT-4o + Embeddings',C.purple],['GitHub/GitLab/Jenkins/Azure CI',C.orange],
    ['Slack/Teams/Email Notify',C.green],['SAML/OAuth/LDAP/TOTP MFA',C.yellow],
    ['Appium Server + Device Farm',C.pink],['Selenium Grid Chrome+Firefox',C.blue],
    ['SharePoint Doc Connector',C.teal],['SMTP/SendGrid Email',C.cyan]];
  ext.forEach((e,i)=>{
    rx(s,0.12+i*1.634,5.05,1.55,0.24,C.dblue,e[1],0.04);
    tx(s,e[0],0.14+i*1.634,5.05,1.55,0.24,6.5,e[1],false,true,'center');
  });

  bx(s,0,5.35,13.33,0.15,'040A12',C.border);
  tx(s,'Security: PBKDF2(100k) · Zod validation · RBAC · httpOnly sessions · SHA-256 audit trail · 21 CFR Part 11 e-signatures · HMAC webhook verification · Docker + PostgreSQL deployment',0.12,5.35,13,0.15,6.5,C.gray);
})();


// ═══════════════════════════════════════════════════════════════
//  SLIDE 2 — COMPLETE FLOWCHART (5-column swimlane)
// ═══════════════════════════════════════════════════════════════
(function(){
  const s = prs.addSlide();
  bg(s,'050D18');

  bx(s,0,0,13.33,0.3,'0A1828',C.green);
  tx(s,'AITAS — Complete End-to-End Flowchart  |  Swimlanes: Input → AI Generation → Human Review (Governance) → Execution Engine → Results & Actions',0.12,0,13,0.3,10,C.green,true);

  // Column definitions
  const CW = 2.58, GAP = 0.08;
  const colX = [0.08, 2.74, 5.40, 8.06, 10.72];
  const colCols = [C.blue, C.purple, C.pink, C.green, C.orange];
  const colTitles = ['INPUT & UPLOAD','AI GENERATION','HUMAN REVIEW\n(VALIDATED MODE)','EXECUTION ENGINE','RESULTS & ACTIONS'];

  // Headers + swimlane backgrounds
  colX.forEach((x,i)=>{
    bx(s,x,0.32,CW,0.34,C.dblue,colCols[i]);
    tx(s,colTitles[i],x,0.32,CW,0.34,7.5,colCols[i],true,true,'center');
    s.addShape('rect',{x,y:0.68,w:CW,h:4.62,fill:{type:'solid',color:'050C16'},line:{color:colCols[i],pt:0.5,type:'dash'}});
  });

  // Node builder
  function nd(col,row,lbl,sub,bc,fc){
    const x=colX[col]+0.1, y=0.74+row*0.61, h=sub?0.5:0.42;
    rx(s,x,y,CW-0.2,h,fc||C.card,bc||colCols[col],0.06);
    s.addShape('rect',{x,y,w:CW-0.2,h:0.03,fill:{type:'solid',color:bc||colCols[col]},line:{type:'none'}});
    tx(s,lbl,x+0.08,y+0.03,CW-0.36,sub?0.22:0.3,8,C.white,true,true,'left');
    if(sub) tx(s,sub,x+0.08,y+0.27,CW-0.36,0.2,6.5,C.light,false,true,'left');
    // horizontal arrow to next column
    if(col<4){
      const arrowY = y + (sub?0.25:0.21);
      arr(s,colX[col]+CW-0.1,arrowY,GAP+0.12,0.18,bc||colCols[col],'right');
    }
  }

  // Column 0: INPUT
  nd(0,0,'Requirement Upload','Text / Word / Excel / PDF / SharePoint',C.blue);
  nd(0,1,'Knowledge Docs Upload','PPTX · PDF · DOCX · Image · Live URL',C.blue);
  nd(0,2,'App Profile Selection','Web · SAP · Salesforce · JDE · API · Mobile',C.blue);
  nd(0,3,'Environment Config','Dev · Staging · Production + variables & headers',C.blue);
  nd(0,4,'User Auth + RBAC Check','PBKDF2 login · role guard · project membership',C.blue);
  nd(0,5,'CI/CD Webhook Trigger','GitHub · GitLab · Jenkins · Azure DevOps inbound',C.blue);
  nd(0,6,'Scheduled Auto-Trigger','Cron: every 5min · hourly · daily · weekly',C.blue,'0A1828');

  // Column 1: AI GENERATION
  nd(1,0,'KB RAG Retrieval','buildRAGContextBlock() — top-6 semantic matches',C.purple);
  nd(1,1,'GPT-4o Test Generation','CanonicalKnowledge → structured test cases JSON',C.purple);
  nd(1,2,'NLP Step Parser','22+ action keywords · locator extraction · data params',C.purple);
  nd(1,3,'Script Generation','4 frameworks × 5 languages — auto-generated code',C.purple);
  nd(1,4,'AI Test Case Validation','Zod schema check · field validation · error messages',C.purple);
  nd(1,5,'Rule-Based Fallback','Offline engine if no API key — generates basic tests',C.purple,'160D30');
  nd(1,6,'DRAFT Status Stamped','reviewStatus=DRAFT · aiProvenance{} recorded',C.purple,'160D30');

  // Column 2: HUMAN REVIEW
  nd(2,0,'VALIDATED Mode Check','platform_settings.system_type = VALIDATED?',C.pink);
  nd(2,1,'Review Gate Opens','HumanReviewGate dialog — blocks execution',C.pink);
  nd(2,2,'Attestation Required','Reviewer confirms content is accurate & compliant',C.pink);
  nd(2,3,'E-Signature Entry','Name typed = legal e-sign (21 CFR Part 11)',C.pink);
  nd(2,4,'SHA-256 Signed Record','review_records row + contentHash stored in DB',C.pink);
  nd(2,5,'Status → APPROVED','Unlocked for execution — execution gate cleared',C.green,'0A2215');
  nd(2,6,'NON-VALIDATED bypass','Skips review lane — goes direct to execution',C.gray,'0A1020');

  // Column 3: EXECUTION
  nd(3,0,'Create Execution Record','DB row: status=pending → running, framework set',C.green);
  nd(3,1,'Select Executor Adapter','Playwright · SAP · Salesforce · JDE · API · Mobile',C.green);
  nd(3,2,'Inject Test Data Params','{{username}} {{password}} substituted in steps',C.green);
  nd(3,3,'Execute Test Steps','Each step run in real browser/app/API environment',C.green);
  nd(3,4,'Capture Evidence','Screenshot · Video · Network logs · Perf metrics',C.green);
  nd(3,5,'Step Failed? → AI Healer','GPT-4o diagnoses selector · timing · flow fix',C.orange,'1E0C05');
  nd(3,6,'All Steps Passed','status=passed · duration saved · results stored',C.green,'0A2215');

  // Column 4: RESULTS
  nd(4,0,'AI Self-Healing Retry','Apply fix → re-run step (up to maxRetries)',C.orange);
  nd(4,1,'Generate Test Report','Pass rate · AI insights · executive summary',C.teal,'0A1E28');
  nd(4,2,'Coverage Matrix Update','Requirement ↔ test case mapping refreshed',C.teal,'0A1E28');
  nd(4,3,'Notifications Sent','Slack · Teams · Email on failure or completion',C.yellow,'201A08');
  nd(4,4,'Export Results','HTML · JSON · JUnit XML · CSV — CI/CD ready',C.teal,'0A1E28');
  nd(4,5,'CI/CD Status Posted','pass/fail status posted back to pipeline badge',C.orange,'1E0C05');
  nd(4,6,'Audit Log Entry','Every action SHA-256 signed in governance_audit_log',C.pink,'1A0812');

  // Bottom legend
  bx(s,0,5.35,13.33,0.15,'040A12',C.border);
  [[' INPUT',C.blue],[' AI ENGINE',C.purple],[' GOVERNANCE',C.pink],[' EXECUTION',C.green],[' RESULTS',C.orange]].forEach(([l,c],i)=>{
    s.addShape('rect',{x:0.1+i*2.6,y:5.37,w:0.12,h:0.1,fill:{type:'solid',color:c},line:{type:'none'}});
    tx(s,l,0.25+i*2.6,5.36,2.3,0.14,7,c,true);
  });
  tx(s,'Dashed lanes = swimlanes  |  VALIDATED mode enforces review gate (21 CFR)  |  NON-VALIDATED bypasses to execution  |  AI healer auto-retries on failure',6.6,5.36,6.6,0.14,6.5,C.gray,false,false,'right');
})();

// SAVE
prs.writeFile({ fileName: 'AITAS_2Slides_Arch_Flowchart.pptx' })
  .then(()=>console.log('SUCCESS: AITAS_2Slides_Arch_Flowchart.pptx generated!'))
  .catch(err=>console.error('ERROR:',err));

