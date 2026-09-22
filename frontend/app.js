import { getModules, socialMetricFields, summarizeSocial, tagCatalog, tagCategories } from '/shared/modules.js';
let modules = getModules('ads');
const activeProject = () => state.projects.find(p => p.id === state.projectId);
const batches = () => state.records.filter(r => r.kind === 'batches');
const activeBatch = () => batches().find(b => b.id === state.batchId);
const social = () => activeProject()?.type === 'social';
let analyticsPlatform = '', analyticsFormat = '';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => value == null ? '—' : Number(value).toFixed(2);
const percent = value => value == null ? '—' : `${(value * 100).toFixed(2)}%`;
const state = { projects: [], projectId: localStorage.getItem('projectId') || '', batchId: localStorage.getItem('batchId') || '', records: [], tags: [], analytics: { rows: [], totals: {}, tags: [] }, query: '', filter: '', loading: false };
const specials = { dashboard: '工作台', analytics: '数据分析', projects: '项目管理', tags: '标签字典' };
let generation = 0;
const page = () => Object.hasOwn(modules, location.hash.slice(1)) || Object.hasOwn(specials, location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard';
async function api(path, options) {
  const response = await fetch(`/api${path}`, options ? { method: options.method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.data) } : {});
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || '请求失败');
  return value;
}
function notify(message, error = false) { $('#notice').textContent = message; $('#notice').className = error ? 'notice error' : 'notice'; }
async function refresh() {
  const ticket = ++generation;
  state.loading = true;
  try {
    const projects = await api('/projects');
    if (ticket !== generation) return;
    state.projects = projects.filter(p => p.type === 'social');
    if (!state.projects.some(p => p.id === state.projectId)) state.projectId = state.projects[0]?.id || '';
    $('#project').innerHTML = projects.length ? projects.map(p => `<option value="${escape(p.id)}">${escape(p.name)}</option>`).join('') : '<option value="">请先创建项目</option>';
    $('#project').value = state.projectId;
    localStorage.setItem('projectId', state.projectId);
    const data = state.projectId ? await api(`/workspace?projectId=${encodeURIComponent(state.projectId)}`) : { records: [], tags: [], analytics: { rows: [], totals: {}, tags: [] } };
    if (ticket !== generation) return;
    Object.assign(state, data, { loading: false });
    const availableBatches = batches();
    if (!availableBatches.some(b => b.id === state.batchId)) state.batchId = availableBatches[0]?.id || '';
    $('#batch').innerHTML = availableBatches.length ? availableBatches.map(b => `<option value="${escape(b.id)}">${escape(b.title)}</option>`).join('') : '<option value="">暂无批次</option>';
    $('#batch').value = state.batchId;
    localStorage.setItem('batchId', state.batchId);
    render();
  } catch (error) { if (ticket === generation) { state.loading = false; notify(`连接失败：${error.message}。请刷新页面重试。`, true); } }
}
function nav() {
  modules = getModules(activeProject()?.type);
  let html = '<p class="nav-group">项目总览</p><a href="#dashboard">◫ <span>工作台</span></a>', group = '';
  const entries = Object.entries(modules).filter(([key]) => key !== 'notes');
  const icon = { batches: '◉', competitors: '▧', concepts: '◇', requests: '☷', assets: '▣', configs: '⚙', relations: '⛓', packages: '▤' };
  for (const [key, module] of entries) {
    if (group !== module.group) { group = module.group; html += `<p class="nav-group">${group}</p>`; }
    html += `<a href="#${key}" ${page() === key ? 'aria-current="page"' : ''}><span class="nav-icon">${icon[key] || '·'}</span><span>${module.label}</span></a>`;
  }
  html += '<p class="nav-group">数据闭环</p><a href="#analytics">▥ <span>数据分析</span></a>';
  if (modules.notes) html += `<a href="#notes" ${page() === 'notes' ? 'aria-current="page"' : ''}><span class="nav-icon">≡</span><span>${modules.notes.label}</span></a>`;
  html += '<p class="nav-group">基础配置</p><a href="#projects">▦ <span>项目管理</span></a><a href="#tags">⌑ <span>标签字典</span></a>';
  $('#nav').innerHTML = html;
  $(`#nav a[href="#${page()}"]`)?.setAttribute('aria-current', 'page');
}
function heading(title, description, action = '') { return `<div class="page-heading"><div><h1>${title}</h1><p>${description}</p></div>${action}</div>`; }
function button(label, mode) { return `<button class="primary" data-new="${mode}">＋ ${label}</button>`; }
function empty(message = '还没有记录，创建第一条开始工作。') { return `<div class="empty"><span>◇</span><h3>${message}</h3><p>所有保存的记录都会留在当前项目中。</p></div>`; }
function badges(ids = []) { return ids.map(id => { const tag = state.tags.find(t => t.id === id); return tag ? `<span class="tag">${escape(tag.name)}</span>` : ''; }).join(''); }
function tagGroupsMarkup(selected = [], inputName = 'tags') {
  const groups = [...new Set(state.tags.map(t => t.category))];
  return groups.map(category => `<section class="picker-group"><h4>${escape(category)}</h4><div class="picker-options">${state.tags.filter(t => t.category === category).map(t => `<label class="picker-option"><input type="checkbox" name="${inputName}" value="${escape(t.id)}" ${selected.includes(t.id) ? 'checked' : ''}><span>${escape(t.name)}</span></label>`).join('')}</div></section>`).join('');
}
function inspirationPicker(value = []) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const records = state.records.filter(r => r.kind === 'competitors' && (!state.batchId || r.data.batchId === state.batchId));
  return `<div class="inspiration-picker"><div class="picker-hint">把本次选题借鉴的所有案例都选上，可多选。</div><div class="inspiration-list">${records.map(r => `<label class="inspiration-option"><span><strong>${escape(r.title)}</strong><small>${escape(r.data.platform || '未标平台')} · ${escape(r.data.contentFormat || '未标形式')} · ${r.status}</small></span><input type="checkbox" name="referenceIds" value="${escape(r.id)}" ${selected.includes(r.id) ? 'checked' : ''}></label>`).join('') || '<p class="muted">先在灵感素材库创建案例。</p>'}</div></div>`;
}
const recordName = id => state.records.find(r => r.id === id)?.title || id || '未关联';
function table(headers, rows) { return `<div class="table-wrap"><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`; }
function stat(label, value, detail) { return `<div class="stat"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`; }
function dashboard() {
  const records = state.records, counts = key => records.filter(r => r.kind === key).length;
  const todo = records.filter(r => ['待制作', '制作中', '待初审', '需修改', '待交付'].includes(r.status));
  if (social()) return heading('把灵感变成下一轮好内容', '收集灵感、协作制作、记录发布，让每次复盘都能产生下一步行动。', button('新建选题', 'concepts')) +
    `<div class="studio-intro"><div><span class="studio-label">${activeProject().is_demo ? '模拟内容工作室' : '内容工作室'}</span><h2>AI 微缩生活实验室</h2><p>用 AI 图片和短视频探索微缩美食、奇幻空间与治愈日常。内容在外部制作，中台负责协作、版本与复盘。</p><a class="text-link" href="#analytics">先看当前批次数据 →</a></div><div class="studio-art" aria-hidden="true"><span>灵感</span><span>作品</span><span>反馈</span></div></div>` +
    `<div class="stats">${stat('选题实验', counts('concepts'), '每个选题关联制作任务')}${stat('内容资产', counts('assets'), '图文与短视频分开观察')}${stat('待办任务', todo.length, '制作、初审与发布准备')}${stat('已发布', records.filter(r => r.kind === 'packages' && r.status === '已发布').length, '发布记录可追溯到创意标签')}</div>` +
    `<div class="workflow">${[['competitors', '收集灵感'], ['concepts', '确定选题'], ['requests', '制作协作'], ['assets', '内容初审'], ['packages', '登记发布'], ['analytics', '数据分析'], ['notes', '批次复盘']].map(([key, label], i) => `<a href="#${key}"><small>0${i + 1}</small><strong>${label}</strong><span>${specials[key] || modules[key].label}</span></a>`).join('')}</div>` +
    `<div class="section-title"><h2>下一步要做什么</h2><span>${todo.length} 条待办</span></div>` + (todo.length ? table(['任务', '环节', '状态', '负责人', '操作'], todo.slice(0, 12).map(r => `<tr><td><strong>${escape(r.title)}</strong></td><td>${modules[r.kind].label}</td><td><span class="status">${r.status}</span></td><td>${escape(r.data.owner || '未分配')}</td><td><button data-edit="${r.id}">查看 / 编辑</button></td></tr>`)) : empty('当前没有待办事项'));
  return heading('让每一轮创意都有依据', '从竞品参考到投放复盘，把创意、素材和效果连在一起。', button('新建创意', 'concepts')) +
    `<div class="stats">${stat('创意方向', counts('concepts'), '等待验证的创意假设')}${stat('素材资产', counts('assets'), '以独立尺寸 / 版本登记')}${stat('待办事项', todo.length, '制作、审核与交付')}${stat('已上线', records.filter(r => r.kind === 'packages' && r.status === '已上线').length, '已登记平台广告 ID')}</div>` +
    `<div class="workflow">${[['competitors', '发现参考'], ['concepts', '确定方向'], ['requests', '下达需求'], ['assets', '制作与初审'], ['packages', '交付投放'], ['analytics', '数据分析'], ['notes', '批次复盘']].map(([key, label], i) => `<a href="#${key}"><small>0${i + 1}</small><strong>${label}</strong><span>${specials[key] || modules[key].label}</span></a>`).join('')}</div>` +
    `<div class="section-title"><h2>当前待办</h2><span>${todo.length} 条记录</span></div>` + (todo.length ? table(['任务', '模块', '状态', '负责人', '操作'], todo.slice(0, 12).map(r => `<tr><td><strong>${escape(r.title)}</strong></td><td>${modules[r.kind].label}</td><td><span class="status">${r.status}</span></td><td>${escape(r.data.owner || '未分配')}</td><td><button data-edit="${r.id}">查看 / 编辑</button></td></tr>`)) : empty('当前没有待办事项'));
}
function recordsView(key) {
  const module = modules[key];
  const batchAware = module.fields.some(f => f.key === 'batchId');
  const records = state.records.filter(r => r.kind === key && (!batchAware || !state.batchId || r.data.batchId === state.batchId) && (!state.filter || r.status === state.filter) && `${r.title} ${r.id} ${Object.values(r.data).filter(v => typeof v === 'string').join(' ')} ${r.tags.map(t => state.tags.find(x => x.id === t)?.name).join(' ')}`.toLowerCase().includes(state.query.toLowerCase()));
  const toolbar = `<div class="toolbar"><input id="search" type="search" placeholder="搜索标题、标签或编号" aria-label="搜索" value="${escape(state.query)}"><select id="status-filter" aria-label="筛选状态"><option value="">全部状态</option>${module.states.map(s => `<option ${s === state.filter ? 'selected' : ''}>${s}</option>`).join('')}</select><span>${records.length} 条记录</span></div>`;
  const rows = records.map(r => `<tr><td><strong>${escape(r.title)}</strong><small class="record-id">${r.id.slice(0, 8)}</small></td><td>${badges(r.tags) || '<span class="muted">未标注</span>'}</td><td><span class="status ${['已通过', '已批准', '已上线', '已完成', '有效', '可使用'].includes(r.status) ? 'good' : ''}">${r.status}</span></td><td>${module.fields.filter(f => f.type === 'link' || f.type === 'multilink').map(f => `<small>${f.label}</small><span>${f.type === 'multilink' ? escape((r.data[f.key] || []).map(recordName).join('、')) : escape(recordName(r.data[f.key]))}</span>`).join('') || escape(r.data.owner || r.data.game || '—')}</td><td>${r.updated_at.slice(0, 10)}</td><td><button data-edit="${r.id}">查看 / 编辑</button></td></tr>`);
  return heading(module.label, module.description, button(`新建${module.label}`, key)) + toolbar + (rows.length ? table(['名称 / 编号', '创意标签', '状态', '关联 / 负责人', '更新日期', '操作'], rows) : empty(state.query || state.filter ? '没有符合条件的记录' : undefined));
}
function analyticsView() {
  if (social()) return socialAnalytics();
  const a = state.analytics;
  return heading('数据分析', '按素材上线时的标签快照汇总表现，为下一轮创意提供线索。', button('录入日数据', 'metrics')) +
    `<div class="callout">基础版使用单一报表口径录入数据；请在同一项目内保持币种、时区和归因窗口一致。多标签数据会重复分组，不能相加作为总计；相关表现不代表单个标签的因果贡献。</div>` +
    `<div class="stats">${stat('花费', money(a.totals.spend || 0), '报表原币种')}${stat('展示', a.totals.impressions || 0, '累计展示次数')}${stat('点击率', percent(a.totals.ctr), '总点击 ÷ 总展示')}${stat('安装成本', money(a.totals.cpi), '总花费 ÷ 总安装')}</div>` +
    `<div class="section-title"><h2>标签表现</h2><span>用于提出下一轮假设</span></div>` +
    (a.tags.length ? table(['标签', '分类', '素材数', '花费', '展示', '点击率', '安装', '安装成本'], a.tags.map(t => `<tr><td><span class="tag">${escape(t.name)}</span></td><td>${escape(t.category)}</td><td>${t.assets}</td><td>${money(t.spend)}</td><td>${t.impressions}</td><td>${percent(t.ctr)}</td><td>${t.installs}</td><td>${money(t.cpi)}</td></tr>`)) : empty('暂无可分析的标签数据')) +
    `<div class="section-title"><h2>原始日数据</h2><span>同一上线包每天一条</span></div>` + (a.rows.length ? table(['日期', '上线包', '花费', '展示', '点击', '安装'], a.rows.map(r => `<tr><td>${r.date}</td><td>${escape(recordName(r.package_id))}</td><td>${money(r.spend)}</td><td>${r.impressions}</td><td>${r.clicks}</td><td>${r.installs}</td></tr>`)) : '<p class="muted">先创建上线包并登记广告 ID，再录入表现数据。</p>');
}
function buildAnalysisPrompt(rows, metrics, totals) {
  const sample = rows.map(r => ({ title: r.title, platform: r.platform, format: r.format, account: r.account, views: r.views, likes: r.likes, saves: r.saves, comments: r.comments, shares: r.shares, follows: r.follows, tags: r.tags.map(t => `${t.category}/${t.name}`) }));
  const tagSummary = metrics.map(m => ({ tag: `${m.tag.category}/${m.tag.name}`, platform: m.platform, format: m.format, samples: m.count, views: m.views, saveRate: m.saveRate, interactionRate: m.interactionRate }));
  const batch = activeBatch();
  return `你是内容营销与运营复盘顾问。请只基于当前实验批次的 72 小时累计数据，输出一份可执行的批次复盘，服务于下一轮选题与制作排期。\n\n实验批次：${batch?.title || '未命名'}\n实验假设：${batch?.data.hypothesis || '未填写'}\n\n请严格按以下结构回答：\n1. 数据事实：只引用数据中能直接验证的现象，列出平台、内容形式、样本量和核心指标。\n2. 初步判断：指出表现较好的标签组合，并同时写出样本量、可能的混杂因素和不能下因果结论的地方。\n3. 营销建议：给出 3 个下一轮可测试的选题或内容结构，每个只改变一个变量，写清保留项、变化项和目标指标。\n4. 运营建议：给出发布时间、账号分工、素材复用和复盘节奏建议；没有证据的部分请标记为假设。\n5. 风险与补数：列出需要补采的字段或需要控制的变量。\n\n总览：${JSON.stringify(totals)}\n作品数据：${JSON.stringify(sample)}\n标签对比：${JSON.stringify(tagSummary)}`;
}
function csv(value) { return `"${String(value ?? '').replaceAll('"', '""')}"`; }
function exportSocialCsv(rows) {
  const headers = ['批次', '内容', '平台', '形式', '账号', '采集日期', '阅读/播放', '点赞', '收藏', '评论', '分享', '新增关注', '创意标签'];
  const lines = [headers, ...rows.map(r => [activeBatch()?.title || '', r.title, r.platform, r.format, r.account, r.observed_date, r.views, r.likes, r.saves, r.comments, r.shares, r.follows, r.tags.map(t => `${t.category}/${t.name}`).join('、')])].map(row => row.map(csv).join(','));
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `creative-workbench-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
  notify('CSV 已导出');
}
function biBar(value, max, label) {
  const width = Math.max(2, Math.min(100, max ? (value / max) * 100 : 0));
  return `<svg class="bi-bar" viewBox="0 0 100 8" role="img" aria-label="${escape(label)}"><rect class="bi-bar-track" x="0" y="0" width="100" height="8" rx="4"></rect><rect class="bi-bar-fill" x="0" y="0" width="${width}" height="8" rx="4"></rect></svg>`;
}
function biBoard(rows, metrics, totals, withAi = false) {
  const top = [...metrics].sort((a, b) => (b.saveRate ?? -1) - (a.saveRate ?? -1)).slice(0, 5);
  const max = Math.max(...top.map(item => item.saveRate || 0), 0.01);
  const segments = [...new Set(rows.map(r => `${r.platform}|||${r.format}`))].map(key => { const [platform, format] = key.split('|||'); return { platform, format, ...summarizeSocial(rows.filter(r => r.platform === platform && r.format === format)) }; });
  const maxViews = Math.max(...segments.map(item => item.views || 0), 1);
  return `<div class="bi-board"><div class="bi-head"><div><span class="eyebrow">BI 看板</span><h2>内容组合表现</h2><p>用真实比例比较标签、平台和形式，避免把相近数据画成相同长度。</p></div><div class="bi-actions"><button data-export-csv>导出 CSV</button>${withAi ? '<button data-ai="deepseek">DeepSeek 分析</button><button class="primary" data-ai="openai">OpenAI 分析</button>' : ''}</div></div><div class="bi-grid"><section class="bi-card"><h3>标签收藏率排行 <small>相对最高值</small></h3>${top.length ? top.map(item => `<div class="bar-row"><span>${escape(item.tag.name)}<small>${escape(item.platform)} · ${escape(item.format)} · ${item.count} 条</small></span>${biBar(item.saveRate, max, `${item.tag.name} 收藏率 ${percent(item.saveRate)}`)}<b>${percent(item.saveRate)}</b></div>`).join('') : '<p class="muted">暂无标签数据</p>'}</section><section class="bi-card"><h3>平台 × 形式触达</h3>${segments.map(item => `<div class="mini-row"><span>${escape(item.platform)} · ${escape(item.format)}<small>${item.count} 条 · 收藏 ${percent(item.saveRate)} · 互动 ${percent(item.interactionRate)}</small></span>${biBar(item.views, maxViews, `${item.platform} ${item.format} 阅读 ${item.views.toLocaleString()}`)}<b>${item.views.toLocaleString()}</b></div>`).join('') || '<p class="muted">暂无数据</p>'}</section></div></div>`;
}
function currentAnalyticsRows() {
  return state.analytics.rows.filter(r => (!state.batchId || r.batchId === state.batchId) && (!analyticsPlatform || r.platform === analyticsPlatform) && (!analyticsFormat || r.format === analyticsFormat));
}
function socialAnalytics() {
  const all = state.analytics.rows.filter(r => !state.batchId || r.batchId === state.batchId);
  const rows = currentAnalyticsRows();
  const totals = summarizeSocial(rows);
  const options = (values, value) => values.map(v => `<option value="${escape(v)}" ${v === value ? 'selected' : ''}>${escape(v)}</option>`).join('');
  const groups = new Map();
  for (const row of rows) for (const tag of row.tags) {
    const key = JSON.stringify([row.platform, row.format, tag.id]);
    if (!groups.has(key)) groups.set(key, { tag, platform: row.platform, format: row.format, rows: [] });
    groups.get(key).rows.push(row);
  }
  const metrics = [...groups.values()].map(g => ({ ...g, ...summarizeSocial(g.rows) })).sort((a, b) => (b.saveRate ?? -1) - (a.saveRate ?? -1));
  return heading(`${activeBatch()?.title || '当前批次'} · 数据分析`, '先看作品，再看同平台、同形式的创意标签。用观察提出假设，用下一轮内容验证。', button('录入 72 小时数据', 'metrics')) +
    `<div class="toolbar"><select id="analytics-platform" aria-label="按平台筛选"><option value="">全部平台</option>${options([...new Set(all.map(r => r.platform))], analyticsPlatform)}</select><select id="analytics-format" aria-label="按内容形式筛选"><option value="">全部形式</option>${options(['图文', '短视频'], analyticsFormat)}</select><span>发布后 72 小时累计值 · ${rows.length} 篇内容</span></div>` +
    `<div class="stats">${stat('阅读 / 播放', totals.views.toLocaleString(), '当前筛选内容累计')}${stat('互动次数', totals.interactions.toLocaleString(), '赞 + 藏 + 评 + 分享；非去重人数')}${stat('收藏率', percent(totals.saveRate), '总收藏 ÷ 总阅读 / 播放')}${stat('新增关注', totals.follows, '内容带来的关注次数')}</div>` +
    biBoard(rows, metrics, totals) +
    `<div class="callout">${activeProject().is_demo ? '以下数值为人工编造的模拟数据，只验证产品流程，不代表真实平台表现或增长收益。' : '请录入后台记录的发布后 72 小时累计值，不要录入每天累计数相加。'}标签多选会重复分组；下表按平台与内容形式分开统计，标签排序仅为描述，不判定因果。</div>` +
    `<div class="section-title"><h2>作品表现</h2><span>从批次复盘或任一作品创建下一轮任务</span></div>` +
    (rows.length ? table(['内容', '平台 / 形式', '阅读 / 播放', '收藏', '收藏率', '互动率', '关注', '下一步'], rows.map(r => { const s = summarizeSocial([r]); return `<tr><td><strong>${escape(r.title)}</strong><small>${escape(r.account)} · ${r.observed_date} 采集 · ${r.source === 'simulated' ? '模拟' : '手工录入'}</small></td><td>${escape(r.platform)}<small>${escape(r.format)}</small></td><td>${r.views.toLocaleString()}</td><td>${r.saves}</td><td>${percent(s.saveRate)}</td><td>${percent(s.interactionRate)}</td><td>${r.follows}</td><td><button data-review="${r.package_id}">写批次复盘</button><button data-iterate="${r.package_id}">创建下一轮任务</button></td></tr>`; })) : empty('先登记发布，再录入内容表现')) +
    `<div class="section-title"><h2>创意标签对比</h2><span>按收藏率排序 · 每组显示样本数</span></div>` +
    (metrics.length ? table(['创意标签', '平台 / 形式', '样本数', '阅读 / 播放', '收藏率', '互动率', '解读'], metrics.map(g => `<tr><td><span class="tag">${escape(g.tag.name)}</span><small>${escape(g.tag.category)}</small></td><td>${escape(g.platform)} / ${escape(g.format)}</td><td>${g.count}</td><td>${g.views.toLocaleString()}</td><td>${percent(g.saveRate)}</td><td>${percent(g.interactionRate)}</td><td class="muted">${activeProject().is_demo ? '模拟观察，需真实验证' : '观察线索，需控制变量验证'}</td></tr>`)) : '') +
    `<div class="section-title"><h2>批次复盘怎么进入生产</h2></div><p class="muted">数据分析只回答“发生了什么”；进入当前批次的复盘页后，再调用 DeepSeek / OpenAI 形成判断、保留项和唯一变量，最后转成下一轮制作任务。</p>`;
}
function socialReview() {
  const rows = currentAnalyticsRows();
  const totals = summarizeSocial(rows);
  const groups = new Map();
  for (const row of rows) for (const tag of row.tags) {
    const key = JSON.stringify([row.platform, row.format, tag.id]);
    if (!groups.has(key)) groups.set(key, { tag, platform: row.platform, format: row.format, rows: [] });
    groups.get(key).rows.push(row);
  }
  const metrics = [...groups.values()].map(g => ({ ...g, ...summarizeSocial(g.rows) })).sort((a, b) => (b.saveRate ?? -1) - (a.saveRate ?? -1));
  const reviews = state.records.filter(r => r.kind === 'notes' && r.data.batchId === state.batchId);
  const batch = activeBatch();
  const reviewRows = reviews.map(r => `<tr><td><strong>${escape(r.title)}</strong><small>${r.data.date || r.updated_at.slice(0, 10)}</small></td><td><span class="status">${r.status}</span></td><td>${escape(r.data.testVariable || '待定义')}</td><td>${escape(r.data.nextTopic || '待补充')}</td><td><button data-edit="${r.id}">查看 / 编辑</button></td></tr>`);
  return heading(`${batch?.title || '当前批次'} · 复盘决策`, '以一个实验批次为单位汇总表现，把数据事实转成下一轮动作。', button('新建批次复盘', 'notes')) +
    `<div class="callout"><strong>实验假设：</strong>${escape(batch?.data.hypothesis || '待补充')}<br><span class="muted">复盘页面集中提供 DeepSeek / OpenAI 分析；数据原表与 CSV 保留在“数据分析”。</span></div>` +
    `<div class="stats">${stat('内容样本', totals.count, '当前批次已采集内容')}${stat('阅读 / 播放', totals.views.toLocaleString(), '72 小时累计')}${stat('收藏率', percent(totals.saveRate), '总收藏 ÷ 总阅读 / 播放')}${stat('互动率', percent(totals.interactionRate), '赞 + 藏 + 评 + 分享')}</div>` +
    biBoard(rows, metrics, totals, true) +
    `<div class="section-title"><h2>本批次复盘记录</h2><span>${reviews.length} 条</span></div>` +
    (reviewRows.length ? table(['复盘记录', '状态', '唯一变量', '下一轮方向', '操作'], reviewRows) : empty('先在上方 AI 分析后新建一条批次复盘'));
}
function render() {
  nav();
  $('#demo-banner').textContent = activeProject()?.is_demo ? '模拟工作空间：账号、内容与效果均为虚构示例，未实际发布到任何平台。' : '';
  const current = page();
  $('#breadcrumb').textContent = `${state.projects.find(p => p.id === state.projectId)?.name || '工作空间'} / ${specials[current] || modules[current].label}`;
  if (!state.projectId && current !== 'projects') {
    $('#content').innerHTML = heading('创建你的第一个项目', '按账号团队或内容主题建立工作空间，再逐步完善创意与数据。', button('创建项目', 'projects')) + empty('从一个内容项目开始'); return;
  }
  let html;
  if (current === 'dashboard') html = dashboard();
  else if (current === 'analytics') html = analyticsView();
  else if (current === 'notes' && social()) html = socialReview();
  else if (current === 'projects') html = heading('项目管理', '每个项目有独立的创意、标签、内容与表现数据。新建项目默认使用内容工作流。', button('新建项目', 'projects')) + (state.projects.length ? `<div class="project-grid">${state.projects.map(p => `<article class="project-card"><span class="muted">${p.type === 'social' ? '社媒内容项目' : '原广告项目'}${p.is_demo ? ' · 模拟数据' : ''}</span><h2>${escape(p.name)}</h2><p>创建于 ${p.created_at.slice(0, 10)}</p><button data-project="${p.id}" ${p.id === state.projectId ? 'disabled' : ''}>${p.id === state.projectId ? '当前工作空间' : '进入项目'}</button></article>`).join('')}</div>` : empty());
  else if (current === 'tags') html = heading('标签字典', '按父类维护子标签，标签会贯穿灵感、选题、成片和 BI 看板。', button('新增标签', 'tags')) + (state.tags.length ? `<div class="tag-groups">${tagCategories.filter(category => state.tags.some(t => t.category === category)).map(category => `<article><div class="tag-parent">${escape(category)}</div><div class="tag-children">${badges(state.tags.filter(t => t.category === category).map(t => t.id))}</div></article>`).join('')}</div>` : empty('先创建内容主题、内容结构、核心立意等标签分类'));
  else html = recordsView(current);
  $('#content').innerHTML = html;
}
function control(f, value = '') {
  const key = escape(f.key), required = f.required ? ' required' : '';
  let input;
  if (f.type === 'textarea') input = `<textarea name="${key}" rows="4" maxlength="10000"${required}>${escape(value)}</textarea>`;
  else if (f.type === 'multilink') input = inspirationPicker(value);
  else if (f.type === 'link' || f.type === 'select') {
    const options = f.type === 'link' ? state.records.filter(r => r.kind === f.target && (f.key === 'batchId' || !r.data.batchId || r.data.batchId === state.batchId)).map(r => [r.id, `${r.title} (${r.status})`]) : f.options.map(v => [v, v]);
    input = `<select name="${key}"${required}><option value="">请选择</option>${options.map(([v, label]) => `<option value="${escape(v)}" ${v === value ? 'selected' : ''}>${escape(label)}</option>`).join('')}</select>`;
  } else input = `<input name="${key}" type="${f.type || 'text'}" value="${escape(value)}" maxlength="2000" ${f.type === 'number' ? 'min="0" step="any"' : ''}${required}>`;
  return `<label class="field">${escape(f.label)}${f.required ? ' *' : ''}${input}</label>`;
}
let editor;
let aiProvider = 'openai';
function openAiDialog(provider) {
  aiProvider = provider;
  const rows = currentAnalyticsRows();
  const groups = new Map();
  for (const row of rows) for (const tag of row.tags) {
    const key = JSON.stringify([row.platform, row.format, tag.id]);
    if (!groups.has(key)) groups.set(key, { tag, platform: row.platform, format: row.format, rows: [] });
    groups.get(key).rows.push(row);
  }
  const metrics = [...groups.values()].map(g => ({ ...g, ...summarizeSocial(g.rows) }));
  $('#ai-provider-label').textContent = provider === 'openai' ? 'OPENAI' : 'DEEPSEEK';
  $('#ai-prompt').value = buildAnalysisPrompt(rows, metrics, summarizeSocial(rows));
  $('#ai-key').value = ''; $('#ai-error').textContent = ''; $('#ai-result').textContent = ''; $('#ai-run').disabled = false; $('#ai-dialog').showModal();
}
$('#ai-form').addEventListener('submit', async event => {
  event.preventDefault();
  const run = $('#ai-run'); run.disabled = true; $('#ai-error').textContent = ''; $('#ai-result').textContent = '分析中…';
  try {
    const result = await api('/ai/analyze', { data: { provider: aiProvider, apiKey: $('#ai-key').value, prompt: $('#ai-prompt').value } });
    $('#ai-result').textContent = result.text;
  } catch (error) { $('#ai-error').textContent = error.message; $('#ai-result').textContent = ''; }
  finally { run.disabled = false; }
});
$('#ai-copy').onclick = async () => { await navigator.clipboard.writeText($('#ai-prompt').value); notify('提示词已复制'); };
$('#ai-close').onclick = () => $('#ai-dialog').close();
function openEditor(kind, existing, defaults) {
  editor = { kind, existing, projectId: state.projectId };
  $('#dialog-title').textContent = `${existing ? '编辑' : '新建'}${specials[kind] || modules[kind]?.label || '日数据'}`;
  let html;
  if (kind === 'projects') html = control({ key: 'name', label: '项目名称', required: true }) + '<label class="checkbox"><input type="checkbox" name="isDemo">模拟项目（不与真实数据混用）</label>';
  else if (kind === 'tags') html = control({ key: 'category', label: '标签分类', type: 'select', options: tagCategories, required: true }) + control({ key: 'name', label: '标签名称', required: true }) + `<p class="muted">分类按素材拆解建议维护，新增值会贯穿灵感、选题、成片和 BI 看板。</p>`;
  else if (kind === 'metrics' && social()) html = '<p class="muted">填写发布后 72 小时的累计值。同一发布包只录入一次；没有观测到的数据请先核实，不要用零代替未知。</p>' + control({ key: 'packageId', label: '已发布内容', type: 'link', target: 'packages', required: true }) + control({ key: 'date', label: '采集日期', type: 'date', required: true }, new Date().toLocaleDateString('sv-SE')) + socialMetricFields.map(f => control(f)).join('');
  else if (kind === 'metrics') html = control({ key: 'packageId', label: '已上线的投放包', type: 'link', target: 'packages', required: true }) + control({ key: 'date', label: '报表日期', type: 'date', required: true }, new Date().toLocaleDateString('sv-SE')) + ['spend', 'impressions', 'clicks', 'installs'].map((key, i) => control({ key, label: ['花费', '展示次数', '点击次数', '安装次数'][i], type: 'number', required: true })).join('');
  else {
    existing ||= defaults || (modules[kind]?.fields.some(f => f.key === 'batchId') ? { data: { batchId: state.batchId } } : null);
    const module = modules[kind];
    html = control({ key: 'title', label: kind === 'batches' ? '批次名称（可重命名）' : '名称', required: true }, existing?.title) + control({ key: 'status', label: '状态', type: 'select', options: module.states, required: true }, existing?.status || module.states[0]);
    html += module.fields.map(f => control(f, existing?.data[f.key])).join('');
    html += `<fieldset><legend>创意标签</legend>${state.tags.length ? `<div class="tag-picker">${tagGroupsMarkup(existing?.tags || [])}</div>` : '<p class="muted">到标签字典中创建标签后即可选择。</p>'}</fieldset>`;
    if (existing?.data.snapshot) html += `<details><summary>查看上线时的固定快照</summary><pre>${escape(JSON.stringify(existing.data.snapshot, null, 2))}</pre></details>`;
  }
  $('#fields').innerHTML = html; $('#form-error').textContent = ''; $('#save').disabled = false; $('#editor').showModal();
}
$('#form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.target), { kind, existing, projectId } = editor;
  $('#save').disabled = true; $('#form-error').textContent = '';
  try {
    let result;
    if (kind === 'projects' || kind === 'tags') result = await api(`/${kind}`, { data: { ...Object.fromEntries(form), projectId, ...(kind === 'projects' ? { isDemo: form.has('isDemo'), type: 'social' } : {}) } });
    else if (kind === 'metrics') {
      const data = { ...Object.fromEntries(form), projectId };
      for (const key of social() ? socialMetricFields.map(f => f.key) : ['spend', 'impressions', 'clicks', 'installs']) data[key] = Number(data[key]);
      if (social()) Object.assign(data, { windowHours: 72, source: activeProject().is_demo ? 'simulated' : 'manual' });
      result = await api('/metrics', { data });
    } else {
      const data = Object.fromEntries(modules[kind].fields.map(f => [f.key, f.type === 'multilink' ? form.getAll(f.key) : (f.type === 'number' && form.get(f.key) !== '' ? Number(form.get(f.key)) : form.get(f.key))]));
      result = await api(`/records${existing ? `/${existing.id}` : ''}`, { method: existing ? 'PUT' : 'POST', data: { kind, projectId, title: form.get('title'), status: form.get('status'), tags: form.getAll('tags'), data } });
    }
    if (kind === 'projects') state.projectId = result.id;
    $('#editor').close(); notify('已保存'); await refresh();
  } catch (error) { $('#form-error').textContent = error.message; }
  finally { $('#save').disabled = false; }
});
$('#close').onclick = $('#cancel').onclick = () => $('#editor').close();
$('#project').onchange = async event => { state.projectId = event.target.value; state.query = ''; state.filter = ''; analyticsPlatform = ''; analyticsFormat = ''; await refresh(); };
$('#batch').onchange = event => { state.batchId = event.target.value; state.query = ''; state.filter = ''; analyticsPlatform = ''; analyticsFormat = ''; localStorage.setItem('batchId', state.batchId); render(); };
$('#content').addEventListener('click', async event => {
  const target = event.target.closest('button'); if (!target || state.loading) return;
  if (target.dataset.new) openEditor(target.dataset.new);
  if (target.dataset.exportCsv) {
    exportSocialCsv(currentAnalyticsRows());
  }
  if (target.dataset.ai) openAiDialog(target.dataset.ai);
  if (target.dataset.edit) { const r = state.records.find(r => r.id === target.dataset.edit); openEditor(r.kind, r); }
  if (target.dataset.review) {
    const row = currentAnalyticsRows().find(r => r.package_id === target.dataset.review) || currentAnalyticsRows()[0];
    const batch = activeBatch();
    if (!row || !batch) return notify('无法找到当前批次或表现数据', true);
    const rows = currentAnalyticsRows(), summary = summarizeSocial(rows);
    openEditor('notes', null, { title: `${batch.title}复盘`, status: '草稿', data: { batchId: batch.id, packageId: row.package_id, date: new Date().toLocaleDateString('sv-SE'), facts: `本批次共 ${rows.length} 条内容，72 小时累计阅读 / 播放 ${summary.views}，收藏 ${summary.saves}，收藏率 ${percent(summary.saveRate)}，互动率 ${percent(summary.interactionRate)}。${rows.some(r => r.source === 'simulated') ? '当前包含模拟数据。' : ''}`, interpretation: '请基于本批次数据写出初步判断，并标明可能的混杂因素。', keepElements: '请填写本批次应保留的主题、结构、视觉或发布条件。', testVariable: '请只填写一个下一轮要改变的变量。', nextTopic: '请填写下一轮选题方向和验证目标。', actionStatus: '待转任务' } });
  }
  if (target.dataset.iterate) {
    const pack = state.records.find(r => r.id === target.dataset.iterate);
    const sourceTask = state.records.find(r => r.id === pack.data.snapshot.asset.data.requestId);
    const row = state.analytics.rows.find(r => r.package_id === pack.id);
    if (!sourceTask || !row) return notify('无法找到来源制作任务或表现数据', true);
    const s = summarizeSocial([row]);
    openEditor('requests', null, { title: `下一轮：${pack.title}`, status: '草稿', tags: pack.data.snapshot.asset.tags, data: { batchId: state.batchId, conceptId: sourceTask.data.conceptId, sourcePackageId: pack.id, brief: `${row.source === 'simulated' ? '【模拟观察，不是真实效果】' : '【观察线索，非因果结论】'}\n来源内容：${pack.title}\n72 小时阅读 / 播放 ${row.views}，收藏 ${row.saves}，收藏率 ${percent(s.saveRate)}。\n保留：${row.tags.map(t => t.name).join('、')}。\n下一轮只改变：请填写一个待验证变量。\n交付要求：请填写脚本、规格与验收标准。` } });
  }
  if (target.dataset.project) { state.projectId = target.dataset.project; location.hash = 'dashboard'; await refresh(); }
});
$('#content').addEventListener('input', event => {
  if (event.target.id === 'search') { const pos = event.target.selectionStart; state.query = event.target.value; render(); $('#search').focus(); $('#search').setSelectionRange(pos, pos); }
});
$('#content').addEventListener('change', event => {
  if (event.target.id === 'status-filter') { state.filter = event.target.value; render(); }
  if (event.target.id === 'analytics-platform') { analyticsPlatform = event.target.value; render(); }
  if (event.target.id === 'analytics-format') { analyticsFormat = event.target.value; render(); }
});
window.addEventListener('hashchange', () => { state.query = ''; state.filter = ''; render(); });
refresh();
