// Shared field definitions keep forms and API validation consistent.
const field = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
const link = (key, label, target, required = true) => field(key, label, 'link', { target, required });
const multiLink = (key, label, target, required = true) => field(key, label, 'multilink', { target, required });
export const modules = {
  competitors: { label: '竞品素材', group: '研究与策划', description: '登记参考来源，人工拆解并标注创意要素。', states: ['待拆解', '已拆解', '已归档'], fields: [field('game', '竞品游戏'), field('url', '素材来源链接', 'url'), field('notes', '拆解记录', 'textarea')] },
  concepts: { label: '创意方向', group: '研究与策划', description: '把参考素材和标签转成可以验证的创意假设。', states: ['草稿', '已批准', '已归档'], fields: [link('referenceId', '参考竞品', 'competitors', false), field('hypothesis', '创意假设', 'textarea'), field('variable', '本轮测试变量')] },
  requests: { label: '素材需求', group: '素材生产', description: '从创意方向下达制作任务，明确交付规格和负责人。', states: ['草稿', '待制作', '制作中', '待初审', '需修改', '已完成'], fields: [link('conceptId', '来源创意', 'concepts'), field('owner', '制作负责人'), field('dueDate', '交付日期', 'date'), field('brief', '制作要求', 'textarea')] },
  assets: { label: '素材资产', group: '素材生产', description: '统一登记成片、尺寸版本与制作标签；文件保留在原存储位置。', states: ['待初审', '需修改', '已通过', '已归档'], fields: [link('requestId', '来源需求', 'requests'), field('url', '飞书 / 文件链接', 'url'), field('ratio', '尺寸比例', 'select', { options: ['9:16', '1:1', '4:5', '16:9'] }), field('version', '素材版本'), field('review', '初审意见', 'textarea')] },
  configs: { label: '投放配置', group: '投放交付', description: '定义平台、国家、受众与优化目标，保存可复用的配置。', states: ['草稿', '可使用', '已归档'], fields: [field('platform', '投放平台', 'select', { options: ['Meta', 'Google', 'TikTok', '其他'] }), field('country', '国家 / 地区'), field('audience', '受众'), field('event', '优化事件'), field('budget', '日预算', 'number')] },
  relations: { label: '素材投放关系', group: '投放交付', description: '把审核通过的素材绑定到投放配置，保留多对多关联。', states: ['有效', '已归档'], fields: [link('assetId', '素材资产', 'assets'), link('configId', '投放配置', 'configs')] },
  packages: { label: '投放上线包', group: '投放交付', description: '创建时固定素材、标签与配置快照，交给投放负责人执行。', states: ['待交付', '已交付', '已上线'], fields: [link('relationId', '素材投放关系', 'relations'), field('owner', '投放负责人'), field('adId', '平台广告 ID'), field('notes', '交付说明', 'textarea')] },
  notes: { label: '投放纪要', group: '数据闭环', description: '记录测试计划、投放动作和现场观察，保留结论的上下文。', states: ['进行中', '已完成'], fields: [link('packageId', '关联上线包', 'packages', false), field('date', '记录日期', 'date'), field('notes', '计划与观察', 'textarea')] }
};

// Keep the original ad workspace intact while adding the content-team workflow.
export const socialModules = {
  batches: { label: '实验批次', group: '项目总览', description: '按一次实验假设组织灵感、选题、发布数据和批次复盘；编辑名称即可重命名。', states: ['规划中', '进行中', '已复盘', '已归档'], fields: [field('hypothesis', '批次实验假设', 'textarea'), field('owner', '负责人'), field('startDate', '开始日期', 'date')] },
  competitors: { ...modules.competitors, label: '灵感素材库', description: '在当前批次下记录可复用案例，并按结构、立意与人群拆解。', fields: [link('batchId', '所属实验批次', 'batches'), field('platform', '来源平台', 'select', { options: ['小红书', '抖音', 'B站', 'Instagram', 'YouTube', '其他'], required: true }), field('creator', '参考作者 / 账号', 'text', { required: true }), field('contentFormat', '内容形式', 'select', { options: ['图文', '短视频', '图片', '视频'], required: true }), field('url', '原内容链接', 'url', { required: true }), field('collectedAt', '收集日期', 'date', { required: true }), field('contentStructure', '内容结构', 'textarea', { required: true }), field('coreIdea', '核心立意', 'textarea', { required: true }), field('targetAudience', '目标人群', 'text', { required: true }), field('hook', '开头 / 首屏钩子'), field('notes', '拆解记录', 'textarea')] },
  concepts: { ...modules.concepts, label: '选题与创意实验', description: '在当前批次下从多条灵感案例建立选题假设，明确受众、变量和预期价值。', fields: [link('batchId', '所属实验批次', 'batches'), multiLink('referenceIds', '关联灵感素材案例（可多选）', 'competitors', true), field('hypothesis', '选题假设', 'textarea', { required: true }), field('variable', '本轮测试变量', 'text', { required: true }), field('audience', '内容受众', 'text', { required: true }), field('expectedValue', '预期内容价值', 'select', { options: ['收藏 / 实用', '互动 / 讨论', '关注 / 转化', '触达 / 认知'], required: true }), field('testNotes', '验证口径', 'textarea')] },
  requests: { ...modules.requests, label: '内容制作任务', group: '内容生产', description: '交付脚本、提示词和制作规格，也可以从批次复盘结果创建下一轮任务。', fields: [link('batchId', '所属实验批次', 'batches', false), link('conceptId', '来源选题', 'concepts'), link('sourcePackageId', '复盘来源发布包', 'packages', false), field('owner', '制作负责人'), field('dueDate', '交付日期', 'date'), field('brief', '脚本 / 制作要求', 'textarea'), field('prompt', '外部生成工具提示词', 'textarea')] },
  assets: { ...modules.assets, label: '内容资产库', group: '内容生产', description: '登记外部制作的图片、短视频与封面，人工初审后进入发布准备。', fields: [link('batchId', '所属实验批次', 'batches', false), link('requestId', '来源制作任务', 'requests'), field('format', '内容形式', 'select', { options: ['图文', '短视频'], required: true }), field('url', '成品文件链接', 'url'), field('ratio', '尺寸比例', 'select', { options: ['3:4', '9:16', '1:1', '4:5', '16:9'] }), field('version', '版本'), field('review', '初审意见', 'textarea')] },
  configs: { label: '账号与发布设置', group: '内容发布', description: '登记平台与账号，作为发布计划的目标。不会自动向平台发布。', states: ['草稿', '可使用', '已归档'], fields: [field('platform', '平台', 'select', { options: ['小红书', '抖音'], required: true }), field('account', '账号名称', 'text', { required: true }), field('audience', '目标受众')] },
  relations: { ...modules.relations, label: '发布计划', group: '内容发布', description: '将已通过审核的内容安排到指定账号，确定发布日期。', fields: [link('batchId', '所属实验批次', 'batches', false), link('assetId', '内容资产', 'assets'), link('configId', '发布账号', 'configs'), field('scheduledDate', '计划发布日期', 'date')] },
  packages: { label: '发布包与记录', group: '内容发布', description: '保存成品与创意标签快照，并登记标题、正文、话题及发布结果。', states: ['待交付', '已交付', '已发布'], fields: [link('batchId', '所属实验批次', 'batches', false), link('relationId', '发布计划', 'relations'), field('owner', '发布负责人'), field('headline', '发布标题'), field('caption', '发布正文', 'textarea'), field('hashtags', '发布话题（与创意标签独立）'), field('postId', '平台内容 ID / 模拟编号'), field('url', '发布链接', 'url'), field('publishedDate', '发布日期', 'date'), field('notes', '发布说明', 'textarea')] },
  notes: { ...modules.notes, label: '复盘与下一轮决策', group: '数据闭环', description: '以一个实验批次为单位汇总数据，调用 AI 分析并形成下一轮执行动作。', states: ['草稿', '待转任务', '已转任务', '已归档'], fields: [link('batchId', '复盘批次', 'batches'), link('packageId', '代表性发布内容', 'packages', false), field('date', '复盘日期', 'date', { required: true }), field('facts', '数据事实', 'textarea', { required: true }), field('interpretation', '初步判断', 'textarea', { required: true }), field('keepElements', '本轮保留项', 'textarea', { required: true }), field('testVariable', '下一轮唯一变量', 'text', { required: true }), field('nextTopic', '下一轮选题方向', 'textarea', { required: true }), field('owner', '下一步负责人'), field('dueDate', '计划完成日期', 'date'), field('actionStatus', '行动状态', 'select', { options: ['待转任务', '已转任务', '暂不行动'], required: true }), link('nextRequestId', '关联下一步制作任务', 'requests', false)] }
};
export const getModules = type => type === 'social' ? socialModules : modules;
export const tagCatalog = {
  '内容形式': ['图文', '短视频', '图片', '视频'],
  '内容主题': ['微缩美食', '奇幻空间', 'AI工具', '生活方式', '知识教程', '品牌故事'],
  '内容结构': ['单场景', '分屏对比', '拼贴网格', '制作过程', '成品揭晓', 'Hook→内容→CTA'],
  '图片画面结构': ['单场景', '分屏', '拼贴网格'],
  '图片构图重心': ['主体居中', '文案主导', 'UI主导', '纵深分层', '对角构图', '前景特写'],
  '核心立意': ['步骤拆解', '前后对比', '奖励展示', '失败 / 成功', '操作指引', '观点表达', '视觉欣赏', '故事叙事'],
  '传播角度': ['美食吸引', '角色吸引', '玩法教学', '场景代入', '目标达成', '好奇', '实用', '情绪共鸣', '反差', '解压'],
  '目标人群': ['AI视觉创作者', '品牌运营', '内容新手', '普通用户'],
  '制作方式': ['实拍', '屏幕录制', 'AI生成', '程序定制', '混剪'],
  '视频行动号召': ['无 CTA', '收藏', '评论', '关注', '立即尝试', '领取奖励'],
  '品牌露出': ['无品牌', '轻 Logo', '强 Logo', '商店徽章'],
  '视觉风格': ['卡通3D', '明快高饱和', '治愈写实', '极简留白', '纪实自然']
};
export const tagCategories = Object.keys(tagCatalog);
export const socialMetricFields = [
  field('views', '阅读 / 播放', 'number', { required: true }),
  field('likes', '点赞', 'number', { required: true }),
  field('saves', '收藏', 'number', { required: true }),
  field('comments', '评论', 'number', { required: true }),
  field('shares', '分享', 'number', { required: true }),
  field('follows', '内容带来的关注', 'number', { required: true })
];
export function summarizeSocial(rows) {
  const totals = Object.fromEntries(socialMetricFields.map(f => [f.key, 0]));
  for (const row of rows) for (const f of socialMetricFields) totals[f.key] += row[f.key];
  const interactions = totals.likes + totals.saves + totals.comments + totals.shares;
  return { ...totals, interactions, count: rows.length, saveRate: totals.views ? totals.saves / totals.views : null, interactionRate: totals.views ? interactions / totals.views : null };
}
