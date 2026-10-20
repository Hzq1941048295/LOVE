(() => {
  'use strict';
  const {docs, cases, project} = window.SHIWEN;
  const main = document.getElementById('main');
  const e = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const getCase = id => cases.find(x=>x.id===id);
  const getDoc = id => docs.find(x=>x.id===id.split('.')[0]);
  const titleMap = {workspace:'问资料',library:'项目资料库',cases:'20题评测集',saved:'个人演示记录',product:'产品方案与接入'};
  let selected = 'Q04';
  let searchResult = null;
  let draft = null;
  let caseFilter = '全部';
  let expandedCase = null;
  let toastTimer;
  let storageOk = true;
  function readLocal(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { storageOk=false; return fallback; }
  }
  let saved = readLocal('shiwen_saved_v1', []);
  let evaluations = readLocal('shiwen_evals_v1', {});
  if(!Array.isArray(saved)) saved=[];
  if(!evaluations || Array.isArray(evaluations) || typeof evaluations!=='object') evaluations={};
  function writeLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { storageOk=false; toast('浏览器不允许持久保存，请导出记录；当前内容仅保留在本页。'); return false; }
  }
  function toast(message) {
    const node = document.getElementById('toast'); node.textContent=message; node.classList.add('show');
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>node.classList.remove('show'),3500);
  }
  function badge(status) {
    const cls = /草稿|待|报价|未/.test(status)?'warn':/替代/.test(status)?'grey':'';
    return `<span class="badge ${cls}">${e(status)}</span>`;
  }
  function refsHtml(refs, short=false) {
    return refs.map(ref=>{
      const d=getDoc(ref); if(!d) return '';
      return short?`<button data-ref="${e(ref)}" title="打开${e(d.title)}">${e(ref)}</button>`:
        `<button class="evidence-chip" data-ref="${e(ref)}"><span>${e(ref)}</span>${e(d.title)} ↗</button>`;
    }).join('');
  }
  function questionButton(c,active=false) {
    return `<button class="question-btn ${active?'active':''}" data-case="${c.id}"><span class="qid">${c.id} / ${e(c.type)}</span><p>${e(c.q)}</p></button>`;
  }
  function answerHtml(c) {
    return `<article class="answer-card" aria-label="预设案例答案">
      <div class="answer-head"><div class="meta"><span>${c.id}</span><span>／</span>${badge(c.type)}<span>预设标准答案 · 非模型生成</span></div><h2>${e(c.q)}</h2></div>
      <div class="answer-body"><div class="verdict"><span class="verdict-icon" aria-hidden="true">✓</span><strong>${e(c.verdict)}</strong></div>
      <ul class="answer-list">${c.answer.map(a=>`<li>${e(a)}</li>`).join('')}</ul>
      <div class="next-step"><b>下一步</b>${e(c.next)}</div>
      <div class="action-row">${c.action?`<button class="btn primary" data-draft="${c.action}">生成${c.action==='change'?'变更核查':'经验'}草稿</button>`:''}<button class="btn" data-action="export-answer" data-id="${c.id}">导出这份答案</button><button class="btn ghost" data-eval="${c.id}">查看验收标准 ↗</button></div></div>
      <div class="evidence"><div class="subhead"><h2>依据原文</h2><span class="muted" style="font-size:10px">点击查看具体段落</span></div><div class="evidence-list">${refsHtml(c.refs)}</div></div>
      <details class="demo-path"><summary>查看预设处理路径（未执行真实 AI 工具调用）</summary><ol><li>识别：${e(c.type)}</li><li>读取：${[...new Set(c.refs.map(r=>r.split('.')[0]))].join('、')}</li><li>核对状态与适用范围</li><li>${c.action?'生成待确认草稿':'返回有依据的结论或信息缺口'}</li></ol></details>
    </article>`;
  }
  function workspace() {
    const featured=['Q04','Q02','Q16','Q10','Q07','Q20'].map(getCase);
    main.innerHTML=`<div class="hero"><div><span class="eyebrow">A LITTLE CLARITY, EVERY DAY</span><h1>让每一次确认，<br>都有出处。</h1><p>材料怎么选、版本用哪份、变更先找谁。<br>把散落的项目信息，变成下一步的依据。</p></div><div class="hero-stamp"><strong>12 / 20</strong><span>份虚构资料 / 道测试问题</span></div></div>
      <form class="search" id="search-form"><span aria-hidden="true">⌕</span><label class="sr-only" for="query">问题或关键词</label><input id="query" name="query" autocomplete="off" placeholder="试试：R03 能直接执行吗？" maxlength="500"><button class="btn primary" type="submit">查找案例 ↗</button></form>
      <p class="search-hint">演示模式：选择预设问题查看答案；输入其他内容可按关键词查找案例与资料。未连接大模型。</p>
      ${searchResult?searchResultsHtml():''}
      <div class="work-grid"><section class="questions" aria-label="推荐案例"><div class="subhead"><h2>从一个真实场景开始</h2><a href="#cases">全部20题 ↗</a></div>${featured.map(c=>questionButton(c,c.id===selected)).join('')}<div class="helper-note">版本核对原则<br><b>先看发布与批准状态，再看日期。</b><br>每个结论都应回到项目的原始依据。</div></section><section id="answer-region" aria-live="polite">${answerHtml(getCase(selected))}</section></div>`;
    document.getElementById('search-form').addEventListener('submit',ev=>{ev.preventDefault(); search(document.getElementById('query').value);});
  }
  function rank(query, objects, textOf, tagsOf) {
    const q=query.trim().toLowerCase(); if(!q)return [];
    const tokens=q.match(/[a-z0-9]+(?:-[a-z0-9]+)?|[\u4e00-\u9fff]{2,}/g)||[];
    const grams=new Set();
    for(const t of tokens){if(/^[\u4e00-\u9fff]+$/.test(t)){for(let i=0;i<t.length-1;i++)grams.add(t.slice(i,i+2));}else grams.add(t);}
    return objects.map(obj=>{
      const text=textOf(obj).toLowerCase();
      let score=text.includes(q)?20:0;
      for(const tag of tagsOf(obj)){if(q.includes(tag.toLowerCase()))score+=8;}
      for(const g of grams){if(text.includes(g))score+=1;}
      return {obj,score};
    }).filter(x=>x.score>=3).sort((a,b)=>b.score-a.score);
  }
  function search(query) {
    const q=query.trim(); if(!q){toast('请输入问题或关键词。');return;}
    const exact=cases.find(c=>c.q.replace(/[？?\s]/g,'')===q.replace(/[？?\s]/g,''));
    if(exact){selected=exact.id;searchResult=null;workspace();document.getElementById('query').value=q;return;}
    searchResult={query:q,
      cases:rank(q,cases,c=>c.q,c=>c.tags).slice(0,4).map(x=>x.obj),
      docs:rank(q,docs,d=>d.title+' '+d.sections.map(s=>s.text).join(' '),d=>d.tags).slice(0,4).map(x=>x.obj),
      saved:rank(q,saved,d=>d.title+' '+d.content,d=>[]).slice(0,3).map(x=>x.obj)};
    workspace();document.getElementById('query').value=q;
    document.getElementById('search-results')?.scrollIntoView({block:'nearest'});
  }
  function searchResultsHtml() {
    const r=searchResult;
    return `<section class="result-search" id="search-results" aria-live="polite"><h2>“${e(r.query)}”的关键词匹配</h2><p>这是本地关键词检索，结果可能相关。请选择一个案例查看预设答案，或直接打开资料；不会为任意问题编造回答。</p>
    ${r.cases.length?`<div class="results-stack">${r.cases.map(c=>questionButton(c)).join('')}</div>`:''}
    ${r.docs.length?`<div class="evidence-list" style="margin-top:16px">${r.docs.map(d=>`<button class="evidence-chip" data-ref="${d.id}"><span>${d.id}</span>${e(d.title)}</button>`).join('')}</div>`:''}
    ${r.saved.length?`<div style="margin-top:16px"><h3>本机个人演示记录</h3>${r.saved.map(s=>`<article class="saved-card"><strong>${e(s.title)}</strong><p>${e(s.content)}</p><small>个人演示记录，非企业批准文件</small></article>`).join('')}</div>`:''}
    ${!r.cases.length&&!r.docs.length&&!r.saved.length?'<p>没有匹配结果。可以换成“地砖”“R03”“窗帘”等关键词，或到20题页面选择示例。</p>':''}</section>`;
  }
  function library() {
    main.innerHTML=`<div class="hero"><div><span class="eyebrow">PROJECT LIBRARY / 资料有来处</span><h1>12份资料，一个项目。</h1><p>这些资料是为产品练习编写的完整虚构文本。旧版与草稿特意保留，用来测试版本判断。</p></div></div><div class="toolbar"><label class="sr-only" for="doc-filter">搜索资料</label><input id="doc-filter" placeholder="搜索资料名称或关键词"><button class="btn" data-action="download-corpus">导出资料 JSON</button></div><div class="doc-grid" id="doc-grid"></div>`;
    function show(q=''){
      const found=q?docs.filter(d=>(d.title+' '+d.version+' '+d.tags.join(' ')).toLowerCase().includes(q.toLowerCase())):docs;
      document.getElementById('doc-grid').innerHTML=found.map(d=>`<button class="doc-card" data-ref="${d.id}"><div class="doc-top"><span class="doc-id">${d.id}</span>${badge(d.status)}</div><h3>${e(d.title)}</h3><p>${e(d.version)} · ${e(d.owner)}</p><div class="doc-bottom"><span>${e(d.date)}</span><span>${d.sections.length} 个原文段落 ↗</span></div></button>`).join('')||'<p>没有匹配资料。</p>';
    }
    show();document.getElementById('doc-filter').addEventListener('input',ev=>show(ev.target.value));
  }
  function openDoc(ref) {
    const d=getDoc(ref); if(!d)return;
    document.getElementById('doc-content').innerHTML=`<div class="dialog-head"><div><span class="eyebrow">${d.id} / 虚构教学资料</span><h2 id="doc-title">${e(d.title)}</h2><p>${e(d.version)} · ${e(d.date)} · ${e(d.owner)}　${badge(d.status)}</p></div><button class="btn small" data-close="doc-dialog" aria-label="关闭资料">关闭 ×</button></div><div class="dialog-body">${d.sections.map(s=>`<section class="doc-section ${ref===s.id?'selected':''}" id="section-${s.id.replace('.','-')}"><h3><span>${s.id}</span>${e(s.title)}</h3><p>${e(s.text)}</p></section>`).join('')}<button class="btn" data-download-doc="${d.id}">下载此资料 TXT</button></div>`;
    document.getElementById('doc-dialog').showModal();
    if(ref.includes('.'))document.getElementById('section-'+ref.replace('.','-'))?.scrollIntoView({block:'nearest'});
  }
  function casePage() {
    const filtered=cases.filter(c=>caseFilter==='全部'||c.split===caseFilter);
    const records=Object.values(evaluations).filter(v=>v.status==='通过'||v.status==='失败');
    const pass=records.filter(v=>v.status==='通过').length;
    main.innerHTML=`<div class="hero"><div><span class="eyebrow">EVALUATION SET / 先定义什么是答对</span><h1>20个问题，20次核对。</h1><p>每题都有标准答案、证据段落和不可犯的错误。点击问题展开。</p></div></div>
    <div class="notice">请在接入真实模型后记录结果。预设答案不是模型实测；本页不自动评分。6道题建议预留，正式测试还需新增未用于调试的问题。</div>
    <div class="toolbar"><label for="case-filter">题目范围</label><select id="case-filter">${['全部','调试','预留评测'].map(s=>`<option ${s===caseFilter?'selected':''}>${s}</option>`).join('')}</select><button class="btn" data-action="download-cases">下载题目与标准答案</button><button class="btn" data-action="download-evaluations">导出人工评测记录</button><button class="btn ghost" data-action="clear-evaluations">清空本机评测</button></div>
    <div class="statline">人工记录：<b>${records.length}/20</b> 题已测 · <b>${pass}</b> 通过 · <b>${records.length-pass}</b> 失败。${!records.length?'暂无模型实测结果。':'仅代表你在本机填写的结果，需保留真实输出与评测条件。'}</div>
    <div class="table-wrap"><table><thead><tr><th>编号 / 类型</th><th>测试问题</th><th>证据段落</th><th>记录</th></tr></thead><tbody>${filtered.map(c=>{
      const record=evaluations[c.id]||{};
      return `<tr><td style="min-width:115px"><b>${c.id}</b><br><span class="muted">${e(c.type)}</span><br><small>${e(c.split)}</small></td><td><button class="link" data-expand="${c.id}">${e(c.q)}</button></td><td class="ref-cell">${refsHtml(c.refs,true)}</td><td style="min-width:100px"><label class="sr-only" for="eval-${c.id}">${c.id}人工评测状态</label><select data-eval-select="${c.id}" id="eval-${c.id}">${['未测','通过','失败'].map(s=>`<option ${s===(record.status||'未测')?'selected':''}>${s}</option>`).join('')}</select></td></tr>
      ${expandedCase===c.id?`<tr class="case-detail"><td colspan="4"><strong>标准答案：${e(c.verdict)}</strong><ul>${c.answer.map(a=>`<li>${e(a)}</li>`).join('')}</ul><p><b>必须做到：</b>${c.must.map(e).join('；')}</p><p><b>不能出现：</b>${c.mustNot.map(e).join('；')}</p><label class="field" style="margin-top:14px"><span>真实模型输出与人工备注（保存后才允许标记通过/失败）</span><textarea id="notes-${c.id}" placeholder="粘贴真实输出，注明模型、运行日期、是否正确、耗时及原因。不要粘贴密钥或真实敏感资料。">${e(record.notes||'')}</textarea></label><div class="action-row"><button class="btn primary" data-save-notes="${c.id}">保存评测备注</button><button class="btn" data-case="${c.id}">打开演示答案</button></div></td></tr>`:''}`;
    }).join('')}</tbody></table></div>`;
    document.getElementById('case-filter').addEventListener('change',ev=>{caseFilter=ev.target.value;casePage();});
    main.querySelectorAll('[data-eval-select]').forEach(el=>el.addEventListener('change',()=>{
      const id=el.dataset.evalSelect; const prev=evaluations[id]||{};
      if(el.value!=='未测'&&!(prev.notes||'').trim()){toast('请先展开此题，保存真实模型输出与备注。');el.value=prev.status||'未测';expandedCase=id;casePage();return;}
      evaluations[id]={...prev,status:el.value,updatedAt:new Date().toISOString()};writeLocal('shiwen_evals_v1',evaluations);casePage();
    }));
  }
  function newDraft(kind) {
    draft=kind==='change'?{
      kind,title:'客餐厅改木地板 · 变更核查草稿',refs:getCase('Q16').refs,
      content:'状态：新增假设需求，未确认、未批准。\n项目：CY-128 / 澄园128㎡样板间\n提出人及日期：待填写\n需求原文：甲方提出客餐厅改木地板（演示假设，非现有纪要决定）。\n\n待核查：\n1. 林设计师核对材料表与产品、小样。\n2. 核查ID-02地面铺装图、排版及ID-05收口节点。\n3. 专业人员核查厚度、标高、基层、接口与设备适配。\n4. 赵采购补充报价、到场周期及采购审批信息。\n5. 周工确认选型后，由负责人发布文件，陈助理更新台账。\n\n负责人、截止时间与可执行性：待人工确认。\n本清单是核查建议，不是改图、施工或下单指令。'
    }:{
      kind:'lesson',title:'询价前先核对发布台账',refs:getCase('Q20').refs,
      content:'适用：CY-128项目材料询价准备。\n问题：个人文件夹中的MAT-R01被误用于询价，写成800×800mm亮面砖。\n已核实原因：询价前未查询发布台账；不是供应商报错。\n处理：撤回旧询价，按MAT-R02重发，并让赵采购核对M02编码。\n预防：询价前核对台账，附件写项目编号与版本，收回确认。\n验证：新询价引用M02与MAT-R02。\n结果：尚未下单，没有实际采购损失。\n边界：个人演示经验，不代表企业正式批准。'
    };
    document.getElementById('draft-content').innerHTML=`<div class="dialog-head"><div><span class="eyebrow">DRAFT / 先核对，再保存</span><h2 id="draft-title">${kind==='change'?'变更核查':'经验条目'}草稿</h2></div><button class="btn small" data-close="draft-dialog">关闭 ×</button></div><form class="dialog-body" id="draft-form"><label class="field"><span>标题</span><input name="title" value="${e(draft.title)}" required maxlength="120"></label><label class="field"><span>内容（可编辑）</span><textarea name="content" required maxlength="12000">${e(draft.content)}</textarea></label><div class="evidence-list">${refsHtml(draft.refs)}</div><div class="notice">仅保存到当前浏览器的个人演示记录，不通知任何人，不更新正式资料。清除浏览器数据会丢失记录；可在保存后导出备份。</div><button class="btn primary" type="submit">我已核对，保存到本机</button></form>`;
    document.getElementById('draft-form').addEventListener('submit',ev=>{
      ev.preventDefault();const form=ev.target;const title=form.elements.title.value.trim();const content=form.elements.content.value.trim();
      if(!title||!content){toast('请填写标题和内容。');return;}
      saved.unshift({id:'L-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),kind:draft.kind,title,content,refs:draft.refs,createdAt:new Date().toISOString(),status:'个人已核对，非企业审批'});
      const persistent=writeLocal('shiwen_saved_v1',saved);
      document.getElementById('draft-dialog').close();draft=null;
      if(persistent)toast('已保存到本机，可在“个人演示记录”查看或导出。');
      if(location.hash==='#saved')savedPage();else location.hash='saved';
    });
    document.getElementById('draft-dialog').showModal();
  }
  function savedPage() {
    main.innerHTML=`<div class="hero"><div><span class="eyebrow">PERSONAL NOTES / 从问题到经验</span><h1>把核对过的经验留下。</h1><p>这些是当前浏览器中的个人演示记录，独立于原始项目资料。</p></div></div><div class="toolbar"><button class="btn primary" data-draft="lesson">生成一条经验草稿</button><button class="btn" data-draft="change">生成变更核查草稿</button><button class="btn" data-action="export-saved">导出全部个人记录</button></div>${!storageOk?'<div class="notice">当前浏览器不允许持久保存，请导出备份。</div>':''}${saved.length?saved.map(s=>`<article class="saved-card"><div class="subhead"><h2>${e(s.title)}</h2>${badge('个人演示记录')}</div><small class="muted">${e(new Date(s.createdAt).toLocaleString('zh-CN'))} · 实际保存时间</small><p>${e(s.content)}</p><div class="evidence-list" style="margin-top:18px">${refsHtml(s.refs||[])}</div><div class="action-row"><button class="btn small" data-export-saved="${e(s.id)}">导出 TXT</button><button class="btn small danger" data-delete-saved="${e(s.id)}">删除本条</button></div></article>`).join(''):'<div class="empty"><h2>还没有保存记录</h2><p>从“旧图误用复盘”生成第一条经验，核对后保存。</p><button class="btn primary" data-draft="lesson">开始整理经验</button></div>'}`;
  }
  function download(filename,content,type='text/plain;charset=utf-8') {
    const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  const jsonDownload=(filename,content)=>download(filename,JSON.stringify(content,null,2),'application/json;charset=utf-8');
  function docText(d) {return `${d.id} ${d.title}\n虚构教学资料，不作真实项目依据。\n项目：CY-128\n版本：${d.version}\n状态：${d.status}\n日期：${d.date}\n负责人：${d.owner}\n\n`+d.sections.map(s=>`[${s.id}] ${s.title}\n${s.text}`).join('\n\n');}
  function answerText(c) {return `${c.id} ${c.q}\n预设标准答案，非模型生成。\n\n${c.verdict}\n${c.answer.join('\n')}\n\n下一步：${c.next}\n\n证据：\n`+c.refs.map(r=>{const d=getDoc(r);const sec=d.sections.find(s=>s.id===r);return `[${r}] ${d.title} / ${d.version}\n${sec.text}`;}).join('\n\n');}
  function route() {
    const key=location.hash.replace('#','')||'workspace';const page=titleMap[key]?key:'workspace';
    document.querySelectorAll('[data-nav]').forEach(a=>{a.classList.toggle('active',a.dataset.nav===page);if(a.dataset.nav===page)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    document.getElementById('page-title').textContent=titleMap[page];
    if(page==='workspace')workspace();else if(page==='library')library();else if(page==='cases')casePage();else if(page==='saved')savedPage();else{main.innerHTML=window.SHIWEN_PRODUCT_HTML;document.getElementById('prompt-text').textContent=window.SHIWEN_PROMPT;}
  }
  document.addEventListener('click',ev=>{
    const t=ev.target.closest('button');if(!t)return;
    if(t.dataset.case){selected=t.dataset.case;searchResult=null;if(location.hash==='#workspace'||!location.hash){workspace();document.getElementById('answer-region')?.scrollIntoView({block:'nearest'});}else location.hash='workspace';}
    if(t.dataset.ref)openDoc(t.dataset.ref);
    if(t.dataset.close)document.getElementById(t.dataset.close).close();
    if(t.dataset.draft)newDraft(t.dataset.draft);
    if(t.dataset.expand){expandedCase=expandedCase===t.dataset.expand?null:t.dataset.expand;casePage();}
    if(t.dataset.eval){expandedCase=t.dataset.eval;caseFilter='全部';location.hash='cases';}
    if(t.dataset.saveNotes){const id=t.dataset.saveNotes;const notes=document.getElementById('notes-'+id).value.trim();evaluations[id]={...evaluations[id],notes,status:'未测',updatedAt:new Date().toISOString()};if(writeLocal('shiwen_evals_v1',evaluations))toast('备注已保存；修改备注后，请重新核对通过/失败状态。');casePage();}
    if(t.dataset.downloadDoc){const d=getDoc(t.dataset.downloadDoc);download(d.id+'-'+d.title+'.txt',docText(d));}
    if(t.dataset.exportSaved){const s=saved.find(x=>x.id===t.dataset.exportSaved);if(s)download(s.title+'.txt',`${s.title}\n${s.status}\n\n${s.content}\n\n来源：${s.refs.join('、')}`);}
    if(t.dataset.deleteSaved){saved=saved.filter(x=>x.id!==t.dataset.deleteSaved);writeLocal('shiwen_saved_v1',saved);savedPage();toast('本条个人演示记录已删除。');}
    switch(t.dataset.action){
      case 'export-answer':{const c=getCase(t.dataset.id);download(c.id+'-演示答案.txt',answerText(c));break;}
      case 'download-prompt':download('拾问-起步提示词.txt',window.SHIWEN_PROMPT);break;
      case 'download-corpus':jsonDownload('拾问-12份虚构资料.json',{project,docs});break;
      case 'download-cases':jsonDownload('拾问-20题测试集.json',{project,notice:'预设标准答案不是模型实测；正式评测需增加未用于调试的问题。',cases});break;
      case 'download-evaluations':jsonDownload('拾问-人工评测记录.json',{exportedAt:new Date().toISOString(),notice:'用户手工填写，不代表独立核验结果。',evaluations});break;
      case 'export-saved':jsonDownload('拾问-个人演示记录.json',{exportedAt:new Date().toISOString(),notice:'个人记录，非企业正式批准。',saved});break;
      case 'clear-evaluations':if(confirm('清空本浏览器中的人工评测记录？建议先导出备份。')){evaluations={};writeLocal('shiwen_evals_v1',evaluations);casePage();}break;
    }
  });
  window.addEventListener('hashchange',()=>{route();window.scrollTo({top:0});});
  // 提供确定性逻辑用于本地校验，不代表真实 AI 能力。
  window.SHIWEN_UTILS={rank,docText,answerText};
  route();
})();
