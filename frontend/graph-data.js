export const categories = [
  { id: 'inspiration', name: '灵感素材', en: 'Inspiration', kinds: ['competitors'], color: '#bbc5e6', create: 'competitors', description: '值得留下的每一个灵感' },
  { id: 'concepts', name: '选题实验', en: 'Experiments', kinds: ['concepts'], color: '#d9c99d', create: 'concepts', description: '把好奇变成可验证的假设' },
  { id: 'production', name: '内容生产', en: 'Production', kinds: ['requests', 'assets'], color: '#9dcac6', create: 'requests', description: '从一个想法，到一件作品' },
  { id: 'works', name: '发布作品', en: 'Published works', kinds: ['packages'], color: '#c2b5e0', create: 'packages', description: '让作品与它的反馈相遇' },
  { id: 'review', name: '复盘决策', en: 'Reflection', kinds: ['notes'], color: '#d5b8a5', create: 'notes', description: '让每一次尝试，成为下一次的依据' }
];
export const relationFields = ['referenceId', 'referenceIds', 'conceptId', 'requestId', 'assetId', 'configId', 'relationId', 'packageId', 'sourcePackageId', 'nextRequestId'];
export function graphData(state) {
  const all = state.records || [];
  const records = all.filter(r => r.kind !== 'batches' && r.kind !== 'configs' && (!state.batchId || r.data.batchId === state.batchId));
  const ids = new Set(records.map(r => r.id));
  const edges = [];
  for (const r of records) for (const field of relationFields) {
    const value = r.data[field];
    for (const source of Array.isArray(value) ? value : value ? [value] : []) {
      if (ids.has(source) && !edges.some(e => e.source === source && e.target === r.id)) edges.push({ source, target: r.id });
    }
  }
  const rows = (state.analytics?.rows || []).filter(r => !state.batchId || r.batchId === state.batchId);
  return { records, edges, rows, categories: categories.map(c => ({ ...c, records: records.filter(r => c.kinds.includes(r.kind)) })) };
}
export function neighbors(id, records) {
  const current = records.find(r => r.id === id);
  if (!current) return [];
  const refs = r => relationFields.flatMap(k => Array.isArray(r.data[k]) ? r.data[k] : r.data[k] ? [r.data[k]] : []);
  const linked = new Set(refs(current));
  return records.filter(r => r.id !== id && (linked.has(r.id) || refs(r).includes(id)));
}
