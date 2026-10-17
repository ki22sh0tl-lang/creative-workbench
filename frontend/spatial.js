import { createUniverse } from '/universe.js';
import { graphData, categories, neighbors } from '/graph-data.js';
import { getModules, summarizeSocial } from '/shared/modules.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = n => Number(n || 0).toLocaleString('zh-CN');
const pct = n => n == null ? '—' : `${(n*100).toFixed(2)}%`;
const safeUrl = value => { try { const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null; } catch {return null;} };

export function mountSpatial(host, actions) {
  host.innerHTML = `<section class="spatial-workspace" aria-label="创意关系图谱">
    <canvas class="universe" aria-hidden="true"></canvas><div class="space-vignette"></div>
    <div class="space-intro"><span class="subtle-label">每个想法，都有来处。</span><h1>让创意发生连接<span>。</span></h1><p class="batch-intention"></p></div>
    <div class="space-breadcrumb"><button type="button" data-space-home>全部节点</button><span class="crumb-category"></span></div>
    <svg class="graph-connections" aria-hidden="true"><defs><filter id="line-glow"><feGaussianBlur stdDeviation="2"/></filter></defs><g class="category-lines"></g><g class="record-lines"></g></svg>
    <div class="category-nodes">${categories.map((c,i)=>`<button type="button" class="category-node node-${i}" data-category="${c.id}" aria-label="打开${c.name}"><span class="node-top"><span class="node-symbol">${['✳','◇','▧','◈','⌘'][i]}</span><b class="node-count">0</b><span class="node-arrow">↗</span></span><strong>${c.name}</strong><small>${c.en}</small></button>`).join('')}</div>
    <div class="core-caption"><span>创意中台</span><small>一个想法，无限可能</small></div>
    <section class="record-region" aria-label="分类记录" hidden><div class="record-heading"><div><span class="category-subtitle"></span><h2 class="category-title"></h2></div><button class="quiet-add" type="button" aria-label="新建记录">＋</button></div><div class="record-filters"></div><div class="record-scroll"></div></section>
    <section class="inspector" aria-label="内容详情" hidden></section>
    <div class="graph-dock"><div class="dock-stats"></div><form class="graph-search" role="search"><span aria-hidden="true">⌕</span><input type="search" aria-label="搜索当前批次内容" placeholder="寻找一个想法，或它与其他内容的连接…" autocomplete="off"><kbd>⌘ K</kbd><button type="submit" aria-label="搜索">↗</button></form><div class="query-shortcuts"><button type="button" data-query="connected">关联最多的内容</button><button type="button" data-query="todo">待推进的任务</button><button type="button" data-query="saved">高收藏作品</button></div></div>
    <section class="query-panel" aria-label="图谱查询结果" hidden></section>
    <div class="space-footer"><span class="live-caption"><i></i>当前批次的真实关联</span><span class="space-help">选择节点，探索创意的来龙去脉</span><button type="button" class="motion-toggle">暂停动效</button></div>
  </section>`;
  const root=host.firstElementChild, $=s=>root.querySelector(s);
  let state, data, selectedCategory=null, selectedRecord=null, filter='', queryMode=null, paused=false, positions=[], disposed=false;
  const nodeElements=[...root.querySelectorAll('.category-node')],caption=$('.core-caption'),region=$('.record-region'),recordScroll=$('.record-scroll');
  const svgNS='http://www.w3.org/2000/svg';
  const categoryPaths=categories.map(c=>{
    const path=document.createElementNS(svgNS,'path');path.setAttribute('class','orb-link active');$('.category-lines').append(path);
    const circle=document.createElementNS(svgNS,'circle');circle.setAttribute('class','travel-dot');circle.setAttribute('r','2');circle.setAttribute('fill',c.color);
    const motion=document.createElementNS(svgNS,'animateMotion');motion.setAttribute('dur','9s');motion.setAttribute('repeatCount','indefinite');circle.append(motion);$('.category-lines').append(circle);
    return {path,motion};
  });
  let recordAnchors=[],recordX=0,recordFromX=0,recordTargetX=0,listKey='',anchorRaf=0,scrollMinY=0,scrollMaxY=0,scrollOffset=0;
  const universe=createUniverse($('.universe'),(p,progress=1)=>{
    positions=p;const ease=1-Math.pow(1-progress,4);recordX=recordFromX+(recordTargetX-recordFromX)*ease;
    region.style.transform=`translate3d(${recordX}px,0,0)`;
    root.classList.toggle('is-transitioning',progress<1);positionNodes();
  });
  function positionNodes(){
    if(!positions.length)return;
    nodeElements.forEach((el,i)=>{
      const p=positions[i+1];el.style.transform=`translate3d(${p.x+(selectedCategory?25:-62)}px,${p.y+(selectedCategory?-20:43)}px,0)`;
    });
    const p=positions[0];caption.style.transform=`translate3d(${p.x-90}px,${p.y+145*p.s}px,0)`;
    drawLines();
  }
  function drawLines(){
    if(!positions.length)return;
    const c=positions[0];
    positions.slice(1).forEach((p,i)=>{
      const active=!selectedCategory||selectedCategory===categories[i].id;
      const x1=c.x+(p.x>c.x?30:-30)*c.s, y1=c.y, x2=p.x,y2=p.y;
      const d=`M${x1.toFixed(1)},${y1.toFixed(1)} C${(x1+(x2-x1)*.55).toFixed(1)},${y1.toFixed(1)} ${(x1+(x2-x1)*.5).toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
      categoryPaths[i].path.setAttribute('d',d);categoryPaths[i].path.classList.toggle('active',active);categoryPaths[i].motion.setAttribute('path',d);
    });
    if(!selectedCategory)return;
    const p=positions[categories.findIndex(c=>c.id===selectedCategory)+1];
    for(const anchor of recordAnchors){
      const x=recordX+anchor.x,y=anchor.y-scrollOffset,sx=p.x+151,sy=p.y+12;
      anchor.path.style.display=y<scrollMinY||y>scrollMaxY?'none':'';
      anchor.path.setAttribute('d',`M${sx.toFixed(1)},${sy.toFixed(1)} C${(sx+60).toFixed(1)},${sy.toFixed(1)} ${(x-90).toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`);
      anchor.path.classList.toggle('selected',anchor.id===selectedRecord);
    }
  }
  function cacheRecordAnchors(){
    cancelAnimationFrame(anchorRaf);
    anchorRaf=requestAnimationFrame(()=>{
      if(disposed)return;
      const box=root.getBoundingClientRect(),regionBox=region.getBoundingClientRect(),scrollBox=recordScroll.getBoundingClientRect();
      scrollOffset=recordScroll.scrollTop;
      scrollMinY=scrollBox.top-box.top;scrollMaxY=scrollBox.bottom-box.top;
      const rows=[...recordScroll.querySelectorAll('.graph-record')].map(el=>({el,box:el.getBoundingClientRect()}));
      const group=$('.record-lines');group.replaceChildren();
      recordAnchors=rows.map(({el,box:r})=>{
        const path=document.createElementNS(svgNS,'path');path.setAttribute('class','record-link');group.append(path);
        return {id:el.dataset.record,path,x:r.left-regionBox.left+4,y:r.top-box.top+r.height/2+scrollOffset};
      });
      drawLines();
    });
  }
  function layout(){
    const w=root.clientWidth,h=root.clientHeight;
    const focus=!!selectedCategory;
    const mobile=w<760;
    recordFromX=recordX;recordTargetX=mobile?20:w*(selectedRecord?.44:.53);
    if(!selectedCategory){recordX=recordTargetX;recordFromX=recordTargetX;}
    const values=focus
      ? [{x:w*.09,y:h*.46,s:.47},...categories.map((c,i)=>({x:w*.225,y:h*(.17+i*.145),s:.64}))]
      : [{x:w*.50,y:h*.425,s:Math.min(1.15,w/1250,h/620)*.82},
        {x:w*.245,y:h*.29,s:.94},{x:w*.49,y:h*.10,s:.84},{x:w*.765,y:h*.32,s:.93},{x:w*.28,y:h*.61,s:.95},{x:w*.72,y:h*.63,s:.86}];
    if(mobile&&!focus){values[0]={x:w*.5,y:165,s:.60};categories.forEach((c,i)=>{values[i+1]={x:25+(i%2)*(w/2)+62,y:290+Math.floor(i/2)*120,s:0};});}
    if(!mobile&&!focus){
      // Move the satellite and its label together; the card must not cover either orb.
      values[2].y-=26;
      const available=values[0].y-(values[2].y+43+nodeElements[1].offsetHeight)-18;
      values[0].s=Math.min(values[0].s,available/135);
      // Leave a clear column for the dock beside the lower-right category card.
      values[5].x=Math.min(values[5].x,w-(w>=1700?40+360:32+336)-nodeElements[4].offsetWidth+62-24);
      for(const i of [1,3,4,5])values[i].x=values[0].x+(values[i].x-values[0].x)*.90;
    }
    universe.layout(values,Math.abs(recordFromX-recordTargetX)>.1);
    cacheRecordAnchors();
    // Accessible HTML and SVG remain usable if WebGL is unavailable.
    if($('.universe').classList.contains('universe-fallback')){positions=values;recordX=recordTargetX;region.style.transform=`translate3d(${recordX}px,0,0)`;positionNodes();}
  }
  function update(next){
    const scopeChanged=state&&(state.projectId!==next.projectId||state.batchId!==next.batchId);
    state={...next};data=graphData(state);
    if(scopeChanged){selectedCategory=null;selectedRecord=null;filter='';queryMode=null;$('.query-panel').hidden=true;}
    if(selectedRecord&&!data.records.some(r=>r.id===selectedRecord))selectedRecord=null;
    const batch=state.records.find(r=>r.id===state.batchId);
    $('.batch-intention').textContent=batch?.data.hypothesis||'收集灵感，验证想法，让每一次创作都有迹可循。';
    data.categories.forEach((c,i)=>root.querySelector(`.node-${i} .node-count`).textContent=c.records.length);
    const works=data.records.filter(r=>r.kind==='packages'&&r.status==='已发布').length;
    $('.dock-stats').innerHTML=[['内容节点',data.records.length],['创意连接',data.edges.length],['已发布作品',works],['待推进',data.records.filter(r=>['待制作','制作中','待初审','需修改','待交付'].includes(r.status)).length]].map(([label,value])=>`<div><span>${label}</span><b>${value}</b></div>`).join('');
    $('.live-caption').innerHTML=`<i></i>${state.projects.find(p=>p.id===state.projectId)?.is_demo?'模拟项目 · 关联来自当前批次':'当前批次的真实关联'}`;
    renderCategory();renderInspector();layout();
  }
  function focusCategory(id){
    if(!categories.some(c=>c.id===id))return;
    selectedCategory=id;selectedRecord=null;filter='';closeQuery();renderCategory();renderInspector();layout();
  }
  function home(){selectedCategory=null;selectedRecord=null;filter='';closeQuery();renderCategory();renderInspector();layout();}
  function renderCategory(){
    root.classList.toggle('is-focused',!!selectedCategory);root.classList.toggle('has-detail',!!selectedRecord);
    $('.record-region').hidden=!selectedCategory;
    const c=data.categories.find(c=>c.id===selectedCategory);
    $('.crumb-category').textContent=c?` / ${c.name}`:'';
    root.querySelectorAll('.category-node').forEach(el=>{el.classList.toggle('selected',el.dataset.category===selectedCategory);el.setAttribute('aria-pressed',el.dataset.category===selectedCategory);});
    if(!c){recordAnchors=[];$('.record-lines').replaceChildren();return;}
    $('.category-subtitle').textContent=c.en;$('.category-title').textContent=c.name;
    $('.quiet-add').dataset.new=c.create;
    const mods=getModules('social');
    $('.record-filters').innerHTML=`<button class="${!filter?'active':''}" type="button" data-filter="">全部 <span>${c.records.length}</span></button>${[...new Set(c.records.map(r=>r.kind))].length>1?[...new Set(c.records.map(r=>r.kind))].map(kind=>`<button type="button" data-filter="${kind}" class="${filter===kind?'active':''}">${kind==='requests'?'制作任务':kind==='assets'?'内容资产':mods[kind].label}</button>`).join(''):''}`;
    const records=c.records.filter(r=>!filter||r.kind===filter);
    const nextListKey=JSON.stringify([c.id,filter,records.map(r=>[r.id,r.title,r.status,r.tags]),data.rows]);
    if(nextListKey===listKey){
      recordScroll.querySelectorAll('.graph-record').forEach(el=>{el.classList.toggle('selected',el.dataset.record===selectedRecord);el.setAttribute('aria-pressed',el.dataset.record===selectedRecord);});
      cacheRecordAnchors();return;
    }
    listKey=nextListKey;
    recordScroll.innerHTML=records.length?records.map(r=>{
      const metric=data.rows.find(m=>m.package_id===r.id);
      const tags=r.tags.map(id=>state.tags.find(t=>t.id===id)?.name).filter(Boolean).slice(0,2).join(' / ');
      return `<button type="button" class="graph-record ${r.id===selectedRecord?'selected':''}" data-record="${esc(r.id)}" aria-pressed="${r.id===selectedRecord}"><i></i><span><strong>${esc(r.title)}</strong><small>${metric?`${num(metric.views)} 阅读 · ${num(metric.saves)} 收藏` : `${esc(r.status)}${tags?' · '+esc(tags):''}`}</small></span><span class="record-arrow">↗</span></button>`;
    }).join(''):`<div class="graph-empty"><span>还没有${esc(c.name)}</span><p>${esc(c.description)}</p><button type="button" data-new="${c.create}">创建第一条记录</button></div>`;
    cacheRecordAnchors();
  }
  function openRecord(id){
    const record=data.records.find(r=>r.id===id);if(!record)return;
    const cat=categories.find(c=>c.kinds.includes(record.kind))||(record.kind==='relations'?categories.find(c=>c.id==='works'):null);if(!cat)return;
    if(selectedCategory!==cat.id){selectedCategory=cat.id;filter='';}
    selectedRecord=id;closeQuery();renderCategory();renderInspector();layout();
    requestAnimationFrame(()=>{$('.graph-record.selected')?.scrollIntoView({block:'nearest'});drawLines();});
  }
  function renderInspector(){
    const panel=$('.inspector');panel.hidden=!selectedRecord;root.classList.toggle('has-detail',!!selectedRecord);
    if(!selectedRecord)return;
    const r=data.records.find(r=>r.id===selectedRecord),mods=getModules('social'),mod=mods[r.kind];
    const row=data.rows.find(m=>m.package_id===r.id),summary=row?summarizeSocial([row]):null;
    const linked=neighbors(r.id,data.records),tags=r.tags.map(id=>state.tags.find(t=>t.id===id)).filter(Boolean);
    const url=safeUrl(r.data.url);
    const fields=mod.fields.filter(f=>!['link','multilink'].includes(f.type)&&r.data[f.key]&&!['url'].includes(f.key));
    panel.innerHTML=`<div class="inspector-top"><span>${esc(mod.label)}</span><button type="button" data-close-detail aria-label="关闭详情">×</button></div><div class="inspector-scroll"><div class="detail-title"><span class="detail-status">${esc(r.status)}</span><h2>${esc(r.title)}</h2><p>${esc(state.records.find(x=>x.id===state.batchId)?.title||'当前批次')}${row?' · 发布后 72 小时':''}</p></div>
      ${row?`<section class="save-rate"><div><span>收藏率</span><b>${pct(summary.saveRate)}</b><small>收藏 / 阅读或播放</small></div><div class="peer-bars" aria-label="当前批次各作品收藏率对比">${data.rows.map(m=>{const rate=m.views?m.saves/m.views:0,max=Math.max(...data.rows.map(v=>v.views?v.saves/v.views:0),.001);return `<span class="${m.package_id===r.id?'current':''}" data-bar="${Math.max(4,rate/max*100)}" title="${esc(m.title)} ${pct(rate)}"></span>`;}).join('')}</div></section><div class="detail-metrics">${[['阅读 / 播放',row.views],['收藏',row.saves],['互动次数',summary.interactions],['新增关注',row.follows]].map(([label,v])=>`<div><span>${label}</span><b>${num(v)}</b></div>`).join('')}</div><div class="metric-note">同批次作品对比 · ${row.source==='simulated'?'模拟数据':'手工采集'}<span>互动率 ${pct(summary.interactionRate)}</span></div>`:''}
      ${fields.length?`<section class="detail-section"><h3>${r.kind==='notes'?'复盘与行动':'内容信息'}</h3>${fields.map(f=>`<div class="detail-field"><span>${esc(f.label)}</span><p>${esc(r.data[f.key])}</p></div>`).join('')}</section>`:''}
      ${tags.length?`<section class="detail-section"><h3>创意标签 <span>${tags.length}</span></h3><div class="detail-tags">${tags.map(t=>`<span title="${esc(t.category)}">${esc(t.name)}</span>`).join('')}</div></section>`:''}
      <section class="detail-section"><h3>连接的内容 <span>${linked.length}</span></h3><div class="related-records">${linked.length?linked.map(n=>`<button type="button" data-record="${n.id}"><small>${esc(mods[n.kind]?.label||n.kind)}</small><span>${esc(n.title)}</span><b>↗</b></button>`).join(''):'<p class="muted">尚未关联其他内容</p>'}</div></section>
      ${url?`<a class="source-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">打开原始链接 ↗</a>`:''}
      </div><div class="inspector-actions"><button type="button" data-edit="${r.id}">编辑记录</button>${row?`<button type="button" class="primary" data-iterate="${r.id}">创建下一轮任务 ↗</button>`:r.kind==='notes'?'<a class="detail-primary" href="#notes">进入批次复盘 ↗</a>':''}</div>`;
    panel.querySelectorAll('[data-bar]').forEach(el=>el.style.setProperty('--bar', el.dataset.bar+'%'));
  }
  function closeQuery(){queryMode=null;$('.query-panel').hidden=true;}
  function query(mode,text=''){
    queryMode=mode;
    let records=[],title='搜索结果',explanation='当前实验批次';
    if(mode==='connected'){
      title='关联最多的内容';explanation='按当前批次的直接业务关联数排序';
      records=[...data.records].sort((a,b)=>neighbors(b.id,data.records).length-neighbors(a.id,data.records).length).slice(0,6);
    } else if(mode==='todo') {title='接下来，推进这些事';explanation='待制作、制作中、待初审、需修改、待交付';records=data.records.filter(r=>['待制作','制作中','待初审','需修改','待交付'].includes(r.status));}
    else if(mode==='saved') {title='值得再看一眼的作品';explanation='按 72 小时收藏率排序 · 同平台、同形式比较更有意义';records=[...data.rows].sort((a,b)=>(b.views?b.saves/b.views:0)-(a.views?a.saves/a.views:0)).map(row=>data.records.find(r=>r.id===row.package_id)).filter(Boolean);}
    else {records=data.records.filter(r=>`${r.title} ${Object.values(r.data).filter(v=>typeof v==='string').join(' ')} ${r.tags.map(id=>state.tags.find(t=>t.id===id)?.name||'').join(' ')}`.toLowerCase().includes(text.toLowerCase()));explanation=`“${text}” · ${records.length} 条匹配记录`;}
    const panel=$('.query-panel');panel.hidden=false;
    panel.innerHTML=`<div class="query-title"><div><span>图谱检索</span><h2>${title}</h2></div><button type="button" data-close-query aria-label="关闭查询">×</button></div><p>${esc(explanation)}</p><div class="query-results">${records.length?records.slice(0,20).map(r=>`<button type="button" data-record="${r.id}"><span>${esc(r.title)}<small>${esc(r.status)}${mode==='connected'?` · ${neighbors(r.id,data.records).length} 条连接`:''}</small></span><b>↗</b></button>`).join(''):'<div class="query-empty">没有符合条件的内容。换个关键词，或新建一条记录。</div>'}</div>`;
  }
  const click=e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-space-home'))home();
    if(b.dataset.category)focusCategory(b.dataset.category);
    if(b.dataset.record)openRecord(b.dataset.record);
    if(b.hasAttribute('data-close-detail')){selectedRecord=null;renderCategory();renderInspector();layout();}
    if(b.hasAttribute('data-filter')){filter=b.dataset.filter;renderCategory();}
    if(b.dataset.query)query(b.dataset.query);
    if(b.hasAttribute('data-close-query'))closeQuery();
    if(b.classList.contains('motion-toggle')){paused=!paused;universe.pause(paused);root.classList.toggle('motion-paused',paused);b.textContent=paused?'继续动效':'暂停动效';}
  };
  root.addEventListener('click',click);
  $('.graph-search').addEventListener('submit',e=>{e.preventDefault();const text=$('.graph-search input').value.trim();if(text)query('text',text);});
  recordScroll.addEventListener('scroll',()=>{scrollOffset=recordScroll.scrollTop;drawLines();},{passive:true});
  const keys=e=>{
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('.graph-search input').focus();}
    if(e.key==='Escape'&&!document.querySelector('dialog[open]')){if(queryMode)closeQuery();else if(selectedRecord){selectedRecord=null;renderCategory();renderInspector();layout();}else if(selectedCategory)home();}
  };
  window.addEventListener('keydown',keys);
  const observer=new ResizeObserver(()=>{if(!disposed&&data)layout();});observer.observe(root);
  return { update, focusCategory, home, dispose(){disposed=true;cancelAnimationFrame(anchorRaf);observer.disconnect();window.removeEventListener('keydown',keys);universe.dispose();} };
}
