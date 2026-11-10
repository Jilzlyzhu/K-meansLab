(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KM = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FEATURES = [
    {name:'氨氮',short:'NH₃-N',unit:'mg/L'},
    {name:'叶绿素 a',short:'Chl-a',unit:'μg/L'},
    {name:'总磷',short:'TP',unit:'mg/L'},
    {name:'溶解氧',short:'DO',unit:'mg/L'},
    {name:'pH',short:'pH',unit:'无量纲'}
  ];
  const HAND_RAW = [[.1,5],[.2,8],[.15,6],[.8,30],[1,35],[.9,28],[1.8,80],[2,90]];
  // A declared instructional rescaling, not water quality thresholds or a national standard.
  const HAND = HAND_RAW.map(p=>[p[0]/.2,p[1]/10]);
  const HAND_INIT = [0,1,6];
  const STAGES = [{name:'发现问题',time:'0—5′',role:'导学'}, {name:'手算建模',time:'5—20′',role:'助学'}, {name:'实验验证',time:'20—34′',role:'助学 · 助评'}, {name:'迁移与反思',time:'34—40′',role:'助评'}];
  const RUBRIC = ['信息意识','计算思维','数字化学习与创新','信息社会责任'];
  const REFLECTION = {
    transfer:[['keep','归 B，保留原中心与分组，结束。'],['iterate','归 B，逐维更新中心，再分配所有点。'],['farthest','归 A，因为它离中心最远。']],
    application:[['alert','把某个簇作为蓝藻预警区。'],['review','用相似群体提供线索，再复测、核验。'],['grade','按簇编号排列水质等级。']],
    focus:[['distance','多维距离怎样计算？'],['mean','更新均值后为何要重新分组？'],['k','怎样用肘部图选 K？'],['boundary','聚类结果能说明什么？'],['extend','我想尝试新应用']]
  };
  function reflectionLabel(field,value){return REFLECTION[field]?.find(x=>x[0]===value)?.[1]||'未选择';}
  function reflectionCheck(a){return {transferOk:a.transfer==='iterate',applicationOk:a.application==='review'};}
  function reflectionNext(a){
    const c=reflectionCheck(a);
    if(!c.transferOk)return '回看“模拟过程”：中心移动后，最近的中心会变吗？';
    if(!c.applicationOk)return '回看指标表：分群之外，预警还缺哪些证据？';
    return {distance:'选一个三维样本，解释三项平方差为何要相加。',mean:'重播更新与分配，找一个改组点解释原因。',k:'用相邻 K 的 SSE 下降量解释选择；无明显拐点也可说明。',boundary:'举一项聚类未提供的信息，说明为何还需核验。',extend:'试试颜色减色：均值颜色怎样代表一组像素？'}[a.focus]||'结合自己的分群建议，向同伴解释一次距离分配和均值更新。';
  }
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const round=(n,p=4)=>Number(n.toFixed(p));
  function rng(seed=1) { let a=seed>>>0; return ()=>{ a+=0x6D2B79F5; let t=a; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }
  function makeData() {
    const r=rng(20261108), rows=[];
    const bases=[[.22,13,.045,8,7.7],[.85,42,.14,6.1,8.1],[1.6,83,.29,4.3,8.7]];
    const spread=[[.21,17,.046,2.4,1.0],[.48,30,.12,3.0,1.3],[.55,35,.15,3.3,1.2]];
    for(let i=0;i<38;i++) {
      const b=i<13?0:i<26?1:2;
      const values=bases[b].map((v,j)=>round(Math.max(j===4?6.5:.005,v+(r()-.5)*spread[b][j]),j===2?3:2));
      // Deliberately varied cross-feature profiles so extra dimensions can change neighborhoods.
      if(i===9){values[2]=.23;values[3]=4.7;values[4]=8.8;}
      if(i===22){values[2]=.055;values[3]=8.2;values[4]=7.4;}
      rows.push({id:`T${String(i+1).padStart(2,'0')}`,values});
    }
    rows.push({id:'T39',values:[1.1,118,.35,3.9,8.8]},{id:'T40',values:[1.95,73,.4,2.7,9.2]});
    return rows;
  }
  const DATA=makeData();
  function validatePoints(points){
    if(!Array.isArray(points)||!points.length||!Array.isArray(points[0])||!points[0].length)throw Error('需要非空数值数据');
    const d=points[0].length;
    if(points.some(p=>p.length!==d||p.some(v=>!Number.isFinite(v))))throw Error('维度须相同且数据须为有限数值');
  }
  function distance2(a,b){ if(a.length!==b.length)throw Error('维度不一致'); return a.reduce((s,v,i)=>s+(v-b[i])**2,0); }
  function scalingExample(unit='mg',rescaled=false){
    if(!['mg','ug'].includes(unit))throw Error('未知单位');
    // The physical samples stay fixed; their ammonia readings and reference scale convert together.
    const factor=unit==='ug'?1000:1,reference=[.2*factor,10];
    const readings=[[.2,10],[.4,11],[.24,15]].map(p=>[p[0]*factor,p[1]]);
    const points=readings.map(p=>p.map((v,d)=>rescaled?v/reference[d]:v));
    const comparisons=points.slice(1).map((p,i)=>({name:['乙','丙'][i],terms:p.map((v,d)=>(v-points[0][d])**2),d2:distance2(p,points[0])}));
    return {reference,readings,points,comparisons,nearest:comparisons.reduce((a,b)=>a.d2<b.d2?a:b).name};
  }
  function mean(points){validatePoints(points);return points[0].map((_,j)=>points.reduce((s,p)=>s+p[j],0)/points.length);}
  function scale(points, mode='zscore'){
    validatePoints(points);
    if(!['zscore','raw'].includes(mode))throw Error('未知缩放方式');
    const means=mean(points), std=means.map((m,j)=>Math.sqrt(points.reduce((s,p)=>s+(p[j]-m)**2,0)/points.length)||1);
    return {points:points.map(p=>p.map((v,j)=>mode==='raw'?v:(v-means[j])/std[j])),means,std,mode};
  }
  function assign(points,centers){return points.map(p=>{let c=0,best=Infinity;centers.forEach((v,j)=>{const d=distance2(p,v);if(d<best-1e-12){best=d;c=j;}});return c;});}
  function sse(points,centers,labels){return points.reduce((s,p,i)=>s+distance2(p,centers[labels[i]]),0);}
  function update(points,labels,old){return old.map((c,j)=>{const group=points.filter((_,i)=>labels[i]===j);return group.length?mean(group):c.slice();});}
  function choose(n,k,seed){const indices=Array.from({length:n},(_,i)=>i),r=rng(seed);for(let i=n-1;i>0;i--){const j=Math.floor(r()*(i+1));[indices[i],indices[j]]=[indices[j],indices[i]];}return indices.slice(0,k);}
  function run(points,k=3,seed=1,initial=null){
    validatePoints(points);
    if(!Number.isInteger(k)||k<1||k>points.length)throw Error('K 超出数据范围');
    const init=initial||choose(points.length,k,seed);
    if(init.length!==k||new Set(init).size!==k||init.some(i=>!Number.isInteger(i)||i<0||i>=points.length))throw Error('初始点必须是 K 个不同的数据点');
    let centers=init.map(i=>points[i].slice()),labels=assign(points,centers);
    const frames=[{round:0,phase:'初始分配',centers,labels,sse:sse(points,centers,labels),shift:0,empty:[]}];
    let converged=false;
    for(let step=1;step<=100;step++){
      const next=update(points,labels,centers), shifted=Math.max(...next.map((c,j)=>distance2(c,centers[j])));
      const empty=next.map((_,j)=>j).filter(j=>!labels.includes(j));
      frames.push({round:step,phase:'均值更新',centers:next,labels:labels.slice(),sse:sse(points,next,labels),shift:shifted,empty});
      const newLabels=assign(points,next), changed=newLabels.some((v,i)=>v!==labels[i]);
      frames.push({round:step,phase:'重新分配',centers:next,labels:newLabels,sse:sse(points,next,newLabels),shift:shifted,empty});
      centers=next;labels=newLabels;
      if(!changed&&shifted<1e-16){converged=true;break;}
    }
    return {initial:init,frames,centers,labels,sse:sse(points,centers,labels),converged,iterations:frames.at(-1).round};
  }
  function prepare(dims=2,mode='zscore'){if(![2,3,4,5].includes(dims))throw Error('维度须为 2 至 5');return scale(DATA.map(r=>r.values.slice(0,dims)),mode);}
  function experiment(params){
    const dims=Number(params.dims),k=Number(params.k),seed=Number(params.seed),mode=params.mode;
    if(![2,3,4,5].includes(dims)||!Number.isInteger(k)||k<2||k>6||!Number.isInteger(seed)||seed<0||seed>2147483647||!['zscore','raw'].includes(mode))throw Error('实验参数无效');
    const prep=prepare(dims,mode),result=run(prep.points,k,seed);
    return {dims,k,seed,mode,initial:result.initial,sse:result.sse,labels:result.labels,centers:result.centers,iterations:result.iterations};
  }
  function elbow(dims,mode){
    const pts=prepare(dims,mode).points, curve=[];
    for(let k=2;k<=6;k++){
      let best=null;
      for(let seed=1;seed<=30;seed++){const r=run(pts,k,seed);if(!best||r.sse<best.sse)best={sse:r.sse,seed};}
      curve.push({k,...best});
    }
    return curve;
  }
  function samePartition(a,b){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)for(let j=0;j<a.length;j++)if((a[i]===a[j])!==(b[i]===b[j]))return false;return true;}
  function handExpected(initial=HAND_INIT){
    const r=run(HAND,3,1,initial),before=r.frames[0],updated=r.frames[1];
    const contributions=HAND.map((p,i)=>distance2(p,updated.centers[updated.labels[i]]));
    return {initial:before,updated,run:r,contributions,sampleIndex:6,trend:Math.abs(before.sse-updated.sse)<1e-9?'same':updated.sse<before.sse?'decrease':'increase'};
  }
  function numeric(v){return (typeof v==='number'||typeof v==='string')&&String(v).trim()!==''&&Number.isFinite(Number(v));}
  function validateHand(answer){
    const init=answer.initial||HAND_INIT, target=handExpected(init);
    const labelsOk=Array.isArray(answer.labels)&&answer.labels.length===8&&answer.labels.every((v,i)=>Number.isInteger(v)&&v===target.initial.labels[i]);
    const centersOk=Array.isArray(answer.centers)&&answer.centers.length===3&&answer.centers.every((p,j)=>Array.isArray(p)&&p.length===2&&p.every((v,d)=>numeric(v)&&Math.abs(Number(v)-target.updated.centers[j][d])<=.015));
    const pointOk=numeric(answer.pointSse)&&Math.abs(Number(answer.pointSse)-target.contributions[target.sampleIndex])<=.015;
    const trendOk=answer.trend===target.trend;
    return {pass:labelsOk&&centersOk&&pointOk&&trendOk,labelsOk,centersOk,pointOk,trendOk};
  }
  function freshStudent(name,group){return {name,group,stage:0,completed:[false,false,false,false],attempts:[0,0,0,0],hints:[0,0,0,0],records:{},experiments:[],review:null,feedback:null};}
  const LAB_BASE={dims:2,k:3,seed:1,mode:'zscore'};
  function simulationExpected(dims=2){const points=prepare(dims,'zscore').points;return {point:9,run:run(points,3,1)};}
  function validateSimulation(a){
    // Requests without a dimension came from the original three-dimensional lesson.
    const dims=a.dims??3;
    if(![2,3].includes(dims))return {pass:false,message:'过程模拟请选择二维或原版三维任务。'};
    const x=simulationExpected(dims);
    const sequence=Array.isArray(a.frames)&&a.frames.length===x.run.frames.length&&a.frames.every((n,i)=>n===i);
    const pass=a.point===x.point&&a.cluster===x.run.frames[0].labels[x.point]&&a.updateRule==='mean'&&a.reassignRule==='nearest'&&a.stopRule==='both'&&sequence;
    return {pass,message:pass?'过程已保存。':'请逐步分配、更新，观察至稳定并判断停止条件。'};
  }
  function labProgress(s){
    const e=s.experiments||[],standard=e.filter(x=>x.mode==='zscore');
    const simulation=!!s.records.simulation;
    const dimensions=[2,3,5].every(d=>standard.some(a=>a.dims===d&&a.k===3&&a.seed===1));
    const initializations=standard.some(a=>a.dims===3&&a.k===3&&a.seed===1)&&standard.some(a=>a.dims===3&&a.k===3&&a.seed!==1);
    const differentK=new Set(standard.filter(x=>x.dims===3&&x.seed===1).map(x=>x.k)).size>=2;
    const elbow=s.records.elbow?.dims===3&&s.records.elbow.mode==='zscore';
    return {simulation,dimensions,initializations,differentK,elbow,available:simulation?(dimensions?(initializations?3:2):1):0};
  }
  function allowed(student,room){let natural=student.completed.findIndex(x=>!x);if(natural<0)natural=3;return Math.max(natural,room?.unlock||0);}
  function validateStage(stage,answer,student){
    if(stage===0)return {pass:answer.choice==='unsupervised',message:answer.choice==='unsupervised'?'正确：无类别标签，属于无监督学习。':'有现成的类别答案吗？设定 K 不等于标注类别。'};
    if(stage===1){
      const v=validateHand(answer),ready=v.labelsOk&&v.centersOk;
      if(answer.phase==='centers')return {...v,pass:false,centersReady:ready,message:ready?'核对通过，接着算 P7。':!v.labelsOk?'先按最近中心订正归属，再逐维求均值。':'对照均值算式订正，再核对质心。'};
      const checkpoint=student.records.handCheck;
      const checked=checkpoint?.ready&&JSON.stringify(checkpoint.answer.initial||HAND_INIT)===JSON.stringify(answer.initial||HAND_INIT);
      const pass=answer.phase==='sse'&&checked&&v.pass;
      return {...v,pass:!!pass,message:!checked||!ready?'请先核对分配与质心。':!v.pointOk?'P7 要用更新后的质心：两维差平方相加，不开方。':!v.trendOk?'比较更新前后的 SSE，是变小、持平还是变大？':pass?'计算与判断完成，可继续观察迭代。':'请按页面顺序核对质心，再提交 SSE 判断。'};
    }
    if(stage===2){
      const k=Number(answer.k),p=labProgress(student);
      const pass=Number.isInteger(k)&&k>=2&&k<=6&&typeof answer.reason==='string'&&answer.reason.trim().length>=12&&typeof answer.observation==='string'&&answer.observation.trim().length>=8&&p.simulation&&p.dimensions&&p.initializations&&p.differentK&&p.elbow;
      return {pass,message:pass?'方案已保存，接着分享与回顾。':!p.simulation?'先完成过程模拟与停止判断。':!p.dimensions?'请保存同一起点、K=3 下的标准化二维、三维和五维对照。':!p.initializations?'请固定三维、标准化与 K=3，保存另一组起点的结果。':!p.differentK?'请固定三维、标准化与起点 1，再保存一个不同 K 的结果。':!p.elbow?'请生成三维标准化肘部图。':'请补充 K 值、至少 12 字的理由和至少 8 字的起点观察。'};
    }
    if(stage===3){
      if(answer.version===2){
        const complete=['transfer','application','focus'].every(key=>REFLECTION[key].some(([v])=>v===answer[key]));
        const noteOk=answer.note===undefined||typeof answer.note==='string'&&answer.note.length<=120;
        const pass=complete&&noteOk;
        return {pass,...reflectionCheck(answer),message:pass?'已保存，请对照反馈交流。':!complete?'请完成两道判断和学习选择；文字可留空。':'补充内容请控制在 120 字以内。'};
      }
      const textKeys=['reason','boundary','beneficiary','reflection'];
      const self=answer.self;
      const pass=textKeys.every(k=>typeof answer[k]==='string'&&answer[k].trim().length>=4)&&['review','direct'].includes(answer.decision)&&Array.isArray(self)&&self.length===4&&self.every(n=>Number.isInteger(n)&&n>=1&&n<=4);
      return {pass,message:pass?'出口条已提交。请查看初评建议，教师将结合你的解释复核。':'请完成 K 依据、使用边界、保护对象、学习反思以及四项自评。'};
    }
    throw Error('无效环节');
  }
  function recordSubmission(s,stage,answer){
    answer=JSON.parse(JSON.stringify(answer));
    if(stage===3&&answer.version===2){
      // Carry forward the student's submitted project evidence, never a client-invented summary.
      const p=s.records[2];
      answer={version:2,transfer:answer.transfer,application:answer.application,focus:answer.focus,note:answer.note??'',project:p?{k:p.k,reason:p.reason,observation:p.observation}:null};
    }
    const earlier=s.attempts[stage];
    const check=validateStage(stage,answer,s);
    s.attempts[stage]++;s.lastCheck=check;
    s.history=s.history||[];s.history.push({stage,answer,check,at:new Date().toISOString()});s.history=s.history.slice(-80);
    if(stage===1){
      s.handStats=s.handStats||{centers:0,sse:0,earlier};
      if(answer.phase==='centers'){
        s.handStats.centers++;
        s.records.handCheck={answer,ready:check.centersReady};
      }else s.handStats.sse++;
    }
    if(check.pass){s.records[stage]=answer;s.completed[stage]=true;s.stage=Math.min(3,stage+1);}
    s.feedback=evaluate(s);return check;
  }
  // Class summaries describe submitted evidence, not inferred mastery or ability.
  function classEvidence(students=[]){
    const tasks=[['concept','判断无监督学习'],['distance','按最近距离分配'],['mean','逐维更新均值'],['transfer','新样本迁移判断']].map(([id,label])=>({id,label,correct:0,submitted:0,needsReview:0,missing:0}));
    const misconceptions=[
      ['concept','无监督学习判断需回看','输入数据有没有现成的类别标签？'],
      ['distance','最近距离分配需订正','比较到各个中心的距离，应该选哪一个？'],
      ['mean','逐维均值计算需订正','同一簇的每一维坐标，应分别怎样求平均？'],
      ['keep','新样本加入后直接结束','新样本加入后，中心和其他点需要怎样调整？'],
      ['farthest','把新样本分给最远中心','距离更近，还是更远，表示特征更相似？'],
      ['alert','把簇直接作为蓝藻预警区','发布预警还需要哪些监测与核验依据？'],
      ['grade','按簇编号排列水质等级','簇编号表示水质等级，还是相似样本的分组？']
    ].map(([id,label,prompt])=>({id,label,prompt,count:0}));
    const kCounts=[2,3,4,5,6].map(k=>({k,count:0}));
    const needs=REFLECTION.focus.map(([id,label])=>({id,label,count:0}));
    const proposals=[];let needsReviewStudents=0,needResponses=0;
    for(const s of students){
      const records=s.records||{},history=s.history||[];
      const concept=records[0]||history.findLast(h=>h.stage===0)?.answer;
      const hand=s.completed?.[1]&&records[1]?records[1]:history.findLast(h=>h.stage===1)?.answer||records.handCheck?.answer;
      let handCheck=null;if(hand){try{handCheck=validateHand(hand);}catch{/* Imported incomplete evidence stays unknown. */}}
      const reflection=records[3]?.version===2?records[3]:null;
      const transfer=reflection&&REFLECTION.transfer.some(([v])=>v===reflection.transfer)?reflection.transfer:null;
      const statuses=[['unsupervised','supervised'].includes(concept?.choice)?concept.choice==='unsupervised':null,handCheck?.labelsOk??null,handCheck?.centersOk??null,transfer?transfer==='iterate':null];
      statuses.forEach((result,i)=>{if(result===null)tasks[i].missing++;else{tasks[i].submitted++;if(result)tasks[i].correct++;else tasks[i].needsReview++;}});
      const errors=[];
      if(statuses[0]===false)errors.push('concept');
      if(statuses[1]===false)errors.push('distance');
      if(statuses[2]===false)errors.push('mean');
      if(transfer==='keep'||transfer==='farthest')errors.push(transfer);
      if(reflection?.application==='alert'||reflection?.application==='grade')errors.push(reflection.application);
      if(errors.length)needsReviewStudents++;
      for(const id of errors)misconceptions.find(x=>x.id===id).count++;
      const proposal=records[2],bucket=kCounts.find(x=>x.k===Number(proposal?.k));
      if(bucket){bucket.count++;proposals.push({k:bucket.k,reason:typeof proposal.reason==='string'?proposal.reason:''});}
      const need=reflection&&needs.find(x=>x.id===reflection.focus);
      if(need){need.count++;needResponses++;}
    }
    return {total:students.length,tasks,misconceptions:misconceptions.filter(x=>x.count>0).sort((a,b)=>b.count-a.count),needsReviewStudents,kCounts,proposals,needs,needResponses};
  }
  function evaluate(s){
    const exit=s.records[3]||{},reason=s.records[2]?.reason||'';
    const first=s.handStats?s.handStats.centers===1&&s.handStats.sse===1&&s.handStats.earlier===0:s.attempts[1]===1;
    const core=s.completed[1]?(first&&s.hints[1]===0?3:2):null;
    const evidence=[
      {level:s.completed[0]?(/SSE|肘|下降|改善|资源|解释/i.test(reason)?3:2):null,evidence:s.completed[0]?'能判断无监督学习；K 依据见原文。':'尚无独立概念判断证据。'},
      {level:core,evidence:core===3?(s.handStats?'分配与均值首次核对正确；完成单点平方距离与变化判断，全体 SSE 由工具汇总。':'首次提交正确且未调用提示，完成原版手算任务。'):core===2?'经尝试、参考或提示后完成；全体 SSE 由工具汇总，独立解释需教师核对。':'尚无完整手算证据。'},
      {level:s.completed[2]?3:s.experiments.length?2:null,evidence:s.completed[2]?'完成加维和起点对照并提交观察，解释质量待复核。':'实验完成情况尚不足以判断迁移能力。'},
      {level:s.completed[3]?(exit.version===2?(exit.application==='review'?2:1):(exit.decision==='review'?2:1)):null,evidence:exit.version===2?(exit.application==='review'?'能在选择题中区分相似群体与预警结论；具体解释仍需教师听取。':'选择了直接预警或按簇评级，需要回看聚类结果的使用范围。'):exit.decision==='review'?'选择先核验；边界的可执行性与保护对象需阅读原文。':exit.decision==='direct'?'仍认为聚类可直接处罚，需要重新核对使用边界。':'尚未提交边界判断。'}
    ];
    if(exit.version===2)evidence[1].evidence+=(exit.transfer==='iterate'?' 新样本情境中选择了继续更新与重新分配；选择正确不等于已能独立解释。':' 新样本情境的迁移判断还需回看。');
    return {source:'本地规则初评 · 教师复核',dimensions:evidence,summary:s.completed.every(Boolean)?'你完成了四个环节。把数值证据与自己的解释对应起来。':'已依据现有记录生成初评，缺失证据不记为低分。',suggestion:exit.version===2?reflectionNext(exit):exit.decision==='direct'?'聚类只发现相似结构。请补充采样、传感器、标准指标和证据程序的核验。':core!==3?'再独立解释一次：质心更新后为什么必须重新比较距离？':'选一个 K 值对照，引用实际 SSE 改善量说明你的取舍。'};
  }
  function tutor(stage,message,student){
    const m=String(message),level=student?.hints?.[stage]||0;
    if(/处罚|国标|五类|水质等级|健康|污染/.test(m))return '簇不等于水质等级。除了相似性，还需核验哪些指标？';
    if(/方向|溶解氧|越高|pH/.test(m))return '聚类看相似，不必统一优劣方向。一个特征整体反向后，平方距离会变吗？';
    if(/归一化/.test(m))return '这里的归一化指 Min–max：缩放到 0—1；Z-score 标准化按标准差缩放。当前手算用指定参考量缩放。三者都处理尺度，但结果未必相同。';
    if(/标准化|量纲|单位|缩放/.test(m))return stage===1?'试试“只换单位”：氨氮数值变为 1000 倍，平方差变为 100 万倍。水样没变，最近关系会变吗？再把参考量一起换单位，检查缩放后的结果。':'Z-score 用（原值−均值）÷标准差，减少数值尺度对距离的影响。数值大不等于更重要；你的距离中哪一项占比最大？';
    if(/SSE|平方|紧凑/i.test(m)&&stage!==1)return '先比较一个 T 点到各中心的 d²，哪项最小？全体 SSE 由工具汇总。';
    if(/SSE|平方|紧凑/i.test(m))return level>1?'P7：横坐标差²＋纵坐标差²，不开方。你用的是更新后的所属质心吗？':'SSE 是到所属质心的距离平方和。先算 P7 的贡献，哪两个差需要平方？';
    if(/均值|质心|中心坐标|平均/.test(m))return level>1?'同簇每维坐标之和÷成员数。新质心一定是原来的某个点吗？':'先列同簇成员，再逐维求平均。你这一组有哪些点？';
    if(/起点|初始化|随机|局部/.test(m))return '只换起点，比较成员组合与 SSE。颜色互换不算改组；你的两次结果有何不同？';
    if(/肘|选.*[kK]|[kK].*选|越大/.test(m))return '比较相邻 K 的 SSE 下降量，哪里明显趋缓？若无清晰拐点，可以如实说明。';
    if(/距离|欧氏|维度|多维|公式/.test(m))return '欧氏距离：各维差平方相加，再开方。只比远近可用 d²；加一维会多哪项？';
    if(/收敛|迭代|停止|变小/.test(m))return '条件不变时 SSE 不增。别只看舍入后的数字：成员和中心都稳定了吗？';
    if(/无监督|标签|监督/.test(m))return 'K 只指定组数，不是类别答案。输入有没有给出每个点的标签？';
    const defaults=['这些点有现成的类别答案吗？','你卡在归属、均值，还是 SSE？','这次只改了哪个条件？结果怎样变化？','回看反馈，选一个具体问题继续讨论。'];
    return defaults[stage];
  }
  return {FEATURES,HAND_RAW,HAND,HAND_INIT,STAGES,RUBRIC,REFLECTION,reflectionLabel,reflectionCheck,reflectionNext,DATA,LAB_BASE,round,clamp,rng,distance2,scalingExample,mean,scale,assign,sse,update,choose,run,prepare,experiment,elbow,samePartition,handExpected,validateHand,freshStudent,simulationExpected,validateSimulation,labProgress,allowed,validateStage,recordSubmission,classEvidence,evaluate,tutor};
});
