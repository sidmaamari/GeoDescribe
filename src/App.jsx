import React, { useEffect, useRef, useState } from "react";

/* ------------------------- Payload fixing ------------------------- */
async function downscaleDataUrl(dataUrl, maxDim = 1024) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.src = dataUrl;
  });
}

/* ------------------------- helper UI (inline) ------------------------- */
function Section({ title, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <div className="rounded-2xl border bg-white p-4">{children}</div>
    </section>
  );
}
function TwoCol({ children }) {
  return <div className="grid md:grid-cols-2 gap-3">{children}</div>;
}
function TextInput({ label, type = "text", value, onChange, placeholder }) {
  return (
    <label className="block">
      <div className="text-sm font-medium mb-1">{label}</div>
      <input
        className="w-full rounded-xl border px-3 py-2"
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    </label>
  );
}
function Select({ label, options, value, onChange }) {
  return (
    <label className="block">
      <div className="text-sm font-medium mb-1">{label}</div>
      <select
        className="w-full rounded-xl border px-3 py-2 bg-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
function TextArea({ label, value, onChange, rows = 4 }) {
  return (
    <label className="block">
      <div className="text-sm font-medium mb-1">{label}</div>
      <textarea
        className="w-full rounded-xl border px-3 py-2"
        rows={rows}
        value={value}
        onChange={onChange}
      />
    </label>
  );
}

/* ------------------------------ enums ------------------------------ */
const ENUMS = {
  context: ["Float", "Outcrop", "Subcrop", "Colluvium", "Alluvium"],
  hardness: ["1","2","3","4","5","6","7","8","9"],
  lustre: ["Dull", "Earthy", "Vitreous", "Metallic", "Submetallic", "Resinous"],
  grainSize: ["Clay", "Silt", "Sand", "Granule", "Pebble", "Cobble", "Boulder"],
};

/* ---------------------------- main app ----------------------------- */
export default function App() {
  /* core form */
  const [form, setForm] = useState({
    project: "",
    sampleId: "MDO",               // your default prefix
    date: new Date().toISOString().slice(0, 16), // datetime-local friendly
    lat: "",
    lon: "",
    elevation: "",
    context: "",
    lustre: "",
    grainSize: "",
    hardness: "",
    notes: "",
  });

  /* photos */
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [photos, setPhotos] = useState([]); // [{id, src}]
  const [activeIdx, setActiveIdx] = useState(0);
  const activeSrc = photos[activeIdx]?.src || null;

  /* AI */
  const [suggested, setSuggested] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /* file handlers */
  async function onFile(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  const readers = files.map(
    file =>
      new Promise(resolve => {
        const fr = new FileReader();
        fr.onload = async ev => {
          // Downscale the image before saving it
          const small = await downscaleDataUrl(String(ev.target?.result), 1024);
          resolve(small);
        };
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

  // reset input so same file can be re-selected if needed
  e.target.value = "";
}
  /* ---------------------- AI request (IMPORTANT) ---------------------- */
  async function generateDescription() {
    try {
      setAiError("");
      setAiBusy(true);

      // 25s timeout guard so the UI never hangs forever
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25000);

      const res = await fetch("/api/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form,
          photoUrl: activeSrc || null, // ← include current photo
        }),
        signal: ctrl.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setSuggested(data.description || data.text || "(no description returned)");
    } catch (err) {
      console.error("AI error:", err);
      setAiError(typeof err?.message === "string" ? err.message : "Failed to generate description.");
    } finally {
      setAiBusy(false);
    }
  }

  /* ------------------------------ view ------------------------------ */
  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-6 sticky top-0 z-50 bg-slate-50/70 backdrop-blur flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold">GeoDescribe – Field Rock Logger</h1>
          <div className="flex gap-2">
            <button
              className="rounded-xl px-4 py-2 border cursor-pointer hover:bg-slate-100 active:scale-95"
              onClick={() => {
                setForm({
                  ...form,
                  sampleId: "MDO",
                  date: new Date().toISOString().slice(0, 16),
                });
                setPhotos([]);
                setActiveIdx(0);
                setSuggested("");
                setAiError("");
              }}
            >
              New Sample
            </button>
          </div>
        </header>

        {/* Sample & Location */}
        <Section title="Sample & Location">
          <TwoCol>
            <TextInput label="Project" value={form.project} onChange={(e) => update("project", e.target.value)} />
            <TextInput label="Sample ID" value={form.sampleId} onChange={(e) => update("sampleId", e.target.value)} />
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
            <Select
              label="Lustre"
              options={ENUMS.lustre}
              value={form.lustre}
              onChange={(v) => update("lustre", v)}
            />
            <Select
              label="Grain size / class"
              options={ENUMS.grainSize}
              value={form.grainSize}
              onChange={(v) => update("grainSize", v)}
            />
            <Select
              label="Hardness (Mohs)"
              options={ENUMS.hardness}
              value={form.hardness}
              onChange={(v) => update("hardness", v)}
            />
            <TextArea label="Notes" value={form.notes} onChange={(e) => update("notes", e.target.value)} />
          </TwoCol>
        </Section>

        {/* Photo */}
        <Section title="Photo">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {/* Left: picker + thumbnail gallery */}
            <div>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="rounded-xl px-4 py-2 border text-sm md:text-base cursor-pointer hover:bg-slate-100 active:scale-95"
                  onClick={() => cameraInputRef.current?.click()}
                  aria-label="Capture a new photo"
                >
                  📷 Take Photo
                </button>
                <button
                  type="button"
                  className="rounded-xl px-4 py-2 border text-sm md:text-base cursor-pointer hover:bg-slate-100 active:scale-95"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Choose existing image files"
                >
                  📥 Choose File(s)
                </button>
              </div>

              {/* hidden inputs */}
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
                        i === activeIdx ? "ring-2 ring-black" : ""
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
                    className="rounded-xl border px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-100 active:scale-95"
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
                    className="rounded-xl border px-3 py-1.5 text-sm cursor-pointer hover:bg-slate-100 active:scale-95"
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

            {/* Right: Analyzer + AI */}
            <div>
              <p className="text-sm text-slate-600 mb-2">
                Generate a concise field description using the active photo and form fields.
              </p>

              <button
                className="mt-1 rounded-xl border px-3 py-2 text-sm cursor-pointer hover:bg-slate-100 active:scale-95 disabled:opacity-50"
                onClick={generateDescription}
                disabled={aiBusy}
              >
                {aiBusy ? "Generating…" : "Generate AI description"}
              </button>

              {aiError && <div className="mt-2 text-sm text-red-600 break-words">{aiError}</div>}

              {suggested && (
                <div className="mt-3 text-sm bg-amber-50 border rounded-xl p-3 whitespace-pre-wrap">
                  {suggested}
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* Footer */}
        <footer className="mt-8 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} GeoDescribe prototype.
        </footer>
      </div>
    </div>
  );
}
