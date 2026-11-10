const {launchBrowser}=require('./test-browser');
const KM=require('../public/engine'),path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
  const browser=await launchBrowser();
  try{
    const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();const network=[],errors=[];
    page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
    await page.goto('file:///'+path.join(__dirname,'..','public','offline.html').replaceAll('\\','/'));
    await page.locator('#name').fill('离线全程验收');await page.getByRole('button',{name:'开始离线练习'}).click();
    await page.locator('input[value="unsupervised"]').check();await page.getByRole('button',{name:'提交我的判断'}).click();await page.getByRole('button',{name:'进入下一环节'}).click();
    await require('./scaling-browser-flow')(page);
    const a=KM.handExpected();for(let i=0;i<8;i++)await page.locator(`[data-label-index="${i}"]`).selectOption(String(a.initial.labels[i]));
    for(let j=0;j<3;j++)for(let d=0;d<2;d++)await page.locator(`[data-center="${j},${d}"]`).fill(String(a.updated.centers[j][d]));
    await page.getByRole('button',{name:'核对质心',exact:true}).click();
    await page.locator('#centroidReference').waitFor();
    assert.equal(await page.locator('#handIteration').count(),0);
    await page.reload();await page.locator('#centroidReference').waitFor();
    await page.locator('#pointSse').fill('0.5');await page.locator('#sseTrend').selectOption('decrease');
    await page.getByRole('button',{name:'提交计算与判断',exact:true}).click();await page.getByRole('button',{name:'进入下一环节'}).click();
    await require('./lab-browser-flow')(page);
    await page.locator('#reason').fill('比较SSE变化和解释价值，选择一个有依据的候选K。');await page.locator('#observation').fill('同维度同K同尺度，只改变起点观察成员组合。');await page.getByRole('button',{name:'提交我的实验结论'}).click();await page.getByRole('button',{name:'进入下一环节'}).click();
    await require('./reflection-browser-flow')(page);
    // Old five-dimensional work stays recorded, but cannot pass new 3-D comparisons.
    const beforeMigration=await page.evaluate(()=>({saved:localStorage.getItem('taihu-offline'),draft:localStorage.getItem('taihu-draft-offline')}));
    const oldExperiments=[[2,3,1],[3,3,1],[5,3,1],[5,3,2],[5,4,1]].map(([dims,k,seed])=>KM.experiment({dims,k,seed,mode:'zscore'}));
    await page.evaluate(({experiments,curve})=>{
      const saved=JSON.parse(localStorage.getItem('taihu-offline'));
      saved.student.experiments=experiments;saved.student.records.elbow={dims:5,mode:'zscore',curve};
      saved.student.records[2]={k:3,reason:'原五维肘部依据，保留原文。',observation:'原五维起点观察，保留原文。'};
      localStorage.setItem('taihu-offline',JSON.stringify(saved));
      const draft=JSON.parse(localStorage.getItem('taihu-draft-offline'));draft.stage=2;
      draft.draft.lab={version:2,step:3,frame:6,params:{dims:5,k:4,seed:1,mode:'zscore'},selected:9,axes:[2,3,4],simulation:{}};
      draft.draft.observation='原五维起点观察，保留原文。';draft.draft.reason='原五维肘部依据，保留原文。';
      localStorage.setItem('taihu-draft-offline',JSON.stringify(draft));
    },{experiments:oldExperiments,curve:KM.elbow(5,'zscore')});
    await page.reload();await page.locator('#lab3d canvas').waitFor();
    assert((await page.locator('.lab-main .tag').innerText()).startsWith('3 维'));
    assert(await page.getByRole('button',{name:'✓ 分群建议已提交'}).isDisabled());
    assert.equal(await page.locator('#elbowTable table').count(),0,'never relabel old 5-D SSE as 3-D');
    let preserved=await page.evaluate(()=>JSON.parse(localStorage.getItem('taihu-offline')).student);
    assert(preserved.completed[2]);assert.deepEqual(preserved.experiments,oldExperiments);assert.equal(preserved.records.elbow.dims,5);
    assert.equal(preserved.records[2].reason,'原五维肘部依据，保留原文。');
    await page.evaluate(()=>{
      const saved=JSON.parse(localStorage.getItem('taihu-offline'));saved.student.completed[2]=false;
      localStorage.setItem('taihu-offline',JSON.stringify(saved));
      const draft=JSON.parse(localStorage.getItem('taihu-draft-offline'));
      draft.draft.lab.version=2;draft.draft.lab.step=3;draft.draft.lab.params.dims=5;
      localStorage.setItem('taihu-draft-offline',JSON.stringify(draft));
    });
    await page.reload();await page.locator('#lab3d canvas').waitFor();
    assert((await page.locator('.lab-tabs .active').innerText()).includes('比较起点'));
    assert(await page.locator('.lab-tabs [data-step="3"]').isDisabled());
    assert.equal(await page.locator('#observation').inputValue(),'');
    const pending=await page.evaluate(()=>JSON.parse(localStorage.getItem('taihu-draft-offline')).draft);
    assert.equal(pending.lab.params.dims,3);assert.equal(pending.lab.frame,-1);
    assert.equal(pending.lab.previousComparison.params.dims,5);
    assert.equal(pending.lab.previousComparison.observation,'原五维起点观察，保留原文。');
    preserved=await page.evaluate(()=>JSON.parse(localStorage.getItem('taihu-offline')).student);
    assert.deepEqual(preserved.experiments,oldExperiments);assert(!preserved.completed[2]);
    await page.evaluate(old=>{localStorage.setItem('taihu-offline',old.saved);localStorage.setItem('taihu-draft-offline',old.draft);},beforeMigration);
    // A saved pre-update completion must stay complete without invented single-point answers.
    await page.evaluate(()=>{
      const old=JSON.parse(localStorage.getItem('taihu-offline'));
      old.student.records[1]={initial:[0,1,6],labels:[0,1,0,1,1,1,2,2],centers:[[.625,.55],[3.625,2.525],[9.5,8.5]],sse:14.95125};
      delete old.student.records.handCheck;delete old.student.handStats;
      localStorage.setItem('taihu-offline',JSON.stringify(old));
      const draft=JSON.parse(localStorage.getItem('taihu-draft-offline'));draft.stage=1;delete draft.draft.hand.pointSse;delete draft.draft.hand.trend;
      localStorage.setItem('taihu-draft-offline',JSON.stringify(draft));
    });
    await page.reload();await page.locator('#centroidReference').waitFor();
    assert((await page.locator('#sseCard').innerText()).includes('你已完成原版全体 SSE 计算'));
    assert(await page.locator('[data-form="hand-sse"]').isHidden());
    assert(await page.locator('#handIteration').isVisible());
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('taihu-offline')).student.records[1].sse),14.95125);
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.locator('#centroidCard').screenshot({path:path.join(__dirname,'..','artifacts','02c-centroid-mobile.png')});
    // The old completed reflection remains readable without new fabricated selections.
    await page.evaluate(()=>{
      const saved=JSON.parse(localStorage.getItem('taihu-offline'));
      saved.student.records[3]={reason:'原版K依据',decision:'review',boundary:'核对采样数据',beneficiary:'保护知情权',reflection:'原版反思保留',self:[3,3,3,3]};
      localStorage.setItem('taihu-offline',JSON.stringify(saved));
      const draft=JSON.parse(localStorage.getItem('taihu-draft-offline'));draft.stage=3;
      localStorage.setItem('taihu-draft-offline',JSON.stringify(draft));
    });
    await page.reload();await page.getByRole('heading',{name:'原版课堂回顾已完成'}).waitFor();
    assert.equal(await page.locator('#reflectionForm').count(),0);
    await page.getByText('查看原版回答',{exact:true}).click();
    assert(await page.getByText('学习反思：原版反思保留',{exact:true}).isVisible());
    // An in-progress old 3-D simulation is archived, never reused as 2-D evidence.
    const legacyRun=KM.simulationExpected(3).run;
    await page.evaluate(legacyRun=>{
      const saved=JSON.parse(localStorage.getItem('taihu-offline'));
      saved.student.completed[2]=false;delete saved.student.records.simulation;
      localStorage.setItem('taihu-offline',JSON.stringify(saved));
      const draft=JSON.parse(localStorage.getItem('taihu-draft-offline'));
      draft.stage=2;draft.draft.lab={step:0,frame:1,params:{dims:3,k:3,seed:1,mode:'zscore'},selected:9,axes:[0,1,2],simulation:{frames:[0,1],attempts:[],cluster:legacyRun.frames[0].labels[9],updateRule:'mean'}};
      localStorage.setItem('taihu-draft-offline',JSON.stringify(draft));
    },legacyRun);
    await page.reload();await page.locator('#lab2d canvas').waitFor();
    assert((await page.locator('#labNarration').innerText()).includes('尚未分配'));
    await page.locator('#simAnswer').selectOption(String(KM.simulationExpected().run.frames[0].labels[9]));
    const migrated=await page.evaluate(()=>JSON.parse(localStorage.getItem('taihu-draft-offline')).draft.lab);
    assert.equal(migrated.params.dims,2);assert.deepEqual(migrated.simulation.frames,[]);
    assert.equal(migrated.previousSimulation.params.dims,3);assert.deepEqual(migrated.previousSimulation.simulation.frames,[0,1]);
    assert.equal(network.length,0);assert.equal(errors.length,0);
    fs.writeFileSync(path.join(__dirname,'..','artifacts','offline-validation.json'),JSON.stringify({passed:true,completeFourStages:true,externalRequests:network,errors,refreshRestores:true,legacyCompletionPreserved:true,mobileNoOverflow:true},null,2));
    console.log('离线四环节完整流程与刷新恢复通过，外部请求为零。');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
