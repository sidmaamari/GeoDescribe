import React, { useEffect, useMemo, useRef, useState } from "react";
// STORAGE: make sure you created src/storage.js from earlier instructions
import { saveSample, listSamples, loadSample, deleteSample } from "./storage";

/**
 * GeoDescribe – Field Rock Logger (all-in-one)
 * - Multi-photo capture (rear camera), gallery with primary/delete
 * - On-device quick colour scan of active photo
 * - Standard geological description fields
 * - Autosave to IndexedDB + Saved drafts modal
 * - pXRF CSV import + summary (Fe, Cu, Zn, Pb, As, Mn)
 * - Export Markdown + JSON
 * Works with Vite + React + Tailwind (v3/v4).
 */

/* ======================= Controlled vocab ======================= */
const ENUMS = {
  category: [
    "Igneous",
    "Sedimentary",
    "Metamorphic",
    "Regolith / Laterite",
    "Gossan / Iron-oxide",
    "Ore / Mineralized",
  ],
  weatheringGrade: ["Fresh", "Slight", "Moderate", "Strong", "Completely"],
  lustre: [
    "Earthy",
    "Dull",
    "Vitreous",
    "Sub-metallic",
    "Metallic",
    "Resinous",
    "Silky",
    "Pearly",
  ],
  fabric: [
    "Massive",
    "Bed/banded",
    "Foliated",
    "Lineated",
    "Vesicular",
    "Amygdaloidal",
    "Brecciated – crackle",
    "Brecciated – mosaic",
    "Brecciated – jigsaw",
  ],
  grainSize: [
    "Aphanitic / cryptocrystalline",
    "Fine (<0.1 mm)",
    "Medium (0.1–1 mm)",
    "Coarse (1–5 mm)",
    "Very coarse (>5 mm)",
    "Clay",
    "Silt",
    "Sand",
    "Granule/pebble",
    "Cobble/boulder",
  ],
  hcl: ["None", "Weak", "Strong"],
  magnetism: ["None", "Weak", "Moderate", "Strong"],
  hardness: ["1","2","3","4","5","6","7","8","9"],
  streak: ["Yellow-brown", "Red-brown", "Black", "White", "Grey", "Green"],
  sg: ["Low", "Moderate", "High", "Very high"],
  alteration: [
    "Silicification",
    "Sericitization",
    "Chloritization",
    "Carbonatization",
    "Hematitization",
    "Goethite/limonite",
    "Mn oxides",
    "Kaolinization",
    "Epidotization",
  ],
  sulfides: [
    "Pyrite",
    "Chalcopyrite",
    "Bornite",
    "Sphalerite",
    "Galena",
    "Pentlandite",
    "Arsenopyrite",
  ],
  minerals: [
    "Quartz",
    "Feldspar",
    "Mica",
    "Chlorite",
    "Carbonate",
    "Amphibole",
    "Pyroxene",
    "Olivine",
    "Hematite",
    "Goethite",
    "Magnetite",
    "Kaolinite",
  ],
  context: ["Outcrop", "Subcrop", "Float", "Trench", "Pit", "Dump", "Core"],
  sampleType: ["Grab", "Chip", "Channel", "Composite", "Other"],
};

/* ======================= Defaults & utils ======================= */
function generateSampleId() {
  const t = new Date();
  return `MDO`;
}

function makeDefaultForm() {
  return {
    project: "",
    sampleId: generateSampleId(),
    date: new Date().toISOString().slice(0, 16), // always now
    lat: "",
    lon: "",
    elevation: "",
    category: "Gossan / Iron-oxide",
    weatheringGrade: "Strong",
    colourFresh: "",
    colourWeathered: "",
    lustre: "Earthy",
    grainSize: "",
    fabric: "Massive",
    hardness: "",
    hcl: "None",
    magnetism: "None",
    streak: "",
    sg: "",
    alteration: [],
    minerals: [],
    sulfides: [],
    fabricNotes: "",
    mineralizationNotes: "",
    structures: "",
    hostUnit: "",
    context: "Outcrop",
    sampleType: "Grab",
    sampleLength_m: "",
    pxrf: "",
    notes: "",
  };
}

const defaultForm = {
  project: "",
  sampleId: generateSampleId(),
  date: new Date().toISOString().slice(0, 16),
  lat: "",
  lon: "",
  elevation: "",
  category: "Gossan / Iron-oxide",
  weatheringGrade: "Strong",
  colourFresh: "",
  colourWeathered: "",
  lustre: "Earthy",
  grainSize: "",
  fabric: "Massive",
  hardness: "",
  hcl: "None",
  magnetism: "None",
  streak: "",
  sg: "",
  alteration: [],
  minerals: [],
  sulfides: [],
  fabricNotes: "",
  mineralizationNotes: "",
  structures: "",
  hostUnit: "",
  context: "Outcrop",
  sampleType: "Grab",
  sampleLength_m: "",
  pxrf: "",
  notes: "",
};

function useGeolocation() {
  const [loc, setLoc] = useState({ lat: "", lon: "" });
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          setLoc({
            lat: pos.coords.latitude.toFixed(6),
            lon: pos.coords.longitude.toFixed(6),
          }),
        () => {}
      );
    }
  }, []);
  return loc;
}

// RGB → HSV (average) + name
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}
function hsvToRockColourName({ h, s, v }) {
  if (v < 0.18) return "very dark / black";
  if (s < 0.12) return v > 0.8 ? "white" : "grey";
  if (h < 20 || h >= 345) return "red";
  if (h < 45) return "orange / ochre";
  if (h < 70) return "yellow";
  if (h < 160) return "green";
  if (h < 250) return "blue";
  if (h < 300) return "purple";
  return "brown";
}
function usePhotoAnalysis(imgSrc) {
  const canvasRef = useRef(null);
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    if (!imgSrc) { setSummary(null); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = canvasRef.current; if (!c) return;
      const ctx = c.getContext("2d");
      const w = 120, h = 120;
      c.width = w; c.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
      r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
      const hsv = rgbToHsv(r, g, b);
      const name = hsvToRockColourName(hsv);
      const ironish = (hsv.h < 70 || hsv.h > 340) && hsv.s > 0.3;
      setSummary({ avgRGB: { r, g, b }, hsv, primaryColourName: name, ironish });
    };
    img.src = imgSrc;
  }, [imgSrc]);
  return { canvasRef, summary };
}
function download(filename, text) {
  const el = document.createElement("a");
  el.href = "data:text/plain;charset=utf-8," + encodeURIComponent(text);
  el.download = filename;
  el.style.display = "none";
  document.body.appendChild(el);
  el.click();
  document.body.removeChild(el);
}
function cryptoRandom() {
  return Math.random().toString(36).slice(2, 9);
}

/* ======================= pXRF CSV utils ======================= */
// simple CSV parser (first row = headers)
function parseCSV(text) {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map(r =>
      r
        .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
        .map(s => s.replace(/^"|"$/g, ""))
    );
  const headers = rows.shift() || [];
  return rows.map(r => Object.fromEntries(headers.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}
function pxrfStats(rows, elems = ["Fe", "Cu", "Zn", "Pb", "As", "Mn"]) {
  const num = v => (v === "" || v == null ? NaN : Number(String(v).replace(/[^0-9.+-eE]/g, "")));
  const byEl = Object.fromEntries(elems.map(e => [e, []]));
  for (const row of rows) {
    for (const e of elems) {
      const v =
        num(row[e]) ??
        num(row[`${e}%`]) ??
        num(row[`${e}_ppm`]) ??
        num(row[`${e}_wt%`]);
      if (!Number.isNaN(v)) byEl[e].push(v);
    }
  }
  const stat = arr => {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const sum = arr.reduce((a, b) => a + b, 0);
    const mean = sum / arr.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    return { n: arr.length, min: sorted[0], median, mean, max: sorted[sorted.length - 1] };
  };
  return Object.fromEntries(Object.entries(byEl).map(([k, v]) => [k, stat(v)]));
}

/* ======================= Small UI helpers ======================= */
function Section({ title, children }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4 md:p-6 mb-4">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      {children}
    </div>
  );
}
function TwoCol({ children }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>;
}
function CheckboxGroup({ options, value, onChange }) {
  function toggle(opt) {
    const set = new Set(value);
    set.has(opt) ? set.delete(opt) : set.add(opt);
    onChange([...set]);
  }
  return (
    <div className="flex flex-wrap">
      {options.map(o => (
        <label key={o} className="mr-3 mb-2 flex items-center gap-2">
          <input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)} />
          <span className="text-sm">{o}</span>
        </label>
      ))}
    </div>
  );
}
function TextInput({ label, ...props }) {
  return (
    <label className="block mb-3">
      <span className="block text-sm font-medium mb-1">{label}</span>
      <input className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring" {...props} />
    </label>
  );
}
function Select({ label, options, value, onChange }) {
  return (
    <label className="block mb-3">
      <span className="block text-sm font-medium mb-1">{label}</span>
      <select
        className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(o => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}
function TextArea({ label, rows = 3, ...props }) {
  return (
    <label className="block mb-3">
      <span className="block text-sm font-medium mb-1">{label}</span>
      <textarea rows={rows} className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring" {...props} />
    </label>
  );
}

/* ======================= Narrative & Export ======================= */
function buildSuggestedText(form, photo) {
  const bits = [];
  const domCol = photo?.summary?.primaryColourName;
  const colourLine = [form.colourWeathered || domCol, form.colourFresh ? `(fresh ${form.colourFresh})` : null]
    .filter(Boolean)
    .join(" ");

  bits.push(`Colour: ${colourLine || "n/a"}; lustre ${form.lustre.toLowerCase()}.`);
  if (form.fabric) bits.push(`Fabric: ${form.fabric.toLowerCase()}.`);
  if (form.grainSize) bits.push(`Grain size: ${form.grainSize.toLowerCase()}.`);

  if (form.alteration?.length) bits.push(`Alteration: ${form.alteration.join(", ")}.`);
  if (form.sulfides?.length) bits.push(`Sulfides: ${form.sulfides.join(", ")}.`);
  if (form.hcl !== "None") bits.push(`HCl reaction ${form.hcl.toLowerCase()}.`);
  if (form.magnetism !== "None") bits.push(`Magnetism ${form.magnetism.toLowerCase()}.`);

  if (photo?.summary?.ironish && /gossan|iron/i.test(form.category)) {
    bits.push("Interpretation: iron-oxide gossan likely (goethite/hematite); check boxwork + Cu-Zn-Pb anomalies via pXRF.");
  }
  return bits.join(" ");
}
function generateMarkdown(form, photo, photosCount, pxrfSummary) {
  const alt = (arr) => (arr && arr.length ? arr.join(", ") : "—");
  const pxrfLine = (pxrfSummary && Object.values(pxrfSummary).some(Boolean))
    ? `- pXRF summary (Fe, Cu, Zn, Pb, As, Mn): ` +
      ["Fe","Cu","Zn","Pb","As","Mn"]
        .map(el => {
          const s = pxrfSummary[el];
          return s ? `${el} mean ${s.mean.toFixed(2)}` : `${el} —`;
        })
        .join("; ") + `\n\n`
    : `\n`;

  return (
    `# Field Rock Description\n\n` +
    `**Project**: ${form.project || "—"}  \n` +
    `**Sample ID**: ${form.sampleId}  \n` +
    `**Date**: ${form.date}  \n` +
    `**Location**: ${form.lat || "—"}, ${form.lon || "—"} (elev ${form.elevation || "—"} m)  \n` +
    `**Category**: ${form.category}  \n` +
    `**Context**: ${form.context}  \n` +
    `**Host unit**: ${form.hostUnit || "—"}\n\n` +
    `## Hand specimen\n` +
    `- Weathering: ${form.weatheringGrade}  \n` +
    `- Colour (fresh/weathered): ${form.colourFresh || "—"} / ${form.colourWeathered || "—"}  \n` +
    `- Lustre: ${form.lustre}  \n` +
    `- Grain size: ${form.grainSize || "—"}  \n` +
    `- Fabric: ${form.fabric}${form.fabricNotes ? ` – ${form.fabricNotes}` : ""}  \n` +
    `- Hardness: ${form.hardness || "—"}  \n` +
    `- Streak: ${form.streak || "—"}  \n` +
    `- Magnetism: ${form.magnetism}  \n` +
    `- HCl reaction: ${form.hcl}  \n` +
    `- SG: ${form.sg || "—"}  \n` +
    `- Minerals: ${alt(form.minerals)}  \n` +
    `- Alteration: ${alt(form.alteration)}  \n` +
    `- Sulfides: ${alt(form.sulfides)}  \n` +
    `- Mineralization notes: ${form.mineralizationNotes || "—"}  \n` +
    `- Structures: ${form.structures || "—"}\n\n` +
    `## Sampling\n` +
    `- Type: ${form.sampleType}  \n` +
    `- Length: ${form.sampleLength_m || "—"} m  \n` +
    `- pXRF: ${form.pxrf || "—"}\n` +
    pxrfLine +
    `## Notes\n${form.notes || "—"}\n\n` +
    (photosCount
      ? `## Photos\nPrimary + ${Math.max(0, photosCount - 1)} more image(s). (Embeds omitted in Markdown export)\n\n`
      : "") +
    (photo?.summary
      ? `> Photo scan: dominant colour **${photo.summary.primaryColourName}**${photo.summary.ironish ? ", iron-oxide likely" : ""}.\n`
      : "")
  );
}

/* ======================= Main App ======================= */
export default function App() {
  // form + location
  const [form, setForm] = useState(makeDefaultForm());
  const { lat, lon } = useGeolocation();

  // photos
  const [photos, setPhotos] = useState([]); // [{id, src}]
  const [activeIdx, setActiveIdx] = useState(0);
  const activeSrc = photos[activeIdx]?.src || null;
  const photo = usePhotoAnalysis(activeSrc);
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const pxrfInputRef = useRef(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");

  // AI text
  const [suggested, setSuggested] = useState("");

  // Saved drafts state
  const [savedList, setSavedList] = useState([]);
  const [savedOpen, setSavedOpen] = useState(false);

  // pXRF
  const [pxrfRows, setPxrfRows] = useState([]);
  const [pxrfSummary, setPxrfSummary] = useState({});

  // set geolocation once
  useEffect(() => {
    if (!form.lat && lat) setForm(f => ({ ...f, lat }));
    if (!form.lon && lon) setForm(f => ({ ...f, lon }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon]);

  // STORAGE: autosave on any change
  useEffect(() => {
    const payload = {
      form,
      photo: photo.summary,
      photos: photos.map(p => p.src),
      pxrf: { rows: pxrfRows, summary: pxrfSummary },
      createdAt: new Date().toISOString(),
    };
    saveSample(payload);
  }, [form, photos, pxrfRows, pxrfSummary, photo.summary]);

  // file handlers
  function onFile(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const readers = files.map(
      file =>
        new Promise(resolve => {
          const fr = new FileReader();
          fr.onload = ev => resolve(String(ev.target?.result));
          fr.readAsDataURL(file);
        })
    );
    Promise.all(readers).then(dataUrls => {
      setPhotos(prev => {
        const next = [...prev, ...dataUrls.map(src => ({ id: cryptoRandom(), src }))];
        if (prev.length === 0) setActiveIdx(0);
        return next;
      });
    });
    e.target.value = "";
  }
  function onPxrfCSV(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = String(ev.target?.result || "");
      const rows = parseCSV(text);
      const stats = pxrfStats(rows);
      setPxrfRows(rows);
      setPxrfSummary(stats);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

    // === AI description request ===
  async function requestAI() {
    try {
      setAiError("");
      setAiBusy(true);
      const res = await fetch("/api/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form,
          photoSummary: photo.summary || null,
          pxrfSummary: pxrfSummary || null,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSuggested(data.text || "");
    } catch (err) {
      setAiError(err?.message || "AI request failed");
    } finally {
      setAiBusy(false);
    }
  }

  // saved drafts helpers
  async function refreshSaved() {
    setSavedList(await listSamples());
  }
  async function loadDraft(id) {
    const s = await loadSample(id);
    if (!s) return;
    setForm(s.form);
    setPhotos((s.photos || []).map(src => ({ id: cryptoRandom(), src })));
    setActiveIdx(0);
    setPxrfRows(s.pxrf?.rows || []);
    setPxrfSummary(s.pxrf?.summary || {});
    setSavedOpen(false);
  }

  // exports / actions
  function exportJSON() {
    const payload = {
      form,
      photo: photo.summary,
      photos: photos.map(p => p.src),
      pxrf: { rows: pxrfRows, summary: pxrfSummary },
      createdAt: new Date().toISOString(),
    };
    download(`${form.sampleId}.json`, JSON.stringify(payload, null, 2));
  }
  function exportMarkdown() {
    const md = generateMarkdown(form, photo, photos.length, pxrfSummary);
    download(`${form.sampleId}.md`, md);
  }
  function resetForm() {
    setForm(makeDefaultForm());
    setPhotos([]);
    setActiveIdx(0);
    setSuggested("");
    setPxrfRows([]);
    setPxrfSummary({});
  }
  function update(k, v) { setForm(f => ({ ...f, [k]: v })); }

  const autoText = useMemo(() => buildSuggestedText(form, photo), [form, photo.summary]);

  async function generateDescription() {
  const res = await fetch("/api/describe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      form,
      photoUrl: photo?.src || null
    }),
  });

  const data = await res.json();
  setDescription(data.description);
}

  return (
  <div className="min-h-screen bg-slate-50 p-4 md:p-8">
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <header className="mb-6 sticky top-0 z-50 bg-slate-50/70 backdrop-blur flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold">GeoDescribe – Field Rock Logger</h1>
        <div className="flex gap-2">
          <button
            className="rounded-xl px-4 py-2 bg-black text-white cursor-pointer hover:bg-gray-800 transition active:scale-95"
            onClick={exportMarkdown}
          >
            Export Markdown
          </button>
          <button
            className="rounded-xl px-4 py-2 border cursor-pointer hover:bg-gray-100 transition active:scale-95"
            onClick={exportJSON}
          >
            Export JSON (share)
          </button>
          <button
            className="rounded-xl px-4 py-2 border cursor-pointer hover:bg-gray-100 transition active:scale-95"
            onClick={resetForm}
          >
            New Sample
          </button>
          <button
            className="rounded-xl px-4 py-2 border cursor-pointer hover:bg-gray-100 transition active:scale-95"
            onClick={() => {
              setSavedOpen(true);
              refreshSaved();
            }}
          >
            Saved
          </button>
        </div>
      </header>

      {/* Sample & Location */}
      <Section title="Sample & Location">
        <TwoCol>
          <TextInput label="Project" value={form.project} onChange={e => update("project", e.target.value)} />
          <TextInput label="Sample ID" value={form.sampleId} onChange={e => update("sampleId", e.target.value)} />
          <TextInput label="Date/time" type="datetime-local" value={form.date} onChange={e => update("date", e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Latitude" value={form.lat} onChange={e => update("lat", e.target.value)} />
            <TextInput label="Longitude" value={form.lon} onChange={e => update("lon", e.target.value)} />
          </div>
          <TextInput label="Elevation (m)" value={form.elevation} onChange={e => update("elevation", e.target.value)} />
          <Select label="Context" options={ENUMS.context} value={form.context} onChange={v => update("context", v)} />
          <TextInput label="Host unit / Formation" value={form.hostUnit} onChange={e => update("hostUnit", e.target.value)} />
          <Select label="Category" options={ENUMS.category} value={form.category} onChange={v => update("category", v)} />
        </TwoCol>
      </Section>

      {/* Photo */}
      <Section title="Photo">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <div>
            {/* Primary actions */}
            <div className="flex gap-3">
              <button
                type="button"
                className="rounded-xl px-4 py-2 border text-sm md:text-base cursor-pointer hover:bg-gray-100 transition active:scale-95"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Choose existing image files"
              >
                📥 Choose File(s)
              </button>
            </div>

            {/* Hidden inputs */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={onFile}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={onFile}
              className="hidden"
            />

            {activeSrc ? (
              <img
                src={activeSrc}
                alt="rock"
                className="mt-3 rounded-2xl w-full max-h-[420px] object-contain border"
              />
            ) : (
              <div className="mt-3 text-sm text-slate-500 border rounded-xl p-3">No photos yet. Add one or more.</div>
            )}

            {photos.length > 0 && (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {photos.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setActiveIdx(i)}
                    className={`relative border rounded-xl p-1 cursor-pointer hover:bg-gray-100 transition active:scale-95 ${i === activeIdx ? "ring-2 ring-black" : ""}`}
                    title={`Photo ${i + 1}`}
                  >
                    <img src={p.src} alt={`thumb-${i}`} className="h-16 w-16 object-cover rounded-lg" />
                  </button>
                ))}
              </div>
            )}

            {photos.length > 0 && (
              <div className="mt-2 flex gap-2">
                <button
                  className="rounded-xl border px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-100 transition active:scale-95"
                  onClick={() => {
                    setPhotos(prev => {
                      if (activeIdx === 0) return prev;
                      const copy = [...prev];
                      const [cur] = copy.splice(activeIdx, 1);
                      copy.unshift(cur);
                      setActiveIdx(0);
                      return copy;
                    });
                  }}
                >
                  Set as primary
                </button>
                <button
                  className="rounded-xl border px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-100 transition active:scale-95"
                  onClick={() => {
                    setPhotos(prev => {
                      if (!prev.length) return prev;
                      const copy = [...prev];
                      copy.splice(activeIdx, 1);
                      const nextIdx = Math.max(0, activeIdx - 1);
                      setActiveIdx(nextIdx);
                      return copy;
                    });
                  }}
                >
                  Delete photo
                </button>
              </div>
            )}
          </div>

          {/* Analyzer panel */}
          <div>
            <p className="text-sm text-slate-600 mb-2">Quick photo scan (on-device):</p>
            {photo.summary ? (
              <div className="rounded-xl border p-3 mb-2 bg-slate-50">
                <div className="flex items-center gap-3">
                  <span
                    className="inline-block w-6 h-6 rounded"
                    style={{
                      background: `rgb(${photo.summary.avgRGB.r},${photo.summary.avgRGB.g},${photo.summary.avgRGB.b})`,
                      border: "1px solid #0002",
                    }}
                  />
                  <div className="text-sm">
                    <div><b>Primary colour:</b> {photo.summary.primaryColourName}</div>
                    <div><b>Iron-oxide hint:</b> {photo.summary.ironish ? "possible" : "not obvious"}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">Select a photo to compute average colour.</div>
            )}
            <canvas ref={photo.canvasRef} className="hidden" />
            <div className="mt-2 flex flex-wrap gap-2">
  <button
    className="rounded-xl border px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 transition active:scale-95 disabled:opacity-60"
    onClick={generateDescription}
    disabled={aiBusy}
    title="Generate a full narrative using the AI endpoint"
  >
    {aiBusy ? "Generating…" : "⚡ Generate AI description"}
  </button>
  <button
    className="rounded-xl border px-3 py-2 text-sm cursor-pointer hover:bg-gray-100 transition active:scale-95"
    onClick={() => setSuggested(buildSuggestedText(form, photo))}
    title="On-device quick draft (no API)"
  >
    ✍️ Quick local draft
  </button>
</div>

{aiError && (
  <div className="mt-2 text-sm text-red-600">{aiError}</div>
)}

{suggested && (
  <div className="mt-3 text-sm bg-amber-50 border rounded-xl p-3 whitespace-pre-wrap">
    {suggested}
  </div>
)}
          </div>
        </div>
      </Section>

      {/* Standard description fields */}
      <Section title="Standard description fields">
        <TwoCol>
          <Select label="Weathering grade" options={ENUMS.weatheringGrade} value={form.weatheringGrade} onChange={v => update("weatheringGrade", v)} />
          <Select label="Hardness (Mohs / scratch test)" options={ENUMS.hardness} value={form.hardness} onChange={(v) => update("hardness", v)} />
          <TextInput label="Colour (fresh)" value={form.colourFresh} onChange={e => update("colourFresh", e.target.value)} />
          <TextInput label="Colour (weathered)" value={form.colourWeathered} onChange={e => update("colourWeathered", e.target.value)} />
          <Select label="Lustre" options={ENUMS.lustre} value={form.lustre} onChange={v => update("lustre", v)} />
          <Select label="Grain size / class" options={ENUMS.grainSize} value={form.grainSize} onChange={v => update("grainSize", v)} />
          <Select label="Fabric" options={ENUMS.fabric} value={form.fabric} onChange={v => update("fabric", v)} />
          <TextInput label="Streak colour" value={form.streak} onChange={e => update("streak", e.target.value)} />
          <Select label="Magnetism" options={ENUMS.magnetism} value={form.magnetism} onChange={v => update("magnetism", v)} />
          <Select label="HCl reaction" options={ENUMS.hcl} value={form.hcl} onChange={v => update("hcl", v)} />
          <TextInput label="Specific gravity (qualitative)" value={form.sg} onChange={e => update("sg", e.target.value)} />
          <TextArea label="Fabric / texture notes" value={form.fabricNotes} onChange={e => update("fabricNotes", e.target.value)} />
        </TwoCol>

        <div className="mt-2">
          <div className="mb-1 text-sm font-medium">Minerals present</div>
          <CheckboxGroup options={ENUMS.minerals} value={form.minerals} onChange={v => update("minerals", v)} />
        </div>

        <div className="mt-2">
          <div className="mb-1 text-sm font-medium">Alteration</div>
          <CheckboxGroup options={ENUMS.alteration} value={form.alteration} onChange={v => update("alteration", v)} />
        </div>

        <div className="mt-2">
          <div className="mb-1 text-sm font-medium">Sulfides observed</div>
          <CheckboxGroup options={ENUMS.sulfides} value={form.sulfides} onChange={v => update("sulfides", v)} />
        </div>

        <TwoCol>
          <TextArea label="Mineralization notes" value={form.mineralizationNotes} onChange={e => update("mineralizationNotes", e.target.value)} />
          <TextArea label="Structures (veins, shear, breccia type, orientations)" value={form.structures} onChange={e => update("structures", e.target.value)} />
        </TwoCol>
      </Section>

      {/* Sampling & extra */}
      <Section title="Sampling & extra">
        <TwoCol>
          <Select label="Sample type" options={ENUMS.sampleType} value={form.sampleType} onChange={v => update("sampleType", v)} />
          <TextInput label="Sample length (m)" value={form.sampleLength_m} onChange={e => update("sampleLength_m", e.target.value)} />
          <TextArea label="pXRF summary (if any)" value={form.pxrf} onChange={e => update("pxrf", e.target.value)} />

          {/* pXRF CSV import */}
          <div className="mb-4">
            <span className="block text-sm font-medium mb-2">Import pXRF Data (CSV)</span>
            <div className="flex gap-3">
              <button
                type="button"
                className="rounded-xl px-4 py-2 border text-sm md:text-base cursor-pointer hover:bg-gray-100 transition active:scale-95"
                onClick={() => pxrfInputRef.current?.click()}
              >
                📊 Import CSV File
              </button>
            </div>

            {/* Hidden input */}
            <input
              ref={pxrfInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onPxrfCSV}
              className="hidden"
            />

            <p className="mt-2 text-xs text-slate-500">
              Upload your pXRF data as a <span className="font-medium">.csv</span> file to automatically generate element summaries.
            </p>
          </div>

          {/* pXRF quick stats */}
          {pxrfRows.length > 0 ? (
            <div className="md:col-span-2 rounded-xl border p-3 bg-slate-50">
              <div className="text-sm mb-2">
                pXRF samples loaded: <b>{pxrfRows.length}</b>
              </div>
              <div className="overflow-x-auto">
                <table className="text-sm w-full">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="pr-4 py-1">Element</th>
                      <th className="pr-4 py-1">n</th>
                      <th className="pr-4 py-1">min</th>
                      <th className="pr-4 py-1">median</th>
                      <th className="pr-4 py-1">mean</th>
                      <th className="pr-4 py-1">max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {["Fe","Cu","Zn","Pb","As","Mn"].map(el => {
                      const s = pxrfSummary[el];
                      return (
                        <tr key={el} className="border-b last:border-0">
                          <td className="pr-4 py-1 font-medium">{el}</td>
                          <td className="pr-4 py-1">{s?.n ?? "—"}</td>
                          <td className="pr-4 py-1">{s ? s.min.toFixed(2) : "—"}</td>
                          <td className="pr-4 py-1">{s ? s.median.toFixed(2) : "—"}</td>
                          <td className="pr-4 py-1">{s ? s.mean.toFixed(2) : "—"}</td>
                          <td className="pr-4 py-1">{s ? s.max.toFixed(2) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </TwoCol>
      </Section>

      {/* Suggested narrative */}
      <Section title="Suggested narrative (auto-generated)">
        <div className="rounded-xl border p-3 bg-slate-50 text-sm whitespace-pre-wrap">
          {autoText || "Fill some fields or add a photo to see a suggestion."}
        </div>
        <div className="mt-2 text-xs text-slate-500">
          This is an on-device suggestion. In production, send the JSON + photo URL to your LLM endpoint
          for a richer geological write-up and sampling advice.
        </div>
      </Section>

      {/* Footer */}
      <footer className="mt-8 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} GeoDescribe prototype. For field use, add offline caching + secure sync
        (Supabase/Postgres with row-level security).
      </footer>

      {/* Saved drafts modal */}
      {savedOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setSavedOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-lg w-full max-w-lg p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Saved drafts</h2>
              <button
                className="text-sm text-slate-600 cursor-pointer hover:text-slate-800 transition active:scale-95"
                onClick={() => setSavedOpen(false)}
              >
                Close
              </button>
            </div>
            {savedList.length === 0 ? (
              <div className="text-sm text-slate-500">No drafts yet.</div>
            ) : (
              <ul className="divide-y">
                {savedList.map((row) => (
                  <li key={row.id} className="py-2 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{row.id}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {row.project} • {row.date} {row.hasPhotos ? "• 📷" : ""}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="rounded-lg border px-2 py-1 text-sm cursor-pointer hover:bg-gray-100 transition active:scale-95"
                        onClick={() => loadDraft(row.id)}
                      >
                        Open
                      </button>
                      <button
                        className="rounded-lg border px-2 py-1 text-sm cursor-pointer hover:bg-red-50 transition active:scale-95"
                        onClick={async () => {
                          await deleteSample(row.id);
                          refreshSaved();
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  </div>
);
}
