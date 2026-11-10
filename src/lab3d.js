import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Positions use one uniform display scale: rotating the camera never changes the metric.
export function mount(host, onSelect) {
  let renderer;
  try { renderer=new THREE.WebGLRenderer({antialias:true,alpha:false}); }
  catch {host.innerHTML='<div class="notice">这台电脑暂未启用三维绘图。请使用支持 WebGL 的 Edge/Chrome 并启用硬件加速；下面的距离表与逐步操作仍可使用。</div>';return {update(){},dispose(){},reset(){}};}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0xf1f6f3);
  renderer.domElement.setAttribute('aria-label','可旋转的三维特征空间，圆球为监测点，菱形为质心');
  renderer.domElement.tabIndex=0;host.appendChild(renderer.domElement);host.dataset.renderer='three';
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(43,1,.1,200);
  camera.position.set(8,5,8);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.12;controls.minDistance=5;controls.maxDistance=30;controls.target.set(0,0,0);
  scene.add(new THREE.AmbientLight(0xffffff,2));const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(3,7,5);scene.add(light);
  const objects=new THREE.Group();scene.add(objects);
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const labelLayer=document.createElement('div');labelLayer.className='scene-labels';host.appendChild(labelLayer);
  let spheres=[],labels3d=[],raf=0,dead=false,movement=null,old=null,lastDown=null;
  function disposeGroup(group){while(group.children.length){const c=group.children[0];group.remove(c);c.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose();}}});}}
  function label(text,position,color='#39584f',scale=1){
    const el=document.createElement('span');el.className=scale<.6?'scene-label tick':'scene-label';el.textContent=text;el.style.color=color;
    labelLayer.appendChild(el);const item={el,position:position.clone(),scale};labels3d.push(item);return item;
  }
  function line(a,b,color,opacity=.4){const g=new THREE.BufferGeometry().setFromPoints([a,b]);const m=new THREE.LineBasicMaterial({color,transparent:true,opacity});const l=new THREE.Line(g,m);objects.add(l);return l;}
  function render(){if(dead)return;controls.update();if(movement){const t=Math.min(1,(performance.now()-movement.start)/650),ease=1-(1-t)**3;movement.items.forEach(({mesh,a,b,sprite})=>{mesh.position.lerpVectors(a,b,ease);sprite.position.copy(mesh.position).add(new THREE.Vector3(0,.4,0));});if(t===1)movement=null;}renderer.render(scene,camera);
    const w=host.clientWidth,h=host.clientHeight;for(const item of labels3d){const v=item.position.clone().project(camera),x=(v.x+1)*w/2,y=(1-v.y)*h/2;item.el.hidden=v.z>1||v.z< -1||x<0||x>w||y<0||y>h;item.el.style.left=Math.max(30,Math.min(w-45,x))+'px';item.el.style.top=Math.max(12,Math.min(h-14,y))+'px';}
    raf=requestAnimationFrame(render);}
  function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();}
  const observer=new ResizeObserver(resize);observer.observe(host);resize();render();
  const down=e=>{lastDown={x:e.clientX,y:e.clientY};};
  const up=e=>{if(!lastDown||Math.hypot(e.clientX-lastDown.x,e.clientY-lastDown.y)>6)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(spheres)[0];if(hit)onSelect(hit.object.userData.index);};
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointerup',up);
  const key=e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(e.key)){e.preventDefault();const offset=camera.position.clone().sub(controls.target),s=new THREE.Spherical().setFromVector3(offset);if(e.key==='ArrowLeft')s.theta-=.12;if(e.key==='ArrowRight')s.theta+=.12;if(e.key==='ArrowUp')s.phi=Math.max(.1,s.phi-.12);if(e.key==='ArrowDown')s.phi=Math.min(Math.PI-.1,s.phi+.12);if(e.key==='+')s.radius=Math.max(5,s.radius*.9);if(e.key==='-')s.radius=Math.min(30,s.radius*1.1);camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));controls.update();}};
  renderer.domElement.addEventListener('keydown',key);
  return {
    update({points,centers,labels,axes,names,colors,selected,changed=[],animate=false}){
      const signature=axes.join(','),span=Math.max(1,...points.flatMap(p=>axes.map(d=>Math.abs(p[d]||0)))),factor=3/span;
      const pos=p=>new THREE.Vector3(...axes.map(d=>(p[d]||0)*factor));
      const previous=old?.signature===signature?old.centers:null;
      disposeGroup(objects);spheres=[];movement=null;labels3d=[];labelLayer.replaceChildren();
      const origin=new THREE.Vector3(-3.6,-3.6,-3.6),axisColors=[0x177e89,0xd78149,0x8b69ad];
      [new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)].forEach((dir,j)=>{
        const arrow=new THREE.ArrowHelper(dir,origin,7.2,axisColors[j],.18,.1);objects.add(arrow);
        const end=origin.clone().addScaledVector(dir,7.1);label(names[axes[j]],end,'#38594e',.84);
        for(const value of [-2,0,2]){const at=origin.clone();at.setComponent(j,value*factor);label(String(value),at,'#7c9288',.45);}
      });
      const grid=new THREE.GridHelper(7.2,12,0xc3d6cd,0xdde8e0);grid.position.y=-3.6;objects.add(grid);
      points.forEach((p,i)=>{
        const color=labels[i]>=0?colors[labels[i]]:'#9caea6';
        const mesh=new THREE.Mesh(new THREE.SphereGeometry(i===selected? .12:.085,16,12),new THREE.MeshStandardMaterial({color,roughness:.45}));
        mesh.position.copy(pos(p));mesh.userData.index=i;objects.add(mesh);spheres.push(mesh);
        if(i===selected||changed.includes(i)){
          const ring=new THREE.Mesh(new THREE.SphereGeometry(.15,12,8),new THREE.MeshBasicMaterial({color:i===selected?0x233c36:0xe5ab57,wireframe:true}));ring.position.copy(mesh.position);objects.add(ring);
          if(i===selected)label('T'+String(i+1).padStart(2,'0'),mesh.position.clone().add(new THREE.Vector3(0,.32,0)),'#36584d',.72);
        }
      });
      const items=[];
      centers.forEach((c,j)=>{
        const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(.2),new THREE.MeshStandardMaterial({color:colors[j],roughness:.25,metalness:.1}));
        const to=pos(c),from=previous?.[j]?pos(previous[j]):to;mesh.position.copy(animate?from:to);objects.add(mesh);
        const sprite=label('中心 '+'ABCDEF'[j],mesh.position.clone().add(new THREE.Vector3(0,.4,0)),colors[j],.75);
        if(animate&&from.distanceTo(to)>.001){line(from,to,colors[j],.9);const ghost=new THREE.Mesh(new THREE.OctahedronGeometry(.19),new THREE.MeshBasicMaterial({color:colors[j],wireframe:true}));ghost.position.copy(from);objects.add(ghost);items.push({mesh,a:from,b:to,sprite});}
        if(points[selected])line(pos(points[selected]),to,colors[j],.6);
      });
      if(items.length)movement={start:performance.now(),items};
      old={signature,centers:centers.map(p=>p.slice())};
    },
    reset(){camera.position.set(8,5,8);controls.target.set(0,0,0);controls.update();},
    dispose(){dead=true;cancelAnimationFrame(raf);observer.disconnect();controls.dispose();renderer.domElement.removeEventListener('pointerdown',down);renderer.domElement.removeEventListener('pointerup',up);renderer.domElement.removeEventListener('keydown',key);disposeGroup(objects);renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();labelLayer.remove();}
  };
}
