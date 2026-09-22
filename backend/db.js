import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tagCatalog } from '../shared/modules.js';

export function openDatabase(path = process.env.DB_PATH || resolve('data/creative.db')) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      category TEXT NOT NULL, name TEXT NOT NULL, UNIQUE(project_id, category, name)
    );
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      kind TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS records_project_kind ON records(project_id, kind);
    CREATE TABLE IF NOT EXISTS record_tags (
      record_id TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id), PRIMARY KEY(record_id, tag_id)
    );
    CREATE TABLE IF NOT EXISTS metrics (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      package_id TEXT NOT NULL REFERENCES records(id), date TEXT NOT NULL,
      spend REAL NOT NULL CHECK(spend >= 0), impressions INTEGER NOT NULL CHECK(impressions >= 0),
      clicks INTEGER NOT NULL CHECK(clicks >= 0), installs INTEGER NOT NULL CHECK(installs >= 0),
      UNIQUE(package_id, date)
    );
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY, value TEXT NOT NULL
    );
  `);
  const columns = db.prepare('PRAGMA table_info(projects)').all().map(c => c.name);
  if (!columns.includes('type')) db.exec("ALTER TABLE projects ADD COLUMN type TEXT NOT NULL DEFAULT 'ads'");
  if (!columns.includes('is_demo')) db.exec('ALTER TABLE projects ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0');
  db.exec(`CREATE TABLE IF NOT EXISTS social_metrics (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
    package_id TEXT NOT NULL UNIQUE REFERENCES records(id),
    observed_date TEXT NOT NULL, window_hours INTEGER NOT NULL CHECK(window_hours = 72),
    views INTEGER NOT NULL CHECK(views >= 0), likes INTEGER NOT NULL CHECK(likes >= 0),
    saves INTEGER NOT NULL CHECK(saves >= 0), comments INTEGER NOT NULL CHECK(comments >= 0),
    shares INTEGER NOT NULL CHECK(shares >= 0), follows INTEGER NOT NULL CHECK(follows >= 0),
    source TEXT NOT NULL CHECK(source IN ('simulated','manual'))
  )`);

  // Remove the obsolete ad/BBQ workspace and normalize the social demo once.
  if (path !== ':memory:' && !db.prepare('SELECT 1 FROM app_meta WHERE key=?').get('social-v2')) {
    db.exec('BEGIN');
    try {
      const adProjects = db.prepare("SELECT id FROM projects WHERE type='ads'").all();
      for (const { id } of adProjects) {
        db.prepare('DELETE FROM metrics WHERE project_id=?').run(id);
        const records = db.prepare('SELECT id FROM records WHERE project_id=?').all(id);
        for (const row of records) db.prepare('DELETE FROM record_tags WHERE record_id=?').run(row.id);
        db.prepare('DELETE FROM records WHERE project_id=?').run(id);
        db.prepare('DELETE FROM tags WHERE project_id=?').run(id);
        db.prepare('DELETE FROM projects WHERE id=?').run(id);
      }
      db.prepare("UPDATE tags SET category='视觉风格' WHERE category='表现风格'").run();
      db.prepare("UPDATE tags SET category='内容结构' WHERE category='叙事方式'").run();
      db.prepare("UPDATE tags SET category='核心立意' WHERE category='内容价值'").run();

      const socialProjects = db.prepare("SELECT id FROM projects WHERE type='social'").all();
      for (const { id } of socialProjects) {
        const refs = db.prepare("SELECT id, title, data, created_at FROM records WHERE project_id=? AND kind='competitors'").all(id);
        for (const row of refs) {
          const data = JSON.parse(row.data);
          const inferredFormat = data.contentFormat || (row.title.includes('图文') ? '图文' : '短视频');
          Object.assign(data, {
            platform: data.platform || '小红书',
            creator: data.creator || '待补充账号',
            contentFormat: inferredFormat,
            url: data.url || 'https://example.com/inspiration',
            collectedAt: data.collectedAt || row.created_at.slice(0, 10),
            contentStructure: data.contentStructure || data.notes || '待补充内容结构',
            coreIdea: data.coreIdea || data.notes || '待补充核心立意',
            targetAudience: data.targetAudience || 'AI视觉创作者',
            hook: data.hook || ''
          });
          db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify(data), row.id);
        }
        const reference = db.prepare("SELECT id FROM records WHERE project_id=? AND kind='competitors' ORDER BY created_at, rowid LIMIT 1").get(id)?.id;
        if (reference) {
          const concepts = db.prepare("SELECT id, data FROM records WHERE project_id=? AND kind='concepts'").all(id);
          for (const row of concepts) {
            const data = JSON.parse(row.data);
            if (!data.referenceId) data.referenceId = reference;
            data.expectedValue ||= '收藏 / 实用';
            data.testNotes ||= '';
            db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify(data), row.id);
          }
        }
        for (const [category, names] of Object.entries(tagCatalog)) {
          for (const name of names) db.prepare('INSERT OR IGNORE INTO tags(id,project_id,category,name) VALUES(lower(hex(randomblob(16))),?,?,?)').run(id, category, name);
        }
      }
      db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run('social-v2', new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  if (path !== ':memory:' && !db.prepare('SELECT 1 FROM app_meta WHERE key=?').get('social-v4')) {
    const categoryMap = { '内容题材': '内容主题', '表现风格': '视觉风格', '叙事方式': '内容结构', '内容价值': '核心立意' };
    db.exec('BEGIN');
    try {
      const legacyTopics = db.prepare("SELECT id, project_id, name FROM tags WHERE category='内容题材'").all();
      for (const oldTag of legacyTopics) {
        const current = db.prepare("SELECT id FROM tags WHERE project_id=? AND category='内容主题' AND name=?").get(oldTag.project_id, oldTag.name);
        if (!current) db.prepare("UPDATE tags SET category='内容主题' WHERE id=?").run(oldTag.id);
        else {
          db.prepare('DELETE FROM record_tags WHERE tag_id=? AND record_id IN (SELECT record_id FROM record_tags WHERE tag_id=?)').run(oldTag.id, current.id);
          db.prepare('UPDATE record_tags SET tag_id=? WHERE tag_id=?').run(current.id, oldTag.id);
          db.prepare('DELETE FROM tags WHERE id=?').run(oldTag.id);
        }
      }
      const packages = db.prepare("SELECT id, data FROM records WHERE kind='packages'").all();
      for (const row of packages) {
        const data = JSON.parse(row.data);
        if (data.snapshot?.tags) for (const tag of data.snapshot.tags) tag.category = categoryMap[tag.category] || tag.category;
        if (data.snapshot) db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify(data), row.id);
      }
      db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run('social-v4', new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  if (path !== ':memory:' && !db.prepare('SELECT 1 FROM app_meta WHERE key=?').get('social-v5')) {
    db.exec('BEGIN');
    try {
      const projects = db.prepare("SELECT id FROM projects WHERE type='social'").all();
      for (const { id } of projects) {
        const fallback = db.prepare("SELECT id FROM records WHERE project_id=? AND kind='competitors' ORDER BY created_at, rowid LIMIT 1").get(id)?.id;
        const concepts = db.prepare("SELECT id, data FROM records WHERE project_id=? AND kind='concepts'").all(id);
        for (const row of concepts) {
          const data = JSON.parse(row.data);
          data.referenceIds = Array.isArray(data.referenceIds) && data.referenceIds.length ? [...new Set(data.referenceIds)] : (data.referenceId ? [data.referenceId] : (fallback ? [fallback] : []));
          delete data.referenceId;
          db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify(data), row.id);
        }
      }
      db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run('social-v5', new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  if (path !== ':memory:' && !db.prepare('SELECT 1 FROM app_meta WHERE key=?').get('social-v6')) {
    db.exec('BEGIN');
    try {
      const notes = db.prepare("SELECT id, data FROM records WHERE kind='notes'").all();
      for (const row of notes) {
        const data = JSON.parse(row.data);
        data.facts ||= data.notes || '待补充数据事实';
        data.interpretation ||= '待补充判断';
        data.keepElements ||= '待补充本轮保留项';
        data.testVariable ||= '待定义下一轮唯一变量';
        data.nextTopic ||= '待补充下一轮选题方向';
        data.actionStatus ||= '待转任务';
        delete data.notes;
        db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify(data), row.id);
      }
      db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run('social-v6', new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  if (path !== ':memory:' && !db.prepare('SELECT 1 FROM app_meta WHERE key=?').get('social-v7')) {
    db.exec('BEGIN');
    try {
      db.prepare("UPDATE records SET status='待转任务' WHERE kind='notes' AND status='已完成'").run();
      db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run('social-v7', new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  if (path !== ':memory:' && !db.prepare('SELECT 1 FROM app_meta WHERE key=?').get('social-v8')) {
    db.exec('BEGIN');
    try {
      const projects = db.prepare("SELECT id FROM projects WHERE type='social'").all();
      for (const { id: projectId } of projects) {
        let batches = db.prepare("SELECT id FROM records WHERE project_id=? AND kind='batches' ORDER BY created_at, rowid").all(projectId).map(row => row.id);
        if (!batches.length) {
          db.prepare("INSERT INTO records(id,project_id,kind,title,status,data) VALUES(lower(hex(randomblob(16))),?,'batches','1批次','进行中',?)").run(projectId, JSON.stringify({ hypothesis: '第一批内容结构与创意标签基线', owner: '内容负责人（模拟）', startDate: '2026-09-18' }));
          db.prepare("INSERT INTO records(id,project_id,kind,title,status,data) VALUES(lower(hex(randomblob(16))),?,'batches','2批次','规划中',?)").run(projectId, JSON.stringify({ hypothesis: '在保持主题与账号稳定时验证单一封面变量', owner: '内容负责人（模拟）', startDate: '2026-09-22' }));
          batches = db.prepare("SELECT id FROM records WHERE project_id=? AND kind='batches' ORDER BY created_at, rowid").all(projectId).map(row => row.id);
        } else if (batches.length === 1) {
          db.prepare("INSERT INTO records(id,project_id,kind,title,status,data) VALUES(lower(hex(randomblob(16))),?,'batches','2批次','规划中',?)").run(projectId, JSON.stringify({ hypothesis: '待补充第二批实验假设', owner: '', startDate: new Date().toISOString().slice(0, 10) }));
          batches.push(db.prepare("SELECT id FROM records WHERE project_id=? AND kind='batches' ORDER BY created_at DESC, rowid DESC LIMIT 1").get(projectId).id);
        }
        const [firstBatch, secondBatch] = batches;
        const rows = db.prepare("SELECT id, title, data FROM records WHERE project_id=? AND kind<>'batches'").all(projectId);
        for (const row of rows) {
          const data = JSON.parse(row.data);
          if (!data.batchId) {
            data.batchId = /第二轮|待制作/.test(row.title) ? secondBatch : firstBatch;
            db.prepare('UPDATE records SET data=? WHERE id=?').run(JSON.stringify(data), row.id);
          }
        }
      }
      db.prepare('INSERT INTO app_meta(key,value) VALUES(?,?)').run('social-v8', new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return db;
}
