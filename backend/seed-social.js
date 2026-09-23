import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.js';
import { createApp } from './server.js';
import { tagCatalog } from '../shared/modules.js';

export async function seedSocial(base) {
  const call = async (path, data) => {
    const response = await fetch(`${base}/api${path}`, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  };
  const name = 'AI 微缩生活实验室 · 模拟项目';
  const found = (await call('/projects')).find(p => p.name === name && p.type === 'social' && p.is_demo);
  const projectId = found?.id || (await call('/projects', { name, type: 'social', isDemo: true })).id;
  const current = await call(`/workspace?projectId=${projectId}`);
  const existingTags = new Map(current.tags.map(tag => [`${tag.category}:${tag.name}`, tag.id]));
  const tags = {};
  for (const [category, names] of Object.entries(tagCatalog)) {
    for (const name of names) {
      const key = `${category}:${name}`;
      tags[name] = existingTags.get(key) || (await call('/tags', { projectId, category, name })).id;
    }
  }
  if (found) return { projectId, existing: true, tags: Object.keys(tags).length };
  const batchOne = await call('/records', { projectId, kind: 'batches', title: '1批次', status: '进行中', data: { hypothesis: '第一批内容结构与创意标签基线', owner: '内容负责人（模拟）', startDate: '2026-09-18' }, tags: [] });
  const batchTwo = await call('/records', { projectId, kind: 'batches', title: '2批次', status: '进行中', data: { hypothesis: '保持主题与账号稳定，比较不同内容结构的收藏与触达表现', owner: '内容负责人（模拟）', startDate: '2026-09-22' }, tags: [] });
  let currentBatchId = batchOne.id;
  const add = (kind, title, status, data, labels = []) => call('/records', { projectId, kind, title, status, data: kind === 'batches' || kind === 'configs' ? data : { batchId: currentBatchId, ...data }, tags: labels.map(t => tags[t]) });
  const account = await add('configs', '微缩生活研究所 · 小红书模拟账号', '可使用', { platform: '小红书', account: '微缩生活研究所（虚构）', audience: '喜欢 AI 视觉创意、微缩场景与制作教程的内容读者' });
  // Deliberately invented fixtures: differences exercise the UI, not platform conclusions.
  const examples = [
    ['杯子里的拉面店：四步搭建', '图文', '微缩美食', '制作过程', '步骤拆解', 4200, 270, 336, 18, 32, 47],
    ['一碗拉面，住进一座小城', '图文', '微缩美食', '成品揭晓', '视觉欣赏', 6500, 460, 195, 31, 40, 36],
    ['面包山谷：提示词与构图拆解', '图文', '微缩美食', '制作过程', '步骤拆解', 3800, 210, 285, 14, 27, 39],
    ['推开冰箱，发现云端厨房', '图文', '奇幻空间', '成品揭晓', '视觉欣赏', 5100, 390, 153, 26, 35, 28],
    ['15 秒，看一间拉面店长出来', '短视频', '微缩美食', '制作过程', '步骤拆解', 9200, 540, 460, 43, 77, 86],
    ['最后一秒，揭晓面包小镇', '短视频', '微缩美食', '成品揭晓', '视觉欣赏', 14800, 950, 296, 68, 128, 104],
    ['咖啡杯里的雨夜，从草图到成片', '短视频', '奇幻空间', '制作过程', '步骤拆解', 8600, 430, 387, 32, 61, 67],
    ['如果云朵是一家甜品店', '短视频', '奇幻空间', '成品揭晓', '视觉欣赏', 12600, 820, 252, 54, 102, 79]
  ];
  const packs = [];
  let firstReferenceId = '', secondReferenceId = '';
  for (const [i, [title, format, topic, narrative, value, views, likes, saves, comments, shares, follows]] of examples.entries()) {
    currentBatchId = i < 4 ? batchOne.id : batchTwo.id;
    const labels = [topic, '治愈写实', narrative, value];
    const reference = await add('competitors', `模拟灵感 ${i + 1}：${topic}的${narrative}`, '已拆解', { platform: '小红书', creator: '虚构参考，非真实博主', contentFormat: format, url: 'https://example.com/inspiration', collectedAt: '2026-09-18', contentStructure: narrative === '制作过程' ? 'Hook → 步骤拆解 → 成品揭晓' : '成品首屏 → 细节特写 → 互动提问', coreIdea: `${narrative}把 AI 视觉创作过程变成可收藏的内容。`, targetAudience: 'AI 视觉创作爱好者', hook: narrative === '制作过程' ? '15 秒看一间小店长出来' : '如果云朵是一家甜品店？', notes: '为流程演示编写的灵感记录，没有抓取真实内容，也没有外部原片。' }, labels);
    if (i < 4 && !firstReferenceId) firstReferenceId = reference.id;
    if (i >= 4 && !secondReferenceId) secondReferenceId = reference.id;
    const concept = await add('concepts', title, '已批准', { referenceIds: [reference.id], audience: 'AI 视觉创作爱好者', variable: '叙事呈现方式', expectedValue: '收藏 / 实用', hypothesis: `${narrative}是否影响${format}的收藏和关注意愿？模拟样本不用于证明结论，真实测试时需控制题材、账号和发布时间。`, testNotes: '固定账号、主题和发布时间，只改变叙事呈现方式。' }, labels);
    const task = await add('requests', `${title} · 制作任务`, '已完成', { conceptId: concept.id, owner: '制作同事（模拟）', dueDate: '2026-09-17', brief: `${format === '图文' ? '4 张 3:4 图片，包含封面和内容页。' : '15 秒 9:16 视频，包含开场、中段和结尾。'}采用${narrative}，突出${value}。本记录无真实图片或视频文件。`, prompt: '微缩场景，柔和自然光，强调可辨识的食物与建筑比例；提示词示例，未调用生成工具。' }, labels);
    const asset = await add('assets', `${title} · v1`, '已通过', { requestId: task.id, format, ratio: format === '图文' ? '3:4' : '9:16', version: 'v1', review: '模拟初审通过；仅有资产元数据，待真实案例补充文件链接。' }, labels);
    const relation = await add('relations', `${title} · 发布计划`, '有效', { assetId: asset.id, configId: account.id, scheduledDate: '2026-09-18' });
    const pack = await add('packages', title, '已发布', { relationId: relation.id, owner: '内容负责人（模拟）', headline: title, caption: `把${topic}做成一个能走进去的小世界。${narrative === '制作过程' ? '这次记录从构图到成片的步骤。' : '你最想走进哪个角落？'}\n模拟文案，未真实发布。`, hashtags: '#AI创作 #微缩世界 #创意灵感', postId: `SIM-XHS-${String(i + 1).padStart(3, '0')}`, publishedDate: '2026-09-18', notes: '模拟发布记录，没有真实平台链接。' });
    await call('/metrics', { projectId, packageId: pack.id, date: '2026-09-21', windowHours: 72, source: 'simulated', views, likes, saves, comments, shares, follows });
    packs.push(pack);
  }
  currentBatchId = batchOne.id;
  await add('notes', '1批次复盘：收藏与触达可能对应不同内容价值', '待转任务', { batchId: batchOne.id, packageId: packs[0].id, date: '2026-09-22', facts: '【纯模拟】步骤拆解样本的收藏率被设定得更高，成品揭晓样本的阅读 / 播放被设定得更高。', interpretation: '叙事与内容价值同时变化，当前只能形成观察线索，不能拆出单标签因果。', keepElements: '保留同一主题、账号和内容形式。', testVariable: '只改变封面信息量。', nextTopic: '下一批次测试同一拉面场景的封面信息量。', owner: '内容负责人（模拟）', dueDate: '2026-09-25', actionStatus: '待转任务' });
  currentBatchId = batchTwo.id;
  await add('notes', '2批次复盘：不同内容结构的触达观察', '草稿', { batchId: batchTwo.id, packageId: packs[4].id, date: '2026-09-22', facts: '【纯模拟】第二批次包含 4 条短视频，触达高于第一批次图文样本。', interpretation: '当前批次同时改变了内容形式与结构，只能作为下一轮验证线索。', keepElements: '保留账号、主题和 72 小时观察窗口。', testVariable: '只改变内容结构，固定短视频形式。', nextTopic: '同一短视频形式下对比制作过程与成品揭晓。', owner: '内容负责人（模拟）', dueDate: '2026-09-29', actionStatus: '待转任务' });
  const pendingConcept = await add('concepts', '第二轮：同一拉面场景测试封面信息量', '草稿', { referenceIds: [secondReferenceId], hypothesis: '只改变封面是否写出制作步骤，观察图文收藏率差异。', variable: '封面信息量', expectedValue: '收藏 / 实用', audience: 'AI 视觉创作爱好者', testNotes: '固定内页与正文，只改变封面信息量。' }, ['微缩美食', '步骤拆解']);
  await add('requests', '待制作：拉面场景双封面方案', '待制作', { conceptId: pendingConcept.id, owner: '制作同事（模拟）', dueDate: '2026-09-25', brief: '保留相同内页、正文和创意标签，制作两种封面方案。先人工审核，暂不实际发布。' }, ['微缩美食', '步骤拆解']);
  return { projectId, packs, batches: [batchOne, batchTwo], existing: false };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = openDatabase();
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { const result = await seedSocial(`http://127.0.0.1:${server.address().port}`); console.log(JSON.stringify({ projectId: result.projectId, existing: result.existing, contents: result.packs?.length })); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); }
}
