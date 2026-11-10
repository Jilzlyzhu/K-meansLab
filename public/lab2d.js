/* True Cartesian 2-D view. Both axes use the same pixels per standardised unit. */
window.Lab2D={mount(host,onSelect){
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  canvas.setAttribute('role','img');canvas.setAttribute('aria-label','二维特征散点图：横轴氨氮，纵轴叶绿素 a；可点选样本，下方也可通过样本列表选择。');
  host.replaceChildren(canvas);host.dataset.renderer='2d';
  let data=null,width=0,height=0,raf=0,disposed=false,start=0,from=null,geometry=null;
  const label=(text,x,y,color='#41534d',align='center',size=12)=>{ctx.font=`${size}px "Microsoft YaHei", sans-serif`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(text,x,y);};
  function diamond(p,color,hollow=false){
    ctx.beginPath();ctx.moveTo(p[0],p[1]-9);ctx.lineTo(p[0]+9,p[1]);ctx.lineTo(p[0],p[1]+9);ctx.lineTo(p[0]-9,p[1]);ctx.closePath();
    ctx.fillStyle=hollow?'#f8fbf8':color;ctx.fill();ctx.strokeStyle=hollow?color:'#fff';ctx.lineWidth=2;ctx.stroke();
  }
  function paint(now=performance.now()){
    if(!data||disposed)return;
    const {points,centers,labels,colors,selected,changed=[],previousCenters}=data;
    const extent=Math.max(2,...points.flat().map(Math.abs),...centers.flat().map(Math.abs),...(previousCenters||[]).flat().map(Math.abs));
    const bound=Math.ceil(extent+.3),left=48,right=20,top=34,bottom=54;
    const scale=Math.max(1,Math.min(width-left-right,height-top-bottom)/(2*bound));
    const cx=left+(width-left-right)/2,cy=top+(height-top-bottom)/2;
    const xy=p=>[cx+p[0]*scale,cy-p[1]*scale];geometry={xy,scale};
    // Keep canvas coordinates in CSS pixels on high-DPI screens.
    ctx.clearRect(0,0,width,height);ctx.fillStyle='#f8fbf8';ctx.fillRect(0,0,width,height);
    const tick=scale<27?2:1;
    for(let v=-bound;v<=bound;v++){
      ctx.strokeStyle=v===0?'#9aada3':'#e0e9e2';ctx.lineWidth=v===0?1.3:1;
      ctx.beginPath();ctx.moveTo(...xy([v,-bound]));ctx.lineTo(...xy([v,bound]));ctx.stroke();
      ctx.beginPath();ctx.moveTo(...xy([-bound,v]));ctx.lineTo(...xy([bound,v]));ctx.stroke();
      if(v%tick===0){label(String(v),xy([v,0])[0],cy+bound*scale+16,'#65766d','center',10);label(String(v),cx-bound*scale-11,xy([0,v])[1],'#65766d','right',10);}
    }
    label('氨氮 z（横轴）',cx,height-14);label('叶绿素 a z（纵轴）',width/2,15);
    const progress=from?Math.min(1,(now-start)/650):1,eased=1-(1-progress)**3;
    const visibleCenters=centers.map((c,j)=>from?.[j]?c.map((v,d)=>from[j][d]+(v-from[j][d])*eased):c);
    if(points[selected])visibleCenters.forEach((c,j)=>{
      ctx.beginPath();ctx.moveTo(...xy(points[selected]));ctx.lineTo(...xy(c));ctx.strokeStyle=colors[j];ctx.globalAlpha=.55;ctx.setLineDash([5,4]);ctx.lineWidth=1.3;ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
    });
    if(previousCenters)previousCenters.forEach((c,j)=>{if(c.some((v,d)=>Math.abs(v-centers[j][d])>1e-9))diamond(xy(c),colors[j],true);});
    points.forEach((p,i)=>{
      const [x,y]=xy(p);ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fillStyle=labels[i]<0?'#a1aaa6':colors[labels[i]];ctx.fill();ctx.lineWidth=1;ctx.strokeStyle='#fff';ctx.stroke();
      if(changed.includes(i)||i===selected){ctx.beginPath();ctx.arc(x,y,i===selected?10:8,0,Math.PI*2);ctx.lineWidth=2;ctx.strokeStyle=i===selected?'#223e35':'#c99d21';ctx.stroke();}
    });
    visibleCenters.forEach((c,j)=>{const p=xy(c);diamond(p,colors[j]);label('中心 '+'ABCDEF'[j],p[0]+13,p[1]-12,colors[j],'left',11);});
    if(points[selected]){const p=xy(points[selected]);label('T'+String(selected+1).padStart(2,'0'),p[0]-12,p[1]+16,'#223e35','right',12);}
    if(progress<1)raf=requestAnimationFrame(paint);else from=null;
  }
  function resize(){const box=host.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);width=box.width;height=box.height;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);paint();}
  function pick(e){if(!data||!geometry)return;const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;let index=-1,best=14**2;data.points.forEach((p,i)=>{const q=geometry.xy(p),d=(q[0]-x)**2+(q[1]-y)**2;if(d<best){best=d;index=i;}});if(index>=0)onSelect(index);}
  canvas.addEventListener('click',pick);const observer=new ResizeObserver(resize);observer.observe(host);resize();
  return {update(next){cancelAnimationFrame(raf);from=next.animate&&data?data.centers.map(c=>c.slice()):null;data=next;start=performance.now();paint();},reset(){from=null;cancelAnimationFrame(raf);paint();},dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();canvas.removeEventListener('click',pick);host.replaceChildren();}};
}};
