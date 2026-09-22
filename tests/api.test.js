import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../backend/db.js';
import { createApp } from '../backend/server.js';
import { seed } from '../backend/seed.js';
import { seedSocial } from '../backend/seed-social.js';
import { summarizeSocial } from '../shared/modules.js';

test('HTTP workflow, validation, snapshot stability, analytics and persistence', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'creative-test-'));
  const db = openDatabase(join(dir, 'test.db'));
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, data, method = 'POST') => {
    const response = await fetch(`${base}/api${path}`, data ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
    return { status: response.status, value: await response.json() };
  };
  try {
    const sample = await seed(base);
    assert.ok(sample.projectId);
    assert.equal(await seed(base), null);
    const workspace = () => call(`/workspace?projectId=${sample.projectId}`);
    let data = (await workspace()).value;
    assert.equal(data.records.length, 8);
    assert.equal(data.analytics.totals.cpi, 41.88 / 5);
    assert.equal(data.analytics.tags.length, 3);
    assert.equal(data.analytics.totals.ctr, 58 / 1940);
    const invalid = await call('/records', { projectId: sample.projectId, kind: 'assets', title: '坏关联', data: { requestId: sample.concept.id } });
    assert.equal(invalid.status, 400);
    const another = (await call('/projects', { name: '隔离项目', type: 'ads' })).value;
    assert.equal((await call('/records', { projectId: another.id, kind: 'requests', title: '跨项目引用', data: { conceptId: sample.concept.id } })).status, 400);
    assert.equal((await call('/records', { projectId: sample.projectId, kind: 'competitors', title: '危险链接', data: { url: 'javascript:alert(1)' } })).status, 400);
    const asset = sample.asset;
    assert.equal((await call(`/records/${asset.id}`, { title: asset.title, status: '需修改', data: asset.data, tags: [] }, 'PUT')).status, 200);
    assert.equal((await call('/records', { projectId: sample.projectId, kind: 'relations', title: '未审核关联', data: { assetId: asset.id, configId: sample.config.id } })).status, 400);
    data = (await workspace()).value;
    assert.equal(data.analytics.tags.length, 3, 'historic tags survive changes to asset tags');
    assert.equal(data.records.find(r => r.id === sample.pack.id).data.snapshot.asset.status, '已通过');
    const metric = { projectId: sample.projectId, packageId: sample.pack.id, date: '2026-09-21', spend: 1, impressions: 1, clicks: 0, installs: 0 };
    assert.equal((await call('/metrics', metric)).status, 409);
    assert.equal((await call('/metrics', { ...metric, date: '2026-02-30' })).status, 400);
    assert.equal((await call('/metrics', { ...metric, date: '2026-09-22', clicks: -1 })).status, 400);
    assert.equal((await call('/metrics', { ...metric, date: '2026-09-22', clicks: .5 })).status, 400);
    const attack = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://other.example' }, body: JSON.stringify({ name: 'blocked' }) });
    assert.equal(attack.status, 403);
    assert.equal((await fetch(`${base}/backend/db.js`)).status, 404);
    assert.equal((await fetch(`${base}/`)).status, 200);
    const empty = (await call(`/workspace?projectId=${another.id}`)).value;
    assert.equal(empty.analytics.totals.cpi, null);
    assert.equal(empty.records.length, 0);
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close();
    const reopened = openDatabase(join(dir, 'test.db'));
    try { assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM records').get().n, 8); }
    finally { reopened.close(); rmSync(dir, { recursive: true }); }
  }
});

test('social demo keeps ad data, compares 72-hour snapshots and feeds production', async () => {
  const db = openDatabase(':memory:');
  const server = createApp(db).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, data, method = 'POST') => {
    const response = await fetch(`${base}/api${path}`, data ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
    return { status: response.status, value: await response.json() };
  };
  try {
    const old = await seed(base);
    const sample = await seedSocial(base);
    assert.equal((await seedSocial(base)).existing, true);
    let workspace = (await call(`/workspace?projectId=${sample.projectId}`)).value;
    assert.equal(workspace.analytics.rows.length, 8);
    assert.equal(workspace.records.filter(r => r.kind === 'packages').length, 8);
    assert.deepEqual(workspace.records.filter(r => r.kind === 'batches').map(r => r.title).sort(), ['1批次', '2批次']);
    assert.equal(new Set(workspace.analytics.rows.map(r => r.batchId)).size, 2);
    const all = summarizeSocial(workspace.analytics.rows);
    assert.equal(all.views, 64800);
    assert.equal(all.saves, 2364);
    assert.equal(all.saveRate, 2364 / 64800);
    assert.equal(summarizeSocial(workspace.analytics.rows.filter(r => r.format === '图文')).count, 4);
    assert.equal(summarizeSocial([]).saveRate, null);
    assert.equal((await call(`/workspace?projectId=${old.projectId}`)).value.analytics.totals.spend, 41.88);
    const pack = workspace.records.find(r => r.id === sample.packs[0].id);
    const asset = workspace.records.find(r => r.id === pack.data.snapshot.asset.id);
    const source = workspace.records.find(r => r.id === asset.data.requestId);
    const task = await call('/records', { projectId: sample.projectId, kind: 'requests', title: '下一轮封面实验', status: '待制作', tags: asset.tags, data: { sourcePackageId: pack.id, conceptId: source.data.conceptId, brief: '保持内页不变，只改变封面信息量。' } });
    assert.equal(task.status, 201);
    assert.equal(task.value.data.sourcePackageId, pack.id);
    assert.equal((await call(`/records/${asset.id}`, { title: asset.title, status: asset.status, tags: [], data: asset.data }, 'PUT')).status, 200);
    workspace = (await call(`/workspace?projectId=${sample.projectId}`)).value;
    assert.equal(workspace.analytics.rows.find(r => r.package_id === pack.id).tags.length, 4);
    const metric = { projectId: sample.projectId, packageId: pack.id, date: '2026-09-21', source: 'simulated', windowHours: 72, views: 10, likes: 1, saves: 1, comments: 0, shares: 0, follows: 0 };
    assert.equal((await call('/metrics', metric)).status, 409);
    assert.equal((await call('/metrics', { ...metric, date: '2026-09-19' })).status, 400);
    assert.equal((await call('/metrics', { ...metric, source: 'manual' })).status, 400);
    assert.equal((await call('/metrics', { ...metric, likes: -1 })).status, 400);
    assert.equal((await call('/metrics', { ...metric, windowHours: 24 })).status, 400);
    assert.equal((await call(`/records/${pack.id}`, { title: pack.title, status: pack.status, tags: [], data: { ...pack.data, postId: 'different-content' } }, 'PUT')).status, 400);
    const changedConcept = workspace.records.find(r => r.kind === 'concepts' && r.id !== source.data.conceptId);
    assert.equal((await call('/records', { projectId: sample.projectId, kind: 'requests', title: '错误来源', data: { sourcePackageId: pack.id, conceptId: changedConcept.id } })).status, 400);
    const live = (await call('/projects', { name: '未来真实内容项目' })).value;
    assert.equal((await call('/projects')).value.find(p => p.id === live.id).type, 'social');
    assert.equal((await call('/projects')).value.find(p => p.id === live.id).is_demo, 0);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); }
});
