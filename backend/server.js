import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDatabase } from './db.js';
import { getModules, socialMetricFields, tagCategories } from '../shared/modules.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const id = () => randomUUID();
function requireValue(ok, message, status = 400) {
  if (!ok) throw Object.assign(new Error(message), { status });
}
function string(value, name, max = 1000) {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `${name}不能为空且不能超过 ${max} 字符`);
  return value.trim();
}
function date(value) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, '日期格式不正确');
  return value;
}
async function body(req) {
  requireValue(req.headers['content-type']?.split(';')[0] === 'application/json', '请求必须为 JSON', 415);
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    requireValue(size <= 256 * 1024, '请求内容过大', 413);
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw Object.assign(new Error('JSON 格式不正确'), { status: 400 }); }
  requireValue(value && typeof value === 'object' && !Array.isArray(value), '请求必须为对象');
  return value;
}

export function createApp(db) {
  const project = value => {
    requireValue(typeof value === 'string' && !!db.prepare('SELECT id FROM projects WHERE id=?').get(value), '项目不存在', 404);
    return value;
  };
  const record = recordId => {
    const row = db.prepare('SELECT * FROM records WHERE id=?').get(recordId);
    requireValue(row, '记录不存在', 404);
    return { ...row, data: JSON.parse(row.data), tags: db.prepare('SELECT tag_id FROM record_tags WHERE record_id=?').all(recordId).map(t => t.tag_id) };
  };
  // ponytail: loads one project's records in memory; add SQL pagination for larger datasets.
  const list = projectId => db.prepare('SELECT id FROM records WHERE project_id=? ORDER BY created_at DESC, rowid DESC').all(projectId).map(r => record(r.id));
  function saveRecord(input, recordId) {
    const old = recordId ? record(recordId) : null;
    const kind = old?.kind || input.kind;
    const projectId = old?.project_id || project(input.projectId);
    const type = db.prepare('SELECT type FROM projects WHERE id=?').get(projectId).type;
    const modules = getModules(type);
    requireValue(Object.hasOwn(modules, kind), '未知模块');
    const definition = modules[kind];
    const title = string(input.title, '标题', 160);
    const status = input.status || definition.states[0];
    requireValue(definition.states.includes(status), '状态不正确');
    requireValue(input.data && typeof input.data === 'object' && !Array.isArray(input.data), '缺少字段数据');
    const data = {};
    for (const f of definition.fields) {
      const value = input.data[f.key];
      if (value === undefined || value === null || value === '') {
        requireValue(!f.required, `请选择${f.label}`);
        continue;
      }
      if (f.type === 'number') {
        requireValue(typeof value === 'number' && Number.isFinite(value) && value >= 0, `${f.label}必须为非负数`);
        data[f.key] = value;
      } else if (f.type === 'multilink') {
        requireValue(Array.isArray(value) && value.length > 0 && value.length <= 30, `${f.label}至少选择一项且不超过 30 项`);
        const links = [...new Set(value)];
        for (const targetId of links) {
          const target = record(targetId);
          requireValue(target.project_id === projectId && target.kind === f.target, `${f.label}关联无效`);
        }
        data[f.key] = links;
      } else {
        data[f.key] = string(value, f.label, f.type === 'textarea' ? 10000 : 2000);
        if (f.type === 'date') date(value);
        if (f.type === 'select') requireValue(f.options.includes(value), `${f.label}选项不正确`);
        if (f.type === 'url') {
          let url; try { url = new URL(value); } catch { requireValue(false, `${f.label}不是有效链接`); }
          requireValue(['https:', 'http:'].includes(url.protocol), '链接仅支持 http / https');
        }
        if (f.type === 'link') {
          const target = record(value);
          requireValue(target.project_id === projectId && target.kind === f.target, `${f.label}关联无效`);
        }
      }
    }
    const batchAware = type === 'social' && kind !== 'batches' && definition.fields.some(f => f.key === 'batchId');
    if (batchAware && !data.batchId) {
      const linkedIds = definition.fields.filter(f => f.type === 'link' || f.type === 'multilink').flatMap(f => f.type === 'multilink' ? (data[f.key] || []) : (data[f.key] ? [data[f.key]] : []));
      const inherited = linkedIds.map(targetId => record(targetId).data.batchId).find(Boolean);
      if (inherited) data.batchId = inherited;
    }
    if (batchAware) {
      requireValue(data.batchId, '请选择所属实验批次');
      const batch = record(data.batchId);
      requireValue(batch.project_id === projectId && batch.kind === 'batches', '所属实验批次无效');
      for (const f of definition.fields.filter(f => f.type === 'link' || f.type === 'multilink')) {
        const ids = f.type === 'multilink' ? (data[f.key] || []) : (data[f.key] ? [data[f.key]] : []);
        for (const targetId of ids) {
          const target = record(targetId);
          if (target.data.batchId) requireValue(target.data.batchId === data.batchId, `${f.label}必须属于同一实验批次`);
        }
      }
    }
    const tags = input.tags ?? [];
    requireValue(Array.isArray(tags) && tags.length <= 40 && tags.every(t => typeof t === 'string'), '标签格式不正确');
    for (const tag of tags) requireValue(db.prepare('SELECT id FROM tags WHERE id=? AND project_id=?').get(tag, projectId), '标签不属于当前项目');
    if (kind === 'requests' && data.sourcePackageId) {
      const source = record(data.sourcePackageId);
      requireValue(source.data.snapshot?.asset?.data.requestId, '来源发布包缺少制作任务');
      requireValue(record(source.data.snapshot.asset.data.requestId).data.conceptId === data.conceptId, '复盘任务应保持原始选题关联');
    }
    if (kind === 'relations') {
      requireValue(record(data.assetId).status === '已通过', '仅可绑定已通过初审的素材');
      requireValue(record(data.configId).status === '可使用', '请选择可使用的账号或配置');
      requireValue(!list(projectId).some(r => r.kind === kind && r.id !== recordId && r.status === '有效' && r.data.assetId === data.assetId && r.data.configId === data.configId && status === '有效'), '有效关联已存在');
    }
    if (kind === 'packages') {
      if (old) {
        requireValue(data.relationId === old.data.relationId, '上线包关联不可更换，请新建上线包');
        data.snapshot = old.data.snapshot;
        if (type === 'social' && db.prepare('SELECT id FROM social_metrics WHERE package_id=?').get(old.id)) {
          requireValue(data.postId === old.data.postId && data.publishedDate === old.data.publishedDate && status === '已发布', '已有表现数据，不能更换发布身份或日期');
        }
      } else {
        const relation = record(data.relationId);
        const asset = record(relation.data.assetId);
        const config = record(relation.data.configId);
        requireValue(relation.status === '有效' && asset.status === '已通过' && config.status === '可使用', '关系、素材或配置不满足交付条件');
        data.snapshot = { asset, config, tags: asset.tags.map(t => db.prepare('SELECT * FROM tags WHERE id=?').get(t)), capturedAt: new Date().toISOString() };
      }
      if (type === 'social') requireValue(status !== '已发布' || (data.postId && data.publishedDate), '已发布记录必须填写内容 ID 和发布日期');
      else requireValue(status !== '已上线' || data.adId, '已上线记录必须填写平台广告 ID');
    }
    const key = old?.id || id();
    db.exec('BEGIN');
    try {
      if (old) db.prepare('UPDATE records SET title=?,status=?,data=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(title, status, JSON.stringify(data), key);
      else db.prepare('INSERT INTO records(id,project_id,kind,title,status,data) VALUES(?,?,?,?,?,?)').run(key, projectId, kind, title, status, JSON.stringify(data));
      db.prepare('DELETE FROM record_tags WHERE record_id=?').run(key);
      for (const tag of new Set(tags)) db.prepare('INSERT INTO record_tags VALUES(?,?)').run(key, tag);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return record(key);
  }
  function analytics(projectId) {
    if (db.prepare('SELECT type FROM projects WHERE id=?').get(projectId).type === 'social') {
      const rows = db.prepare('SELECT * FROM social_metrics WHERE project_id=? ORDER BY observed_date DESC').all(projectId).map(row => {
        const pack = record(row.package_id);
        return { ...row, batchId: pack.data.batchId || null, title: pack.title, platform: pack.data.snapshot.config.data.platform, account: pack.data.snapshot.config.data.account, format: pack.data.snapshot.asset.data.format, tags: pack.data.snapshot.tags };
      });
      return { rows };
    }
    const rows = db.prepare('SELECT * FROM metrics WHERE project_id=? ORDER BY date DESC').all(projectId);
    const sum = items => {
      const result = { spend: 0, impressions: 0, clicks: 0, installs: 0 };
      for (const item of items) for (const key of Object.keys(result)) result[key] += item[key];
      return { ...result, ctr: result.impressions ? result.clicks / result.impressions : null, cpi: result.installs ? result.spend / result.installs : null };
    };
    const groups = new Map();
    for (const row of rows) for (const tag of record(row.package_id).data.snapshot?.tags || []) {
      if (!groups.has(tag.id)) groups.set(tag.id, { tag, rows: [], assets: new Set() });
      const group = groups.get(tag.id);
      group.rows.push(row); group.assets.add(record(row.package_id).data.snapshot.asset.id);
    }
    return { rows, totals: sum(rows), tags: [...groups.values()].map(g => ({ ...g.tag, ...sum(g.rows), assets: g.assets.size })) };
  }
  return createServer(async (req, res) => {
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      // Local-only app: reject foreign hosts and cross-origin writes (including DNS rebinding).
      const host = req.headers.host || '';
      const production = process.env.NODE_ENV === 'production';
      requireValue(production || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host), '无效主机', 403);
      const protocol = String(req.headers['x-forwarded-proto'] || (production ? 'https' : 'http')).split(',')[0].trim();
      if (!['GET', 'HEAD'].includes(req.method)) requireValue(!req.headers.origin || req.headers.origin === `${protocol}://${host}`, '不允许跨站写入', 403);
      const url = new URL(req.url, `http://${host}`);
      const path = url.pathname;
      if (req.method === 'GET' && path === '/api/health') return send(200, { ok: true });
      if (req.method === 'GET' && path === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end('ok');
      }
      if (req.method === 'GET' && path === '/api/projects') return send(200, db.prepare('SELECT * FROM projects ORDER BY created_at, rowid').all());
      if (req.method === 'POST' && path === '/api/projects') {
        const input = await body(req), key = id();
        const type = input.type || 'social';
        requireValue(['ads', 'social'].includes(type), '项目类型不正确');
        requireValue(input.isDemo === undefined || typeof input.isDemo === 'boolean', '演示标记不正确');
        db.prepare('INSERT INTO projects(id,name,type,is_demo) VALUES(?,?,?,?)').run(key, string(input.name, '项目名称', 100), type, input.isDemo ? 1 : 0);
        return send(201, { id: key });
      }
      if (req.method === 'GET' && path === '/api/workspace') {
        const projectId = project(url.searchParams.get('projectId'));
        return send(200, { records: list(projectId), tags: db.prepare('SELECT * FROM tags WHERE project_id=? ORDER BY category,name').all(projectId), analytics: analytics(projectId) });
      }
      if (req.method === 'POST' && path === '/api/tags') {
        const input = await body(req), key = id();
        const projectId = project(input.projectId);
        const category = string(input.category, '标签分类', 50);
        const type = db.prepare('SELECT type FROM projects WHERE id=?').get(projectId).type;
        if (type === 'social') requireValue(tagCategories.includes(category), '标签分类不在字典中');
        db.prepare('INSERT INTO tags(id,project_id,category,name) VALUES(?,?,?,?)').run(key, projectId, category, string(input.name, '标签名称', 50));
        return send(201, { id: key });
      }
      if (req.method === 'DELETE' && path.startsWith('/api/tags/')) {
        const tagId = decodeURIComponent(path.slice('/api/tags/'.length));
        const tag = db.prepare('SELECT id, project_id FROM tags WHERE id=?').get(tagId);
        requireValue(tag, '标签不存在', 404);
        db.exec('BEGIN');
        try {
          db.prepare('DELETE FROM record_tags WHERE tag_id=?').run(tagId);
          db.prepare('DELETE FROM tags WHERE id=?').run(tagId);
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
        return send(200, { id: tagId });
      }
      if (req.method === 'POST' && path === '/api/ai/analyze') {
        const input = await body(req);
        const provider = input.provider;
        requireValue(['openai', 'deepseek'].includes(provider), '分析服务不受支持');
        const apiKey = string(input.apiKey, 'API Key', 300);
        const prompt = string(input.prompt, '分析提示词', 20000);
        const endpoint = provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://api.deepseek.com/chat/completions';
        const model = provider === 'openai' ? 'gpt-4o-mini' : 'deepseek-chat';
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: 'system', content: '你是内容营销与运营复盘顾问。只基于输入数据做判断，明确区分事实、假设和下一步验证建议。' }, { role: 'user', content: prompt }] }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(result.error?.message || 'AI 服务请求失败'), { status: 502 });
        return send(200, { provider, model, text: result.choices?.[0]?.message?.content || 'AI 未返回可读结果' });
      }
      if (req.method === 'POST' && path === '/api/records') return send(201, saveRecord(await body(req)));
      const match = path.match(/^\/api\/records\/([a-f0-9-]+)$/);
      if (req.method === 'PUT' && match) return send(200, saveRecord(await body(req), match[1]));
      if (req.method === 'POST' && path === '/api/metrics') {
        const input = await body(req), projectId = project(input.projectId), pack = record(string(input.packageId, '上线包'));
        const projectRow = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId);
        if (projectRow.type === 'social') {
          requireValue(pack.kind === 'packages' && pack.project_id === projectId && pack.status === '已发布', '请选择当前项目已发布的内容');
          const observed = date(input.date);
          requireValue(Date.parse(observed) >= Date.parse(pack.data.publishedDate) + 72 * 3600000, '采集日期须至少晚于发布日期 3 天');
          requireValue(input.windowHours === 72, '当前仅接收发布后 72 小时累计值');
          requireValue(input.source === (projectRow.is_demo ? 'simulated' : 'manual'), '模拟与真实项目的数据来源不可混用');
          const values = socialMetricFields.map(f => {
            const value = input[f.key];
            requireValue(Number.isSafeInteger(value) && value >= 0, `${f.label}必须是非负整数`);
            return value;
          });
          requireValue(values[0] > 0 || values.every(v => v === 0), '阅读 / 播放为零时不能存在互动');
          db.prepare('INSERT INTO social_metrics VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id(), projectId, pack.id, observed, 72, ...values, input.source);
          return send(201, { ok: true });
        }
        requireValue(pack.kind === 'packages' && pack.project_id === projectId && pack.status === '已上线', '请选择当前项目已上线的交付包');
        const values = ['spend', 'impressions', 'clicks', 'installs'].map(key => {
          const value = input[key];
          requireValue(typeof value === 'number' && Number.isFinite(value) && value >= 0 && (key === 'spend' || Number.isSafeInteger(value)), `${key}必须为有效非负数，次数必须为整数`);
          return value;
        });
        db.prepare('INSERT INTO metrics VALUES(?,?,?,?,?,?,?,?)').run(id(), projectId, pack.id, date(input.date), ...values);
        return send(201, { ok: true });
      }
      if (path.startsWith('/api/')) return send(404, { error: '接口不存在' });
      const files = {
        '/': ['frontend/landing.html', 'text/html'],
        '/landing.css': ['frontend/landing.css', 'text/css'],
        '/workbench-preview.png': ['frontend/workbench-preview.png', 'image/png'],
        '/app': ['frontend/index.html', 'text/html'],
        '/app.js': ['frontend/app.js', 'text/javascript'],
        '/style.css': ['frontend/style.css', 'text/css'],
        '/shared/modules.js': ['shared/modules.js', 'text/javascript']
      };
      requireValue(req.method === 'GET' && Object.hasOwn(files, path), '页面不存在', 404);
      const [file, type] = files[path];
      res.writeHead(200, { 'Content-Type': type.startsWith('image/') ? type : `${type}; charset=utf-8`, 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'", 'X-Content-Type-Options': 'nosniff' });
      res.end(await readFile(resolve(root, file)));
    } catch (error) {
      if (error.code?.startsWith('ERR_SQLITE') && /UNIQUE/.test(error.message)) return send(409, { error: '记录已存在，请勿重复提交。内容表现每个发布包仅保留一份 72 小时累计值。' });
      if (!error.status) console.error(error);
      send(error.status || 500, { error: error.status ? error.message : '服务暂时异常，请重试' });
    }
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = openDatabase();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  const server = createApp(db).listen(port, host, async () => {
    console.log(`Creative Workbench: http://${host}:${port}`);
    if (process.env.SEED_DEMO === 'true') {
      try {
        const { seedSocial } = await import('./seed-social.js');
        await seedSocial(`http://127.0.0.1:${port}`);
        console.log('Demo workspace ready');
      } catch (error) {
        console.error('Demo seed failed', error);
        server.close(() => { db.close(); process.exit(1); });
      }
    }
  });
  const stop = () => server.close(() => { db.close(); process.exit(0); });
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
