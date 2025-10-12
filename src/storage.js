import { get, set, del, keys } from 'idb-keyval';

// Namespaced keys for different log types
const outcropKey = (id) => `outcrop:${id}`;
const boreholeKey = (id) => `borehole:${id}`;

// ---------------- Outcrop (sample) ----------------
export async function saveOutcropLog(payload) {
  const id = payload?.form?.sampleId;
  if (!id) throw new Error('Missing sampleId');
  await set(outcropKey(id), { ...payload, kind: 'outcrop' });
}

export async function loadOutcropLog(id) {
  return get(outcropKey(id));
}

export async function deleteOutcropLog(id) {
  return del(outcropKey(id));
}

export async function listOutcropLogs() {
  const allKeys = await keys();
  const ids = allKeys
    .filter((k) => String(k).startsWith('outcrop:'))
    .map((k) => String(k).split(':')[1]);
  return Promise.all(
    ids.map(async (id) => {
      const s = await get(outcropKey(id));
      return {
        id,
        kind: 'outcrop',
        title: s?.form?.sampleId || id,
        project: s?.form?.project || '—',
        date: s?.form?.date,
        hasPhotos: (s?.photos || []).length > 0,
      };
    })
  );
}

// ---------------- Borehole ----------------
// Borehole model: { holeId, project, collar: {lat,lon,elev,azimuth,dip}, intervals: [{from,to,unit,description,notes}], photos: string[] }
export async function saveBoreholeLog(bh) {
  const id = bh?.holeId;
  if (!id) throw new Error('Missing holeId');
  await set(boreholeKey(id), { ...bh, kind: 'borehole' });
}

export async function loadBoreholeLog(id) {
  return get(boreholeKey(id));
}

export async function deleteBoreholeLog(id) {
  return del(boreholeKey(id));
}

export async function listBoreholeLogs() {
  const allKeys = await keys();
  const ids = allKeys
    .filter((k) => String(k).startsWith('borehole:'))
    .map((k) => String(k).split(':')[1]);
  return Promise.all(
    ids.map(async (id) => {
      const s = await get(boreholeKey(id));
      return {
        id,
        kind: 'borehole',
        title: s?.holeId || id,
        project: s?.project || '—',
        date: s?.createdAt,
        intervalCount: Array.isArray(s?.intervals) ? s.intervals.length : 0,
      };
    })
  );
}

// ---------------- Utilities ----------------
export async function exportBoreholeCSV(bh) {
  const rows = [
    ['From_m', 'To_m', 'Unit', 'Description', 'Notes'],
    ...(bh?.intervals || []).map((iv) => [
      iv.from ?? '',
      iv.to ?? '',
      iv.unit ?? '',
      (iv.description || '').replaceAll('\n', ' '),
      (iv.notes || '').replaceAll('\n', ' '),
    ]),
  ];
  const csv = rows.map((r) => r.map((c) => String(c).includes(',') ? `"${String(c).replaceAll('"', '""')}"` : String(c)).join(',')).join('\n');
  return new Blob([csv], { type: 'text/csv' });
}
