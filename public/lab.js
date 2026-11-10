/* Guided experiments. All numerical results are computed by KM, including 5-D distances. */
window.ClassroomLab={create(io){
  const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(n,p=3)=>Number(n.toFixed(p)).toLocaleString('en-US',{maximumFractionDigits:p});
  const colors=['#177e89','#d78149','#8b69ad','#ae9b38','#4378af','#bf607a'];
  const steps=[['模拟过程','逐步模拟聚类'],['增加特征','从二维到五维'],['比较起点','换起点，结果会变吗？'],['选择 K','分几组更合适？']];
  let view=null,timer=null,busy=false,cache=null;
  const student=()=>io.read().student;
  const state=()=>io.read().draft.lab;
  function init(){
    const d=io.read().draft;
    d.lab=d.lab||{version:3,step:0,frame:-1,params:{...KM.LAB_BASE},selected:9,axes:[0,1,2],simulation:{frames:[],attempts:[]}};
    const l=d.lab;
    if(!l.version){
      if(l.step===0&&l.params.dims===3){l.previousSimulation={params:{...l.params},frame:l.frame,simulation:JSON.parse(JSON.stringify(l.simulation||{}))};l.params={...KM.LAB_BASE};l.frame=-1;l.simulation={frames:[],attempts:[]};}
      l.version=2;
    }
    if(l.version<3){
      const previousComparison=l.step>=2||student().experiments.some(x=>x.dims===5&&x.seed!==1)||student().records.elbow?.dims===5;
      if(previousComparison){
        l.previousComparison={step:l.step,params:{...l.params},frame:l.frame,observation:d.observation,reason:d.reason,k:d.k};
        if(!student().completed[2]){d.observation='';d.reason='';}
      }
      if(l.step>=2){l.params={...KM.LAB_BASE,dims:3};l.frame=-1;l.axes=[0,1,2];}
      l.version=3;
    }
    l.simulation||={frames:[],attempts:[]};
    const step=Math.min(l.step,student().completed[2]?3:KM.labProgress(student()).available);
    if(step!==l.step){l.step=step;l.params={...KM.LAB_BASE,dims:step>=2?3:2};l.frame=-1;l.axes=[0,1,2];}
  }
  function save(){io.save();}
  function run(){const p=state().params,key=JSON.stringify(p);if(cache?.key!==key)cache={key,...KM.run(KM.prepare(p.dims,p.mode).points,p.k,p.seed)};return cache;}
  function frame(){const l=state(),r=run();return l.frame<0?{...r.frames[0],labels:Array(40).fill(-1),sse:null,phase:'选择初始中心'}:r.frames[Math.min(l.frame,r.frames.length-1)];}
  function stable(){return state().frame===run().frames.length-1;}
  function stop(){clearInterval(timer);timer=null;}
  function dispose(){stop();view?.dispose();view=null;}
  function enter(step){const l=state();if(step>(student().completed[2]?3:KM.labProgress(student()).available))return;stop();l.step=step;l.frame=-1;l.axes=[0,1,2];l.selected=9;l.params={...KM.LAB_BASE,dims:step>=2?3:2};if(step===0&&student().records.simulation)l.frame=run().frames.length-1;save();io.render();}
  function opts(list,value){return '<option value="">请选择</option>'+list.map(([v,t])=>`<option value="${v}" ${String(value)===String(v)?'selected':''}>${t}</option>`).join('');}
  function guideHtml(){
    const l=state(),r=run(),f=frame(),sim=l.simulation;
    if(l.step!==0)return `<div class="soft"><b>本次只改变：${['','特征维数','初始中心','K'][l.step]}</b><p class="small" style="margin-top:8px">${['','固定 K=3、起点 1、标准化；依次保存 2、3、5 维结果。','固定三维、标准化、K=3；保存另一组起点的结果。','固定三维、标准化、起点 1；保存另一 K 的结果，再看肘部图。'][l.step]}</p></div>`;
    if(student().records.simulation)return '<div class="success"><b>✓ 已完成过程模拟</b><p class="small" style="margin:8px 0 0">可进入下一任务，或重播观察。</p></div>';
    const controls=l.frame===-1?`<label for="simAnswer">比较下表距离：T10 属于哪组？</label><select id="simAnswer" data-lab-field="cluster">${opts([[0,'组 A'],[1,'组 B'],[2,'组 C']],sim.cluster)}</select>`:
      l.frame===0?`<label for="simAnswer">新质心怎样计算？</label><select id="simAnswer" data-lab-field="updateRule">${opts([['mean','同组各点每一维分别求平均'],['sample','选一个离原中心最远的样本']],sim.updateRule)}</select>`:
      l.frame===1?`<label for="simAnswer">中心移动后，成员怎么办？</label><select id="simAnswer" data-lab-field="reassignRule">${opts([['nearest','重新比较到所有新中心的距离'],['keep','保持原分组直到结束']],sim.reassignRule)}</select>`:
      stable()?`<label for="stopRule">为什么可以停止？</label><select id="stopRule" data-lab-field="stopRule">${opts([['both','成员归属与各维质心都已稳定'],['sse','只要显示的 SSE 两位小数一样'],['once','只要更新过一次均值']],sim.stopRule)}</select>`:
      '<p class="small">继续更新、重新分配，观察成员与中心是否稳定。</p>';
    return `<div class="simulation-prompt"><h4>${l.frame<0?'① 分配给最近的中心':l.frame===0?'② 用均值更新中心':l.frame===1?'③ 按新中心重新分配':stable()?'④ 判断停止条件':'继续迭代'}</h4>${controls}<div id="simFeedback" class="small" role="status"></div></div>`;
  }
  function controlsHtml(){const l=state(),done=student().records.simulation,locked=l.step===0&&!done;return `<div class="lab-actions">
    <button class="primary" data-lab-action="step" ${stable()?'disabled':''}>${l.frame<0?'执行首次分配':run().frames[l.frame+1]?.phase==='均值更新'?'执行均值更新':'执行重新分配'}</button>
    <button data-lab-action="play" ${locked&&l.frame<2||stable()?'disabled':''}>连续观察 / 暂停</button>
    ${l.step>0?'<button data-lab-action="finish">运行至稳定</button>':''}
    <button class="ghost" data-lab-action="reset">从起点重看</button>
    <button data-lab-action="save" ${!stable()?'disabled':''}>${l.step===0?'保存过程证据':'保存本次实验'}</button>
  </div>`;}
  function comparisonHtml(){const l=state(),e=student().experiments;
    if(l.step===1){const a=e.find(x=>x.dims===2&&x.k===3&&x.seed===1&&x.mode==='zscore'),b=e.findLast(x=>x.dims===5&&x.k===3&&x.seed===1&&x.mode==='zscore');return `<section class="card"><h3>多一维，距离多一项</h3><div class="formula">二维：d²＝Δ氨氮²＋Δ叶绿素 a²<br>三维：d²＝Δ氨氮²＋Δ叶绿素 a²＋Δ总磷²<br>五维：d²＝前三项＋Δ溶解氧²＋ΔpH²</div><p>Δ 为标准化坐标差；均值仍逐维计算。</p>${a&&b?`<div class="success">同 K、同起点的二维与五维：<b>${KM.samePartition(a.labels,b.labels)?'成员组合相同':'成员组合发生变化'}</b>。</div>`:'<p class="muted">保存后比较成员组合。</p>'}<p class="small muted" style="margin-top:12px">不同维数的 SSE 不直接比优劣。</p></section>`;}
    if(l.step===2){const a=e.find(x=>x.dims===3&&x.k===3&&x.seed===1&&x.mode==='zscore'),b=e.findLast(x=>x.dims===3&&x.k===3&&x.seed!==1&&x.mode==='zscore');return `<section class="card"><h3>比较成员与 SSE</h3>${a&&b?`<div class="info-pair"><div class="metric">起点 ${a.seed}<div class="value">${fmt(a.sse)}</div><span class="small">最终 SSE</span></div><div class="metric">起点 ${b.seed}<div class="value">${fmt(b.sse)}</div><span class="small">最终 SSE</span></div></div><p style="margin-top:12px">本次成员组合${KM.samePartition(a.labels,b.labels)?'相同':'不同'}（已排除编号互换）。</p>`:'<p class="muted">保存另一组起点后对比。</p>'}<label for="observation">换起点后，结果如何？</label><textarea id="observation" data-lab-field="observation" maxlength="1000" placeholder="成员组合与 SSE 有何变化？至少 8 字。">${esc(io.read().draft.observation||'')}</textarea><p class="small muted">结果可能相同或不同；多次运行也不保证全局最优。</p></section>`;}
    if(l.step===3){const curve=student().records.elbow?.dims===3&&student().records.elbow.mode==='zscore'?student().records.elbow.curve:null;return `<section class="card"><div class="row between"><h3>读肘部图，提出 K</h3><button class="primary" data-lab-action="elbow">生成肘部图</button></div><p class="small muted">找 SSE 下降趋缓的位置；SSE 最小不等于 K 最合适。</p><details><summary>肘部图怎样计算？</summary><p>固定三维、标准化；K=2—6 各试 30 个起点，取最小 SSE。</p></details><div class="grid2"><canvas id="elbowPlot" class="chart small-chart" aria-label="K与SSE的肘部关系图"></canvas><div id="elbowTable">${curve?`<table><thead><tr><th>K</th><th>SSE</th><th>比前一 K 下降</th></tr></thead><tbody>${curve.map((c,i)=>`<tr><td>${c.k}</td><td>${fmt(c.sse)}</td><td>${i?fmt(curve[i-1].sse-c.sse):'—'}</td></tr>`).join('')}</tbody></table>`:'生成后比较相邻 K 的下降量。'}</div></div><form data-form="proposal"><label for="chosenK">我的候选 K</label><select id="chosenK" name="k">${[2,3,4,5,6].map(k=>`<option ${Number(io.read().draft.k||3)===k?'selected':''}>${k}</option>`).join('')}</select><label for="reason" style="margin-top:14px">K 的依据</label><textarea id="reason" name="reason" maxlength="1000" required placeholder="引用 SSE 下降量，说明取舍（至少 12 字）；无明显拐点也可说明。">${esc(io.read().draft.reason||'')}</textarea><label for="observation" style="margin-top:14px">起点观察（已带入，可修改）</label><textarea id="observation" name="observation" maxlength="1000" required>${esc(io.read().draft.observation||'')}</textarea><button class="primary" style="margin-top:14px" ${student().completed[2]?'disabled':''}>${student().completed[2]?'✓ 分群建议已提交':'提交我的实验结论'}</button><div id="stageFeedback" class="answer-feedback" role="status"></div></form><details style="margin-top:16px"><summary>国标五类为什么不决定 K=5？</summary><p>国标按规定指标与限值评价，聚类依据所选特征的距离发现结构；簇数不等于水质等级数，K=5 也不能将五个簇直接对应五类水。叶绿素 a 不是 GB 3838 基本项目的 I—V 类分级指标。</p></details></section>`;}
    return '';
  }
  function html(){init();const l=state(),p=KM.labProgress(student()),allowed=student().completed[2]?3:p.available;return `<section class="lab-roadmap"><div class="eyebrow">每次只改一个条件</div><div class="lab-tabs">${steps.map((s,i)=>`<button data-lab-action="tab" data-step="${i}" class="${i===l.step?'active':''}" ${i>allowed?'disabled':''}><span>${i+1}. ${s[0]}${[p.simulation,p.dimensions,p.initializations,student().completed[2]][i]?' ✓':''}</span></button>`).join('')}</div></section>
    <section class="card lab-main"><div class="row between"><h3>${steps[l.step][1]}</h3><span class="tag">${l.params.dims} 维 · 标准化 · K=${l.params.k} · 起点 ${l.params.seed}</span></div>
    ${l.step===0?'<p class="small muted">先固定 K=3 观察过程，最后讨论 K 的依据。</p>':''}
    ${l.step===1?`<div class="row"><label for="dims">计算特征</label><select id="dims" data-lab-field="dims" style="max-width:320px"><option value="2" ${l.params.dims===2?'selected':''}>2 维：氨氮、叶绿素 a</option><option value="3" ${l.params.dims===3?'selected':''}>3 维：氨氮、叶绿素 a、总磷</option><option value="5" ${l.params.dims===5?'selected':''}>5 维：增加溶解氧、pH</option></select></div>`:''}
    ${l.step===2?'<button data-lab-action="random">换一组起点</button>':''}
    ${l.step===3?`<div class="row"><label for="k">簇数 K</label><select id="k" data-lab-field="k" style="max-width:180px">${[2,3,4,5,6].map(k=>`<option ${l.params.k===k?'selected':''}>${k}</option>`).join('')}</select></div>`:''}
    <div class="lab-scene-layout"><div><div class="scene-toolbar"><span class="small">${l.params.dims===2?'二维平面 · 横纵轴等比例 · 点选样本':'拖动旋转 · 滚轮缩放 · 点选样本'}</span>${l.params.dims===2?'':'<button class="small ghost" data-lab-action="camera">复位视角</button>'}</div><div id="${l.params.dims===2?'lab2d':'lab3d'}" class="lab3d"></div><div class="row small" style="margin:10px 0"><span>● 样本　◆ 质心　空心◆ 更新前质心</span><span>${l.params.dims===2?'金色圆环':'金色网格球'}：本步改组样本</span></div><div id="labProjection"></div><div id="expLegend" class="legend"></div></div><aside><div id="labGuide">${guideHtml()}</div><div id="labMetrics"></div></aside></div>
    <div id="labActions">${controlsHtml()}</div><div id="labNarration" class="notice" aria-live="polite"></div>
    <div class="lab-inspection"><div class="row between"><h4>这个点离哪个中心近？</h4><select id="labPoint" data-lab-field="selected" aria-label="追踪样本" style="max-width:150px">${KM.DATA.map((r,i)=>`<option value="${i}" ${i===l.selected?'selected':''}>${r.id}</option>`).join('')}</select></div><div id="distanceDetails"></div></div>
    <details><summary>查看质心与成员</summary><div id="centerDetails"></div></details>
    </section>${comparisonHtml()}
    <section class="card"><div class="row between"><h3>实验记录</h3><span class="tag">${student().experiments.length} 次实验</span></div>${io.experimentTable(student().experiments)}${l.step<3?`<button class="primary" style="margin-top:14px" data-lab-action="tab" data-step="${l.step+1}" ${l.step+1>allowed?'disabled':''}>下一任务：${steps[l.step+1][0]} →</button>`:''}</section>
    <details><summary>数据与尺度说明</summary><p>40 点为无标签教学模拟数据。各特征按 z＝(原值−均值)/标准差处理，避免数值尺度主导距离。各轴等比例；坐标表示特征，不是地理位置。</p><button class="small" data-action="export-data">下载模拟数据 CSV</button></details>`;}
  function draw(animate=false){const host=$('#lab2d')||$('#lab3d');if(!host)return;const l=state(),r=run(),f=frame(),points=KM.prepare(l.params.dims,'zscore').points,prev=l.frame>0?r.frames[l.frame-1]:null;
    const changed=prev&&f.phase==='重新分配'?f.labels.map((v,i)=>v!==prev.labels[i]?i:-1).filter(i=>i>=0):[];
    if(!view)view=(l.params.dims===2?window.Lab2D:window.Lab3D)?.mount(host,i=>{if(l.step===0&&l.frame<0&&!student().records.simulation){io.toast('先预测 T10，分配后可换样本。');return;}l.selected=i;save();draw();});
    view?.update({points,centers:f.centers,labels:f.labels,axes:l.axes,names:KM.FEATURES.map(f=>f.name+' z'),colors,selected:l.selected,changed,animate,previousCenters:f.phase==='均值更新'?prev?.centers:null});
    $('#labPoint').value=l.selected;$('#labPoint').disabled=l.step===0&&l.frame<0&&!student().records.simulation;
    $('#labProjection').innerHTML=l.params.dims===5?`<label for="labAxes">显示的三个轴</label><select id="labAxes" data-lab-field="axes"><option value="0,1,2" ${l.axes.join(',')==='0,1,2'?'selected':''}>氨氮 · 叶绿素 a · 总磷</option><option value="2,3,4" ${l.axes.join(',')==='2,3,4'?'selected':''}>总磷 · 溶解氧 · pH</option><option value="0,3,4" ${l.axes.join(',')==='0,3,4'?'selected':''}>氨氮 · 溶解氧 · pH</option></select><p class="small muted">仅显示三轴；五维均参与计算。真实距离见下表，换轴不改分组。</p>`:l.params.dims===2?'<p class="small muted">z 为标准化值；连线为二维距离。</p>':'<p class="small muted">三轴：氨氮、叶绿素 a、总磷；z 为标准化值。</p>';
    $('#labMetrics').innerHTML=`<div class="metric"><div class="label">第 ${f.round} 轮 · ${l.frame<0?'尚未分配':f.phase}</div><div class="value">${f.sse===null?'待分配':'SSE '+fmt(f.sse,2)}</div></div><div class="metric"><div class="label">本步成员变化</div><b>${l.frame<0?'尚未分配':l.frame===0?'首次分配 40 点':f.phase==='均值更新'?'保持原分组':changed.length+' 个点改组'}</b></div><div class="metric"><div class="label">本轮质心最大移动量</div><b>${l.frame<1?'—':fmt(Math.sqrt(f.shift),5)}</b></div>`;
    $('#labNarration').textContent=l.frame<0?'灰色点尚未分配。比较 T10 到三个中心的距离。':f.phase==='均值更新'?'逐维求均值，中心移动；成员暂不变，下一步重新分配。':l.frame===0?'首次分配完成，下一步求各组均值。':stable()?'成员与中心稳定，停止；不保证全局最优。':`重新比较距离：${changed.length} 个点改组。继续检查中心是否稳定。`;
    $('#expLegend').innerHTML=f.centers.map((_,j)=>`<span><i class="dot" style="background:${colors[j]}"></i>${'ABCDEF'[j]} · ${f.labels.filter(x=>x===j).length} 点</span>`).join('');
    const point=points[l.selected],nearest=KM.assign([point],f.centers)[0];
    $('#distanceDetails').innerHTML=`<p class="small">${KM.DATA[l.selected].id} · z 坐标：(${point.map(v=>fmt(v)).join(', ')})。${l.frame<0?'比较距离，再预测。':`归属 ${'ABCDEF'[f.labels[l.selected]]}；最近中心 ${'ABCDEF'[nearest]}。${f.phase==='均值更新'?'均值已更新，待重新分配。':''}`}</p><div class="table-scroll"><table><thead><tr><th>中心</th>${KM.FEATURES.slice(0,l.params.dims).map(x=>`<th>Δ${x.name}²</th>`).join('')}<th>总和 d²</th><th>距离 d</th></tr></thead><tbody>${f.centers.map((c,j)=>{const terms=point.map((v,d)=>(v-c[d])**2),sum=terms.reduce((a,b)=>a+b,0);return `<tr><td>${'ABCDEF'[j]}</td>${terms.map(v=>`<td>${fmt(v)}</td>`).join('')}<td><b>${fmt(sum)}</b></td><td>${fmt(Math.sqrt(sum))}</td></tr>`;}).join('')}</tbody></table></div><p class="small muted">d²＝各维坐标差的平方和，越小越近；显示值已舍入。</p>`;
    $('#centerDetails').innerHTML='<div class="table-scroll"><table><thead><tr><th>组</th><th>当前质心（逐维坐标）</th><th>当前成员</th></tr></thead><tbody>'+f.centers.map((c,j)=>`<tr><td>${'ABCDEF'[j]}</td><td>(${c.map(v=>fmt(v)).join(', ')})</td><td class="wrap">${f.labels.map((v,i)=>v===j?KM.DATA[i].id:'').filter(Boolean).join('、')||'尚无成员'}</td></tr>`).join('')+'</tbody></table></div>';
    $('#labGuide').innerHTML=guideHtml();$('#labActions').innerHTML=controlsHtml();
    const e=student().records.elbow;if($('#elbowPlot'))io.lineChart('elbowPlot',e?.dims===3&&e.mode==='zscore'?e.curve.map(x=>x.sse):null,e?.curve.map(x=>'K='+x.k),'SSE · 固定三维与标准化');
  }
  function next(){const l=state(),sim=l.simulation,r=run();if(stable())return;
    if(l.step===0&&!student().records.simulation){let ok=true,msg='';if(l.frame===-1){ok=sim.cluster===r.frames[0].labels[9];msg=`比较 T10 到三个中心的完整${l.params.dims}维距离，选择数值最小的一组。`;}if(l.frame===0){ok=sim.updateRule==='mean';msg='对同组成员逐维求平均，不是任选样本。';}if(l.frame===1){ok=sim.reassignRule==='nearest';msg='中心移动了，请重新比较到各中心的距离。';}sim.attempts.push({frame:l.frame,ok,at:new Date().toISOString()});if(!ok){save();$('#simFeedback').textContent=msg;io.toast(msg);return;}}
    l.frame++;if(l.step===0&&!sim.frames.includes(l.frame))sim.frames.push(l.frame);save();draw(true);if(stable())stop();
  }
  async function act(action,el){const l=state();if(busy)return;
    if(action==='tab')return enter(Number(el.dataset.step));
    if(action==='camera')return view?.reset();
    if(action==='step'){stop();return next();}
    if(action==='play'){if(timer)return stop();if(l.step===0&&l.frame<2&&!student().records.simulation)return;timer=setInterval(next,1100);return;}
    if(action==='reset'){stop();l.frame=-1;if(l.step===0&&!student().records.simulation)l.simulation={frames:[],attempts:l.simulation.attempts||[]};save();draw();return;}
    if(action==='finish'){if(l.step===0)return;stop();l.frame=run().frames.length-1;save();draw();return;}
    if(action==='random'){stop();l.params.seed++;l.frame=-1;save();io.render();return;}
    if(['save','elbow'].includes(action)){
      if(io.read().room.paused)throw Error('教师已暂停提交，请先听讲。');busy=true;el.disabled=true;
      try{
        if(action==='save'){
          if(!stable())throw Error('先观察至稳定，再保存记录。');
          if(l.step===0){if(student().records.simulation){io.toast('已保存，可进入下一任务。');return;}const answer={...l.simulation,point:9,dims:l.params.dims};const check=KM.validateSimulation(answer);if(!check.pass)throw Error(check.message);if(io.offline){if(!student().records.simulation){student().records.simulation=answer;student().experiments.push(KM.experiment(l.params));}}else{const result=await io.post('simulation',answer);io.set(result);if(!result.check.pass)throw Error(result.check.message);}}
          else if(io.offline)student().experiments.push(KM.experiment(l.params));else io.set(await io.post('experiment',l.params));
          io.toast(l.step===0?'已保存，接着比较维数。':'已保存，请比较结果。');
        }else{if(io.offline)student().records.elbow={dims:3,mode:'zscore',curve:KM.elbow(3,'zscore')};else io.set(await io.post('elbow',{dims:3,mode:'zscore'}));}
        save();io.render();
      }finally{busy=false;if(el.isConnected)el.disabled=false;}
    }
  }
  document.addEventListener('click',async ev=>{const el=ev.target.closest('[data-lab-action]');if(!el||el.disabled)return;try{await act(el.dataset.labAction,el);}catch(e){io.toast(e.message);}});
  document.addEventListener('change',ev=>{const el=ev.target,key=el.dataset.labField;if(!key)return;const l=state();if(['dims','k'].includes(key)){stop();l.params[key]=Number(el.value);l.axes=[0,1,2];l.frame=-1;save();io.render();}else if(key==='axes'){l.axes=el.value.split(',').map(Number);save();draw();}else if(key==='selected'){l.selected=Number(el.value);save();draw();}else if(key!=='observation'){l.simulation[key]=key==='cluster'?Number(el.value):el.value;save();}});
  document.addEventListener('input',ev=>{if(ev.target.dataset.labField==='observation'){io.read().draft.observation=ev.target.value;save();}});
  return {init,html,draw,dispose};
}};
