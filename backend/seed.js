import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openDatabase } from './db.js';
import { createApp } from './server.js';

// Explicit opt-in sample data; never run automatically on application startup.
export async function seed(base) {
  const request = async (path, data) => {
    const res = await fetch(`${base}/api${path}`, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
    const result = await res.json();
    if (!res.ok) throw new Error(result.error);
    return result;
  };
  const name = 'BBQ 创意测试 · 演示数据';
  if ((await request('/projects')).some(p => p.name === name)) return null;
  const project = await request('/projects', { name, type: 'ads', isDemo: true });
  const projectId = project.id;
  const tags = [];
  for (const [category, name] of [['创意侧重', '策略'], ['开场钩子', '订单压力'], ['玩法类型', '困难关']]) tags.push((await request('/tags', { projectId, category, name })).id);
  const add = (kind, title, status, data, selected = tags) => request('/records', { projectId, kind, title, status, data, tags: selected });
  const reference = await add('competitors', '订单堆积：限时出餐参考', '已拆解', { game: '示例竞品', notes: '演示记录，不代表真实竞品效果。通过订单压力和倒计时建立紧张感。' });
  const concept = await add('concepts', '困难关 × 订单压力：策略解题方向', '已批准', { referenceId: reference.id, hypothesis: '展示先后顺序与解题过程，测试是否改善安装效率。', variable: '首三秒钩子' });
  const production = await add('requests', '首三秒订单压力 · 竖版视频', '制作中', { conceptId: concept.id, owner: '制作同事', brief: '9:16，15 秒。前 3 秒展示待处理订单，中段展示解题，末段落到真实玩法。' });
  const asset = await add('assets', '订单压力 A · 9:16 · v1', '已通过', { requestId: production.id, ratio: '9:16', version: 'v1', review: '演示：已通过内容初审，文件链接待补。' });
  const config = await add('configs', 'Meta 美国 · 安装优化测试', '可使用', { platform: 'Meta', country: 'US', audience: '18–65', event: 'Install', budget: 50 }, []);
  const relation = await add('relations', '订单压力 A × 美国安装测试', '有效', { assetId: asset.id, configId: config.id }, []);
  const pack = await add('packages', '订单压力 A · 第一轮上线包', '已上线', { relationId: relation.id, owner: 'Leader', adId: 'demo-ad-001', notes: '演示数据，未向广告平台提交。' }, []);
  await add('notes', '第一轮测试观察', '进行中', { packageId: pack.id, date: '2026-09-21', notes: '数据仅用于展示统计链路。需增加可比样本后再决定是否放大生产。' }, []);
  await request('/metrics', { projectId, packageId: pack.id, date: '2026-09-21', spend: 41.88, impressions: 1940, clicks: 58, installs: 5 });
  return { projectId, tags, reference, concept, production, asset, config, relation, pack };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = openDatabase();
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { console.log(await seed(`http://127.0.0.1:${server.address().port}`) ? '演示项目已创建。' : '演示项目已存在，未重复写入。'); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); }
}
