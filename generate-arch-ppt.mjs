import pptxgen from 'pptxgenjs';
const prs = new pptxgen();
prs.layout = 'LAYOUT_WIDE';

const C = {
  dark:'09111F', navy:'060C18', card:'0D1F35', border:'1A3050',
  cyan:'00F0FF', blue:'0096C7', green:'06D6A0', purple:'7B2FBE',
  orange:'F77F00', yellow:'FFD166', pink:'EF476F', teal:'4CC9F0',
  white:'FFFFFF', gray:'8899AA', light:'C8D6E5', gold:'FFC300',
};
function bg(s,c){s.addShape('rect',{x:0,y:0,w:'100%',h:'100%',fill:{type:'solid',color:c||C.dark},line:{type:'none'}});}
function bar(s,c,y,h){s.addShape('rect',{x:0,y:y||0,w:'100%',h:h||0.055,fill:{type:'solid',color:c},line:{type:'none'}});}
function dot(s,x,y,r,c){s.addShape('ellipse',{x,y,w:r,h:r,fill:{type:'solid',color:c},line:{type:'none'}});}
function card(s,x,y,w,h,c,b){s.addShape('roundRect',{x,y,w,h,rectRadius:0.1,fill:{type:'solid',color:c||C.card},line:{color:b||C.border,pt:1}});}
function ttl(s,t,y,sz,c){s.addText(t,{x:0.5,y:y||0.38,w:12.33,h:0.7,fontSize:sz||33,bold:true,color:c||C.white,fontFace:'Calibri'});}
function sub(s,t,y,sz,c){s.addText(t,{x:0.5,y:y||1.08,w:12.33,h:0.38,fontSize:sz||14,color:c||C.gray,fontFace:'Calibri'});}
function tag(s,t,c){s.addText(t,{x:0.5,y:0.1,w:6,h:0.24,fontSize:9.5,bold:true,color:c,fontFace:'Calibri',charSpacing:3});}
function foot(s){bar(s,C.border,5.6,0.055);s.addText('AITAS Architecture & Intelligence Deep-Dive  |  Confidential  |  2025',{x:0,y:5.67,w:'100%',h:0.22,fontSize:8.5,color:C.gray,align:'center',fontFace:'Calibri'});}
function uline(s,c,y,w){s.addShape('rect',{x:0.5,y:y||0.97,w:w||4,h:0.045,fill:{type:'solid',color:c},line:{type:'none'}});}
function lbl(s,t,x,y,c){s.addText(t,{x,y,w:2,h:0.26,fontSize:9,bold:true,color:c,fontFace:'Calibri',charSpacing:2});}
function pill(s,t,x,y,c,bg2){
  s.addShape('roundRect',{x,y,w:t.length*0.11+0.4,h:0.3,rectRadius:0.08,fill:{type:'solid',color:bg2||C.card},line:{color:c,pt:1}});
  s.addText(t,{x:x+0.08,y:y+0.02,w:t.length*0.11+0.25,h:0.26,fontSize:9.5,bold:true,color:c,fontFace:'Calibri'});
}

// ══════════════════════════════════════════════════════════════════
// SLIDE 1 — TITLE
// ══════════════════════════════════════════════════════════════════
(function(){
  const s=prs.addSlide(); bg(s,'060C18');
  [[-1,-0.5,4,'0A1E35'],[11,5.5,3.5,'0A1E35'],[12,-0.8,3,'0A1E35'],[-0.5,5,2.5,'0A1E35']].forEach(([x,y,r,c])=>dot(s,x,y,r,c));
  [[8.2,0.8],[9.0,1.4],[9.7,0.7],[10.3,1.3],[9.5,2.1],[10.7,1.8],[11.3,1.1],[10.0,2.6],[11.2,2.2]].forEach(([x,y])=>dot(s,x,y,0.12,C.cyan));
  bar(s,C.cyan,0,0.055);
  s.addShape('roundRect',{x:10.5,y:0.25,w:2.0,h:0.38,rectRadius:0.08,fill:{type:'solid',color:'00B0C8'},line:{type:'none'}});
  s.addText('DEEP-DIVE EDITION',{x:10.5,y:0.27,w:2.0,h:0.34,fontSize:8,bold:true,color:'001820',align:'center',fontFace:'Calibri'});
  s.addText('AITAS',{x:0.5,y:1.05,w:9,h:1.65,fontSize:112,bold:true,color:C.white,fontFace:'Calibri',charSpacing:12});
  s.addShape('rect',{x:0.52,y:2.68,w:5.5,h:0.065,fill:{type:'solid',color:C.cyan},line:{type:'none'}});
  s.addText('Architecture  ·  AI Intelligence  ·  Enterprise Features',{x:0.52,y:2.85,w:11,h:0.5,fontSize:22,color:C.cyan,fontFace:'Calibri'});
  s.addText('Raw Data  →  Structured Intelligence  →  Automated Testing',{x:0.52,y:3.42,w:11,h:0.4,fontSize:15,color:C.gray,fontFace:'Calibri'});
  s.addShape('rect',{x:0.52,y:3.96,w:12,h:0.018,fill:{type:'solid',color:'1A3050'},line:{type:'none'}});
  [['20+ Slides','Full Architecture'],['6 Stages','Ingestion Pipeline'],['RAG + Vectors','AI Knowledge Hub'],['21 CFR','Governance'],['10+ Executors','Enterprise Coverage']].forEach(([v,l],i)=>{
    const x=0.52+i*2.46;
    s.addText(v,{x,y:4.08,w:2.3,h:0.4,fontSize:18,bold:true,color:C.cyan,align:'center',fontFace:'Calibri'});
    s.addText(l,{x,y:4.5,w:2.3,h:0.26,fontSize:9.5,color:C.gray,align:'center',fontFace:'Calibri'});
  });
  foot(s);
})();


// ══════════════════════════════════════════════════════════════════
// SLIDE 2 — FULL SYSTEM ARCHITECTURE OVERVIEW
// ══════════════════════════════════════════════════════════════════
(function(){
  const s=prs.addSlide(); bg(s,C.dark);
  bar(s,C.cyan,0,0.055); tag(s,'SYSTEM ARCHITECTURE',C.cyan);
  ttl(s,'AITAS — Full Platform Architecture',0.38,30); uline(s,C.cyan,0.94,5.5);
  sub(s,'Three-tier architecture: React SPA → Express API Server → Multi-Database + AI Services + External Integrations',1.04,13);

  // TIER 1: Frontend
  card(s,0.3,1.32,12.73,1.15,'091828',C.cyan);
  s.addShape('rect',{x:0.3,y:1.32,w:12.73,h:0.045,fill:{type:'solid',color:C.cyan},line:{type:'none'}});
  s.addText('TIER 1  —  CLIENT BROWSER  (React 18 SPA + Vite + TypeScript)',{x:0.5,y:1.38,w:12.33,h:0.3,fontSize:11,bold:true,color:C.cyan,fontFace:'Calibri'});
  ['Dashboard','AI Generator','Repository','Executions','Reports','Agents','AI Healer','Environments','CI/CD','Coverage','Performance','Admin','Governance','Knowledge Hub'].forEach((p,i)=>{
    const x=0.48+i*0.9;
    s.addShape('roundRect',{x,y:1.75,w:0.83,h:0.6,rectRadius:0.06,fill:{type:'solid',color:'0D2540'},line:{color:C.blue,pt:1}});
    s.addText(p,{x,y:1.77,w:0.83,h:0.56,fontSize:7.5,color:C.light,align:'center',fontFace:'Calibri',valign:'middle',wrap:true});
  });

  // Arrow down
  s.addShape('downArrow',{x:6.1,y:2.58,w:0.6,h:0.28,fill:{type:'solid',color:C.gray},line:{type:'none'}});
  s.addText('HTTPS / REST JSON / WebSocket',{x:3.5,y:2.58,w:5.5,h:0.26,fontSize:9,color:C.gray,align:'center',fontFace:'Calibri'});

  // TIER 2: Server
  card(s,0.3,2.9,12.73,1.3,'091520',C.green);
  s.addShape('rect',{x:0.3,y:2.9,w:12.73,h:0.045,fill:{type:'solid',color:C.green},line:{type:'none'}});
  s.addText('TIER 2  —  EXPRESS.JS API SERVER  (Node.js + TypeScript + Zod Validation)',{x:0.5,y:2.96,w:12,h:0.3,fontSize:11,bold:true,color:C.green,fontFace:'Calibri'});
  [['Auth\n+ RBAC',C.pink],['REST\nRoutes',C.blue],['AI Engine\nGPT-4o',C.purple],['KB Ingestion\nPipeline',C.cyan],['Test\nExecutors',C.green],['Scheduler\n+ Agents',C.yellow],['CI/CD\nEngine',C.orange],['Governance\n+ Audit',C.pink]].forEach(([t,c],i)=>{
    const x=0.45+i*1.58;
    s.addShape('roundRect',{x,y:3.32,w:1.45,h:0.75,rectRadius:0.07,fill:{type:'solid',color:'0A1D2C'},line:{color:c,pt:1}});
    s.addText(t,{x,y:3.34,w:1.45,h:0.71,fontSize:9.5,bold:true,color:c,align:'center',fontFace:'Calibri',valign:'middle',wrap:true});
  });

  // Arrow down
  s.addShape('downArrow',{x:6.1,y:4.18,w:0.6,h:0.28,fill:{type:'solid',color:C.gray},line:{type:'none'}});

  // TIER 3: Data + External
  card(s,0.3,4.5,12.73,0.95,'0A0F1A',C.purple);
  s.addShape('rect',{x:0.3,y:4.5,w:12.73,h:0.045,fill:{type:'solid',color:C.purple},line:{type:'none'}});
  s.addText('TIER 3  —  DATA + EXTERNAL SERVICES',{x:0.5,y:4.56,w:12,h:0.28,fontSize:11,bold:true,color:C.purple,fontFace:'Calibri'});
  [['PostgreSQL\n(Production)',C.blue],['SQLite\n(Dev/Self-host)',C.teal],['OpenAI\nGPT-4o',C.purple],['Vector Index\n(RAG/Embeddings)',C.cyan],['GitHub/GitLab\nCI/CD Systems',C.orange],['Slack/Teams\nNotifications',C.green],['SAML/OAuth\nEnterprise Auth',C.yellow]].forEach(([t,c],i)=>{
    const x=0.45+i*1.82;
    s.addShape('roundRect',{x,y:4.85,w:1.68,h:0.55,rectRadius:0.07,fill:{type:'solid',color:'080D18'},line:{color:c,pt:1}});
    s.addText(t,{x,y:4.87,w:1.68,h:0.51,fontSize:9,color:c,align:'center',fontFace:'Calibri',valign:'middle',wrap:true});
  });
  foot(s);
})();


// ══════════════════════════════════════════════════════════════════
// SLIDE 3 — RAW TO STRUCTURED: THE 6-STAGE INGESTION PIPELINE
// ══════════════════════════════════════════════════════════════════
(function(){
  const s=prs.addSlide(); bg(s,'07101C');
  bar(s,C.gold,0,0.055); tag(s,'AI KNOWLEDGE HUB — INGESTION PIPELINE',C.gold);
  ttl(s,'Raw Document → Structured Intelligence: 6-Stage Pipeline',0.38,29,C.white); uline(s,C.gold,0.94,7);
  sub(s,'Any file format (PDF, PPT, DOCX, Image, URL) is automatically transformed into structured, queryable, AI-ready knowledge.',1.04,13);

  const stages=[
    {num:'1',title:'UPLOAD & DETECT',desc:'Accept PDF, PPTX, DOCX, PNG/JPG, URL. Auto-detect MIME type & route to correct extractor.',col:C.blue,bg2:'0A1830',icon:'📤'},
    {num:'2',title:'EXTRACT CONTENT',desc:'Extractor parses slides/pages/images. Outputs ExtractedUnit[] with text, bullets, tables, UI elements.',col:C.cyan,bg2:'0A2030',icon:'🔍'},
    {num:'3',title:'AI STRUCTURE',desc:'GPT-4o reads raw units. Outputs CanonicalKnowledge[] — processes, rules, fields, test points, objects.',col:C.purple,bg2:'160D30',icon:'🤖'},
    {num:'4',title:'VALIDATE',desc:'Anti-hallucination engine checks every fact against source text. Rejects items with no evidence.',col:C.orange,bg2:'2A1205',icon:'✅'},
    {num:'5',title:'STORE IN DB',desc:'Validated items saved to structured_knowledge table. Linked to source. Confidence-scored.',col:C.green,bg2:'0A2215',icon:'💾'},
    {num:'6',title:'VECTOR INDEX',desc:'text-embedding-3-small generates embeddings. Stored in hybrid vector+keyword index for RAG retrieval.',col:C.gold,bg2:'252008',icon:'🧠'},
  ];

  stages.forEach((st,i)=>{
    const x=0.3+(i%3)*4.28, y=1.58+(Math.floor(i/3)*2.0);
    card(s,x,y,4.0,1.78,st.bg2,st.col);
    s.addShape('rect',{x,y,w:4.0,h:0.045,fill:{type:'solid',color:st.col},line:{type:'none'}});
    // Step circle
    s.addShape('ellipse',{x:x+0.18,y:y+0.1,w:0.5,h:0.5,fill:{type:'solid',color:st.col},line:{type:'none'}});
    s.addText(st.num,{x:x+0.18,y:y+0.1,w:0.5,h:0.5,fontSize:17,bold:true,color:'000D1A',align:'center',fontFace:'Calibri'});
    s.addText(st.icon+'  '+st.title,{x:x+0.78,y:y+0.12,w:3.1,h:0.4,fontSize:12,bold:true,color:st.col,fontFace:'Calibri'});
    s.addText(st.desc,{x:x+0.15,y:y+0.65,w:3.7,h:0.98,fontSize:11,color:C.light,fontFace:'Calibri',wrap:true,valign:'top'});
    // Arrow between
    if(i%3<2){s.addShape('rightArrow',{x:x+4.06,y:y+0.65,w:0.17,h:0.4,fill:{type:'solid',color:st.col},line:{type:'none'}});}
  });

  // Pipeline status bar at bottom
  s.addText('Pipeline Statuses: PENDING → INGESTING → CLASSIFYING → EXTRACTING → EMBEDDING → READY  |  Failures: FAILED with error message',{x:0.5,y:5.42,w:12.33,h:0.26,fontSize:10,color:C.gray,fontFace:'Calibri'});
  foot(s);
})();


// ══════════════════════════════════════════════════════════════════
// SLIDE 4 — CONTENT EXTRACTORS DEEP DIVE
// ══════════════════════════════════════════════════════════════════
(function(){
  const s=prs.addSlide(); bg(s,C.dark);
  bar(s,C.blue,0,0.055); tag(s,'STAGE 1 & 2 — EXTRACTORS',C.blue);
  ttl(s,'Multi-Format Content Extraction Engine',0.38,30); uline(s,C.blue,0.94,5);
  sub(s,'Five dedicated extractors auto-selected by file type — each producing normalized ExtractedUnit[] for the AI structurer.',1.04,13);

  const extractors=[
    {name:'PPTX Extractor',icon:'📊',formats:['pptx','ppt'],col:C.orange,bg2:'2A1205',
     points:['Parses slide title, body, bullets','Extracts speaker notes','Detects tables in slides','Identifies shapes & flowcharts','Handles embedded images (OCR)','Outputs SLIDE-type ExtractedUnit']},
    {name:'PDF Extractor',icon:'📄',formats:['pdf'],col:C.blue,bg2:'0A1830',
     points:['Full text extraction per page','Table detection & parsing','Page-level unit segmentation','Multi-column layout handling','Metadata (author, title, date)','Outputs PAGE-type ExtractedUnit']},
    {name:'DOCX Extractor',icon:'📝',formats:['docx','doc'],col:C.green,bg2:'0A2215',
     points:['Word document text & headings','Paragraph and list extraction','Table extraction (all cells)','Section boundary detection','Comments & track changes','Outputs SECTION-type units']},
    {name:'Image Extractor',icon:'🖼',formats:['png','jpg','jpeg','webp','tiff'],col:C.purple,bg2:'160D30',
     points:['Tesseract.js OCR text extraction','UI element detection & labeling','Button, Input, Label recognition','Form field identification','OCR confidence scoring','Outputs IMAGE_REGION units']},
    {name:'URL Extractor',icon:'🌐',formats:['http','https'],col:C.teal,bg2:'0A2028',
     points:['Web page content extraction','SharePoint document fetching','Heading & paragraph parsing','Table extraction from HTML','Link & navigation detection','Outputs SECTION-type units']},
  ];

  extractors.forEach((e,i)=>{
    const x=0.25+(i%5)*2.55, y=1.56+(Math.floor(i/5)*2.6);
    card(s,x,y,2.38,3.94,e.bg2,e.col);
    s.addShape('rect',{x,y,w:2.38,h:0.045,fill:{type:'solid',color:e.col},line:{type:'none'}});
    s.addText(e.icon,{x,y:y+0.1,w:2.38,h:0.5,fontSize:26,align:'center',fontFace:'Calibri'});
    s.addText(e.name,{x:x+0.08,y:y+0.64,w:2.22,h:0.42,fontSize:11,bold:true,color:e.col,align:'center',fontFace:'Calibri',wrap:true});
    s.addText(e.formats.join(' · '),{x:x+0.08,y:y+1.08,w:2.22,h:0.26,fontSize:9,color:C.gray,align:'center',fontFace:'Calibri'});
    s.addShape('rect',{x:x+0.12,y:y+1.35,w:2.14,h:0.018,fill:{type:'solid',color:C.border},line:{type:'none'}});
    e.points.forEach((p,j)=>{
      s.addText('• '+p,{x:x+0.1,y:y+1.42+j*0.4,w:2.18,h:0.35,fontSize:9,color:C.light,fontFace:'Calibri',wrap:true});
    });
  });
  foot(s);
})();


// ══════════════════════════════════════════════════════════════════
// SLIDE 5 — AI KNOWLEDGE STRUCTURER
// ══════════════════════════════════════════════════════════════════
(function(){
  const s=prs.addSlide(); bg(s,'07101C');
  bar(s,C.purple,0,0.055); tag(s,'STAGE 3 — AI STRUCTURER',C.purple);
  ttl(s,'AI Knowledge Structurer — Raw Text → Canonical Knowledge',0.38,29,C.white); uline(s,C.purple,0.94,6.5);
  sub(s,'GPT-4o converts unstructured document content into validated, schema-compliant CanonicalKnowledge objects — with strict anti-hallucination rules.',1.04,13);

  // Left: Input
  card(s,0.3,1.52,3.8,4.1,'0B1830',C.blue);
  s.addShape('rect',{x:0.3,y:1.52,w:3.8,h:0.045,fill:{type:'solid',color:C.blue},line:{type:'none'}});
  s.addText('INPUT — ExtractedUnit',{x:0.48,y:1.6,w:3.45,h:0.34,fontSize:12,bold:true,color:C.blue,fontFace:'Calibri'});
  s.addShape('roundRect',{x:0.45,y:2.0,w:3.5,h:3.45,rectRadius:0.08,fill:{type:'solid',color:'080F20'},line:{color:C.border,pt:1}});
  s.addText('[SLIDE 3] Purchase Order Entry\n\nP4310 - Purchase Order Entry\n• Enter supplier number\n• Enter item details\n• Set quantity and price\n• Approval required >$5000\n\nTable F4311 stores order lines.\nIntegrates with F0401 Address Book.\n\nFields: Supplier No, Item No,\nQty, Unit Price, G/L Account',{x:0.55,y:2.08,w:3.3,h:3.28,fontSize:9.5,color:C.gray,fontFace:'Calibri',wrap:true,italic:true});

  // Arrow
  s.addShape('rightArrow',{x:4.18,y:3.3,w:0.75,h:0.55,fill:{type:'solid',color:C.purple},line:{type:'none'}});
  s.addText('GPT-4o',{x:4.17,y:3.92,w:0.78,h:0.26,fontSize:9.5,bold:true,color:C.purple,align:'center',fontFace:'Calibri'});

  // Center: AI System Prompt rules
  card(s,5.08,1.52,2.9,4.1,'120828',C.purple);
  s.addShape('rect',{x:5.08,y:1.52,w:2.9,h:0.045,fill:{type:'solid',color:C.purple},line:{type:'none'}});
  s.addText('AI RULES',{x:5.22,y:1.6,w:2.62,h:0.34,fontSize:12,bold:true,color:C.purple,fontFace:'Calibri'});
  ['ONLY extract explicit facts','NEVER hallucinate IDs or names','NEVER invent business processes','Omit field if uncertain','Confidence must reflect evidence','No UI selectors (runtime only)','No test scripts — only knowledge','Max 10 items per chunk'].forEach((r,i)=>{
    s.addText((i<5?'🔴':'🟡')+'  '+r,{x:5.22,y:1.98+i*0.43,w:2.62,h:0.36,fontSize:9.5,color:C.light,fontFace:'Calibri'});
  });

  // Arrow
  s.addShape('rightArrow',{x:8.06,y:3.3,w:0.75,h:0.55,fill:{type:'solid',color:C.green},line:{type:'none'}});

  // Right: Output
  card(s,8.88,1.52,3.85,4.1,'0A2215',C.green);
  s.addShape('rect',{x:8.88,y:1.52,w:3.85,h:0.045,fill:{type:'solid',color:C.green},line:{type:'none'}});
  s.addText('OUTPUT — CanonicalKnowledge',{x:9.02,y:1.6,w:3.55,h:0.34,fontSize:11,bold:true,color:C.green,fontFace:'Calibri'});
  s.addShape('roundRect',{x:9.02,y:2.0,w:3.55,h:3.45,rectRadius:0.08,fill:{type:'solid',color:'050F10'},line:{color:C.border,pt:1}});
  s.addText('objectName: "P4310"\nknowledgeType: "PROCESS"\napplication: "JDE"\nmodule: "PROCUREMENT"\n\nfacts:\n  description: "Purchase Order Entry\n  program for creating and\n  managing purchase orders"\n  businessProcess:\n    1. Enter supplier number\n    2. Add item lines\n    3. Set qty and price\n    4. Submit for approval\n  tables: ["F4311","F0401"]\n  validations:\n    "Approval required >$5000"\n  testableActions:\n    ["Create","Approve","Cancel"]\n\nconfidenceScore: 88\nreasoning: "Explicit P4310..."',{x:9.1,y:2.08,w:3.4,h:3.28,fontSize:8.5,color:C.light,fontFace:'Calibri',wrap:true,fontFace:'Courier New'});
  foot(s);
})();


// ══════════════════════════════════════════════════════════════════
// SLIDE 6 — VECTOR INDEX & RAG RETRIEVAL
// ══════════════════════════════════════════════════════════════════
(function(){
  const s=prs.addSlide(); bg(s,C.dark);
  bar(s,C.cyan,0,0.055); tag(s,'STAGES 5 & 6 — VECTOR INDEX + RAG',C.cyan);
  ttl(s,'Vector Index — Semantic Search & RAG Retrieval',0.38,30); uline(s,C.cyan,0.94,5.5);
  sub(s,'Hybrid retrieval: OpenAI text-embedding-3-small semantic search + TF-IDF keyword scoring. Persisted to disk. Auto-loaded on restart.',1.04,13);

  // Left: How indexing works
  card(s,0.3,1.52,6.0,3.1,'0A1E2C',C.cyan);
  s.addShape('rect',{x:0.3,y:1.52,w:6.0,h:0.045,fill:{type:'solid',color:C.cyan},line:{type:'none'}});
  s.addText('How the Vector Index Works',{x:0.48,y:1.6,w:5.65,h:0.34,fontSize:13,bold:true,color:C.cyan,fontFace:'Calibri'});

  [['📥','Input','CanonicalKnowledge items from Stage 5',C.blue],
   ['✂','Chunk','Build chunk text: objectName + description + businessProcess + fields + validations',C.cyan],
   ['🔢','Embed','OpenAI text-embedding-3-small → float[] vector per chunk',C.purple],
   ['📊','TF-IDF','Compute term frequency map for keyword fallback scoring',C.yellow],
   ['🗂','Store','VectorEntry{ id, embedding, termFreq, metadata } → in-memory Map',C.green],
   ['💾','Persist','Auto-flush to aitas-vector-index.json every 30s + on ingestion complete',C.orange]].forEach(([icon,title,desc,col],i)=>{
    const y=2.04+i*0.42;
    s.addShape('roundRect',{x:0.42,y,w:5.78,h:0.36,rectRadius:0.07,fill:{type:'solid',color:'0A1828'},line:{color:col,pt:1}});
    s.addText(icon,{x:0.5,y:y+0.03,w:0.42,h:0.3,fontSize:13,color:col,align:'center',fontFace:'Calibri'});
    s.addText(title+':',{x:0.95,y:y+0.04,w:0.9,h:0.28,fontSize:9.5,bold:true,color:col,fontFace:'Calibri'});
    s.addText(desc,{x:1.88,y:y+0.04,w:4.28,h:0.28,fontSize:9.5,color:C.light,fontFace:'Calibri',wrap:true});
  });

  // Left bottom: Hybrid scoring formula
  card(s,0.3,4.72,6.0,0.72,'0A2030',C.gold);
  s.addText('Hybrid Score = 0.7 × cosine_similarity(queryEmb, chunkEmb)  +  0.3 × keyword_overlap(queryTF, chunkTF)',{x:0.45,y:4.82,w:5.75,h:0.5,fontSize:10.5,color:C.gold,fontFace:'Calibri',wrap:true,bold:true});

  // Right: RAG retrieval flow
  card(s,6.55,1.52,6.1,3.92,'0A1A25',C.green);
  s.addShape('rect',{x:6.55,y:1.52,w:6.1,h:0.045,fill:{type:'solid',color:C.green},line:{type:'none'}});
  s.addText('RAG Retrieval Flow — Used by ALL Generators',{x:6.7,y:1.6,w:5.8,h:0.34,fontSize:13,bold:true,color:C.green,fontFace:'Calibri'});

  [['1','Query Input','User requirement text passed to buildRAGContextBlock()',C.blue],
   ['2','Embed Query','text-embedding-3-small embeds the requirement (first 2000 chars)',C.purple],
   ['3','Hybrid Search','Cosine similarity + keyword overlap → top-K results (default 6)',C.cyan],
   ['4','Filter','Optional: filter by application, module, objectName',C.yellow],
   ['5','Format Block','Results formatted as =KNOWLEDGE BASE CONTEXT= block for LLM prompt',C.green],
   ['6','Inject to AI','Context block appended to GPT-4o prompt before test generation',C.orange],
   ['7','Grounded Output','AI generates tests GROUNDED in real KB content — not hallucinated',C.gold]].forEach(([n,t,d,col],i)=>{
    const y=2.04+i*0.5;
    s.addShape('ellipse',{x:6.68,y:y+0.06,w:0.35,h:0.35,fill:{type:'solid',color:col},line:{type:'none'}});
    s.addText(n,{x:6.68,y:y+0.06,w:0.35,h:0.35,fontSize:11,bold:true,color:'000D1A',align:'center',fontFace:'Calibri'});
    s.addText(t+':',{x:7.1,y:y+0.06,w:1.4,h:0.3,fontSize:9.5,bold:true,color:col,fontFace:'Calibri'});
    s.addText(d,{x:8.54,y:y+0.06,w:4.0,h:0.3,fontSize:9.5,color:C.light,fontFace:'Calibri',wrap:true});
  });
  foot(s);
})();


// ══════════════════════════════════════════════════════════════════
// SLIDE 7 — AI KNOWLEDGE HUB COMPLETE FEATURES
// ══════════════════════════════════════════════════════════════════
(function(){
  const s=prs.addSlide(); bg(s,'07101C');
  bar(s,C.gold,0,0.055); tag(s,'AI KNOWLEDGE HUB — COMPLETE FEATURE MAP',C.gold);
  ttl(s,'AI Knowledge Hub — Enterprise Intelligence Center',0.38,30,C.white); uline(s,C.gold,0.94,6);
  sub(s,'The Knowledge Hub transforms any enterprise document into queryable intelligence that powers AI-grounded test generation across all platforms.',1.04,13);

  const features=[
    {title:'Multi-Format Upload',icon:'📤',col:C.blue,bg2:'0A1830',items:['PPTX / PPT slide decks','PDF documents (any layout)','DOCX Word documents','PNG / JPG / TIFF images (OCR)','Live URLs & SharePoint pages','Drag-and-drop or API upload']},
    {title:'AI Structuring Engine',icon:'🤖',col:C.purple,bg2:'160D30',items:['GPT-4o document parsing','8 knowledge types extracted','Anti-hallucination validation','Confidence scoring (0-100)','Fact deduplication & merging','Per-chunk AI processing']},
    {title:'Knowledge Types',icon:'🏗',col:C.cyan,bg2:'0A2030',items:['PROCESS — business workflows','CONFIGURATION — system settings','INTEGRATION — system links','TABLE_SCHEMA — DB structures','BUSINESS_RULE — validations','WORKFLOW / UI_FLOW / REPORT']},
    {title:'Vector Store (RAG)',icon:'🧠',col:C.green,bg2:'0A2215',items:['OpenAI embedding model','Hybrid semantic + keyword','Persistent disk index','Auto-flush every 30 seconds','Per-source removal support','Source, module, app filtering']},
    {title:'Knowledge Validator',icon:'✅',col:C.orange,bg2:'2A1205',items:['Evidence-based validation','Fact present in source text','Confidence threshold checks','Automatic rejection with reasons','Partial data handling','Batch validation pipeline']},
    {title:'KB → Test Generation',icon:'⚡',col:C.gold,bg2:'252008',items:['Shared buildRAGContextBlock()','Powers ALL test generators','JDE, SAP, Salesforce, custom','KB context in every AI prompt','Grounded, accurate test cases','Source attribution tracked']},
  ];

  features.forEach((f,i)=>{
    const x=0.28+(i%3)*4.25, y=1.56+(Math.floor(i/3)*2.1);
    card(s,x,y,3.98,1.92,f.bg2,f.col);
    s.addShape('rect',{x,y,w:3.98,h:0.045,fill:{type:'solid',color:f.col},line:{type:'none'}});
    s.addText(f.icon+'  '+f.title,{x:x+0.12,y:y+0.1,w:3.72,h:0.38,fontSize:13,bold:true,color:f.col,fontFace:'Calibri'});
    f.items.forEach((item,j)=>{
      s.addText('• '+item,{x:x+0.15,y:y+0.55+j*0.22,w:3.68,h:0.2,fontSize:9.5,color:C.light,fontFace:'Calibri'});
    });
  });
  foot(s);
})();


// ══════════════════════════════════════════════════════════════════
// SLIDE 8 — DATABASE SCHEMA (ENTITY MAP)
// ══════════════════════════════════════════════════════════════════
(function(){
  const s=prs.addSlide(); bg(s,C.dark);
  bar(s,C.teal,0,0.055); tag(s,'DATA ARCHITECTURE — DATABASE SCHEMA',C.teal);
  ttl(s,'Complete Database Entity Relationship Map',0.38,30); uline(s,C.teal,0.94,5.5);
  sub(s,'Drizzle ORM schema — dual PostgreSQL (prod) / SQLite (dev). IStorage interface abstracts all DB operations for zero-migration switching.',1.04,13);

  const entities=[
    {name:'users',col:C.cyan,fields:['id (PK)','email','passwordHash','firstName, lastName','mustChangePassword','isActive, isSuperAdmin']},
    {name:'projects',col:C.blue,fields:['id (PK)','name, slug','description','ownerId → users.id','isActive, settings{}']},
    {name:'roles',col:C.purple,fields:['id (PK)','name, displayName','permissions[]','isSystem (bool)']},
    {name:'testSuites',col:C.green,fields:['id (PK)','name, description','tags[]','createdAt, updatedAt']},
    {name:'testCases',col:C.teal,fields:['id (PK)','suiteId → testSuites','title, steps[]{}','priority, status, tags[]','reviewStatus, contentHash','aiProvenance{}']},
    {name:'testExecutions',col:C.orange,fields:['id (PK)','suiteId, agentId','framework, testData[]','status, environment','totalTests, passedTests','duration, startedAt']},
    {name:'testResults',col:C.yellow,fields:['id (PK)','executionId, testCaseId','status, errorMessage','screenshot, video','stepScreenshots[]','networkLogs[], perfMetrics{}']},
    {name:'testAgents',col:C.green,fields:['id (PK)','name, type, status','isAutonomous, targetUrl','scheduleInterval','selfHealingEnabled','capabilities[]']},
    {name:'environments',col:C.blue,fields:['id (PK)','name, displayName','baseUrl','variables{}, headers{}','isDefault, isActive']},
    {name:'governance_audit_log',col:C.pink,fields:['id (PK)','eventType, severity','resourceType, resourceId','actorId, actorEmail','payload{}, signature','ipAddress, systemType']},
    {name:'review_records',col:C.orange,fields:['id (PK)','resourceType, resourceId','decision (APPROVED etc)','reviewerName, comment','contentHashAtReview','signature (SHA-256)']},
    {name:'knowledge_sources',col:C.gold,fields:['id (PK)','name, sourceType','status (READY etc)','application, moduleTag','documentCount']},
  ];

  entities.forEach((e,i)=>{
    const col2=i%4, row=Math.floor(i/4);
    const x=0.28+col2*3.18, y=1.52+row*1.38;
    card(s,x,y,3.0,1.25,C.card,e.col);
    s.addShape('rect',{x,y,w:3.0,h:0.038,fill:{type:'solid',color:e.col},line:{type:'none'}});
    s.addText(e.name,{x:x+0.1,y:y+0.06,w:2.8,h:0.3,fontSize:11,bold:true,color:e.col,fontFace:'Calibri'});
    e.fields.forEach((f,j)=>{
      s.addText('  '+f,{x:x+0.08,y:y+0.38+j*0.15,w:2.84,h:0.15,fontSize:8,color:C.light,fontFace:'Calibri'});
    });
  });
  foot(s);
})();


// ══════════════════════════════════════════════════════════════════
// SLIDE 9 — GOVERNANCE & COMPLIANCE ARCHITECTURE
// ══════════════════════════════════════════════════════════════════
(function(){
  const s=prs.addSlide(); bg(s,'070A18');
  bar(s,C.pink,0,0.055); tag(s,'GOVERNANCE ARCHITECTURE — 21 CFR PART 11',C.pink);
  ttl(s,'Human-in-the-Loop Governance System Architecture',0.38,29,C.white); uline(s,C.pink,0.94,7);
  sub(s,'Every AI output in VALIDATED mode must pass through a cryptographically-signed human approval gate before execution. Zero bypass — even for admins.',1.04,13);

  // Flow: AI generates → Review gate → Approved → Execute
  const flow=[
    ['AI Generates\nTest Case','DRAFT status\nstamped to DB',C.purple,'160D30'],
    ['Review\nRequired Check','Blocks execution\nif not APPROVED',C.orange,'2A1205'],
    ['Human Review\nGate Opens','Attestation +\ne-signature required',C.yellow,'252008'],
    ['Backend\nValidates','SHA-256 signed\nreview_records row',C.blue,'0A1830'],
    ['Status →\nAPPROVED','contentHash stored\nfor tamper detection',C.green,'0A2215'],
    ['Execution\nAllowed','Audit log entry\ncryptographically signed',C.cyan,'0A2030'],
  ];
  flow.forEach((f,i)=>{
    const x=0.3+i*2.12;
    card(s,x,1.52,1.95,1.68,f[3],f[2]);
    s.addShape('rect',{x,y:1.52,w:1.95,h:0.042,fill:{type:'solid',color:f[2]},line:{type:'none'}});
    s.addShape('ellipse',{x:x+0.72,y:1.6,w:0.5,h:0.5,fill:{type:'solid',color:f[2]},line:{type:'none'}});
    s.addText(String(i+1),{x:x+0.72,y:1.6,w:0.5,h:0.5,fontSize:17,bold:true,color:'000D1A',align:'center',fontFace:'Calibri'});
    s.addText(f[0],{x:x+0.08,y:2.18,w:1.8,h:0.5,fontSize:10.5,bold:true,color:f[2],align:'center',fontFace:'Calibri',wrap:true});
    s.addText(f[1],{x:x+0.08,y:2.72,w:1.8,h:0.38,fontSize:9,color:C.light,align:'center',fontFace:'Calibri',wrap:true});
    if(i<5){s.addShape('rightArrow',{x:x+2.01,y:2.2,w:0.08,h:0.3,fill:{type:'solid',color:C.gray},line:{type:'none'}});}
  });

  // Key Controls
  s.addText('Non-Bypassable Controls:',{x:0.5,y:3.38,w:12,h:0.34,fontSize:14,bold:true,color:C.gray,fontFace:'Calibri'});
  [['🔒  No "skip review" flag — mode set via platform_settings only. No per-request override.',C.pink],
   ['👤  E-signature must match account name exactly (case-insensitive). Backend re-validates.',C.orange],
   ['✏  Any edit clears contentHash → reverts test case to DRAFT. Must re-review.',C.yellow],
   ['👥  Configurable minimum approver count (SETTING_KEY_MIN_APPROVERS) per content hash.',C.blue],
   ['🔴  Auto-heal blocked in VALIDATED mode. Logs CRITICAL REVIEW_BYPASS_ATTEMPTED event.',C.pink],
   ['🔗  Audit log append-only. SHA-256 signed. Verified via GET /api/governance/audit/verify/:id.',C.cyan]].forEach(([t,col],i)=>{
    const x=0.3+(i%2)*6.35, y=3.82+(Math.floor(i/2)*0.52);
    s.addShape('roundRect',{x,y,w:6.08,h:0.44,rectRadius:0.07,fill:{type:'solid',color:C.card},line:{color:col,pt:1}});
    s.addText(t,{x:x+0.12,y:y+0.05,w:5.82,h:0.34,fontSize:10.5,color:C.white,fontFace:'Calibri',wrap:true});
  });
  foot(s);
})();


// ══════════════════════════════════════════════════════════════════
// SLIDE 10 — MULTI-AGENT ARCHITECTURE
// ══════════════════════════════════════════════════════════════════
(function(){
  const s=prs.addSlide(); bg(s,C.dark);
  bar(s,C.green,0,0.055); tag(s,'MULTI-AGENT ARCHITECTURE',C.green);
  ttl(s,'Autonomous Multi-Agent System Architecture',0.38,30); uline(s,C.green,0.94,5.5);
  sub(s,'Orchestrator coordinates specialized agents (Navigator, Action, Validation, DOM Intelligence, Memory, Planner) for autonomous test execution.',1.04,13);

  // Orchestrator in center
  card(s,4.6,2.0,3.62,1.28,'0F2815',C.green);
  s.addShape('rect',{x:4.6,y:2.0,w:3.62,h:0.045,fill:{type:'solid',color:C.green},line:{type:'none'}});
  s.addText('🎯  ORCHESTRATOR AGENT',{x:4.75,y:2.08,w:3.32,h:0.38,fontSize:14,bold:true,color:C.green,fontFace:'Calibri'});
  s.addText('Coordinates all sub-agents\nManages agent lifecycle & state\nRoutes tasks via Agent Bus',{x:4.75,y:2.52,w:3.32,h:0.6,fontSize:10,color:C.light,fontFace:'Calibri',wrap:true});

  // Sub-agents
  const agents=[
    {name:'PLANNER AGENT',icon:'🗺',desc:'Breaks test cases into executable steps. Plans navigation & action sequence.',col:C.blue,bg2:'0A1830',x:0.3,y:1.52},
    {name:'NAVIGATOR AGENT',icon:'🧭',desc:'Controls browser navigation. URL routing, back/forward, tab management.',col:C.cyan,bg2:'0A2030',x:0.3,y:3.38},
    {name:'ACTION AGENT',icon:'⚡',desc:'Executes UI interactions: click, type, select, scroll, drag & hover.',col:C.orange,bg2:'2A1205',x:4.35,y:4.52},
    {name:'DOM INTELLIGENCE',icon:'🔬',desc:'Analyses DOM structure. Smart element finding, self-healing selectors.',col:C.purple,bg2:'160D30',x:8.52,y:3.38},
    {name:'VALIDATION AGENT',icon:'✅',desc:'Verifies expected outcomes. Screenshot comparison, text assertion.',col:C.yellow,bg2:'252008',x:8.52,y:1.52},
    {name:'MEMORY AGENT',icon:'🧠',desc:'Persists test state, session data, context across agent interactions.',col:C.teal,bg2:'0A2028',x:4.35,y:0.28},
  ];
  agents.forEach((ag)=>{
    card(s,ag.x,ag.y,3.8,1.58,ag.bg2,ag.col);
    s.addShape('rect',{x:ag.x,y:ag.y,w:3.8,h:0.042,fill:{type:'solid',color:ag.col},line:{type:'none'}});
    s.addText(ag.icon+'  '+ag.name,{x:ag.x+0.12,y:ag.y+0.1,w:3.55,h:0.38,fontSize:11.5,bold:true,color:ag.col,fontFace:'Calibri'});
    s.addText(ag.desc,{x:ag.x+0.12,y:ag.y+0.56,w:3.55,h:0.85,fontSize:10,color:C.light,fontFace:'Calibri',wrap:true});
  });

  // Agent Bus label
  card(s,4.35,4.95,3.62,0.52,'0A1525',C.gray);
  s.addText('📡  AGENT BUS — Event-driven inter-agent communication & state sharing',{x:4.48,y:5.04,w:3.36,h:0.35,fontSize:9,color:C.gray,fontFace:'Calibri',wrap:true});
  foot(s);
})();


// ══════════════════════════════════════════════════════════════════
// SLIDE 11 — TEST DATA FACTORY
// ══════════════════════════════════════════════════════════════════
(function(){
  const s=prs.addSlide(); bg(s,'07101C');
  bar(s,C.teal,0,0.055); tag(s,'FEATURE — TEST DATA FACTORY',C.teal);
  ttl(s,'Intelligent Test Data Factory',0.38,30,C.white); uline(s,C.teal,0.94,4.5);
  sub(s,'Generate synthetic, realistic, and parametrized test data on-demand for any application domain — no real data exposure.',1.04,13);

  const dataTypes=[
    {type:'USER DATA',icon:'👤',col:C.blue,bg2:'0A1830',examples:['firstName, lastName, email','username, passwordHash','phoneNumber, dateOfBirth','address (full structured)','profilePicture URL','role, department, employeeId']},
    {type:'PRODUCT DATA',icon:'🛍',col:C.green,bg2:'0A2215',examples:['productName, SKU, barcode','price, discountRate, tax','category, subcategory','stockQty, warehouseLocation','dimensions, weight','supplier, leadTime']},
    {type:'PAYMENT DATA',icon:'💳',col:C.purple,bg2:'160D30',examples:['cardNumber (masked)','expiryDate, CVV (test)','bankAccount, IBAN','paymentMethod type','currency, amount','transactionReference']},
    {type:'ADDRESS DATA',icon:'📍',col:C.orange,bg2:'2A1205',examples:['street, city, state','postalCode, country','GPS coordinates','addressType (billing etc)','deliveryInstructions','timezone']},
    {type:'DATE & TIME',icon:'📅',col:C.yellow,bg2:'252008',examples:['ISO 8601 date strings','Past / future date ranges','Business day calculation','Timezone-aware timestamps','Fiscal year periods','Cron expression generation']},
    {type:'CUSTOM / POOLS',icon:'🎲',col:C.pink,bg2:'2A0815',examples:['Reusable data pool sets','Shared across test suites','Auto-cleanup after run','CSV / JSON export','Parameter injection {{var}}','Edge case generation']},
  ];
  dataTypes.forEach((d,i)=>{
    const x=0.28+(i%3)*4.25, y=1.56+(Math.floor(i/3)*2.05);
    card(s,x,y,3.98,1.85,d.bg2,d.col);
    s.addShape('rect',{x,y,w:3.98,h:0.042,fill:{type:'solid',color:d.col},line:{type:'none'}});
    s.addText(d.icon+'  '+d.type,{x:x+0.12,y:y+0.1,w:3.72,h:0.38,fontSize:13,bold:true,color:d.col,fontFace:'Calibri'});
    d.examples.forEach((ex,j)=>{
      s.addText('• '+ex,{x:x+0.15,y:y+0.55+j*0.22,w:3.68,h:0.2,fontSize:9.5,color:C.light,fontFace:'Calibri'});
    });
  });
  s.addText('Placeholder syntax: {{username}}, {{email}}, {{price}} — auto-substituted at execution time into test steps',{x:0.5,y:5.42,w:12.33,h:0.25,fontSize:10,color:C.gray,fontFace:'Calibri'});
  foot(s);
})();


// ══════════════════════════════════════════════════════════════════
// SLIDE 12 — COVERAGE MATRIX + REPORT ANALYTICS
// ══════════════════════════════════════════════════════════════════
(function(){
  const s=prs.addSlide(); bg(s,C.dark);
  bar(s,C.yellow,0,0.055); tag(s,'FEATURE — COVERAGE MATRIX & ANALYTICS',C.yellow);
  ttl(s,'Requirements Coverage Matrix & Predictive Analytics',0.38,29); uline(s,C.yellow,0.94,6);
  sub(s,'Automatically maps test cases to requirements via tag & keyword matching. Identifies uncovered requirements. Predicts pass rates.',1.04,13);

  // Coverage matrix mockup
  card(s,0.3,1.52,7.3,3.08,'0A1A0A',C.green);
  s.addShape('rect',{x:0.3,y:1.52,w:7.3,h:0.042,fill:{type:'solid',color:C.green},line:{type:'none'}});
  s.addText('📊  Coverage Matrix',{x:0.48,y:1.58,w:7.0,h:0.36,fontSize:13,bold:true,color:C.green,fontFace:'Calibri'});

  // Header row
  ['REQUIREMENT','TC-001','TC-002','TC-003','TC-004','TC-005','Cov%'].forEach((h,i)=>{
    const x=0.42+i*0.99;
    s.addShape('roundRect',{x,y:2.02,w:0.94,h:0.3,rectRadius:0.04,fill:{type:'solid',color:'0A2215'},line:{color:C.green,pt:1}});
    s.addText(h,{x,y:2.04,w:0.94,h:0.26,fontSize:8,bold:true,color:C.green,align:'center',fontFace:'Calibri'});
  });
  const rows=[
    ['REQ-001: Login','✓','✓','✓','','','100%',C.green],
    ['REQ-002: Search','✓','','','✓','','67%',C.yellow],
    ['REQ-003: Checkout','','✓','','','✓','50%',C.orange],
    ['REQ-004: Reports','','','','','','0%',C.pink],
  ];
  rows.forEach((row,ri)=>{
    row.slice(0,7).forEach((cell,ci)=>{
      const x=0.42+ci*0.99, y=2.38+ri*0.42;
      const bgc=ci===0?'0D1F10':ci===6?'0D1F10':'080F10';
      const col=ci===6?(cell==='100%'?C.green:cell==='0%'?C.pink:C.yellow):cell==='✓'?C.green:C.gray;
      s.addShape('roundRect',{x,y,w:0.94,h:0.36,rectRadius:0.04,fill:{type:'solid',color:bgc},line:{color:'1A3050',pt:1}});
      s.addText(cell,{x,y:y+0.02,w:0.94,h:0.32,fontSize:ci===0?7.5:11,color:col,align:'center',fontFace:'Calibri',bold:ci===6});
    });
  });
  // Summary
  s.addShape('roundRect',{x:0.42,y:4.1,w:7.12,h:0.38,rectRadius:0.07,fill:{type:'solid',color:'0A2A0A'},line:{color:C.green,pt:1}});
  s.addText('Overall Coverage: 54%  |  Covered: 3/4 requirements  |  Uncovered: REQ-004 Reports  |  Fully Covered: REQ-001 Login',{x:0.55,y:4.16,w:6.88,h:0.26,fontSize:9.5,color:C.light,fontFace:'Calibri'});

  // Right: Analytics
  card(s,7.85,1.52,4.72,3.08,'0A1A25',C.cyan);
  s.addShape('rect',{x:7.85,y:1.52,w:4.72,h:0.042,fill:{type:'solid',color:C.cyan},line:{type:'none'}});
  s.addText('📈  Predictive Analytics',{x:8.0,y:1.58,w:4.42,h:0.36,fontSize:13,bold:true,color:C.cyan,fontFace:'Calibri'});
  [['Pass Rate Trend','Analyses 30-day execution history to predict next run pass rate',C.green],
   ['Flaky Test Detection','Identifies tests that alternate pass/fail — flags for investigation',C.yellow],
   ['Failure Pattern Analysis','Groups failures by error type, framework, environment',C.orange],
   ['Coverage Gaps Report','Lists requirements with zero test coverage automatically',C.pink],
   ['Performance Regression','Compares LCP/FCP/TTI across releases to catch slowdowns',C.cyan],
   ['AI Insight Generation','GPT-4o writes human-readable summary of execution results',C.purple]].forEach(([t,d,col],i)=>{
    const y=2.0+i*0.5;
    s.addShape('roundRect',{x:8.0,y,w:4.45,h:0.42,rectRadius:0.07,fill:{type:'solid',color:C.card},line:{color:col,pt:1}});
    s.addText(t,{x:8.12,y:y+0.04,w:4.2,h:0.18,fontSize:9.5,bold:true,color:col,fontFace:'Calibri'});
    s.addText(d,{x:8.12,y:y+0.22,w:4.2,h:0.16,fontSize:8.5,color:C.gray,fontFace:'Calibri',wrap:true});
  });

  // Export formats
  s.addText('Report Export: HTML (styled) · JSON (structured) · JUnit XML (CI/CD) · CSV (spreadsheet)',{x:0.5,y:5.42,w:12.33,h:0.25,fontSize:10,color:C.gray,fontFace:'Calibri'});
  foot(s);
})();


// ══════════════════════════════════════════════════════════════════
// SLIDE 13 — ENTERPRISE EXECUTOR ARCHITECTURE
// ══════════════════════════════════════════════════════════════════
(function(){
  const s=prs.addSlide(); bg(s,'07101C');
  bar(s,C.orange,0,0.055); tag(s,'EXECUTION ENGINE — ALL ADAPTERS',C.orange);
  ttl(s,'Enterprise Execution Adapter Architecture',0.38,30,C.white); uline(s,C.orange,0.94,5.5);
  sub(s,'Adapter Pattern: every executor implements the same interface — runExecution() + generateScript(). 10+ production-grade adapters.',1.04,13);

  // Interface box
  card(s,3.5,1.5,5.82,0.8,'0F1A10',C.green);
  s.addShape('rect',{x:3.5,y:1.5,w:5.82,h:0.042,fill:{type:'solid',color:C.green},line:{type:'none'}});
  s.addText('TestExecutorAdapter Interface  |  run(testCase, config): Promise<TestResult>  |  generateScript?(testCase): Promise<string>',{x:3.65,y:1.56,w:5.55,h:0.65,fontSize:9.5,color:C.green,fontFace:'Calibri',wrap:true,bold:true});

  const adapters=[
    {name:'Playwright',icon:'🎭',col:C.blue,bg2:'0A1830',notes:'Full support: video, network logs, performance metrics, step screenshots'},
    {name:'Puppeteer',icon:'🤖',col:C.cyan,bg2:'0A2030',notes:'Network logging + performance metrics. No native video recording.'},
    {name:'Selenium WebDriver',icon:'🌐',col:C.orange,bg2:'2A1205',notes:'Performance metrics only. Remote Grid support. ChromeDriver, GeckoDriver.'},
    {name:'SAP Fiori (Web)',icon:'🏢',col:C.purple,bg2:'160D30',notes:'Playwright-based. SAPUI5 & Fiori Elements. Login, navigation, transactions.'},
    {name:'SAP GUI (Desktop)',icon:'🖥',col:C.blue,bg2:'0A1830',notes:'VBScript SAP GUI automation generation. T-code execution. Screen scraping.'},
    {name:'Salesforce CRM',icon:'☁',col:C.teal,bg2:'0A2028',notes:'Playwright-based. Lightning & Classic. SOQL validation. Custom objects.'},
    {name:'Oracle JDE',icon:'🔶',col:C.orange,bg2:'2A1205',notes:'AIS (Application Interface Services) REST API + Selenium for E1 Pages.'},
    {name:'REST API Executor',icon:'🔗',col:C.yellow,bg2:'252008',notes:'Full HTTP testing: GET/POST/PUT/DELETE/PATCH. Auth headers. Response assertion.'},
    {name:'GraphQL Executor',icon:'⚡',col:C.green,bg2:'0A2215',notes:'GraphQL query & mutation execution. Response validation. Schema testing.'},
    {name:'SOAP / WSDL',icon:'📡',col:C.gray,bg2:'181A20',notes:'XML-based SOAP request generation from WSDL. Response parsing & assertion.'},
    {name:'Appium (Mobile)',icon:'📱',col:C.pink,bg2:'2A0815',notes:'iOS (XCUITest) & Android (UiAutomator2). Real devices & simulators. Gestures.'},
    {name:'.NET WinAppDriver',icon:'🪟',col:C.blue,bg2:'0A1830',notes:'Windows desktop app automation via WinAppDriver. UIA accessibility tree.'},
  ];

  adapters.forEach((a,i)=>{
    const x=0.28+(i%4)*3.2, y=2.5+(Math.floor(i/4)*0.86);
    card(s,x,y,3.05,0.76,a.bg2,a.col);
    s.addShape('rect',{x,y,w:3.05,h:0.035,fill:{type:'solid',color:a.col},line:{type:'none'}});
    s.addText(a.icon+'  '+a.name,{x:x+0.1,y:y+0.06,w:2.85,h:0.28,fontSize:10.5,bold:true,color:a.col,fontFace:'Calibri'});
    s.addText(a.notes,{x:x+0.1,y:y+0.36,w:2.85,h:0.34,fontSize:8,color:C.light,fontFace:'Calibri',wrap:true});
  });
  foot(s);
})();


// ══════════════════════════════════════════════════════════════════
// SLIDE 14 — SECURITY ARCHITECTURE DEEP DIVE
// ══════════════════════════════════════════════════════════════════
(function(){
  const s=prs.addSlide(); bg(s,C.dark);
  bar(s,C.green,0,0.055); tag(s,'SECURITY ARCHITECTURE',C.green);
  ttl(s,'Enterprise Security Architecture — Defense in Depth',0.38,30); uline(s,C.green,0.94,5);
  sub(s,'Six independent security layers — each designed to be independently verifiable and non-bypassable.',1.04,13);

  // Security layers stacked
  const layers=[
    {layer:'LAYER 6 — COMPLIANCE & AUDIT',desc:'Immutable governance_audit_log table. SHA-256 signed events. Append-only. 21 CFR / EU Annex 11. Verified via /api/governance/audit/verify/:id',col:C.pink,bg2:'1A0812'},
    {layer:'LAYER 5 — WEBHOOK SECURITY',desc:'GitHub: HMAC-SHA256 X-Hub-Signature-256. GitLab: X-GitLab-Token comparison. Azure: Bearer token. Full inbound payload signature verification.',col:C.orange,bg2:'1A1008'},
    {layer:'LAYER 4 — RBAC + PROJECTS',desc:'Admin / Tester / Viewer roles with permissions[]. Per-project TeamMembership. isSuperAdmin flag. Route-level permission guard on every endpoint.',col:C.yellow,bg2:'1A1A08'},
    {layer:'LAYER 3 — SESSION SECURITY',desc:'httpOnly + secure + sameSite=lax cookies. SESSION_SECRET env var. Prod: connect-pg-simple. Dev: memorystore. express-session v1.18.',col:C.blue,bg2:'0A1830'},
    {layer:'LAYER 2 — INPUT VALIDATION',desc:'Zod schema validation on ALL POST/PATCH endpoints. Insert schemas via drizzle-zod. Partial schemas for updates. Sanitized error messages.',col:C.cyan,bg2:'0A2030'},
    {layer:'LAYER 1 — PASSWORD SECURITY',desc:'PBKDF2-SHA256 hashing. 100,000 iterations. 32-byte crypto.randomBytes salt. Hex-encoded output. bcrypt-equivalent security at enterprise standards.',col:C.green,bg2:'0A2215'},
  ];

  layers.forEach((l,i)=>{
    const y=1.52+i*0.72;
    card(s,0.3,y,12.73,0.64,l.bg2,l.col);
    s.addShape('rect',{x:0.3,y,w:12.73,h:0.035,fill:{type:'solid',color:l.col},line:{type:'none'}});
    s.addText(l.layer,{x:0.48,y:y+0.06,w:3.8,h:0.28,fontSize:10.5,bold:true,color:l.col,fontFace:'Calibri'});
    s.addText(l.desc,{x:4.35,y:y+0.06,w:8.55,h:0.48,fontSize:10,color:C.light,fontFace:'Calibri',wrap:true});
  });

  s.addShape('rect',{x:0.3,y:5.88,w:12.73,h:0.018,fill:{type:'solid',color:C.border},line:{type:'none'}});
  s.addText('Zero-Trust architecture: every request is independently authenticated, validated, and authorized regardless of origin',{x:0.5,y:5.42,w:12.33,h:0.24,fontSize:10,bold:true,color:C.cyan,fontFace:'Calibri',align:'center'});
  foot(s);
})();


// ══════════════════════════════════════════════════════════════════
// SLIDE 15 — COMPLETE FEATURE MATRIX
// ══════════════════════════════════════════════════════════════════
(function(){
  const s=prs.addSlide(); bg(s,'07101C');
  bar(s,C.gold,0,0.055); tag(s,'COMPLETE FEATURE MATRIX',C.gold);
  ttl(s,'AITAS — Complete Capability & Feature Matrix',0.38,30,C.white); uline(s,C.gold,0.94,6);
  sub(s,'Every capability available in the current release — covering the full test automation lifecycle end-to-end.',1.04,13);

  const cats=[
    {cat:'AI & GENERATION',col:C.purple,items:['AI test cases from natural language','AI script generation (4 frameworks × 5 languages)','NLP step parser (22+ action keywords)','Knowledge-grounded test generation (RAG)','Rule-based fallback (no API key needed)','AI requirement → test case mapping']},
    {cat:'EXECUTION ENGINE',col:C.green,items:['Playwright (video, network, perf)','Puppeteer & Selenium WebDriver','Appium (iOS + Android)','SAP Fiori & SAP GUI','Salesforce CRM (Lightning + Classic)','Oracle JDE (AIS + E1 Pages)']},
    {cat:'API & INTEGRATION',col:C.blue,items:['REST API (all HTTP methods)','GraphQL queries & mutations','SOAP / WSDL testing','Service virtualization (API Mocks)','GraphQL schema introspection','Response body assertion & diff']},
    {cat:'AI INTELLIGENCE',col:C.cyan,items:['AI Self-Healing (selector repair)','Autonomous agents (24/7 background)','AI test result analysis','Predictive pass-rate analytics','AI evidence review (GPT-4o)','AI-powered report insights']},
    {cat:'QUALITY & COVERAGE',col:C.yellow,items:['Visual regression engine','Pixel-diff baseline comparison','Core Web Vitals (LCP, FID, CLS)','Coverage matrix (req → test)','Gap analysis & uncovered reqs','Performance trend across releases']},
    {cat:'DEVOPS & GOVERNANCE',col:C.orange,items:['GitHub Actions / GitLab CI / Jenkins','Azure DevOps native integration','Cron-based test scheduler','21 CFR Part 11 e-signatures','Multi-approver review workflows','Immutable SHA-256 audit trail']},
  ];

  cats.forEach((cat,i)=>{
    const x=0.28+(i%3)*4.25, y=1.56+(Math.floor(i/3)*2.1);
    card(s,x,y,3.98,1.92,C.card,cat.col);
    s.addShape('rect',{x,y,w:3.98,h:0.042,fill:{type:'solid',color:cat.col},line:{type:'none'}});
    s.addText(cat.cat,{x:x+0.12,y:y+0.1,w:3.72,h:0.36,fontSize:11.5,bold:true,color:cat.col,fontFace:'Calibri',charSpacing:1});
    cat.items.forEach((item,j)=>{
      s.addText('✓  '+item,{x:x+0.12,y:y+0.54+j*0.23,w:3.7,h:0.2,fontSize:9.5,color:C.light,fontFace:'Calibri'});
    });
  });
  foot(s);
})();


// ══════════════════════════════════════════════════════════════════
// SLIDE 16 — SCALABILITY & DEPLOYMENT ARCHITECTURE
// ══════════════════════════════════════════════════════════════════
(function(){
  const s=prs.addSlide(); bg(s,C.dark);
  bar(s,C.teal,0,0.055); tag(s,'DEPLOYMENT & SCALABILITY',C.teal);
  ttl(s,'Deployment Architecture & Scale-Out Roadmap',0.38,30); uline(s,C.teal,0.94,5.5);
  sub(s,'Docker-first, 12-factor app design. Runs on a single container today, scales to Kubernetes cluster with zero code changes.',1.04,13);

  // Current: single container
  card(s,0.3,1.52,5.95,3.9,'091828',C.blue);
  s.addShape('rect',{x:0.3,y:1.52,w:5.95,h:0.042,fill:{type:'solid',color:C.blue},line:{type:'none'}});
  s.addText('CURRENT — Docker Compose',{x:0.48,y:1.58,w:5.65,h:0.34,fontSize:13,bold:true,color:C.blue,fontFace:'Calibri'});
  [['🐳 aitas-app','Node.js 20, Port 5000, Playwright browsers installed'],
   ['🐘 postgres','PostgreSQL 15, Volume: pgdata, Port 5432'],
   ['🔬 selenium-hub','Optional Grid: Chrome + Firefox nodes, Port 4444'],
   ['⚙ .env config','DATABASE_URL, SESSION_SECRET, OPENAI_API_KEY, LLM_API_URL'],
   ['🏥 health probes','GET /api/health (liveness) + GET /api/ready (readiness)'],
   ['📦 build pipeline','Vite → dist/public/ + esbuild → dist/index.cjs']].forEach(([icon,desc],i)=>{
    const y=2.0+i*0.54;
    s.addShape('roundRect',{x:0.45,y,w:5.65,h:0.46,rectRadius:0.07,fill:{type:'solid',color:'0A1830'},line:{color:C.blue,pt:1}});
    s.addText(icon,{x:0.55,y:y+0.04,w:1.8,h:0.38,fontSize:10,bold:true,color:C.blue,fontFace:'Calibri'});
    s.addText(desc,{x:2.42,y:y+0.06,w:3.62,h:0.32,fontSize:9.5,color:C.light,fontFace:'Calibri',wrap:true});
  });

  // Scale-out
  card(s,6.5,1.52,6.12,3.9,'091520',C.green);
  s.addShape('rect',{x:6.5,y:1.52,w:6.12,h:0.042,fill:{type:'solid',color:C.green},line:{type:'none'}});
  s.addText('SCALE-OUT — Kubernetes / Cloud Ready',{x:6.65,y:1.58,w:5.82,h:0.34,fontSize:13,bold:true,color:C.green,fontFace:'Calibri'});
  [['Session Storage','memorystore → Redis Cluster (connect-redis)',C.blue],
   ['Test Execution','In-process async → Bull/BullMQ + Redis workers',C.cyan],
   ['Autonomous Agents','setInterval → Agenda.js distributed scheduler',C.purple],
   ['File Storage','Base64 in DB → AWS S3 / GCS (screenshots, video)',C.yellow],
   ['Vector Index','In-memory → Pinecone / Weaviate / Qdrant',C.gold],
   ['Database','Single PostgreSQL → Read replicas + PgBouncer',C.orange],
   ['WebSocket','ws (single node) → Socket.io + Redis adapter',C.teal]].forEach(([concern,solution,col],i)=>{
    const y=2.0+i*0.5;
    s.addShape('roundRect',{x:6.65,y,w:5.82,h:0.42,rectRadius:0.07,fill:{type:'solid',color:'0A1E12'},line:{color:col,pt:1}});
    s.addText(concern+':',{x:6.78,y:y+0.05,w:1.5,h:0.3,fontSize:9,bold:true,color:col,fontFace:'Calibri'});
    s.addText(solution,{x:8.32,y:y+0.05,w:4.1,h:0.3,fontSize:9,color:C.light,fontFace:'Calibri',wrap:true});
  });
  foot(s);
})();


// ══════════════════════════════════════════════════════════════════
// SLIDE 17 — DESIGN PATTERNS USED
// ══════════════════════════════════════════════════════════════════
(function(){
  const s=prs.addSlide(); bg(s,'07101C');
  bar(s,C.purple,0,0.055); tag(s,'SOFTWARE DESIGN PATTERNS',C.purple);
  ttl(s,'Enterprise Design Patterns Across AITAS',0.38,30,C.white); uline(s,C.purple,0.94,5.5);
  sub(s,'AITAS is architected using 8 core enterprise software design patterns — ensuring extensibility, testability, and maintainability.',1.04,13);

  const patterns=[
    {name:'Repository Pattern',col:C.blue,bg2:'0A1830',where:'IStorage interface + DatabaseStorage + SQLiteStorage',benefit:'Swap PostgreSQL ↔ SQLite with one line. Zero code changes in routes.'},
    {name:'Adapter Pattern',col:C.green,bg2:'0A2215',where:'PlaywrightExecutor, SeleniumExecutor, SAPFioriExecutor etc.',benefit:'Add new executor in 4 steps. All share same interface. No route changes.'},
    {name:'Strategy Pattern',col:C.purple,bg2:'160D30',where:'getAiClient() — OpenAI vs Azure vs Custom vs Fallback',benefit:'AI provider swapped via env vars. All services call getAiClient() identically.'},
    {name:'Factory Pattern',col:C.orange,bg2:'2A1205',where:'getAiClient(), testDataFactory, ExtractorRegistry.extract()',benefit:'Correct implementation auto-selected based on context. No switch statements.'},
    {name:'Observer Pattern',col:C.yellow,bg2:'252008',where:'Autonomous agent setInterval loop, Agent Bus events',benefit:'Agents publish events. Subscribers react independently. Decoupled execution.'},
    {name:'Facade Pattern',col:C.cyan,bg2:'0A2030',where:'routes.ts — single API surface for all 60+ endpoints',benefit:'Client sees one consistent API. Internal services hidden behind routes facade.'},
    {name:'Singleton Pattern',col:C.pink,bg2:'2A0815',where:'storage, aiTestExecutor, testScheduler, vectorIndex',benefit:'Single shared instance. Consistent state. Lazy initialization where needed.'},
    {name:'Pipeline Pattern',col:C.gold,bg2:'252008',where:'IngestionEngine: Extract → Structure → Validate → Store → Index',benefit:'Each stage is independent. Can run preview (partial) or full pipeline.'},
  ];

  patterns.forEach((p,i)=>{
    const x=0.28+(i%4)*3.2, y=1.56+(Math.floor(i/4)*2.05);
    card(s,x,y,3.05,1.88,p.bg2,p.col);
    s.addShape('rect',{x,y,w:3.05,h:0.042,fill:{type:'solid',color:p.col},line:{type:'none'}});
    s.addText(p.name,{x:x+0.1,y:y+0.1,w:2.85,h:0.4,fontSize:12,bold:true,color:p.col,fontFace:'Calibri',wrap:true});
    s.addText('WHERE:',{x:x+0.1,y:y+0.55,w:0.62,h:0.2,fontSize:8,bold:true,color:C.gray,fontFace:'Calibri'});
    s.addText(p.where,{x:x+0.1,y:y+0.72,w:2.85,h:0.38,fontSize:8.5,color:C.light,fontFace:'Calibri',wrap:true,italic:true});
    s.addText('WHY:',{x:x+0.1,y:y+1.14,w:0.52,h:0.2,fontSize:8,bold:true,color:C.gray,fontFace:'Calibri'});
    s.addText(p.benefit,{x:x+0.1,y:y+1.3,w:2.85,h:0.45,fontSize:8.5,color:p.col,fontFace:'Calibri',wrap:true});
  });
  foot(s);
})();


// ══════════════════════════════════════════════════════════════════
// SLIDE 18 — API SURFACE SUMMARY
// ══════════════════════════════════════════════════════════════════
(function(){
  const s=prs.addSlide(); bg(s,C.dark);
  bar(s,C.blue,0,0.055); tag(s,'API REFERENCE — SURFACE SUMMARY',C.blue);
  ttl(s,'REST API Surface — 60+ Endpoints Across 12 Domains',0.38,29); uline(s,C.blue,0.94,6);
  sub(s,'Fully documented REST JSON API. All POST/PATCH endpoints validated with Zod. Auth required on all except /api/health and /api/ready.',1.04,13);

  const domains=[
    {domain:'Core Test Management',col:C.green,endpoints:['GET/POST /api/test-suites','GET/PATCH/DELETE /api/test-suites/:id','GET/POST /api/test-cases','GET/PATCH/DELETE /api/test-cases/:id']},
    {domain:'AI Generation',col:C.purple,endpoints:['POST /api/generate-tests','POST /api/generate-script','POST /api/test-cases/validate','POST /api/test-cases/parse-steps']},
    {domain:'Execution Engine',col:C.orange,endpoints:['GET/POST /api/executions','GET /api/executions/:id','POST /api/executions/:id/cancel','GET /api/executions/:id/results']},
    {domain:'Enterprise Executors',col:C.blue,endpoints:['POST /api/executions/sap-fiori','POST /api/executions/salesforce','POST /api/executions/jde','POST /api/executions/api|graphql|soap']},
    {domain:'AI Healer + Agents',col:C.cyan,endpoints:['POST /api/healer/analyse','POST /api/healer/apply','POST /api/agents/:id/start|stop','GET /api/agents/:id/status']},
    {domain:'Knowledge Hub',col:C.gold,endpoints:['POST /api/knowledge/upload','GET /api/knowledge/sources','POST /api/knowledge/preview','GET /api/knowledge/health']},
    {domain:'Analytics & Reports',col:C.yellow,endpoints:['GET /api/coverage/matrix','GET /api/reports','POST /api/performance/benchmark','POST /api/visual/compare']},
    {domain:'CI/CD & Scheduling',col:C.teal,endpoints:['GET/POST /api/webhooks','POST /api/cicd/trigger','GET/POST /api/schedules','POST /api/schedules/:id/run-now']},
    {domain:'Governance',col:C.pink,endpoints:['POST /api/governance/reviews/bulk','GET /api/governance/audit/verify/:id','PUT /api/governance/system-type','PUT /api/governance/evidence/:id/attest']},
    {domain:'Auth & RBAC',col:C.green,endpoints:['POST /api/auth/login|logout','GET /api/auth/user','POST /api/auth/change-password','GET/POST /api/roles']},
    {domain:'Projects & Teams',col:C.blue,endpoints:['GET/POST /api/projects','DELETE /api/projects/:id','POST /api/projects/:id/members','GET /api/admin/users']},
    {domain:'Platform Settings',col:C.orange,endpoints:['GET /api/settings','POST /api/settings/bulk','GET /api/health', 'GET /api/ready']},
  ];

  domains.forEach((d,i)=>{
    const x=0.28+(i%4)*3.2, y=1.52+(Math.floor(i/4)*1.4);
    card(s,x,y,3.05,1.25,C.card,d.col);
    s.addShape('rect',{x,y,w:3.05,h:0.035,fill:{type:'solid',color:d.col},line:{type:'none'}});
    s.addText(d.domain,{x:x+0.1,y:y+0.06,w:2.85,h:0.3,fontSize:9.5,bold:true,color:d.col,fontFace:'Calibri',wrap:true});
    d.endpoints.forEach((ep,j)=>{
      s.addText(ep,{x:x+0.08,y:y+0.4+j*0.2,w:2.9,h:0.19,fontSize:7.5,color:C.light,fontFace:'Calibri'});
    });
  });
  foot(s);
})();


// ══════════════════════════════════════════════════════════════════
// SLIDE 19 — TECHNOLOGY STACK FULL MAP
// ══════════════════════════════════════════════════════════════════
(function(){
  const s=prs.addSlide(); bg(s,'07101C');
  bar(s,C.cyan,0,0.055); tag(s,'COMPLETE TECHNOLOGY STACK',C.cyan);
  ttl(s,'Full Technology Stack — 50+ Libraries & Services',0.38,30,C.white); uline(s,C.cyan,0.94,5);
  sub(s,'Production-grade, well-maintained open-source stack. Zero proprietary lock-in. Every layer replaceable via abstraction interfaces.',1.04,13);

  const cols=[
    {title:'FRONTEND',col:C.cyan,items:['React 18 + TypeScript','Vite 5 (HMR build tool)','Wouter 3 (routing, 2KB)','TanStack React Query v5','shadcn/ui + Radix UI','Tailwind CSS v3','React Hook Form + Zod','Recharts + Chart.js','Framer Motion','next-themes (dark mode)','Lucide React + React Icons']},
    {title:'BACKEND',col:C.green,items:['Node.js 24 (ESM modules)','Express.js v5','TypeScript (tsx / esbuild)','Passport.js + Local strategy','express-session v1.18','Zod schema validation','Drizzle ORM v0.45','drizzle-kit migrations','Multer (file uploads)','Bull queue + Redis','WebSocket (ws v8)']},
    {title:'AI & ML',col:C.purple,items:['OpenAI SDK v6 (GPT-4o)','Azure OpenAI support','text-embedding-3-small','Custom LLM endpoint ready','Tesseract.js (OCR)','pdf-parse (PDF text)','mammoth (DOCX extract)','JSZip (PPTX parsing)','xml2js (SOAP/XML)','Rule-based fallback gen','NLP action keyword parser']},
    {title:'DATABASES',col:C.blue,items:['PostgreSQL 15 (prod)','SQLite via better-sqlite3','Drizzle ORM (both)','connect-pg-simple sessions','memorystore (dev)','Redis (session scale-out)','Neon serverless PostgreSQL','Drizzle IStorage interface','UUID primary keys','JSONB columns for flex data','In-memory vector index']},
    {title:'EXECUTION',col:C.orange,items:['Playwright v1.57','Puppeteer v24','Selenium WebDriver v4','Appium (iOS + Android)','WinAppDriver (.NET)','Java AWT Bridge (JAB)','Tesseract.js (image OCR)','axios / node-fetch (API)','xml2js (SOAP parsing)','p-retry (retry logic)','p-limit (concurrency)']},
  ];

  cols.forEach((col,i)=>{
    const x=0.25+i*2.55;
    card(s,x,1.5,2.38,4.0,C.card,col.col);
    s.addShape('rect',{x,y:1.5,w:2.38,h:0.042,fill:{type:'solid',color:col.col},line:{type:'none'}});
    s.addText(col.title,{x:x+0.1,y:1.56,w:2.18,h:0.32,fontSize:11,bold:true,color:col.col,fontFace:'Calibri',charSpacing:1});
    col.items.forEach((item,j)=>{
      s.addText('• '+item,{x:x+0.1,y:1.94+j*0.33,w:2.18,h:0.3,fontSize:9,color:C.light,fontFace:'Calibri'});
    });
  });
  foot(s);
})();


// ══════════════════════════════════════════════════════════════════
// SLIDE 20 — CLOSING: AITAS INTELLIGENCE MAP
// ══════════════════════════════════════════════════════════════════
(function(){
  const s=prs.addSlide(); bg(s,'060C18');
  [[-1,-0.5,4,'0A1E35'],[11,5.5,3.5,'0A1E35'],[12,-0.8,3,'0A1E35'],[-0.5,5,2.5,'0A1E35']].forEach(([x,y,r,c])=>dot(s,x,y,r,c));
  [[8.2,0.8],[9.0,1.4],[9.7,0.7],[10.3,1.3],[9.5,2.1],[10.7,1.8],[11.3,1.1],[10.0,2.6],[11.2,2.2]].forEach(([x,y])=>dot(s,x,y,0.12,C.cyan));
  bar(s,C.gold,0,0.055);

  s.addText('AITAS',{x:0.5,y:0.85,w:12.33,h:1.2,fontSize:88,bold:true,color:C.white,fontFace:'Calibri',align:'center',charSpacing:14});
  s.addShape('rect',{x:3.5,y:2.0,w:5.83,h:0.06,fill:{type:'solid',color:C.gold},line:{type:'none'}});
  s.addText('Architecture & Intelligence Deep-Dive Complete',{x:0.5,y:2.15,w:12.33,h:0.5,fontSize:20,color:C.gold,fontFace:'Calibri',align:'center'});

  const summary=[
    ['3-Tier Architecture','React SPA → Express API → PostgreSQL + AI Services',C.cyan],
    ['6-Stage KB Pipeline','Upload → Extract → Structure → Validate → Store → Index',C.gold],
    ['Hybrid RAG Engine','Semantic embeddings + TF-IDF keyword scoring + disk persistence',C.purple],
    ['10+ Exec Adapters','Playwright, Selenium, SAP, Salesforce, JDE, Appium, API, Desktop',C.green],
    ['6-Layer Security','PBKDF2 + Session + Zod + RBAC + Webhooks + Governance Audit',C.orange],
    ['8 Design Patterns','Repository, Adapter, Strategy, Factory, Observer, Facade, Singleton, Pipeline',C.blue],
  ];
  summary.forEach(([title,desc,col],i)=>{
    const x=0.3+(i%3)*4.25, y=2.85+(Math.floor(i/3)*1.2);
    card(s,x,y,3.98,1.05,C.card,col);
    s.addShape('rect',{x,y,w:3.98,h:0.042,fill:{type:'solid',color:col},line:{type:'none'}});
    s.addText(title,{x:x+0.14,y:y+0.1,w:3.7,h:0.32,fontSize:12,bold:true,color:col,fontFace:'Calibri'});
    s.addText(desc,{x:x+0.14,y:y+0.48,w:3.7,h:0.45,fontSize:9.5,color:C.light,fontFace:'Calibri',wrap:true});
  });

  bar(s,C.border,5.58,0.055);
  s.addText('AITAS  |  AI-Powered Test Automation System  |  Architecture Edition  |  2025',{x:0,y:5.65,w:'100%',h:0.24,fontSize:9.5,bold:true,color:C.gold,align:'center',fontFace:'Calibri'});
})();

// ═══════════════ SAVE ═══════════════
prs.writeFile({ fileName: 'AITAS_Architecture_Deep_Dive.pptx' })
  .then(()=>console.log('SUCCESS: AITAS_Architecture_Deep_Dive.pptx generated!'))
  .catch(err=>console.error('ERROR:',err));

