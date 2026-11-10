const test=require('node:test'),assert=require('node:assert/strict');
const KM=require('../public/engine');
test('Euclidean distance and coordinate means are correct in n dimensions',()=>{
  assert.equal(KM.distance2([4,2,5],[3,2,4]),2);
  assert.deepEqual(KM.mean([[1,3,8],[3,5,4]]),[2,4,6]);
  assert.throws(()=>KM.distance2([1],[2,3]));
});
test('z score corrects units, treats constant features safely and needs no direction inversion',()=>{
  const p=[[1,10,5],[2,20,5],[3,30,5]],scaled=KM.scale(p).points;
  assert(scaled.every(r=>Math.abs(r[0]-r[1])<1e-10&&r[2]===0));
  const reverse=p.map(r=>[-r[0],r[1],r[2]]);
  assert.equal(KM.distance2(p[0],p[1]),KM.distance2(reverse[0],reverse[1]));
});
test('unit conversion can reverse raw neighbors while consistent rescaling and z scores preserve them',()=>{
  const mg=KM.scalingExample('mg'),ug=KM.scalingExample('ug');
  assert.equal(mg.nearest,'乙');assert.equal(ug.nearest,'丙');
  mg.readings.forEach((p,i)=>{assert.equal(ug.readings[i][0],p[0]*1000);assert.equal(ug.readings[i][1],p[1]);});
  mg.comparisons.forEach((c,i)=>assert(Math.abs(ug.comparisons[i].terms[0]/c.terms[0]-1e6)<1e-6));
  const a=KM.scalingExample('mg',true),b=KM.scalingExample('ug',true);
  assert.equal(a.nearest,'丙');assert.equal(b.nearest,'丙');
  assert.equal(b.reference[0],200);
  [a,b].forEach(r=>{assert(Math.abs(r.comparisons[0].d2-1.01)<1e-10);assert(Math.abs(r.comparisons[1].d2-.29)<1e-10);});
  a.points.forEach((p,i)=>p.forEach((v,d)=>assert(Math.abs(v-b.points[i][d])<1e-10)));
  const z=KM.scale(mg.readings).points,zu=KM.scale(ug.readings).points;
  z.forEach((p,i)=>p.forEach((v,d)=>assert(Math.abs(v-zu[i][d])<1e-10)));
});
test('hand calculation verifies means, one point contribution and total SSE independently',()=>{
  const x=KM.handExpected();
  const labels=[0,1,0,1,1,1,2,2];
  assert.deepEqual(x.initial.labels,labels);
  const centers=[[.625,.55],[3.625,2.525],[9.5,8.5]];
  centers.forEach((c,j)=>c.forEach((v,d)=>assert(Math.abs(x.updated.centers[j][d]-v)<1e-9)));
  const total=KM.HAND.reduce((s,p,i)=>s+(p[0]-centers[labels[i]][0])**2+(p[1]-centers[labels[i]][1])**2,0);
  assert(Math.abs(total-x.updated.sse)<1e-10);
  assert.equal(x.contributions[6],.5);
  assert(Math.abs(x.contributions.reduce((a,b)=>a+b,0)-14.95125)<1e-9);
  assert(Math.abs(x.initial.sse-55.4525)<1e-9);
  assert(KM.validateHand({labels,centers,pointSse:.5,trend:'decrease'}).pass);
  assert(!KM.validateHand({labels,centers,pointSse:'',trend:'decrease'}).pass);
  assert(!KM.validateHand({labels,centers,pointSse:.5,trend:'increase'}).pass);
  assert(!KM.validateHand({labels:Array(8).fill(0),centers,pointSse:.5,trend:'decrease'}).pass);
  assert(x.run.frames.some(f=>f.labels.some((v,i)=>v!==labels[i])),'example must reassign points');
});
test('centroid feedback is a checkpoint, preserves attempts and requires correction before completion',()=>{
  const x=KM.handExpected(),s=KM.freshStudent('A','1');
  const a={initial:KM.HAND_INIT.slice(),labels:x.initial.labels,centers:[[.75,.63],[4.5,3.25],[9.5,8.5]],phase:'centers'};
  const first=KM.recordSubmission(s,1,a);assert(!first.centersReady);assert(!first.pass);assert(!s.completed[1]);
  a.centers=x.updated.centers;
  assert.deepEqual(s.records.handCheck.answer.centers[0],[.75,.63],'student edits must not overwrite submitted evidence');
  assert(!KM.validateStage(1,{...a,phase:'sse',pointSse:.5,trend:'decrease'},s).pass);
  const corrected=KM.recordSubmission(s,1,a);assert(corrected.centersReady);assert(!corrected.pass);
  assert(KM.recordSubmission(s,1,{...a,phase:'sse',pointSse:.5,trend:'decrease'}).pass);
  assert.equal(s.feedback.dimensions[1].level,2,'correcting from the reference is assisted work');
  const independent=KM.freshStudent('B','1');
  KM.recordSubmission(independent,1,a);
  KM.recordSubmission(independent,1,{...a,phase:'sse',pointSse:.5,trend:'decrease'});
  assert.equal(independent.feedback.dimensions[1].level,3);
  assert.match(independent.feedback.dimensions[1].evidence,/工具汇总/);
});
test('changing initial centers requires a new checkpoint and uses the new P7 center',()=>{
  const s=KM.freshStudent('C','2'),x=KM.handExpected();
  KM.recordSubmission(s,1,{initial:KM.HAND_INIT,labels:x.initial.labels,centers:x.updated.centers,phase:'centers'});
  const initial=[0,1,2],other=KM.handExpected(initial);
  const a={initial,labels:other.initial.labels,centers:other.updated.centers,pointSse:other.contributions[6],trend:other.trend,phase:'sse'};
  assert.notEqual(a.pointSse,.5);assert(!KM.validateStage(1,a,s).pass);
  KM.recordSubmission(s,1,{...a,phase:'centers'});
  assert(KM.validateStage(1,a,s).pass);
  assert(!KM.validateStage(1,{...a,pointSse:.5},s).pass);
});
test('Lloyd half steps never increase SSE and stopping uses unrounded centers and labels',()=>{
  for(const dims of [2,3,5])for(const mode of ['raw','zscore'])for(let seed=1;seed<=12;seed++){
    const r=KM.run(KM.prepare(dims,mode).points,3,seed);assert(r.converged);
    for(let i=1;i<r.frames.length;i++)assert(r.frames[i].sse<=r.frames[i-1].sse+1e-7);
    assert(r.frames.at(-1).shift<1e-16);
  }
});
test('empty clusters and identical points stay finite and deterministic',()=>{
  const r=KM.run([[1,1],[1,1],[2,2]],3,1,[0,1,2]);assert(r.converged);assert.equal(r.sse,0);assert(r.frames.some(f=>f.empty.length));
  assert.deepEqual(KM.run(KM.HAND,3,7),KM.run(KM.HAND,3,7));
});
test('elbow comes from actual reproducible multistart runs, no automatic K choice',()=>{
  for(const dims of [3,5]){
    const c=KM.elbow(dims,'zscore');assert.deepEqual(c.map(p=>p.k),[2,3,4,5,6]);
    c.forEach((p,i)=>{assert.equal(p.sse,KM.experiment({dims,k:p.k,seed:p.seed,mode:'zscore'}).sse);if(i)assert(p.sse<=c[i-1].sse+1e-8);});
  }
});
test('same labels with permuted IDs are the same partition; seeds can also differ materially',()=>{
  assert(KM.samePartition([0,0,1,2],[2,2,0,1]));assert(!KM.samePartition([0,0,1],[0,1,1]));
  const values=new Set(Array.from({length:40},(_,i)=>KM.experiment({dims:3,k:3,seed:i+1,mode:'zscore'}).sse.toFixed(6)));
  assert(values.size>1,'the dataset must support an honest differing-initialization comparison');
});
test('gates require actual learning records and teacher unlock never fabricates completion',()=>{
  const s=KM.freshStudent('A','1');assert.equal(KM.allowed(s,{unlock:0}),0);assert.equal(KM.allowed(s,{unlock:3}),3);assert(!s.completed.some(Boolean));
  assert(!KM.validateStage(0,{choice:'supervised'},s).pass);
  assert(!KM.validateStage(2,{k:3,reason:'观察到了肘部与改善幅度的变化',observation:'两次起点不同但可能相同'},s).pass);
  assert(KM.evaluate(s).dimensions.every(d=>d.level===null));
});
test('guided lab requires full simulation and controlled dimension, seed and K comparisons',()=>{
  const x=KM.simulationExpected(),s=KM.freshStudent('Lab','1');
  const a={dims:2,point:9,cluster:x.run.frames[0].labels[9],updateRule:'mean',reassignRule:'nearest',stopRule:'both',frames:x.run.frames.map((_,i)=>i)};
  assert(KM.validateSimulation(a).pass);
  assert(!KM.validateSimulation({...a,dims:5}).pass);
  const legacy=KM.simulationExpected(3);
  assert(KM.validateSimulation({...a,dims:undefined,cluster:legacy.run.frames[0].labels[9],frames:legacy.run.frames.map((_,i)=>i)}).pass);
  assert(!KM.validateSimulation({...a,frames:[0,1,2]}).pass);
  assert(!KM.validateSimulation({...a,stopRule:'sse'}).pass);
  assert(!KM.validateSimulation({...a,updateRule:'sample'}).pass);
  assert.equal(KM.labProgress(s).available,0);s.records.simulation=a;
  s.experiments.push(KM.experiment(KM.LAB_BASE));assert.equal(KM.labProgress(s).available,1);
  s.experiments.push(KM.experiment({dims:5,k:4,seed:1,mode:'zscore'}));assert(!KM.labProgress(s).dimensions,'changing K at the same time is not a dimension comparison');
  s.experiments.push(KM.experiment({dims:5,k:3,seed:1,mode:'zscore'}));assert.equal(KM.labProgress(s).available,1);
  s.experiments.push(KM.experiment({dims:3,k:3,seed:1,mode:'zscore'}));assert.equal(KM.labProgress(s).available,2);
  s.experiments.push(KM.experiment({dims:5,k:3,seed:2,mode:'zscore'}));assert.equal(KM.labProgress(s).available,2,'five-dimensional records cannot satisfy the three-dimensional comparison');
  assert(!KM.labProgress(s).differentK);
  s.experiments.push(KM.experiment({dims:3,k:3,seed:2,mode:'zscore'}));assert.equal(KM.labProgress(s).available,3);
  s.experiments.push(KM.experiment({dims:3,k:4,seed:2,mode:'zscore'}));assert(!KM.labProgress(s).differentK,'hold seed 1 fixed when comparing K');
  s.experiments.push(KM.experiment({dims:3,k:4,seed:1,mode:'zscore'}));assert(KM.labProgress(s).differentK);
  const proposal={k:3,reason:'依据相邻K的改善幅度和分组解释价值。',observation:'同一条件下改变起点，比较成员组合。'};
  assert(!KM.validateStage(2,proposal,s).pass);
  s.records.elbow={dims:5,mode:'zscore',curve:KM.elbow(5,'zscore')};assert(!KM.validateStage(2,proposal,s).pass,'the elbow must use the same three features');
  s.records.elbow={dims:3,mode:'zscore',curve:KM.elbow(3,'zscore')};assert(KM.validateStage(2,proposal,s).pass);
});
test('short reflection keeps learning evidence distinct from completeness and learning preferences',()=>{
  const s=KM.freshStudent('Reflect','1');
  s.records[2]={k:4,reason:'依据相邻K的改善幅度提出候选方案',observation:'固定条件换起点'};
  const a={version:2,transfer:'iterate',application:'review',focus:'k',note:''};
  for(const field of ['transfer','application','focus'])assert(!KM.validateStage(3,{...a,[field]:''},s).pass);
  assert(!KM.validateStage(3,{...a,note:'x'.repeat(121)},s).pass);
  const check=KM.recordSubmission(s,3,{...a,project:{k:6,reason:'forged'},self:[4,4,4,4]});
  assert(check.pass&&check.transferOk&&check.applicationOk);
  assert.deepEqual(s.records[3].project,s.records[2]);assert.equal(s.records[3].note,'');assert(!('self' in s.records[3]));
  const before=KM.evaluate(s).dimensions;
  s.records[3].focus='extend';assert.deepEqual(KM.evaluate(s).dimensions,before,'learning preference must not be graded');
  const wrong=KM.freshStudent('Wrong','2');
  const misconception=KM.recordSubmission(wrong,3,{...a,transfer:'keep',application:'alert'});
  assert(misconception.pass&&wrong.completed[3],'completion records a response, not mastery');
  assert(!misconception.transferOk&&!misconception.applicationOk);
  assert.match(KM.evaluate(wrong).suggestion,/模拟过程/);
  assert.match(KM.evaluate(wrong).dimensions[3].evidence,/需要回看/);
  assert.equal(s.records[3].project.k,4);
});
test('legacy reflection records remain valid and do not gain invented new answers',()=>{
  const s=KM.freshStudent('Legacy','1'),a={reason:'依据实际改善幅度',decision:'review',boundary:'复核取样数据',beneficiary:'保护居民权益',reflection:'逐维求均值',self:[3,3,3,3]};
  assert(KM.recordSubmission(s,3,a).pass);assert.deepEqual(s.records[3],a);
  assert(!('transfer' in s.records[3]));assert(!('project' in s.records[3]));
});

test('class evidence uses latest submitted answers, preserves missing data, and separates needs from correctness',()=>{
  const empty=KM.freshStudent('Empty','1'),correct=KM.freshStudent('Correct','1'),wrong=KM.freshStudent('Wrong','2'),legacy=KM.freshStudent('Legacy','3');
  const hand=KM.handExpected(),answer={phase:'centers',initial:KM.HAND_INIT,labels:hand.initial.labels,centers:hand.updated.centers};
  KM.recordSubmission(correct,0,{choice:'supervised'});
  KM.recordSubmission(correct,0,{choice:'unsupervised'});
  KM.recordSubmission(correct,1,{...answer,centers:[[0,0],[0,0],[0,0]]});
  KM.recordSubmission(correct,1,answer);
  KM.recordSubmission(correct,3,{version:2,transfer:'iterate',application:'review',focus:'extend',note:''});
  correct.records[2]={k:4,reason:'保留原文，不按关键词评价。'};
  KM.recordSubmission(wrong,0,{choice:'supervised'});
  KM.recordSubmission(wrong,1,{...answer,labels:Array(8).fill(0),centers:[[0,0],[0,0],[0,0]]});
  KM.recordSubmission(wrong,3,{version:2,transfer:'keep',application:'alert',focus:'k',note:''});
  legacy.completed=[true,true,true,true];
  legacy.records={0:{choice:'unsupervised'},1:answer,2:{k:3,reason:'旧版依据'},3:{decision:'review',self:[4,4,4,4]}};
  const list=[empty,correct,wrong,legacy],snapshot=JSON.stringify(list),e=KM.classEvidence(list);
  assert.equal(JSON.stringify(list),snapshot,'summary is read-only');
  assert.equal(e.total,4);
  for(const task of e.tasks.slice(0,3))assert.deepEqual([task.correct,task.submitted,task.needsReview,task.missing],[2,3,1,1]);
  assert.deepEqual([e.tasks[3].correct,e.tasks[3].submitted,e.tasks[3].needsReview,e.tasks[3].missing],[1,2,1,2]);
  assert.equal(e.needsReviewStudents,1);
  assert.deepEqual(e.misconceptions.map(x=>x.id),['concept','distance','mean','keep','alert']);
  assert(e.misconceptions.every(x=>x.count===1),'corrected past errors are excluded');
  assert.deepEqual(e.kCounts.map(x=>x.count),[0,1,1,0,0]);
  assert.deepEqual(e.proposals.map(x=>x.reason),['保留原文，不按关键词评价。','旧版依据']);
  assert.equal(e.needResponses,2);assert.equal(e.needs.find(x=>x.id==='extend').count,1);
  wrong.records[3].focus='extend';assert.deepEqual(KM.classEvidence(list).tasks,e.tasks);
  wrong.records[3].transfer='farthest';wrong.records[3].application='grade';
  const changed=KM.classEvidence(list);assert(changed.misconceptions.some(x=>x.id==='farthest'));assert(changed.misconceptions.some(x=>x.id==='grade'));
  const afterDelete=KM.classEvidence(list.filter(s=>s!==wrong));assert.equal(afterDelete.needsReviewStudents,0);assert.equal(afterDelete.total,3);
  const noOne=KM.classEvidence([]);assert(noOne.tasks.every(t=>t.missing===0&&t.submitted===0));assert.equal(noOne.proposals.length,0);
});
