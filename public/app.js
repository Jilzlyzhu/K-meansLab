/* Local classroom UI. All mathematical facts come from engine.js. */
(()=>{'use strict';
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors=['#177e89','#d78149','#8b69ad','#ae9b38','#4378af','#bf607a'];
const fmt=(n,p=3)=>Number.isFinite(n)?Number(n.toFixed(p)).toLocaleString('en-US',{maximumFractionDigits:p}):'—';
const params=new URLSearchParams(location.search),offline=location.protocol==='file:'||window.OFFLINE===true;
const teacherView=params.get('view')==='teacher';
const get=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const put=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
let token=teacherView?sessionStorage.getItem('taihu-teacher'):get('taihu-token',null);
let S=null,stage=0,collapsed=false,chatBusy=false,playTimer=null,teacherData=null,rooms=[],selectedRoom=sessionStorage.getItem('taihu-room')||'',projector=false;
let draft={},handFrame=0,expFrame=0,expResult=null,expParams={dims:2,k:3,mode:'zscore',seed:1},curve=null,selectingCenter=0,centerArmed=false;
let messages=[[],[],[],[]],pollTimer,chartPositions={},teacherLoadVersion=0,teacherDeleting=false;
const greetings=['先看看：数据中有没有现成的类别答案？','卡在哪一步？距离、均值，还是 SSE？','先预测再操作；有疑问随时问我。','先独立判断，提交后一起回看。'];
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),4200);}
function draftKey(){return 'taihu-draft-'+(S?.student.id||'offline');}
function saveDraft(){put(draftKey(),{draft,stage,expParams,messages});if(offline)put('taihu-offline',S);}
function initDraft(){const stored=get(draftKey(),{});draft=stored.draft||{};stage=Math.min(stored.stage??S.student.stage,KM.allowed(S.student,S.room));expParams={...expParams,...stored.expParams};messages=stored.messages||[[],[],[],[]];draft.hand=draft.hand||{initial:KM.HAND_INIT.slice(),labels:Array(8).fill(-1),centers:[['',''],['',''],['','']],sse:''};draft.exit=draft.exit||{};draft.exitV2=draft.exitV2||{};curve=S.student.records.elbow?.curve||null;lab.init();}
async function request(endpoint,data,method){
  const response=await fetch('/api/'+endpoint,{method:method||(data?'POST':'GET'),headers:{...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});
  const json=await response.json();if(!response.ok)throw Error(json.error||'请求未完成');return json;
}
function setState(result){S={...S,...result};saveDraft();}
function header(){return `<header class="topbar"><a class="brand" href="${offline?'offline.html':'/'}"><span class="brand-icon">≈</span><span>湖畔实验室 <span class="muted small"> / K-means</span></span></a><div class="top-meta">${S?`<span class="tag ${offline?'amber':''}">${offline?'离线练习':`课堂 ${esc(S.room.code)}`}</span><span class="meta">${esc(S.student.name)} · 第 ${esc(S.student.group)} 组</span><button class="ghost small" data-action="logout">退出</button>`:`<span class="meta">高中人工智能通识</span><a class="small" href="?view=teacher">教师入口 ↗</a>`}</div></header>`;}
function landing(){
  lab.dispose();
  $('#app').innerHTML=header()+`<main class="landing"><div class="hero"><section class="hero-copy"><div class="eyebrow">TAIHU FIELD LAB / 课堂探究</div><h1>为太湖水质把脉<br><span style="color:var(--green)">先从发现相似开始</span></h1><p class="muted">用距离与均值，为太湖监测点提出分群建议。</p><div class="hero-stats"><div><div class="big-number">40</div><span class="small muted">模拟监测点</span></div><div><div class="big-number">5</div><span class="small muted">数值特征</span></div><div><div class="big-number">4</div><span class="small muted">课堂环节</span></div></div><form data-form="join"><div class="login-grid">${offline?'':`<div class="full"><label for="classCode">课堂码</label><input id="classCode" name="code" placeholder="教师提供的 6 位课堂码" maxlength="12" required autocomplete="off" value="${esc(params.get('class')||'')}"></div>`}<div><label for="name">姓名或课堂代号</label><input id="name" name="name" maxlength="24" placeholder="例如：01号" required></div><div><label for="group">小组</label><select id="group" name="group">${Array.from({length:10},(_,i)=>`<option value="${i+1}">第 ${i+1} 组</option>`).join('')}</select></div><button class="primary full" type="submit">${offline?'开始离线练习':'进入我的课堂'} →</button></div><div class="answer-feedback" id="joinFeedback" role="status"></div></form></section><div class="hero-image"><div class="image-caption"><div class="eyebrow">从家乡问题出发</div><b>发现相似，提出建议。</b><p class="small muted" style="margin:8px 0 0">情境插画 · 数据为教学模拟</p></div></div></div><div class="landing-foot"><span>${offline?'离线记录仅保存在本机':'无需安装 · 记录保存在教师电脑'}</span><span>${offline?'':'<a href="offline.html">断网备用：离线练习 ↗</a>'}</span></div></main>`;
}
function handCheckpoint(){
  const check=S.student.records.handCheck;
  return !draft.hand.fresh&&check&&JSON.stringify(check.answer.initial||KM.HAND_INIT)===JSON.stringify(draft.hand.initial)?check:null;
}
function handReady(){
  const v=KM.validateHand(draft.hand);
  return !!handCheckpoint()?.ready&&v.labelsOk&&v.centersOk;
}
function handReferenceHtml(target){
  const checkpoint=handCheckpoint(),done=S.student.completed[1];
  if(!checkpoint&&!done)return '';
  const attempted=checkpoint?.answer||S.student.records[1]||draft.hand;
  const check=KM.validateHand(attempted);
  return `<div id="centroidReference" class="hand-reference" aria-live="polite">
    <div class="row between"><h4>正确质心坐标</h4><span class="tag">首次更新</span></div>
    <p class="small muted">${check.labelsOk?'归属正确，请核对均值。':'归属有误，请对照成员订正。'}</p>
    <div class="center-results">${target.updated.centers.map((center,j)=>{
      const members=KM.HAND.map((_,i)=>i).filter(i=>target.initial.labels[i]===j);
      const value=attempted.centers?.[j]||['',''];
      const correct=center.every((v,d)=>String(value[d]??'').trim()!==''&&Number.isFinite(Number(value[d]))&&Math.abs(Number(value[d])-v)<=.015);
      return `<article class="center-result"><div class="row between"><b><i class="dot" style="background:${colors[j]}"></i>组 ${'ABC'[j]}</b><span class="tag ${correct?'':'amber'}">${correct?'坐标正确':'坐标待订正'}</span></div>
        <p class="small">成员：${members.map(i=>'P'+(i+1)).join('、')}</p>
        <p class="small muted">本次提交：(${esc(value[0])}, ${esc(value[1])})</p>
        <div class="correct-coordinate">正确坐标：(${fmt(center[0],6)}, ${fmt(center[1],6)})</div>
        <div class="mean-work">${[0,1].map(d=>`${d?'y':'x'}＝(${members.map(i=>fmt(KM.HAND[i][d])).join('＋')}) ÷ ${members.length}＝${fmt(center[d],6)}`).join('<br>')}</div>
      </article>`;
    }).join('')}</div>
    <p class="small muted" style="margin:10px 0 0">中心已更新；重新比较距离后，成员可能改组。</p>
  </div>`;
}
function handCalculationHtml(){
  const h=draft.hand,done=S.student.completed[1],target=KM.handExpected(h.initial),checked=!!handCheckpoint()||done;
  const legacy=done&&S.student.records[1]?.phase!=='sse';
  const i=target.sampleIndex,p=KM.HAND[i],j=target.initial.labels[i],center=target.updated.centers[j];
  return `<section class="card" id="centroidCard">
    <div class="section-label"><span class="index">02</span><h3 style="margin:0">更新：每一维分别求平均</h3></div>
    <form data-form="hand-centers">
      <div class="center-fields">${[0,1,2].map(j=>`<div class="soft"><label><span class="dot" style="background:${colors[j]}"></span>组 ${'ABC'[j]} 的新质心</label><div class="row"><input aria-label="组${'ABC'[j]}新质心x" data-center="${j},0" inputmode="decimal" placeholder="平均 x" value="${esc(h.centers[j][0])}" ${done?'disabled':''} required><input aria-label="组${'ABC'[j]}新质心y" data-center="${j},1" inputmode="decimal" placeholder="平均 y" value="${esc(h.centers[j][1])}" ${done?'disabled':''} required></div></div>`).join('')}</div>
      <div class="formula">新质心＝(本簇 x 坐标之和 ÷ 点数，本簇 y 坐标之和 ÷ 点数)</div>
      <button class="primary" type="submit" ${done?'disabled':''}>${done?'✓ 分配与质心已完成':'核对质心'}</button>

    </form>
    ${handReferenceHtml(target)}
  </section>
  <section class="card" id="sseCard">
    <div class="section-label"><span class="index">03</span><h3 style="margin:0">观察 SSE 的变化</h3></div>
    <p class="small">SSE＝各点到所属质心的<b>距离平方和</b>。只手算 P7，其余由工具汇总。</p>
    ${checked?`<div class="grid2 sse-summary"><div class="metric"><div class="label">更新前 SSE · 工具汇总</div><div class="value">${fmt(target.initial.sse,4)}</div></div><div class="metric"><div class="label">更新后 SSE · 工具汇总</div><div class="value">${fmt(target.updated.sse,4)}</div></div></div>
      <p class="small muted" style="margin-top:10px">仅更新中心，分组未变。</p>
      ${legacy?'<div class="notice">你已完成原版全体 SSE 计算，无需重做。</div>':''}<form data-form="hand-sse" ${legacy?'hidden':''}>
        <p>P7 (${fmt(p[0])}, ${fmt(p[1])}) 属于组 ${'ABC'[j]}；更新后中心为 (${fmt(center[0],6)}, ${fmt(center[1],6)})。</p>
        <div class="formula">P7 的贡献＝(${fmt(p[0])}−${fmt(center[0],6)})²＋(${fmt(p[1])}−${fmt(center[1],6)})²<br><span class="small muted">不开方；可用计算器，保留两位小数。</span></div>
        <div class="grid2"><div class="field"><label for="pointSse">P7 的平方距离贡献</label><input id="pointSse" inputmode="decimal" placeholder="只算这一个点" value="${esc(h.pointSse??'')}" ${done?'disabled':''} required></div>
          <div class="field"><label for="sseTrend">SSE 怎样变化？</label><select id="sseTrend" ${done?'disabled':''} required><option value="">请选择</option>${[['decrease','变小'],['same','不变'],['increase','变大']].map(([v,t])=>`<option value="${v}" ${h.trend===v?'selected':''}>${t}</option>`).join('')}</select></div></div>
        <p id="handReadyNote" class="small muted">${done?'本环节已完成。':handReady()?'已核对，可以提交。':'先订正并核对质心。'}</p>
        <button class="primary" id="submitHandSse" type="submit" ${done||!handReady()?'disabled':''}>${done?'✓ 单点计算与判断已完成':'提交计算与判断'}</button>
      </form>
      ${done?`<div class="success" style="margin-top:16px">P7 的贡献＝${fmt((p[0]-center[0])**2,6)}＋${fmt((p[1]-center[1])**2,6)}＝${fmt(target.contributions[i],6)}；全体 SSE 由工具汇总。</div>
        <details style="margin-top:12px"><summary>查看逐点贡献</summary><div class="table-scroll"><table><thead><tr><th>点位</th><th>所属组</th><th>更新后平方距离贡献</th></tr></thead><tbody>${target.contributions.map((v,i)=>`<tr><td>P${i+1}</td><td>${'ABC'[target.initial.labels[i]]}</td><td class="mono">${fmt(v,6)}</td></tr>`).join('')}<tr><th colspan="2">SSE · 使用未舍入数值求和</th><th>${fmt(target.updated.sse,6)}</th></tr></tbody></table></div></details>`:''}`
      :'<div class="notice">先完成分配并核对质心。</div>'}
    <div id="stageFeedback" class="answer-feedback" role="status"></div>
  </section>`;
}
function scaleActivityHtml(){
  const a=draft.scaleDemo||{},unit=a.unit||'mg',scaled=!!a.scaled,x=KM.scalingExample(unit,scaled),unitText=unit==='mg'?'mg/L':'μg/L';
  return `<details id="scaleActivity" class="scale-activity" ${a.done?'':'open'}><summary>小实验：只换单位，谁更近？${a.done?' ✓':''}</summary>
    <p>三份水样不变，只改变氨氮的计量单位。</p>
    <div class="table-scroll"><table><caption>教学示例 · 比较谁离甲更近</caption><thead><tr><th>水样</th><th>氨氮（${unitText}）</th><th>叶绿素 a（μg/L）</th></tr></thead><tbody>${x.readings.map((p,i)=>`<tr><td>${['甲 · 待比较','乙','丙'][i]}</td><td>${fmt(p[0],4)}</td><td>${fmt(p[1],4)}</td></tr>`).join('')}</tbody></table></div>
    ${!a.prediction?`<p><b>直接用数值算距离，只换单位，“最近水样”会变吗？</b></p><div class="row"><button type="button" class="small" data-action="scale-predict" data-value="change">会变</button><button type="button" class="small" data-action="scale-predict" data-value="same">不会变</button></div>`:
    `<div class="row scale-controls"><button id="scaleUnitToggle" type="button" class="small" data-action="scale-unit">换成 ${unit==='mg'?'μg/L':'mg/L'}</button><button id="scaleMethodToggle" type="button" class="small ${scaled?'primary':''}" data-action="scale-method" ${a.converted?'':'disabled'}>${scaled?'查看原始数值':'按尺度缩放'}</button><span class="small muted">${scaled?'参考量也同步换单位':a.converted?'再试试按尺度缩放':'先换单位，看看结果'}</span></div>
    ${scaled?`<div class="formula small">氨氮 ÷ (${fmt(x.reference[0])} ${unitText})；叶绿素 a ÷ (10 μg/L)</div>`:'<p class="small muted">演示：把两列原始数值直接代入 d²。</p>'}
    <div class="scale-results" aria-live="polite">${x.comparisons.map(c=>`<div class="scale-result ${c.name===x.nearest?'nearest':''}"><span class="small">甲 → ${c.name} · d²</span><div class="scale-equation">${fmt(c.terms[0],4)} ＋ ${fmt(c.terms[1],4)} ＝ <b>${fmt(c.d2,4)}</b></div><span class="small muted">氨氮差² ＋ 叶绿素 a 差²</span></div>`).join('')}</div>
    <p id="scaleNearest" class="scale-nearest"><b>最近：${x.nearest}</b>${scaled?' · 比较缩放后的 d²':` · 氨氮单位 ${unitText}`}</p>
    <div id="scaleInsight" class="${scaled?'success':'notice'}" role="status">${scaled?(a.verified?`两种单位下的缩放结果一致：d² 到乙为 ${fmt(x.comparisons[0].d2,4)}，到丙为 ${fmt(x.comparisons[1].d2,4)}。`:'再切换一次单位，检查最近水样是否还会变化。'):a.converted?`你的预测：${a.prediction==='change'?'会变':'不会变'}。未缩放：mg/L 时乙近，μg/L 时丙近。氨氮平方项变为 100 万倍。`:'当前乙更近。水样不变，换个单位再比较。'}</div>
    ${a.verified?'<p class="small"><b>说一说：</b>水样没变，为什么要先处理尺度？</p><button type="button" class="small" data-action="scale-done" style="margin-top:10px">收起实验，开始分组</button>':''}`}
  </details>`;
}
function scaleIntroHtml(){return `<section class="card" id="scaleIntro"><div class="section-label"><span class="index">01</span><h3 style="margin:0">统一尺度，计算距离</h3></div>
  <div id="scaleActivityHost">${scaleActivityHtml()}</div>
  <div id="scaleReason" style="margin-top:16px"><h4>为什么要先统一尺度？</h4>
    <p class="small">K-means 根据距离分组。某个特征的数值差异特别大时，它可能主导距离，让其他特征的作用被掩盖。</p>
    <p class="small"><b>先把各个特征调整到可比较的尺度，再用距离判断相似。</b></p>
  </div>
  <div class="formula">x＝氨氮 ÷ (0.2 mg/L)　　y＝叶绿素 a ÷ (10 μg/L)<br>距离 d＝√[(x−a)²＋(y−b)²]　　比较 d² 即可判断远近。</div>
  <details style="margin-top:10px"><summary>原始数据与教学坐标</summary><div class="table-scroll"><table><thead><tr><th>点</th><th>氨氮 mg/L</th><th>叶绿素 a μg/L</th><th>教学坐标 (x,y)</th></tr></thead><tbody>${KM.HAND_RAW.map((p,i)=>`<tr><td>P${i+1}</td><td>${p[0]}</td><td>${p[1]}</td><td>(${fmt(KM.HAND[i][0])}, ${fmt(KM.HAND[i][1])})</td></tr>`).join('')}</tbody></table></div></details>
  </section>`;}
function refreshHandReady(){
  if(!$('#submitHandSse')||S.student.completed[1])return;
  $('#submitHandSse').disabled=!handReady();
  $('#handReadyNote').textContent=handReady()?'已核对，可以提交。':'先订正并核对质心。';
}
function studentRender(){
  stopPlay();lab.dispose();saveDraft();const allowed=KM.allowed(S.student,S.room);
  $('#app').innerHTML=header()+`<nav class="progress-nav" aria-label="学习进度">${KM.STAGES.map((s,i)=>`<button class="step ${stage===i?'active':''}" data-action="stage" data-stage="${i}" ${i>allowed?'disabled':''}><span class="num">${S.student.completed[i]?'✓':i+1}</span><span>${s.name}<small>${i>allowed?'待解锁':S.student.completed[i]?'已完成':'探究任务'}</small></span></button>`).join('')}</nav><div class="workspace ${collapsed?'collapsed':''}"><main class="main-column">${S.room.paused?'<div class="notice">教师已暂停提交，输入已保留。</div>':''}<div class="stage-heading"><div class="eyebrow">任务 ${String(stage+1).padStart(2,'0')}</div><h2>${['没有标签，也能发现群体吗？','用距离与均值分组','模拟聚类，选择 K','分享成果，回顾学习'][stage]}</h2></div>${[stage0,stage1,stage2,stage3][stage]()}<div class="stage-foot"><span class="small muted">${offline?'记录仅保存在当前浏览器':'课堂记录已保存至教师电脑'} · ${S.student.completed.filter(Boolean).length}/4 已完成</span>${S.student.completed[stage]&&stage<3?`<button class="primary" data-action="stage" data-stage="${stage+1}">进入下一环节 →</button>`:''}</div></main>${tutorHtml()}</div>`;
  drawAll();
}
function stage0(){return `<section class="card lake-strip"><div><div class="section-label"><span class="index">观察</span><h3 style="margin:0">40 个点位，200 个数</h3></div><p>40 个模拟点位，每点 5 项指标，没有类别标签。</p><p><b>项目任务：</b>哪些点相似？分几组？结果怎样使用？</p><span class="tag">成果：分群图＋K 依据＋使用边界</span></div><img src="lake.svg" alt="太湖情境插画，非真实监测地图"></section><section class="card"><div class="section-label"><span class="index">读数</span><h3 style="margin:0">一行一个点，一列一个特征</h3></div><div class="table-scroll">${rawTable(KM.DATA.slice(0,5))}</div><p class="small muted" style="margin:12px 0 0">T 是编号，不参与计算；模拟数据不用于水质认定。</p></section><section class="card"><h3>先作一个判断</h3><form data-form="concept"><p>K-means 用无标签数据分群，属于哪种学习？</p><label class="radio-card"><input type="radio" name="choice" value="supervised" ${draft.choice==='supervised'?'checked':''} required><span><b>有监督学习</b><br><span class="small muted">用已知类别答案学习</span></span></label><label class="radio-card"><input type="radio" name="choice" value="unsupervised" ${draft.choice==='unsupervised'?'checked':''}><span><b>无监督学习</b><br><span class="small muted">无类别答案，依据相似性分群</span></span></label><button class="primary" type="submit" ${S.student.completed[0]?'disabled':''}>${S.student.completed[0]?'✓ 已完成判断':'提交我的判断'}</button><div id="stageFeedback" class="answer-feedback" role="status"></div></form></section>`;}
function rawTable(rows){return `<table><thead><tr><th>点位</th>${KM.FEATURES.map(f=>`<th>${f.name}<br><small>${f.unit}</small></th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr><td>${r.id}</td>${r.values.map(v=>`<td class="mono">${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;}
function stage1(){const h=draft.hand,done=S.student.completed[1];return `${scaleIntroHtml()}<section class="card"><div class="row between"><h3>按最近的初始质心分配</h3><span class="tag">本轮暂取 K=3</span></div><div class="initial-chips">${h.initial.map((v,j)=>`<button class="small ${selectingCenter===j?'active':''}" data-action="choose-center" data-index="${j}" ${done?'disabled':''}><span class="dot" style="background:${colors[j]}"></span>中心 ${'ABC'[j]}：P${v+1}</button>`).join('')}<button class="small ghost" data-action="reset-hand" ${done?'disabled':''}>恢复预置起点</button></div><p class="small muted">换起点：选中心，再点样本；本轮计算将清空。</p><div class="grid2"><div class="chart-wrapper"><canvas id="handPlot" class="chart" aria-label="八个监测点的教学坐标散点图"></canvas><div id="handTooltip" class="plot-tooltip">先预测归属，再点样本查看距离。</div></div><div class="table-scroll"><table><thead><tr><th>点</th><th>(x,y)</th><th>归属预测</th></tr></thead><tbody>${KM.HAND.map((p,i)=>`<tr><td>P${i+1}</td><td class="mono">${fmt(p[0])}, ${fmt(p[1])}</td><td><select aria-label="P${i+1}归属" data-label-index="${i}" ${done?'disabled':''}><option value="-1">请选择</option>${[0,1,2].map(j=>`<option value="${j}" ${h.labels[i]===j?'selected':''}>组 ${'ABC'[j]}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div></div></section>${handCalculationHtml()}${done?`<section class="card"><div class="row between"><h3>继续迭代</h3><div class="row"><button class="small" data-action="hand-step">单步</button><button class="small" data-action="hand-play">播放 / 暂停</button><button class="small" data-action="hand-reset">回到起点</button></div></div><div class="grid2"><canvas id="handIteration" class="chart"></canvas><div><div id="handMetrics"></div><canvas id="handCurve" class="chart small-chart"></canvas><p class="small muted">条件不变时 SSE 不增；成员与中心稳定时停止，不保证全局最优。</p></div></div></section>`:''}`;}
function stage2(){return lab.html();}

function experimentTable(e){if(!e.length)return '<p class="muted small">先运行至稳定，再保存一条实验记录。</p>';const shown=e.slice(-8);return `<div class="table-scroll"><table><thead><tr><th>维度 / 尺度</th><th>K</th><th>起点</th><th>最终 SSE</th><th>同条件起点对照</th></tr></thead><tbody>${shown.map((r,index)=>{const prev=e.slice(0,e.indexOf(r)).findLast(p=>p.dims===r.dims&&p.k===r.k&&p.mode===r.mode&&p.seed!==r.seed);return `<tr><td>${r.dims} 维 / ${r.mode==='raw'?'原始':'标准化'}</td><td>${r.k}</td><td>${r.seed}</td><td class="mono">${fmt(r.sse)}</td><td>${prev?(KM.samePartition(prev.labels,r.labels)?'成员组合相同':'成员组合不同'):'待保存另一组起点'}</td></tr>`;}).join('')}</tbody></table></div>`;}
function projectCard(){
  const p=S.student.records[3]?.project||S.student.records[2],curve=S.student.records.elbow;
  return `<section class="card project-result" id="projectResult"><div class="row between"><div class="section-label"><span class="index">01</span><h3 style="margin:0">我的分群建议</h3></div><span class="tag">来自实验记录</span></div>
    ${p?`<div class="project-summary"><div class="project-k"><span class="small">候选方案</span><strong>K = ${esc(p.k)}</strong><span class="small">${esc(p.k)} 个特征群体</span></div><div><h4>选择依据</h4><p class="saved-reason">${esc(p.reason)}</p></div></div>
    <p class="small muted">和同伴说说：为什么选这个 K？</p>
    <details><summary>查看实验依据</summary><p>${esc(p.observation||'尚未记录起点观察')}</p>${curve?`<p>以下 SSE 来自 ${curve.dims} 维、${curve.mode==='zscore'?'标准化':'原始尺度'}的肘部实验。</p><div class="table-scroll"><table><thead><tr><th>K</th><th>SSE</th><th>比前一 K 下降</th></tr></thead><tbody>${curve.curve.map((r,i)=>`<tr><td>${r.k}</td><td>${fmt(r.sse)}</td><td>${i?fmt(curve.curve[i-1].sse-r.sse):'—'}</td></tr>`).join('')}</tbody></table></div>`:''}</details>`:'<div class="notice">尚未提交 K 方案，请回实验环节补充。</div>'}
    <button class="small ghost" data-action="stage" data-stage="2" style="margin-top:12px">回看分群实验</button></section>`;
}
function reflectionChoices(field,value){return KM.REFLECTION[field].map(([v,t])=>`<label class="radio-card reflection-option"><input type="radio" name="${field}" data-reflection="${field}" value="${v}" ${value===v?'checked':''} required><span>${t}</span></label>`).join('');}
function stage3(){
  const done=S.student.completed[3],a=draft.exitV2||{},old=S.student.records[3];
  return projectCard()+(done?`${old?.version===2?'':`<section class="card"><h3>原版课堂回顾已完成</h3><p class="small muted">原记录已保留，无需重填。</p><details><summary>查看原版回答</summary><p>原 K 依据：${esc(old?.reason||'未记录')}</p><p>使用判断：${old?.decision==='review'?'需要核验':old?.decision==='direct'?'直接使用':'未记录'}</p><p>核验与保护对象：${esc(old?.boundary||'')} ${esc(old?.beneficiary||'')}</p><p>学习反思：${esc(old?.reflection||'')}</p></details></section>`}${feedbackHtml()}${extensionHtml()}`:
    `<form data-form="exit" class="card reflection-form" id="reflectionForm"><div class="section-label"><span class="index">02</span><h3 style="margin:0">两道小判断</h3></div>
    <fieldset><legend>① 新点加入后，怎样继续迭代？</legend><p class="small">保持标准化尺度不变，将新点加入数据继续迭代。到各中心的欧氏距离如下（示例）：</p><div class="distance-chips" aria-label="新点到三个中心的示例距离"><span>到 A：<b>1.2</b></span><span>到 B：<b>0.4</b></span><span>到 C：<b>1.0</b></span></div>${reflectionChoices('transfer',a.transfer)}</fieldset>
    <fieldset><legend>② 分群结果怎样用于真实监测？</legend>${reflectionChoices('application',a.application)}</fieldset>
    <div class="reflection-focus"><div class="section-label"><span class="index">03</span><h3 style="margin:0">我还想探究</h3></div><label for="reflectionFocus">选择下一步</label><select id="reflectionFocus" name="focus" data-reflection="focus" required><option value="">请选择一项</option>${KM.REFLECTION.focus.map(([v,t])=>`<option value="${v}" ${a.focus===v?'selected':''}>${t}</option>`).join('')}</select><details style="margin-top:12px" ${a.note?'open':''}><summary>补充问题（选填）</summary><label class="hidden" for="reflectionNote">我的补充</label><textarea id="reflectionNote" name="note" data-reflection="note" rows="2" maxlength="120" placeholder="例如：加一维后，T10 为什么换组？">${esc(a.note||'')}</textarea></details></div>
    <div class="row between reflection-submit"><button class="primary" type="submit">完成回顾，查看反馈</button></div><div id="stageFeedback" class="answer-feedback" role="status"></div></form>`);
}
function extensionHtml(){return `<details class="reflection-extension"><summary>课后拓展：颜色也能聚类</summary><p>像素是对象，RGB 是三个数值特征。用距离与均值将像素聚成 5 组，以均值颜色代表各组。RGB 数值距离不完全等同于人眼感受。</p><button class="small" data-action="color" style="margin:12px 0">将图案减为 5 种代表色</button><div class="color-pair"><div><canvas id="colorOriginal"></canvas><div class="small muted">原始颜色</div></div><div><canvas id="colorResult"></canvas><div class="small muted" id="colorCaption">点击后观察代表色</div></div></div></details>`;}
function feedbackHtml(){
  const s=S.student,a=s.records[3]||{},modern=a.version===2,c=KM.reflectionCheck(a),f=s.feedback||KM.evaluate(s);
  return `<section class="card" id="reflectionFeedback"><div class="row between"><h3>我的学习反馈</h3><span class="tag gray">按记录反馈</span></div>
    ${modern?`<div class="reflection-feedback-grid"><article class="soft"><span class="tag ${c.transferOk?'':'amber'}">${c.transferOk?'判断合理':'还需回看'}</span><h4>新点加入</h4><p class="small">你的选择：${esc(KM.reflectionLabel('transfer',a.transfer))}</p><p>0.4 最小，先归 B；再逐维求均值、重新分配，直到稳定。</p></article><article class="soft"><span class="tag ${c.applicationOk?'':'amber'}">${c.applicationOk?'判断合理':'还需回看'}</span><h4>成果使用</h4><p class="small">你的选择：${esc(KM.reflectionLabel('application',a.application))}</p><p>簇编号不表示好坏。预警还需有效判据与连续监测等信息。</p></article></div>
    <div class="reflection-next"><b>你的下一步</b><p>${esc(KM.reflectionNext(a))}</p>${a.note?`<p class="small">我的问题：${esc(a.note)}</p>`:''}</div>`:`<p>${esc(f.summary)}</p><div class="soft"><b>下一步：</b>${esc(f.suggestion)}</div>`}
    <details style="margin-top:14px"><summary>查看学习记录</summary><ul class="evidence-list"><li>距离与均值：${s.completed[1]?'已完成手算与核对。':'尚未提交完整手算记录。'}</li><li>K 的选择：${s.records[2]?'已提出 K='+esc(s.records[2].k)+' 的建议，依据见成果卡。':'尚未提交 K 的选择依据。'}</li><li>控制条件：${s.records.simulation?'已保存过程模拟。':'尚无过程模拟记录。'}${s.completed[2]?'已保存加维、起点与 K 的对照。':''}</li></ul></details>
    ${s.feedback?.source?.startsWith('大模型')?`<div class="soft" style="margin-top:14px"><h4>AI 补充点评</h4><p>${esc(f.summary)}</p><p>${esc(f.suggestion)}</p></div>`:''}
    ${s.review?`<div class="line"></div><h4>教师反馈</h4><p>${esc(s.review.comment||'教师已复核你的学习记录。')}</p>`:''}
    <div class="row"><button data-action="export-mine">下载我的学习记录</button>${S.model?'<button data-action="model-feedback" class="primary">请 AI 补充一条建议</button>':''}</div></section>`;
}
function tutorHtml(){const noHelp=stage===3&&!S.student.completed[3];return `<aside class="tutor ${collapsed?'collapsed':''}" aria-label="学习助手"><div class="tutor-header"><div class="tutor-title"><b>湖畔学习助手</b><div class="tutor-role">${KM.STAGES[stage].role} · <span id="tutorMode">${S.model?'大模型已接入':'本地导学'}</span></div></div><button class="ghost small" data-action="toggle-tutor" aria-label="折叠或展开学习助手">${collapsed?'＋':'−'}</button></div><div class="tutor-body" id="chatMessages"><div class="bubble">${stage===3&&S.student.completed[3]?'回顾已保存。有疑问，继续问我。':stage===3&&!S.student.records[2]?'先独立判断；K 方案可回实验环节补充。':greetings[stage]}</div>${messages[stage].map(m=>`<div class="${m.user?'bubble user':'bubble'}">${!m.user?`<div class="bubble-source">${esc(m.source||'本地导学')}</div>`:''}${esc(m.text)}</div>`).join('')}</div><div class="tutor-bottom">${noHelp?'<p class="small muted">提交后恢复提问</p>':`<div class="quick-questions">${(stage===1?['为什么要缩放？','怎样比较距离？','均值怎样更新？']:['怎样比较距离？','均值怎样更新？','怎样读肘部图？']).map(q=>`<button data-action="quick-chat" data-question="${q}">${q}</button>`).join('')}</div><form data-form="chat"><label class="hidden" for="chatInput">向学习助手提问</label><textarea id="chatInput" name="message" maxlength="500" placeholder="你卡在哪一步？" ${chatBusy?'disabled':''}></textarea><div class="row between" style="margin-top:8px"><span class="model-status">${S.model?'简短提示':'规则提示'}</span><button class="small primary" ${chatBusy?'disabled':''}>发送 ↑</button></div></form>`}</div></aside>`;}
function teacherLogin(){S=null;$('#app').innerHTML=header()+`<main class="login-teacher card"><div class="eyebrow">TEACHER DESK</div><h2>教师课堂工作台</h2><p class="muted">创建课堂，查看进度与学习记录。</p>${offline?'<div class="notice">离线版无教师汇总，请启动课堂服务。</div>':`<button class="primary" data-action="teacher-local" style="width:100%;margin-bottom:18px">在服务器电脑上登录</button><details><summary>在另一台电脑登录</summary><form data-form="teacher-login" style="margin-top:14px"><label for="teacherKey">教师口令</label><input id="teacherKey" type="password" name="key" required autocomplete="current-password"><p class="small muted">请向服务器管理员索取教师口令，非学生课堂码。</p><button class="primary">登录教师端</button></form></details>`}<div id="loginFeedback" role="status" class="answer-feedback"></div><p class="small" style="margin:18px 0 0"><a href="/">← 返回学生入口</a></p></main>`;}
async function loadTeacher(){const revision=++teacherLoadVersion;const r=await request('teacher/rooms');if(revision!==teacherLoadVersion)return;rooms=r.rooms;teacherData={...teacherData,...r};if(!selectedRoom||!rooms.some(x=>x.code===selectedRoom))selectedRoom=rooms.at(-1)?.code||'';if(selectedRoom){const c=await request('teacher/class?code='+selectedRoom);if(revision!==teacherLoadVersion)return;teacherData={...teacherData,...c};}teacherRender();}
function classEvidenceHtml(students){
  const e=KM.classEvidence(students),proposalCount=e.proposals.length;
  const maxK=Math.max(1,...e.kCounts.map(x=>x.count)),maxNeed=Math.max(1,...e.needs.map(x=>x.count));
  return `<section class="card class-evidence"><div class="row between"><h3>班级证据概览</h3><span class="tag">${e.total} 份学生记录</span></div>
    <div class="evidence-grid">
      <article class="evidence-module" id="evidenceTasks"><h4><span class="index">01</span>关键任务作答表现</h4><p class="small muted">按最近一次已提交的作答统计。</p>
        <div class="evidence-task-list">${e.tasks.map(t=>`<div class="evidence-task" data-task="${t.id}"><div class="row between"><b>${t.label}</b><span class="small">正确 <strong>${t.correct}</strong> / 已作答 ${t.submitted}</span></div><div class="evidence-track" aria-hidden="true"><span class="correct" style="width:${e.total?t.correct/e.total*100:0}%"></span><span class="needs-review" style="width:${e.total?t.needsReview/e.total*100:0}%"></span></div><div class="evidence-counts"><span>正确 ${t.correct}</span><span>需回看 ${t.needsReview}</span><span>暂无记录 ${t.missing}</span></div></div>`).join('')}</div>
      </article>
      <article class="evidence-module" id="evidenceMisconceptions"><h4><span class="index">02</span>常见误区</h4><p class="small muted">${e.needsReviewStudents} 人有需回看的作答；同一人可能涉及多项。</p>
        ${e.misconceptions.length?`<ul class="misconception-list">${e.misconceptions.map(m=>`<li><div class="row between"><b>${m.label}</b><span class="tag amber">${m.count} 人</span></div><p>${m.prompt}</p></li>`).join('')}</ul>`:'<p class="evidence-empty">当前已提交记录中暂无此类错误；未作答不代表已掌握。</p>'}
      </article>
      <article class="evidence-module" id="evidenceK"><h4><span class="index">03</span>K 方案与依据</h4><p class="small muted">已提交 ${proposalCount} 份；暂无方案 ${e.total-proposalCount} 份。</p>
        <div class="evidence-bars">${e.kCounts.map(x=>`<div class="evidence-bar"><b>K=${x.k}</b><div class="evidence-track" aria-hidden="true"><span class="correct" style="width:${x.count/maxK*100}%"></span></div><span>${x.count} 人</span></div>`).join('')}</div>
        ${proposalCount?`<details class="proposal-evidence"><summary>查看学生依据 · ${proposalCount} 份</summary><p class="small muted">以下为学生原文，未显示姓名；依据质量由教师结合解释判断。</p><div class="proposal-list">${e.proposals.map((p,i)=>`<article><div class="row between"><b>方案 ${i+1}</b><span class="tag">K=${p.k}</span></div><p>${esc(p.reason||'该记录未保存文字依据。')}</p></article>`).join('')}</div></details>`:'<p class="evidence-empty">等待学生提交 K 的选择与理由。</p>'}
        <p class="evidence-footnote">人数表示选择分布，不代表哪个 K 更正确。</p>
      </article>
      <article class="evidence-module" id="evidenceNeeds"><h4><span class="index">04</span>下一步学习需求</h4><p class="small muted">已选择 ${e.needResponses} 人；暂无记录 ${e.total-e.needResponses} 人。</p>
        <div class="need-list">${e.needs.map(n=>`<div><div class="row between"><span>${n.label}</span><b>${n.count} 人</b></div><div class="evidence-track" aria-hidden="true"><span class="need-fill" style="width:${n.count/maxNeed*100}%"></span></div></div>`).join('')}</div>
        <p class="evidence-footnote">学习需求来自学生选择，用于补讲与拓展，不计分。</p>
      </article>
    </div><p class="evidence-footnote">作答结果用于定位讲解重点；独立解释与方案质量仍需课堂观察。</p>
  </section>`;
}
function teacherRender(){const r=teacherData.room,students=teacherData.students||[];
  $('#app').innerHTML=`<header class="topbar"><a class="brand" href="/"><span class="brand-icon">≈</span><span>湖畔实验室 <span class="muted small"> / 教师工作台</span></span></a><div class="row"><span class="tag">${students.length} 人已进入</span><button class="small" data-action="projector">${projector?'退出投屏':'投屏大字模式'}</button><button class="ghost small" data-action="teacher-logout">退出</button></div></header><main class="teacher ${projector?'projector':''}"><div class="teacher-grid"><aside class="teacher-sidebar stack"><section class="card"><div class="eyebrow">我的课堂</div><form data-form="create-class"><label for="className">课堂名称</label><input id="className" name="name" value="高一人工智能公开课" maxlength="50"><button class="primary" style="margin-top:12px;width:100%">创建新课堂</button></form>${rooms.length?`<div class="line"></div><label for="selectClass">查看已有课堂</label><select id="selectClass" data-teacher-room>${rooms.map(x=>`<option value="${x.code}" ${selectedRoom===x.code?'selected':''}>${esc(x.name)} · ${x.code}</option>`).join('')}</select>`:''}</section>${r?`<section class="card"><label>学生课堂码</label><div class="teacher-code">${r.code}</div><p class="small muted">${esc(r.name)}</p><label>学生访问地址</label>${(teacherData.addresses||[]).map(a=>`<p class="small"><a href="${a}/?class=${r.code}" target="_blank" rel="noopener">${a}/?class=${r.code}</a></p>`).join('')||'<p class="small muted">未检测到局域网地址，请检查网络。</p>'}<button class="small" data-action="copy-link">复制学生链接</button><div class="line"></div><h4>课堂节奏</h4><div class="stack">${[1,2,3].map(i=>`<button class="small" data-action="unlock" data-stage="${i}" ${r.unlock>=i?'disabled':''}>开放至环节 ${i+1} · ${KM.STAGES[i].name}</button>`).join('')}<button data-action="pause">${r.paused?'恢复提交':'暂停全班提交'}</button></div><p class="small muted" style="margin:12px 0 0">开放访问不代表完成或掌握。</p></section>`:''}<details><summary>助教服务设置（可选）</summary><p>本地导学始终可用。接入兼容 Chat Completions 的服务后，对话使用大模型；超时自动回退。本地初评先保留，课堂回顾提交后可请求 AI 补充点评，所有评价由教师复核。</p><form data-form="model" style="margin-top:14px"><label>服务基础地址</label><input name="baseUrl" placeholder="https://服务地址/v1" value="${esc(teacherData.model?.baseUrl||'')}"><label style="margin-top:8px">模型名称</label><input name="model" value="${esc(teacherData.model?.model||'')}"><label style="margin-top:8px">服务凭据（留空保留）</label><input name="key" type="password" autocomplete="new-password"><p class="small muted">仅保存在教师电脑，不发送到学生浏览器。服务商会收到提问和相关学习记录，请按学校要求选用服务。</p><div class="row"><button class="small primary">保存</button><button class="small" type="button" data-action="test-model">测试连接</button></div></form><p class="small">当前：${teacherData.model?.configured?'已配置，连接状态以测试为准':'本地导学'}</p></details></aside><section class="stack">${r?teacherMain(students,r):`<div class="card"><h2>从一间新课堂开始</h2><p class="muted">创建课堂后，将课堂码和学生地址投屏。</p></div>`}</section></div></main>`;drawTeacher();}
function teacherMain(students,r){return `<div><div class="eyebrow">CLASS OVERVIEW / 每 4 秒更新</div><div class="row between"><h2>${esc(r.name)}</h2><span class="tag">课堂码 ${r.code}</span></div></div><div class="teacher-summary">${KM.STAGES.map((st,i)=>{const count=students.filter(s=>s.completed[i]).length;return `<div class="metric"><div class="label">${i+1} · ${st.name}</div><div class="value">${count}<small class="muted" style="font-size:15px"> / ${students.length}</small></div><div class="progress-track"><div class="progress-fill" style="width:${students.length?count/students.length*100:0}%"></div></div><div class="small muted">已完成提交</div></div>`;}).join('')}</div>${classEvidenceHtml(students)}<section class="card private-records"><div class="row between"><h3>学生记录与教师复核</h3><div class="row"><button class="small" data-action="export-class">导出 CSV</button><button class="small" data-action="export-json">完整记录 JSON</button><button class="small ghost" data-action="refresh-teacher">刷新</button></div></div>${students.length?`<div class="record-list">${students.map(studentRecord).join('')}</div>`:'<p class="muted">等待学生加入。</p>'}</section>`;}
function studentRecord(s){const f=s.feedback||KM.evaluate(s),exit=s.records[3]||{};return `<div class="record-entry"><details class="record-item" data-record="${s.id}"><summary><span class="row between"><span>${esc(s.name)} <span class="muted small">第 ${esc(s.group)} 组</span></span><span class="small">${s.completed.map((x,i)=>`<span class="chip">${i+1}${x?' ✓':' ·'}</span>`).join(' ')}　K=${esc(s.records[2]?.k||'—')}</span></span></summary><div class="line"></div><div class="info-pair"><div><label>K 与起点观察</label><p>${esc(s.records[2]?.reason||'尚未提交')}</p><p>${esc(s.records[2]?.observation||'')}</p></div><div>${exit.version===2?`<label>成果应用判断</label><p>${esc(KM.reflectionLabel('application',exit.application))}</p><p class="small muted">${exit.application==='review'?'选择合理，需听取学生解释。':'需回看：聚类不直接给出预警或等级。'}</p>`:`<label>原版使用边界与保护对象</label><p>${esc(exit.boundary||'尚未提交')}</p><p>${esc(exit.beneficiary||'')}</p>`}</div></div>${exit.version===2?`<div class="reflection-answer"><label>新样本迁移判断</label><p>${esc(KM.reflectionLabel('transfer',exit.transfer))}</p><label>学生希望继续探究</label><p>${esc(KM.reflectionLabel('focus',exit.focus))}</p>${exit.note?`<p>补充：${esc(exit.note)}</p>`:''}</div>`:`<label>原版学习反思</label><p>${esc(exit.reflection||'尚未提交')}</p>`}<p class="small muted">${s.handStats?`质心核对 ${s.handStats.centers} 次 · 单点判断 ${s.handStats.sse} 次`:`手算尝试 ${s.attempts[1]} 次`} · 提示 ${s.hints[1]} 次 · 实验 ${s.experiments.length} 次（次数仅为过程记录）</p><div class="rubric-grid">${f.dimensions.map((d,i)=>`<div class="rubric-item"><b>${KM.RUBRIC[i]} ${d.level||'待观察'}</b>${esc(d.evidence)}${exit.self?`<div class="small muted">原版学生自评：${exit.self[i]||'—'}</div>`:''}</div>`).join('')}</div><form data-form="review" data-id="${s.id}" style="margin-top:18px"><label>教师复核等级</label><div class="review-fields">${KM.RUBRIC.map((x,i)=>`<label>${x}<select name="level${i}"><option value="">待观察</option>${[1,2,3,4].map(n=>`<option value="${n}" ${s.review?.levels[i]===n?'selected':''}>${n} 级</option>`).join('')}</select></label>`).join('')}</div><label>教师评语</label><textarea name="comment" maxlength="1000">${esc(s.review?.comment||'')}</textarea><button class="primary small" style="margin-top:10px">保存复核</button></form></details><button type="button" class="small danger record-delete" data-action="delete-student" data-id="${s.id}" aria-label="删除${esc(s.name)}第${esc(s.group)}组的记录">删除</button></div>`;}
// Canvas drawings use a common aspect ratio in the hand calculation plot.
function canvasSetup(id){const c=document.getElementById(id);if(!c)return null;const w=Math.max(220,c.clientWidth),h=c.clientHeight||240,dpr=window.devicePixelRatio||1;c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);const ctx=c.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);ctx.font='11px Microsoft YaHei';return {c,ctx,w,h};}
function scatter(id,points,centers,labels,options={}){
  const setup=canvasSetup(id);if(!setup)return;const {ctx,w,h}=setup;
  let xmin=options.hand?0:Math.min(...points.map(p=>p[0]),...centers.map(p=>p[0])),xmax=options.hand?11:Math.max(...points.map(p=>p[0]),...centers.map(p=>p[0]));
  let ymin=options.hand?0:Math.min(...points.map(p=>p[1]),...centers.map(p=>p[1])),ymax=options.hand?11:Math.max(...points.map(p=>p[1]),...centers.map(p=>p[1]));
  if(!options.hand){const dx=(xmax-xmin||1)*.14,dy=(ymax-ymin||1)*.14;xmin-=dx;xmax+=dx;ymin-=dy;ymax+=dy;}
  let left=43,top=22,pw=w-64,ph=h-63;
  if(options.hand){const size=Math.min(pw,ph);left+=(pw-size)/2;pw=size;ph=size;}
  const X=x=>left+(x-xmin)/(xmax-xmin)*pw,Y=y=>top+ph-(y-ymin)/(ymax-ymin)*ph;
  ctx.lineWidth=1;ctx.textAlign='center';
  for(let t=0;t<=5;t++){const xv=xmin+(xmax-xmin)*t/5,yv=ymin+(ymax-ymin)*t/5;ctx.strokeStyle='#e3e9e1';ctx.beginPath();ctx.moveTo(X(xv),top);ctx.lineTo(X(xv),top+ph);ctx.moveTo(left,Y(yv));ctx.lineTo(left+pw,Y(yv));ctx.stroke();ctx.fillStyle='#7b8a82';ctx.fillText(fmt(xv,1),X(xv),top+ph+18);ctx.textAlign='right';ctx.fillText(fmt(yv,1),left-7,Y(yv)+4);ctx.textAlign='center';}
  ctx.strokeStyle='#9aaba0';ctx.strokeRect(left,top,pw,ph);
  if(options.links)points.forEach((p,i)=>{const j=labels[i];if(j<0||!centers[j])return;ctx.strokeStyle=colors[j]+'45';ctx.beginPath();ctx.moveTo(X(p[0]),Y(p[1]));ctx.lineTo(X(centers[j][0]),Y(centers[j][1]));ctx.stroke();});
  chartPositions[id]=[];
  points.forEach((p,i)=>{const j=labels?.[i]??-1,x=X(p[0]),y=Y(p[1]);ctx.fillStyle=j>=0?colors[j]:'#8d9f95';ctx.beginPath();ctx.arc(x,y,options.hand?5.5:5,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.stroke();chartPositions[id].push({x,y,i});if(options.hand){ctx.textAlign='left';ctx.fillStyle='#3b4f46';ctx.fillText('P'+(i+1),x+8,y+(i%2?11:-7));}});
  centers.forEach((p,j)=>{const x=X(p[0]),y=Y(p[1]);ctx.fillStyle='#fff';ctx.strokeStyle=colors[j];ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(x,y-9);ctx.lineTo(x+9,y);ctx.lineTo(x,y+9);ctx.lineTo(x-9,y);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle=colors[j];ctx.textAlign='center';ctx.fillText('ABCDEF'[j],x,y-13);});
  ctx.fillStyle='#60776a';ctx.textAlign='center';ctx.fillText(options.hand?'x：氨氮教学坐标':`氨氮${expParams.mode==='zscore'?'（标准化）':' mg/L'}`,left+pw/2,h-5);ctx.textAlign='left';ctx.fillText(options.hand?'y：叶绿素 a 教学坐标':`叶绿素 a${expParams.mode==='zscore'?'（标准化）':' μg/L'}`,5,12);
}
function lineChart(id,values,xLabels,label){const setup=canvasSetup(id);if(!setup)return;const {ctx,w,h}=setup;if(!values?.length){ctx.fillStyle='#7e9084';ctx.fillText('等待实验数据',20,h/2);return;}const l=48,t=20,pw=w-68,ph=h-54,max=Math.max(...values,1)*1.1;ctx.font='10px Microsoft YaHei';for(let i=0;i<=3;i++){const y=t+ph-i/3*ph;ctx.strokeStyle='#e3e9e1';ctx.beginPath();ctx.moveTo(l,y);ctx.lineTo(l+pw,y);ctx.stroke();ctx.fillStyle='#718578';ctx.textAlign='right';ctx.fillText(fmt(max*i/3,1),l-6,y+4);}ctx.strokeStyle='#145d58';ctx.lineWidth=2;ctx.beginPath();values.forEach((v,i)=>{const x=l+i*pw/Math.max(1,values.length-1),y=t+ph-v/max*ph;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();values.forEach((v,i)=>{const x=l+i*pw/Math.max(1,values.length-1),y=t+ph-v/max*ph;ctx.fillStyle='#145d58';ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fill();ctx.textAlign='center';if(values.length<8||i===0||i===values.length-1)ctx.fillText(xLabels[i],x,t+ph+18);});ctx.fillStyle='#718578';ctx.textAlign='left';ctx.fillText(label||'SSE',5,12);}
function barChart(id,labels,values,max){const setup=canvasSetup(id);if(!setup)return;const {ctx,w,h}=setup,l=26,t=22,pw=w-38,ph=h-62;max=max||Math.max(...values,1);labels.forEach((name,i)=>{const bw=pw/labels.length*.48,x=l+pw/labels.length*(i+.26),v=values[i]||0,bh=v/max*ph;ctx.fillStyle='#eaf1e8';ctx.fillRect(x,t,bw,ph);ctx.fillStyle=colors[i%colors.length];ctx.fillRect(x,t+ph-bh,bw,bh);ctx.fillStyle='#365247';ctx.textAlign='center';ctx.fillText(fmt(v,1),x+bw/2,t+ph-bh-7);ctx.fillText(name,x+bw/2,t+ph+20);});}
function drawAll(){if(stage===1){drawHand();if(S.student.completed[1])drawHandIteration();}if(stage===2)lab.draw();if(stage===3)drawColor(false);}
function drawHand(){const h=draft.hand;scatter('handPlot',KM.HAND,h.initial.map(i=>KM.HAND[i]),h.labels,{hand:true,links:true});}
function drawHandIteration(){const run=KM.handExpected(draft.hand.initial).run;handFrame=Math.min(handFrame,run.frames.length-1);const f=run.frames[handFrame];scatter('handIteration',KM.HAND,f.centers,f.labels,{hand:true,links:true});$('#handMetrics').innerHTML=`<div class="metric"><div class="label">第 ${f.round} 轮 · ${f.phase}${handFrame===run.frames.length-1?' · 已稳定':''}</div><div class="value">SSE ${fmt(f.sse,4)}</div></div><p class="small" style="margin-top:12px">${f.centers.map((c,j)=>`中心 ${'ABC'[j]} (${fmt(c[0])}, ${fmt(c[1])})`).join('<br>')}</p>`;lineChart('handCurve',run.frames.slice(0,handFrame+1).map(x=>x.sse),run.frames.slice(0,handFrame+1).map((_,i)=>i),'SSE · 半步记录');}

function drawTeacher(){ /* Teacher evidence is accessible HTML, responsive without canvas redraws. */ }
function colorPixels(){const points=[];for(let y=0;y<24;y++)for(let x=0;x<48;x++){const lake=y>10+Math.sin(x/7)*2;points.push(lake?[40+x*2,120+y*2,125+x]:[135+x,175+y,150+y*2]);}return points;}
function drawColor(reduced){const pixels=colorPixels(),result=reduced?KM.run(pixels,5,12):null;for(const [id,use] of [['colorOriginal',false],['colorResult',reduced]]){const canvas=document.getElementById(id);if(!canvas)continue;canvas.width=48;canvas.height=24;const ctx=canvas.getContext('2d');pixels.forEach((p,i)=>{const rgb=use?result.centers[result.labels[i]]:p;ctx.fillStyle=`rgb(${rgb.map(Math.round).join(',')})`;ctx.fillRect(i%48,Math.floor(i/48),1,1);});}if(reduced)$('#colorCaption').textContent='聚成 5 组，每组用均值颜色表示';}
function stopPlay(){if(playTimer)clearInterval(playTimer);playTimer=null;}
function play(kind){if(playTimer)return stopPlay();playTimer=setInterval(()=>{const n=KM.handExpected(draft.hand.initial).run.frames.length;handFrame=Math.min(handFrame+1,n-1);drawHandIteration();if(handFrame===n-1)stopPlay();},850);}
async function submit(stageNum,answer){
  let check;
  if(offline){
    if(S.student.completed[stageNum])return;
    check=KM.recordSubmission(S.student,stageNum,answer);saveDraft();
  }else{
    const result=await request('submit',{stage:stageNum,answer});check=result.check;setState(result);
  }
  if(check.pass||stageNum===1)studentRender();
  const feedback=$('#stageFeedback');
  if(feedback){feedback.className='answer-feedback '+(check.pass||check.centersReady?'success':'error');feedback.textContent=check.message;}
  toast(check.message);
  if(stageNum===3&&check.pass)$('#reflectionFeedback')?.scrollIntoView({behavior:'smooth',block:'start'});
  if(stageNum===1&&answer.phase==='centers')$('#centroidReference')?.scrollIntoView({behavior:'smooth',block:'center'});
}
function download(name,content,type='application/json'){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csv(rows){const cell=v=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};return '\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n');}
async function chat(question){if(chatBusy||!question.trim())return;chatBusy=true;messages[stage].push({user:true,text:question});const currentStage=stage;studentRender();const reply={text:'',source:S.model?'大模型助教':'本地导学'};messages[currentStage].push(reply);const area=$('#chatMessages');area.insertAdjacentHTML('beforeend','<div class="bubble" id="liveReply">正在思考你的问题…</div>');try{if(offline){S.student.hints[currentStage]++;reply.text=KM.tutor(currentStage,question,S.student).slice(0,120);}else{const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({stage:currentStage,message:question})});if(!response.ok){const data=await response.json();throw Error(data.error);}const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const blocks=buffer.split('\n\n');buffer=blocks.pop();for(const block of blocks){const line=block.split('\n').find(x=>x.startsWith('data: '));if(!line)continue;const obj=JSON.parse(line.slice(6));if(obj.source)reply.source=obj.source+(obj.fallback?'（模型暂不可用，已切换）':'');if(obj.delta)reply.text+=obj.delta;if($('#liveReply'))$('#liveReply').textContent=reply.text||'正在准备提示…';area.scrollTop=area.scrollHeight;}}}}catch(e){reply.text=e.message;reply.source='提示';}finally{chatBusy=false;saveDraft();studentRender();$('#chatMessages').scrollTop=$('#chatMessages').scrollHeight;}}
document.addEventListener('submit',async ev=>{const form=ev.target;if(!form.dataset.form)return;ev.preventDefault();const button=form.querySelector('button[type=submit],button:not([type])');if(button)button.disabled=true;const f=Object.fromEntries(new FormData(form));try{switch(form.dataset.form){
  case 'join':if(offline){S={student:{...KM.freshStudent(f.name,f.group),id:'offline'},room:{code:'离线',unlock:0},model:false};put('taihu-offline',S);}else{const result=await request('join',f);token=result.token;put('taihu-token',token);S=result;}initDraft();studentRender();startPoll();break;
  case 'concept':draft.choice=f.choice;await submit(0,{choice:f.choice});break;
  case 'hand-centers':draft.hand.fresh=false;await submit(1,{...draft.hand,phase:'centers'});break;
  case 'hand-sse':await submit(1,{...draft.hand,phase:'sse'});break;
  case 'proposal':draft={...draft,...f};await submit(2,{k:Number(f.k),reason:f.reason,observation:f.observation});break;
  case 'exit':await submit(3,{version:2,transfer:f.transfer,application:f.application,focus:f.focus,note:f.note||''});break;
  case 'chat':await chat(f.message);break;
  case 'teacher-login':{const r=await request('teacher/login',f);token=r.token;sessionStorage.setItem('taihu-teacher',token);await loadTeacher();startPoll();break;}
  case 'create-class':{const r=await request('teacher/create',f);selectedRoom=r.room.code;sessionStorage.setItem('taihu-room',selectedRoom);await loadTeacher();break;}
  case 'review':await request('teacher/review',{id:form.dataset.id,levels:[0,1,2,3].map(i=>f['level'+i]?Number(f['level'+i]):null),comment:f.comment});toast('教师复核已保存，学生端可查看。');break;
  case 'model':await request('teacher/model',{baseUrl:f.baseUrl,model:f.model,...(f.key?{key:f.key}:{})});toast('设置已保存，请测试连接。');await loadTeacher();break;
}}catch(e){toast(e.message);const el=$('#joinFeedback')||$('#loginFeedback');if(el){el.className='answer-feedback error';el.textContent=e.message;}}finally{if(button&&button.isConnected)button.disabled=false;saveDraft();}});
document.addEventListener('click',async ev=>{const b=ev.target.closest('[data-action]');if(!b||b.disabled)return;const act=b.dataset.action;try{switch(act){
  case 'stage':{const next=Number(b.dataset.stage);if(next>KM.allowed(S.student,S.room))return;stage=next;studentRender();window.scrollTo({top:0,behavior:'smooth'});break;}
  case 'toggle-tutor':collapsed=!collapsed;studentRender();break;
  case 'scale-predict':case 'scale-unit':case 'scale-method':case 'scale-done':{
    const a=draft.scaleDemo||={unit:'mg',scaled:false};let focus;
    if(act==='scale-predict'){a.prediction=b.dataset.value;focus='#scaleUnitToggle';}
    if(act==='scale-unit'){a.unit=a.unit==='mg'?'ug':'mg';if(a.scaled)a.verified=true;else a.converted=true;focus='#scaleUnitToggle';}
    if(act==='scale-method'){a.scaled=!a.scaled;focus='#scaleMethodToggle';}
    if(act==='scale-done'){a.done=true;focus='#scaleActivity summary';}
    saveDraft();$('#scaleActivityHost').innerHTML=scaleActivityHtml();$(focus)?.focus({preventScroll:true});break;
  }
  case 'logout':if(!offline)await request('logout',{});token=null;put('taihu-token',null);S=null;clearInterval(pollTimer);landing();break;
  case 'choose-center':selectingCenter=Number(b.dataset.index);centerArmed=true;studentRender();toast('请点击一个样本点，将它设为所选初始中心。');break;
  case 'reset-hand':draft.hand={fresh:true,initial:KM.HAND_INIT.slice(),labels:Array(8).fill(-1),centers:[['',''],['',''],['','']],sse:''};studentRender();break;
  case 'hand-step':stopPlay();handFrame=Math.min(handFrame+1,KM.handExpected(draft.hand.initial).run.frames.length-1);drawHandIteration();break;
  case 'hand-reset':stopPlay();handFrame=0;drawHandIteration();break;
  case 'hand-play':play('hand');break;
  case 'export-data':download('40点模拟数据.csv',csv([['点位',...KM.FEATURES.map(f=>f.name+' '+f.unit),'来源'],...KM.DATA.map(r=>[r.id,...r.values,'教学模拟，非实测'])]),'text/csv;charset=utf-8');break;
  case 'export-mine':download('我的学习记录.json',JSON.stringify(S.student,null,2));break;
  case 'model-feedback':{b.disabled=true;toast('正在依据过程证据生成补充点评…');const result=await request('feedback',{});setState(result);studentRender();toast(result.modelReview?'AI 点评已生成，供教师复核。':result.message);break;}
  case 'color':drawColor(true);break;
  case 'quick-chat':await chat(b.dataset.question);break;
  case 'teacher-local':{const r=await request('teacher/login',{local:true});token=r.token;sessionStorage.setItem('taihu-teacher',token);await loadTeacher();startPoll();break;}
  case 'teacher-logout':await request('logout',{});token=null;sessionStorage.removeItem('taihu-teacher');clearInterval(pollTimer);teacherLogin();break;
  case 'projector':projector=!projector;teacherRender();break;
  case 'unlock':await request('teacher/control',{code:selectedRoom,unlock:Number(b.dataset.stage)});await loadTeacher();toast('已开放访问；学生的完成记录保持真实。');break;
  case 'pause':await request('teacher/control',{code:selectedRoom,paused:!teacherData.room.paused});await loadTeacher();break;
  case 'refresh-teacher':await loadTeacher();break;
  case 'delete-student':{
    const s=teacherData?.students?.find(s=>s.id===b.dataset.id),code=selectedRoom;
    if(!s||teacherDeleting)break;
    const description=`“${s.name}”（第 ${s.group} 组，已完成 ${s.completed.filter(Boolean).length}/4 环节，K=${s.records[2]?.k||'—'}）`;
    if(!window.confirm(`删除${description}的记录？\n\n该条记录的作答、实验和教师复核将一并删除，班级统计与导出同步更新。删除后无法撤销。`))break;
    const openRecords=$$('.record-item[open]').map(el=>el.dataset.record);
    const edits=$$('form[data-form="review"]').map(form=>({id:form.dataset.id,values:Object.fromEntries(new FormData(form))}));
    teacherDeleting=true;++teacherLoadVersion;b.disabled=true;
    try{
      await request('teacher/delete-student',{id:s.id,code});
      if(selectedRoom===code){
        teacherData.students=teacherData.students.filter(student=>student.id!==s.id);teacherRender();
        $$('.record-item').forEach(el=>{el.open=openRecords.includes(el.dataset.record);});
        $$('form[data-form="review"]').forEach(form=>{const edit=edits.find(x=>x.id===form.dataset.id);if(edit)for(const [name,value] of Object.entries(edit.values))if(form.elements.namedItem(name))form.elements.namedItem(name).value=value;});
        $('[data-action="refresh-teacher"]')?.focus({preventScroll:true});
      }
      toast(`已删除“${s.name}”的记录。`);
    }finally{teacherDeleting=false;if(b.isConnected)b.disabled=false;}
    break;
  }
  case 'copy-link':{const link=(teacherData.addresses?.[0]||location.origin)+'/?class='+selectedRoom;try{await navigator.clipboard.writeText(link);toast('学生链接已复制');}catch{window.prompt('复制学生链接',link);}break;}
  case 'export-class':case 'export-json':{const json=act==='export-json';const response=await fetch('/api/teacher/export?code='+selectedRoom+(json?'&format=json':''),{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw Error('导出未完成，请刷新后重试');download('课堂记录.'+(json?'json':'csv'),await response.text(),json?'application/json':'text/csv;charset=utf-8');break;}
  case 'test-model':b.disabled=true;toast('正在测试模型连接…');const test=await request('teacher/model-test',{});toast(test.message);b.disabled=false;break;
}}catch(e){toast(e.message);b.disabled=false;}});
document.addEventListener('input',ev=>{const el=ev.target;if(!S||teacherView)return;if(el.dataset.center){const [j,d]=el.dataset.center.split(',').map(Number);draft.hand.centers[j][d]=el.value;refreshHandReady();}else if(el.id==='pointSse')draft.hand.pointSse=el.value;else if(el.id==='sseTrend')draft.hand.trend=el.value;else if(el.dataset.reflection){draft.exitV2[el.dataset.reflection]=el.value;}else if(el.dataset.exit){draft.exit[el.dataset.exit]=el.value;}else if(el.dataset.self){draft.exit.self=draft.exit.self||[];draft.exit.self[Number(el.dataset.self)]=Number(el.value);}else if(['reason','observation'].includes(el.name)&&stage===2)draft[el.name]=el.value;saveDraft();});
document.addEventListener('change',async ev=>{const el=ev.target;try{if(el.dataset.labelIndex!==undefined){draft.hand.labels[Number(el.dataset.labelIndex)]=Number(el.value);saveDraft();drawHand();refreshHandReady();}if(el.name==='choice'){draft.choice=el.value;saveDraft();}if(el.name==='k'&&stage===2){draft.k=Number(el.value);saveDraft();}if(el.dataset.teacherRoom!==undefined){selectedRoom=el.value;sessionStorage.setItem('taihu-room',selectedRoom);await loadTeacher();}}catch(e){toast(e.message);}});
document.addEventListener('click',ev=>{if(ev.target.id!=='handPlot')return;const c=ev.target,r=c.getBoundingClientRect(),x=ev.clientX-r.left,y=ev.clientY-r.top;const p=(chartPositions[c.id]||[]).find(p=>Math.hypot(p.x-x,p.y-y)<18);if(!p)return;if(c.id==='handPlot'){const h=draft.hand;if((centerArmed||ev.shiftKey)&&!S.student.completed[1]){setInitialPoint(p.i);return;}const d=h.initial.map(i=>KM.distance2(KM.HAND[p.i],KM.HAND[i]));$('#handTooltip').textContent=h.labels[p.i]<0?`P${p.i+1}：请先预测它所属的组，再点击查看距离。按住 Shift 点击可设置选中的初始中心。`:`P${p.i+1} 到 A/B/C 的平方距离：${d.map(n=>fmt(n,4)).join(' / ')}。你的预测是组 ${'ABC'[h.labels[p.i]]}。`;}});
function setInitialPoint(i){if(draft.hand.initial.includes(i)&&draft.hand.initial[selectingCenter]!==i){toast('三个初始质心请选择不同的点。');return;}centerArmed=false;draft.hand.initial[selectingCenter]=i;draft.hand.labels=Array(8).fill(-1);draft.hand.centers=[['',''],['',''],['','']];draft.hand.sse='';draft.hand.pointSse='';draft.hand.trend='';draft.hand.fresh=true;studentRender();toast(`中心 ${'ABC'[selectingCenter]} 已设置为 P${i+1}`);}
let dragCenter=null;
document.addEventListener('pointerdown',ev=>{if(ev.target.id!=='handPlot'||S.student.completed[1])return;const r=ev.target.getBoundingClientRect(),x=ev.clientX-r.left,y=ev.clientY-r.top;const p=chartPositions.handPlot.find(p=>Math.hypot(p.x-x,p.y-y)<15&&draft.hand.initial.includes(p.i));if(p){dragCenter={j:draft.hand.initial.indexOf(p.i),x:ev.clientX,y:ev.clientY};ev.target.setPointerCapture(ev.pointerId);}});
document.addEventListener('pointerup',ev=>{if(!dragCenter)return;const drag=dragCenter;dragCenter=null;if(Math.hypot(ev.clientX-drag.x,ev.clientY-drag.y)<5)return;const r=ev.target.getBoundingClientRect(),x=ev.clientX-r.left,y=ev.clientY-r.top;const p=chartPositions.handPlot.find(p=>Math.hypot(p.x-x,p.y-y)<22);if(p){selectingCenter=drag.j;setInitialPoint(p.i);}});
function startPoll(){clearInterval(pollTimer);if(offline)return;pollTimer=setInterval(async()=>{if(document.hidden)return;try{if(teacherView){if(!token||teacherDeleting||document.querySelector('.record-item[open], .class-evidence details[open]')||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;await loadTeacher();}else if(S){const r=await request('me');if(S.student.attempts.some((n,i)=>n>r.student.attempts[i])||S.student.completed.some((done,i)=>done&&!r.student.completed[i])||S.student.experiments.length>r.student.experiments.length)return;const changed=r.room.unlock!==S.room.unlock||r.room.paused!==S.room.paused||JSON.stringify(r.student.review)!==JSON.stringify(S.student.review)||r.model!==S.model;S={...S,...r};if(changed&&!chatBusy){studentRender();toast('课堂状态已更新');}}}catch{/* retain drafts when temporarily offline; mutations display explicit errors */}},4000);}
window.addEventListener('resize',()=>{clearTimeout(window.resizeTimer);window.resizeTimer=setTimeout(()=>teacherView?drawTeacher():S&&drawAll(),150);});
async function boot(){if(teacherView){if(offline)return teacherLogin();if(token){try{await loadTeacher();startPoll();return;}catch{token=null;}}teacherLogin();return;}if(offline){S=get('taihu-offline',null);if(S){initDraft();studentRender();return;}landing();return;}if(token){try{S=await request('me');initDraft();studentRender();startPoll();return;}catch{token=null;put('taihu-token',null);}}landing();}
const lab=ClassroomLab.create({read:()=>({student:S.student,room:S.room,draft}),save:saveDraft,post:request,set:setState,render:studentRender,toast,offline,lineChart,experimentTable});
boot();
})();
