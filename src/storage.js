import { get, set, del, keys } from 'idb-keyval';

const key = (id) => `sample:${id}`;

export async function saveSample(payload) {
  await set(key(payload.form.sampleId), payload);
}
export async function loadSample(id) {
  return get(key(id));
}
export async function deleteSample(id) {
  return del(key(id));
}
export async function listSamples() {
  const ks = await keys();
  const ids = ks.filter(k => String(k).startsWith('sample:')).map(k => String(k).split(':')[1]);
  return Promise.all(ids.map(async (id) => {
    const s = await get(key(id));
    return { id, project: s.form.project || '—', date: s.form.date, hasPhotos: (s.photos||[]).length>0 };
  }));
}
