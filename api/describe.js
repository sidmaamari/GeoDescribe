// geodescribe/api/describe.js
// Vision endpoint: large vocabulary + smart filtering + strict single-name output.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ---- Safe JSON body parse (Node/Edge) ----
  let payload = {};
  try {
    let raw = ""; const td = new TextDecoder();
    for await (const ch of req) raw += typeof ch === "string" ? ch : td.decode(ch, { stream:true });
    payload = raw ? JSON.parse(raw) : {};
  } catch (e) {
    return res.status(400).json({ error: "Invalid JSON body", details: String(e?.message || e) });
  }

  const { form = {}, photoUrl = null, pxrfSummary = null } = payload;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

  // --- 1) Large master vocabulary (extend freely) ---
  // Keep terms concise; synonyms can be added as separate strings.
  const MASTER_TERMS = {
    alteration_ore: [
      "gossan","jasperoid","skarn","greisen","silicified breccia","quartz-carbonate vein","epithermal vein",
      "stockwork","ironstone","banded iron formation","BIF","ferricrete","laterite","hematitic breccia",
      "limonitic breccia","oxide cap","supergene blanket","saprolite","sericitic alteration","propylitic alteration",
      "argillic alteration","advanced argillic","potassic alteration","phyllic alteration","chloritic alteration",
      "silicified shear zone","manganiferous oxide rock","malachite-azurite gossan","jarosite-rich gossan"
    ],
    igneous_volcanic: [
      "basalt","hawaiite","trachybasalt","andesite","basaltic andesite","dacite","rhyolite","komatiite",
      "trachyte","phonolite","ignimbrite","welded tuff","ash tuff","lapilli tuff","volcanic breccia","agglomerate",
      "scoria","pumice","obsidian","pitchstone","porphyritic basalt","porphyritic andesite","porphyry"
    ],
    igneous_plutonic: [
      "gabbro","diorite","monzodiorite","monzonite","syenite","granodiorite","granite","tonalite","anorthosite",
      "peridotite","pyroxenite","harzburgite","dunite","norite","pegmatite","aplite","lamprophyre"
    ],
    sedimentary_clastic: [
      "mudstone","shale","siltstone","sandstone","arkose","lithic sandstone","greywacke","conglomerate",
      "breccia","sedimentary breccia","diamictite","aeolian sandstone","fluvial sandstone"
    ],
    sedimentary_chemical_biogenic: [
      "limestone","dolostone","chert","banded chert","iron formation (sedimentary)","evaporite","gypsum rock",
      "halite rock","phosphorite","coal","oil shale","travertine","tufa","oolitic limestone","stromatolitic limestone"
    ],
    metamorphic_low_med: [
      "slate","phyllite","schist","greenschist","blueschist","amphibolite","quartzite","marble","hornfels",
      "serpentinite","listvenite","mylonite","cataclasite","chlorite schist","talc schist"
    ],
    metamorphic_high: [
      "gneiss","migmatite","granulite","eclogite","charno-enderbite","skarnite"
    ]
  };

  // --- 2) Heuristic filtering to keep tokens low ---
  function filterTerms(form, hints) {
    const out = new Set();

    const ctx = (form.context || "").toLowerCase();
    const notes = (form.notes || "").toLowerCase();
    const grain = (form.grainSize || "").toLowerCase();
    const cat = (form.category || "").toLowerCase();

    // Photo hints (very light): if ironish colour detected, nudge alteration terms
    const ironish = hints?.ironish === true;

    // Context/category nudges
    if (/vein|shear|fault|breccia/.test(notes)) {
      add("alteration_ore","silicified breccia","quartz-carbonate vein","epithermal vein","stockwork","silicified shear zone");
    }
    if (ironish || /gossan|oxide|hematite|limonite|jarosite|iron/.test(notes)) {
      add("alteration_ore","gossan","ironstone","hematitic breccia","limonitic breccia","jarosite-rich gossan","oxide cap","BIF","banded iron formation","ferricrete","laterite");
    }

    if (/volcanic|tuff|lava|flow|scoria|pumice/.test(notes) || /outcrop/.test(ctx)) {
      add("ig","volcanic breccia","welded tuff","ash tuff","basalt","andesite","dacite","rhyolite","ignimbrite","porphyry","porphyritic andesite","porphyritic basalt");
    }
    if (/intrusive|granite|granodiorite|gabbro|diorite|pluton/.test(notes)) {
      add("plutonic","granite","granodiorite","diorite","gabbro","pegmatite","aplite","syenite","monzonite");
    }
    if (/sand|gravel|conglomerate|breccia|fluvial|aeolian/.test(notes) || /sand|pebble|granule/.test(grain)) {
      add("clastic","sandstone","arkose","lithic sandstone","greywacke","conglomerate","breccia","sedimentary breccia","aeolian sandstone","fluvial sandstone");
    }
    if (/carbonate|fossil|micrite|sparite|oolite|stromatolite/.test(notes)) {
      add("chem","limestone","dolostone","oolitic limestone","stromatolitic limestone","travertine","tufa","chert");
    }
    if (/foliation|schistose|gneissic|mylonite|shear/.test(notes)) {
      add("meta","slate","phyllite","schist","greenschist","amphibolite","gneiss","mylonite","hornfels","quartzite","marble","serpentinite");
    }

    // Always ensure a broad baseline if nothing matched
    if (out.size < 30) {
      addAll("alteration_ore"); addAll("igneous_volcanic"); addAll("igneous_plutonic");
      addAll("sedimentary_clastic"); addAll("sedimentary_chemical_biogenic");
      addAll("metamorphic_low_med"); addAll("metamorphic_high");
    }

    // Helper adders
    function add(group, ...names) {
      const map = {
        alteration_ore: MASTER_TERMS.alteration_ore,
        ig: MASTER_TERMS.igneous_volcanic,
        plutonic: MASTER_TERMS.igneous_plutonic,
        clastic: MASTER_TERMS.sedimentary_clastic,
        chem: MASTER_TERMS.sedimentary_chemical_biogenic,
        meta: MASTER_TERMS.metamorphic_low_med.concat(MASTER_TERMS.metamorphic_high),
      };
      (names.length ? names : []).forEach(n => out.add(n));
      if (!names.length && map[group]) map[group].forEach(n => out.add(n));
    }
    function addAll(key){ MASTER_TERMS[key].forEach(n => out.add(n)); }

    // Return sorted limited list (to keep tokens lean)
    return Array.from(out).slice(0, 80); // cap at ~80 terms for cost
  }

  // very-light photo hint; if you keep a colour analyzer, pass its boolean here
  const photoHints = form?.__photoHints || {}; // or set via frontend
  const candidates = filterTerms(form, photoHints);

  // ---- Style & output rules (strict) ----
  const style =
    "STYLE:\n" +
    "- Two short paragraphs. No headings, bullets, or JSON.\n" +
    "- Para 1: observational description only (colour, texture/fabric, grain-size class if inferable, visible/likely minerals, alteration such as Fe-oxides). Use the photo primarily; form adds context. Do NOT mention magnetism or HCl unless present in FORM.\n" +
    "- Para 2: concise scientific interpretation based on those observations (process/setting).\n" +
    "- Avoid vague filler ('interesting assemblage', 'requires further work').\n" +
    "- Finish with EXACTLY one line:\n" +
    "  Suggested rock name: <choose one exact term from the allowed list>";

  const allowedLine = "ALLOWED ROCK NAMES:\n- " + candidates.join("\n- ");

  const formBrief = JSON.stringify(form || {}, null, 0);
  const pxrfBrief = pxrfSummary ? JSON.stringify(pxrfSummary || {}, null, 0) : null;

  // Build vision user message
  const userContent = [{ type: "text", text:
    "You are a precise field geologist. Produce a tight description + interpretation, then select ONE name from the allowed list.\n\n" +
    style + "\n\n" +
    allowedLine + "\n\n" +
    `FORM (context): ${formBrief}\n` +
    (pxrfBrief ? `PXRF: ${pxrfBrief}\n` : "")
  }];
  if (photoUrl) userContent.push({ type:"image_url", image_url:{ url: photoUrl, detail:"low" } });

  async function call(model){
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method:"POST",
      headers:{ Authorization:`Bearer ${apiKey}`, "Content-Type":"application/json" },
      body: JSON.stringify({
        model, temperature: 0.25,
        messages: [
          { role:"system", content:"You are a no-fluff exploration geologist." },
          { role:"user", content: userContent }
        ],
      })
    });
    const text = await r.text();
    if (!r.ok){ const err=new Error(`Upstream ${r.status}: ${text.slice(0,1200)}`); err.status=r.status; throw err; }
    const data = JSON.parse(text);
    return (data?.choices?.[0]?.message?.content || "").trim()
      .replace(/^\s*#+\s*/gm,"").replace(/^\s*[-*]\s+/gm,"");
  }

  // Try models (add "gpt-5" first if your key has access)
  const models = ["gpt-4o-mini"];
  for (let i=0;i<models.length;i++){
    try {
      const description = await call(models[i]);
      return res.status(200).json({ description, model: models[i], candidates });
    } catch (e) {
      if (i === models.length-1) {
        const s = e.status||500;
        const msg = s===401?"OpenAI 401: key scopes/workspace insufficient."
          : s===404?"OpenAI 404: model unavailable."
          : s===429?"OpenAI 429: quota/rate limited."
          : `Upstream ${s}: ${String(e.message||e)}`;
        return res.status(500).json({ error: msg });
      }
    }
  }
}
