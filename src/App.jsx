// src/App.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  saveOutcropLog,
  listOutcropLogs,
  deleteOutcropLog,
  loadOutcropLog,
  saveBoreholeLog,
  listBoreholeLogs,
  deleteBoreholeLog,
  loadBoreholeLog,
  exportBoreholeCSV,
} from "./storage";

// ---------------- Small UI helpers ----------------
function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold mb-3">{title}</h2>
      <div className="rounded-2xl border bg-white p-4">{children}</div>
    </section>
  );
}
function TwoCol({ children }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>;
}
function TextInput({ label, ...props }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1">{label}</span>
      <input
        className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-black/30"
        {...props}
      />
    </label>
  );
}
function TextArea({ label, ...props }) {
  return (
    <label className="block md:col-span-2">
      <span className="block text-sm font-medium mb-1">{label}</span>
      <textarea
        rows={4}
        className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-black/30"
        {...props}
      />
    </label>
  );
}
function Select({ label, options, value, onChange }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1">{label}</span>
      <select
        className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-black/30 cursor-pointer"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>
          Select…
        </option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}
function CheckboxGroup({ options, value = [], onChange }) {
  function toggle(v) {
    const set = new Set(value);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    onChange(Array.from(set));
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const on = value.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            className={`px-3 py-1.5 rounded-xl border text-sm transition active:scale-95 ${
              on ? "bg-black text-white border-black" : "hover:bg-slate-50"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ---------------- Domain enums ----------------
const ENUMS = {
  context: ["Outcrop", "Float", "Trench", "Dump", "Drill core"],
  category: ["Igneous", "Sedimentary", "Metamorphic", "Hydrothermal/Alteration"],
  weatheringGrade: ["Fresh", "Slight", "Moderate", "Strong", "Complete"],
  lustre: ["Dull", "Waxy", "Vitreous", "Resinous", "Submetallic", "Metallic"],
  grainSize: ["Clay", "Silt", "Very fine", "Fine", "Medium", "Coarse", "Very coarse", "Granule", "Pebble"],
  fabric: ["Massive", "Banded", "Foliated", "Brecciated", "Vuggy"],
  magnetism: ["None", "Weak", "Moderate", "Strong"],
  hcl: ["No reaction", "Weak fizz", "Strong fizz"],
  minerals: [
    "Quartz",
    "Feldspar",
    "Mica",
    "Calcite",
    "Dolomite",
    "Hematite",
    "Goethite",
    "Pyrite",
    "Chalcopyrite",
    "Galena",
    "Sphalerite",
  ],
  alteration: [
    "Silicification",
    "Sericitization",
    "Chloritization",
    "Hematization",
    "Argillic",
    "Propylitic",
  ],
  sulfides: ["Pyrite", "Chalcopyrite", "Bornite", "Galena", "Sphalerite"],
  sampleType: ["Grab", "Chip", "Channel", "Core", "Float"],
  hardness: ["1","2","3","4","5","6","7","8","9"],

  // ✅ NEW FIELDS
  packing: ["matrix-supported", "grain-supported"],
  textureType: ["clastic", "crystalline"],
};

// ---------------- Helpers ----------------
const cryptoRandom = () => Math.random().toString(36).slice(2);

// Downscale any read image to ~1024px before storing/sending
async function downscaleDataUrl(dataUrl, maxDim = 1024) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.src = dataUrl;
  });
}

// ---------------- Main App ----------------
export default function App() {
  // form model
  const [form, setForm] = useState(() => ({
    project: "",
    sampleId: "MDO", // default prefix per your request
    date: new Date().toISOString().slice(0, 16), // yyyy-MM-ddTHH:mm
    lat: "",
    lon: "",
    elevation: "",
    context: "",
    hostUnit: "",
    category: "",
    weatheringGrade: "",
    colourFresh: "",
    colourWeathered: "",
    lustre: "",
    grainSize: "",
    fabric: "",
    streak: "",
    magnetism: "",
    hcl: "",
    sg: "",
    fabricNotes: "",
    minerals: [],
    alteration: [],
    sulfides: [],
    mineralizationNotes: "",
    structures: "",
    sampleType: "",
    sampleLength_m: "",
    pxrf: "",
    hardness: "",

    // ✅ NEW fields in model
    packing: "",       // "matrix-supported" | "grain-supported"
    textureType: "",   // "clastic" | "crystalline"
  }));

  const [photos, setPhotos] = useState([]); // [{id, src}]
  const [activeIdx, setActiveIdx] = useState(0);
  const activeSrc = photos[activeIdx]?.src || null;

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const [aiText, setAiText] = useState("");
  const [busy, setBusy] = useState(false);

  function update(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function resetForm() {
    setForm((f) => ({
      ...f,
      project: "",
      sampleId: "MDO",
      date: new Date().toISOString().slice(0, 16),
      lat: "",
      lon: "",
      elevation: "",
      context: "",
      hostUnit: "",
      category: "",
      weatheringGrade: "",
      colourFresh: "",
      colourWeathered: "",
      lustre: "",
      grainSize: "",
      fabric: "",
      streak: "",
      magnetism: "",
      hcl: "",
      sg: "",
      fabricNotes: "",
      minerals: [],
      alteration: [],
      sulfides: [],
      mineralizationNotes: "",
      structures: "",
      sampleType: "",
      sampleLength_m: "",
      pxrf: "",
      hardness: "",
      packing: "",
      textureType: "",
    }));
    setPhotos([]);
    setActiveIdx(0);
    setAiText("");
  }

  // Save current outcrop sample to local device storage
  async function saveCurrentOutcrop() {
    const payload = {
      form,
      photos: photos.map((p) => p.src),
      generated: aiText,
      createdAt: new Date().toISOString(),
    };
    await saveOutcropLog(payload);
    // If the Saved tab is open, refresh it
    if (tab === 'saved') await refreshSaved();
  }

  async function loadOutcropIntoForm(id) {
    const data = await loadOutcropLog(id);
    if (!data) return;
    setForm((f) => ({ ...f, ...data.form }));
    setPhotos((data.photos || []).map((src) => ({ id: cryptoRandom(), src })));
    setActiveIdx(0);
    setAiText(data.generated || "");
    setTab('outcrop');
  }

  // File handling (with downscale)
  function onFile(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const readers = files.map(
      (file) =>
        new Promise((resolve) => {
          const fr = new FileReader();
          fr.onload = async (ev) => {
            const small = await downscaleDataUrl(String(ev.target?.result), 1024);
            resolve(small);
          };
          fr.readAsDataURL(file);
        })
    );
    Promise.all(readers).then((dataUrls) => {
      setPhotos((prev) => {
        const next = [...prev, ...dataUrls.map((src) => ({ id: cryptoRandom(), src }))];
        if (prev.length === 0) setActiveIdx(0);
        return next;
      });
    });
    e.target.value = "";
  }

  // Export helpers
  function exportJSON() {
    const payload = {
      form,
      photos: photos.map((p) => p.src),
      generated: aiText,
      createdAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.sampleId || "sample"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportMarkdown() {
    const md = [
      `# Sample ${form.sampleId || ""}`,
      `**Project:** ${form.project || ""}`,
      `**Date/time:** ${form.date || ""}`,
      `**Location:** ${form.lat || ""}, ${form.lon || ""} (elev ${form.elevation || ""} m)`,
      "",
      "## Standard description fields",
      `- Context: ${form.context || ""}`,
      `- Category: ${form.category || ""}`,
      `- Weathering grade: ${form.weatheringGrade || ""}`,
      `- Hardness (Mohs): ${form.hardness || ""}`,
      `- Colour (fresh): ${form.colourFresh || ""}`,
      `- Colour (weathered): ${form.colourWeathered || ""}`,
      `- Lustre: ${form.lustre || ""}`,
      `- Grain size: ${form.grainSize || ""}`,
      `- Fabric: ${form.fabric || ""}`,
      `- Streak: ${form.streak || ""}`,
      `- Magnetism: ${form.magnetism || ""}`,
      `- HCl reaction: ${form.hcl || ""}`,
      `- Specific gravity (qual): ${form.sg || ""}`,
      `- Minerals: ${form.minerals.join(", ")}`,
      `- Alteration: ${form.alteration.join(", ")}`,
      `- Sulfides: ${form.sulfides.join(", ")}`,
      `- Mineralization notes: ${form.mineralizationNotes || ""}`,
      `- Structures: ${form.structures || ""}`,
      "",
      "## Sampling",
      `- Sample type: ${form.sampleType || ""}`,
      `- Sample length (m): ${form.sampleLength_m || ""}`,
      "",
      "## New fields",
      `- Packing: ${form.packing || ""}`,
      `- Texture: ${form.textureType || ""}`,
      "",
      "## AI Suggested narrative",
      aiText || "—",
    ].join("\n");

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${form.sampleId || "sample"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // AI generate
  async function generateAI() {
    setBusy(true);
    setAiText("");
    try {
      const r = await fetch("/api/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form,
          photoUrl: activeSrc || null,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "API error");
      setAiText(data.description || "");
    } catch (e) {
      setAiText(`(Error) ${String(e.message || e)}`);
    } finally {
      setBusy(false);
    }
  }

  const [tab, setTab] = useState('outcrop');

  // ---------------- Borehole state ----------------
  const [bh, setBh] = useState(() => ({
    holeId: 'BH-1',
    project: '',
    createdAt: new Date().toISOString(),
    collar: { lat: '', lon: '', elev: '', azimuth: '', dip: '' },
    intervals: [],
  }));

  function updateBh(path, value) {
    setBh((prev) => {
      const next = { ...prev };
      if (path.startsWith('collar.')) {
        const k = path.split('.')[1];
        next.collar = { ...next.collar, [k]: value };
      } else {
        next[path] = value;
      }
      return next;
    });
  }

  function addInterval() {
    setBh((prev) => ({
      ...prev,
      intervals: [
        ...prev.intervals,
        { id: cryptoRandom(), from: '', to: '', unit: '', description: '', notes: '' },
      ],
    }));
  }

  function updateInterval(id, field, val) {
    setBh((prev) => ({
      ...prev,
      intervals: prev.intervals.map((iv) => (iv.id === id ? { ...iv, [field]: val } : iv)),
    }));
  }

  function deleteInterval(id) {
    setBh((prev) => ({ ...prev, intervals: prev.intervals.filter((iv) => iv.id !== id) }));
  }

  async function saveCurrentBorehole() {
    const payload = { ...bh, createdAt: bh.createdAt || new Date().toISOString() };
    await saveBoreholeLog(payload);
    if (tab === 'saved') await refreshSaved();
  }

  async function loadBoreholeIntoForm(id) {
    const data = await loadBoreholeLog(id);
    if (!data) return;
    // ensure each interval has an id for UI keys
    const intervals = (data.intervals || []).map((iv) => ({ id: cryptoRandom(), ...iv }));
    setBh({ ...data, intervals });
    setTab('borehole');
  }

  async function exportBhCSV() {
    const blob = await exportBoreholeCSV(bh);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${bh.holeId || 'borehole'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetBorehole() {
    setBh({
      holeId: 'BH-1',
      project: '',
      createdAt: new Date().toISOString(),
      collar: { lat: '', lon: '', elev: '', azimuth: '', dip: '' },
      intervals: [],
    });
  }

  // ---------------- Saved lists ----------------
  const [savedOutcrops, setSavedOutcrops] = useState([]);
  const [savedBoreholes, setSavedBoreholes] = useState([]);

  async function refreshSaved() {
    const [o, b] = await Promise.all([listOutcropLogs(), listBoreholeLogs()]);
    setSavedOutcrops(o.sort((a,b)=> String(b.date||'').localeCompare(String(a.date||''))));
    setSavedBoreholes(b.sort((a,b)=> String(b.date||'').localeCompare(String(a.date||''))));
  }

  useEffect(() => {
    if (tab === 'saved') {
      void refreshSaved();
    }
  }, [tab]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-6 sticky top-0 z-50 bg-slate-50/70 backdrop-blur">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl md:text-3xl font-bold">GeoDescribe – Geological Logger</h1>
            <div className="flex gap-2">
              <button
                className="rounded-xl px-4 py-2 bg-black text-white cursor-pointer hover:bg-gray-800 transition active:scale-95"
                onClick={exportMarkdown}
              >
                Export Markdown
              </button>
              <button
                className="rounded-xl px-4 py-2 border cursor-pointer hover:bg-slate-50 active:scale-95"
                onClick={exportJSON}
              >
                Export JSON (share)
              </button>
              {tab === 'outcrop' && (
                <button
                  className="rounded-xl px-4 py-2 border cursor-pointer hover:bg-slate-50 active:scale-95"
                  onClick={saveCurrentOutcrop}
                >
                  Save Sample
                </button>
              )}
              {tab === 'borehole' && (
                <>
                  <button
                    className="rounded-xl px-4 py-2 border cursor-pointer hover:bg-slate-50 active:scale-95"
                    onClick={saveCurrentBorehole}
                  >
                    Save Borehole
                  </button>
                  <button
                    className="rounded-xl px-4 py-2 border cursor-pointer hover:bg-slate-50 active:scale-95"
                    onClick={exportBhCSV}
                  >
                    Export CSV
                  </button>
                </>
              )}
              <button
                className="rounded-xl px-4 py-2 border cursor-pointer hover:bg-slate-50 active:scale-95"
                onClick={resetForm}
              >
                New Sample
              </button>
            </div>
          </div>
          <nav className="mt-3 flex gap-2">
            {[
              { id: 'outcrop', label: 'Outcrop/Hand specimen' },
              { id: 'borehole', label: 'Borehole' },
              { id: 'saved', label: 'Saved' },
            ].map((t) => (
              <button
                key={t.id}
                className={`px-3 py-1.5 rounded-xl border text-sm cursor-pointer ${tab===t.id? 'bg-black text-white border-black' : 'hover:bg-slate-50'}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>

        {/* Sample & Location */}
        <Section title="Sample & Location">
          <TwoCol>
            <TextInput
              label="Project"
              value={form.project}
              onChange={(e) => update("project", e.target.value)}
            />
            <TextInput
              label="Sample ID"
              value={form.sampleId}
              onChange={(e) => update("sampleId", e.target.value)}
            />
            <TextInput
              label="Date/time"
              type="datetime-local"
              value={form.date}
              onChange={(e) => update("date", e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <TextInput label="Latitude" value={form.lat} onChange={(e) => update("lat", e.target.value)} />
              <TextInput label="Longitude" value={form.lon} onChange={(e) => update("lon", e.target.value)} />
            </div>
            <TextInput
              label="Elevation (m)"
              value={form.elevation}
              onChange={(e) => update("elevation", e.target.value)}
            />
            <Select label="Context" options={ENUMS.context} value={form.context} onChange={(v) => update("context", v)} />
            <TextInput
              label="Host unit / Formation"
              value={form.hostUnit}
              onChange={(e) => update("hostUnit", e.target.value)}
            />
            <Select
              label="Category"
              options={ENUMS.category}
              value={form.category}
              onChange={(v) => update("category", v)}
            />
          </TwoCol>
        </Section>

        {tab === 'outcrop' && (
        <>
        {/* Photo */}
        <Section title="Photo">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="rounded-xl px-4 py-2 border text-sm md:text-base cursor-pointer hover:bg-slate-50 active:scale-95"
                  onClick={() => cameraInputRef.current?.click()}
                  aria-label="Capture a photo"
                >
                  📷 Take Photo
                </button>
                <button
                  type="button"
                  className="rounded-xl px-4 py-2 border text-sm md:text-base cursor-pointer hover:bg-slate-50 active:scale-95"
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
                <div className="mt-3 text-sm text-slate-500 border rounded-xl p-3">
                  No photos yet. Add one or more.
                </div>
              )}

              {photos.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {photos.map((p, i) => (
                    <button
                      key={p.id}
                      onClick={() => setActiveIdx(i)}
                      className={`relative border rounded-xl p-1 cursor-pointer ${
                        i === activeIdx ? "ring-2 ring-black" : "hover:bg-slate-50"
                      }`}
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
                    className="rounded-xl border px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50 active:scale-95"
                    onClick={() => {
                      setPhotos((prev) => {
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
                    className="rounded-xl border px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-50 active:scale-95"
                    onClick={() => {
                      setPhotos((prev) => {
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

            {/* AI panel */}
            <div>
              <p className="text-sm text-slate-600 mb-2">
                Generate a concise field description using the active photo and form fields.
              </p>
              <button
                className="rounded-xl px-4 py-2 border cursor-pointer hover:bg-slate-50 active:scale-95"
                onClick={generateAI}
                disabled={busy}
                title="Generate with AI"
              >
                {busy ? "Generating…" : "Generate AI description"}
              </button>
              <div className="mt-3 rounded-xl border p-3 bg-amber-50 whitespace-pre-wrap text-sm min-h-[120px]">
                {aiText || "—"}
              </div>
            </div>
          </div>
        </Section>

        {/* Standard description fields */}
        <Section title="Standard description fields">
          <TwoCol>
            <Select
              label="Weathering grade"
              options={ENUMS.weatheringGrade}
              value={form.weatheringGrade}
              onChange={(v) => update("weatheringGrade", v)}
            />
            <Select
              label="Hardness (Mohs / scratch test)"
              options={ENUMS.hardness}
              value={form.hardness}
              onChange={(v) => update("hardness", v)}
            />
            <TextInput
              label="Colour (fresh)"
              value={form.colourFresh}
              onChange={(e) => update("colourFresh", e.target.value)}
            />
            <TextInput
              label="Colour (weathered)"
              value={form.colourWeathered}
              onChange={(e) => update("colourWeathered", e.target.value)}
            />
            <Select label="Lustre" options={ENUMS.lustre} value={form.lustre} onChange={(v) => update("lustre", v)} />
            <Select
              label="Grain size / class"
              options={ENUMS.grainSize}
              value={form.grainSize}
              onChange={(v) => update("grainSize", v)}
            />
            <Select label="Fabric" options={ENUMS.fabric} value={form.fabric} onChange={(v) => update("fabric", v)} />
            <TextInput label="Streak colour" value={form.streak} onChange={(e) => update("streak", e.target.value)} />
            <Select
              label="Magnetism"
              options={ENUMS.magnetism}
              value={form.magnetism}
              onChange={(v) => update("magnetism", v)}
            />
            <Select label="HCl reaction" options={ENUMS.hcl} value={form.hcl} onChange={(v) => update("hcl", v)} />
            <TextInput
              label="Specific gravity (qualitative)"
              value={form.sg}
              onChange={(e) => update("sg", e.target.value)}
            />
            <TextArea
              label="Fabric / texture notes"
              value={form.fabricNotes}
              onChange={(e) => update("fabricNotes", e.target.value)}
            />

            {/* ✅ NEW FIELD: Packing */}
            <Select
              label="Packing"
              options={ENUMS.packing}
              value={form.packing}
              onChange={(v) => update("packing", v)}
            />

            {/* ✅ NEW FIELD: Texture Type */}
            <Select
              label="Texture"
              options={ENUMS.textureType}
              value={form.textureType}
              onChange={(v) => update("textureType", v)}
            />
          </TwoCol>

          <div className="mt-2">
            <div className="mb-1 text-sm font-medium">Minerals present</div>
            <CheckboxGroup options={ENUMS.minerals} value={form.minerals} onChange={(v) => update("minerals", v)} />
          </div>

          <div className="mt-2">
            <div className="mb-1 text-sm font-medium">Alteration</div>
            <CheckboxGroup options={ENUMS.alteration} value={form.alteration} onChange={(v) => update("alteration", v)} />
          </div>

          <div className="mt-2">
            <div className="mb-1 text-sm font-medium">Sulfides observed</div>
            <CheckboxGroup options={ENUMS.sulfides} value={form.sulfides} onChange={(v) => update("sulfides", v)} />
          </div>

          <TwoCol>
            <TextArea
              label="Mineralization notes"
              value={form.mineralizationNotes}
              onChange={(e) => update("mineralizationNotes", e.target.value)}
            />
            <TextArea
              label="Structures (veins, shear, breccia type, orientations)"
              value={form.structures}
              onChange={(e) => update("structures", e.target.value)}
            />
          </TwoCol>
        </Section>

        {/* Sampling & extra */}
        <Section title="Sampling & extra">
          <TwoCol>
            <Select
              label="Sample type"
              options={ENUMS.sampleType}
              value={form.sampleType}
              onChange={(v) => update("sampleType", v)}
            />
            <TextInput
              label="Sample length (m)"
              value={form.sampleLength_m}
              onChange={(e) => update("sampleLength_m", e.target.value)}
            />
            <TextArea label="pXRF summary (if any)" value={form.pxrf} onChange={(e) => update("pxrf", e.target.value)} />
          </TwoCol>
        </Section>
        </>
        )}

        {tab === 'saved' && (
          <>
            <Section title="Saved – Outcrops">
              {savedOutcrops.length === 0 ? (
                <div className="text-sm text-slate-500">No saved outcrops.</div>
              ) : (
                <div className="space-y-2">
                  {savedOutcrops.map((s) => (
                    <div key={`o-${s.id}`} className="flex items-center justify-between rounded-xl border p-3">
                      <div className="text-sm">
                        <div className="font-medium">{s.title}</div>
                        <div className="text-slate-500">{s.project} · {s.date}</div>
                      </div>
                      <div className="flex gap-2">
                        <button className="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50"
                          onClick={() => loadOutcropIntoForm(s.id)}
                        >Open</button>
                        <button className="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50"
                          onClick={async () => {
                            const rec = await loadOutcropLog(s.id);
                            if (!rec) return;
                            const blob = new Blob([JSON.stringify(rec, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${s.id}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                        >Export JSON</button>
                        <button className="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50"
                          onClick={async () => { await deleteOutcropLog(s.id); await refreshSaved(); }}
                        >Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Saved – Boreholes">
              {savedBoreholes.length === 0 ? (
                <div className="text-sm text-slate-500">No saved boreholes.</div>
              ) : (
                <div className="space-y-2">
                  {savedBoreholes.map((s) => (
                    <div key={`b-${s.id}`} className="flex items-center justify-between rounded-xl border p-3">
                      <div className="text-sm">
                        <div className="font-medium">{s.title}</div>
                        <div className="text-slate-500">{s.project} · {s.intervalCount} intervals</div>
                      </div>
                      <div className="flex gap-2">
                        <button className="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50"
                          onClick={() => loadBoreholeIntoForm(s.id)}
                        >Open</button>
                        <button className="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50"
                          onClick={async () => {
                            const rec = await loadBoreholeLog(s.id);
                            if (!rec) return;
                            const blob = await exportBoreholeCSV(rec);
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${s.title || s.id}.csv`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                        >Export CSV</button>
                        <button className="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50"
                          onClick={async () => { await deleteBoreholeLog(s.id); await refreshSaved(); }}
                        >Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}

        {tab === 'borehole' && (
          <>
            <Section title="Borehole metadata">
              <TwoCol>
                <TextInput label="Hole ID" value={bh.holeId} onChange={(e)=>updateBh('holeId', e.target.value)} />
                <TextInput label="Project" value={bh.project} onChange={(e)=>updateBh('project', e.target.value)} />
                <div className="grid grid-cols-2 gap-3">
                  <TextInput label="Latitude" value={bh.collar.lat} onChange={(e)=>updateBh('collar.lat', e.target.value)} />
                  <TextInput label="Longitude" value={bh.collar.lon} onChange={(e)=>updateBh('collar.lon', e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <TextInput label="Elevation (m)" value={bh.collar.elev} onChange={(e)=>updateBh('collar.elev', e.target.value)} />
                  <TextInput label="Azimuth (°)" value={bh.collar.azimuth} onChange={(e)=>updateBh('collar.azimuth', e.target.value)} />
                  <TextInput label="Dip (°)" value={bh.collar.dip} onChange={(e)=>updateBh('collar.dip', e.target.value)} />
                </div>
              </TwoCol>
              <div className="mt-3 flex gap-2">
                <button className="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50" onClick={addInterval}>Add interval</button>
                <button className="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50" onClick={resetBorehole}>New borehole</button>
              </div>
            </Section>

            <Section title="Intervals">
              {bh.intervals.length === 0 ? (
                <div className="text-sm text-slate-500">No intervals yet.</div>
              ) : (
                <div className="space-y-3">
                  {bh.intervals.map((iv) => (
                    <div key={iv.id} className="rounded-xl border p-3">
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-start">
                        <TextInput label="From (m)" value={iv.from} onChange={(e)=>updateInterval(iv.id,'from', e.target.value)} />
                        <TextInput label="To (m)" value={iv.to} onChange={(e)=>updateInterval(iv.id,'to', e.target.value)} />
                        <TextInput label="Unit" value={iv.unit} onChange={(e)=>updateInterval(iv.id,'unit', e.target.value)} />
                        <div className="md:col-span-2">
                          <TextArea label="Description" value={iv.description} onChange={(e)=>updateInterval(iv.id,'description', e.target.value)} />
                        </div>
                        <div className="md:col-span-1">
                          <TextArea label="Notes" value={iv.notes} onChange={(e)=>updateInterval(iv.id,'notes', e.target.value)} />
                        </div>
                      </div>
                      <div className="mt-2">
                        <button className="rounded-xl border px-3 py-1.5 text-sm hover:bg-slate-50" onClick={()=>deleteInterval(iv.id)}>Delete interval</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}

        {/* Footer */}
        <footer className="mt-8 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} GeoDescribe prototype.
        </footer>
      </div>
    </div>
  );
}
