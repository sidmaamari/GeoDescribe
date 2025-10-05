// server.js (ESM)
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// accept base64 images from the browser; keep client downscaling (~1024px)
app.use(express.json({ limit: "8mb" }));

// ------------ AI endpoint -------------
app.post("/api/describe", async (req, res) => {
  try {
    const { form = {}, photoUrl = null, pxrfSummary = null } = req.body || {};

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    const formBrief = JSON.stringify(form || {}, null, 0);
    const pxrfBrief = pxrfSummary ? JSON.stringify(pxrfSummary || {}, null, 0) : null;

    // strict style + decision rules to avoid “breccia” mislabels and fluff
    const style =
      "STYLE:\n" +
      "- Two short paragraphs. No headings, bullets, or JSON.\n" +
      "- Para 1: observational description ONLY (colour, luster, texture/fabric, grain-size class if inferable, visible/likely minerals, alteration such as Fe-oxides). Base on the photo; use form only as context. Do NOT mention magnetism/HCl unless present in FORM.\n" +
      "- Para 2: concise scientific interpretation grounded in the observations (process/setting). Avoid vague filler.\n" +
      "- Finish with EXACTLY one line:  Suggested rock name: <single best-fit lithologic term>";

    const decisionRules =
      "DECISION RULES (important):\n" +
      "- Do NOT call it a breccia unless there are multiple distinct clasts with clear clast–matrix boundaries or vein fills; conchoidal fracture ≠ clasts.\n" +
      "- If homogeneous, fine/cryptocrystalline silica with conchoidal fracture and waxy–dull luster, strongly prefer chert (flint if dark; jasper if red/Fe-rich).\n" +
      "- Use cautious language only when supported by visible cues (e.g., blue–green Cu carbonates).";

    const masterTerms =
      "MASTER TERMS (use when relevant): aphanitic, phaneritic, porphyritic, clastic, crystalline, vesicular, glassy, foliated, massive, brecciated; " +
      "microcrystalline/cryptocrystalline; felsic, mafic, ultramafic, siliceous, calcareous, ferruginous; bedding, foliation, laminations, vesicles, phenocrysts, veins, banding; " +
      "basalt, andesite, dacite, rhyolite, tuff, ignimbrite, volcanic breccia, porphyry; granite, diorite, gabbro, pegmatite, aplite; " +
      "sandstone, arkose, greywacke, conglomerate, breccia, limestone, dolostone, chert, flint, jasper, jasperoid, gossan, ironstone; " +
      "slate, phyllite, schist, gneiss, amphibolite, quartzite, marble, serpentinite, mylonite; silicification, sericitization, chloritization, hematization, epidotization; " +
      "magmatic, volcanic, plutonic, sedimentary, diagenetic, metamorphic, hydrothermal, supergene.";

    const userContent = [
      {
        type: "text",
        text:
          "You are a precise field geologist. Produce a tight observation + interpretation, then pick ONE rock name.\n\n" +
          style + "\n\n" +
          decisionRules + "\n\n" +
          "Vocabulary guidance:\n" + masterTerms + "\n\n" +
          `FORM (context): ${formBrief}\n` +
          (pxrfBrief ? `PXRF: ${pxrfBrief}\n` : "")
      }
    ];
    if (photoUrl) {
      userContent.push({
        type: "image_url",
        image_url: { url: photoUrl, detail: "high" } // high detail; client should downscale to ~1024px
      });
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",     // change to "gpt-5" when your key has access
        temperature: 0.15,
        messages: [
          { role: "system", content: "You are a no-fluff exploration geologist." },
          { role: "user", content: userContent },
        ],
      }),
    });

    const text = await r.text();
    if (!r.ok) return res.status(r.status).json({ error: `Upstream ${r.status}: ${text}` });

    const data = JSON.parse(text);
    let description = data?.choices?.[0]?.message?.content?.trim() || "";

    // normalize in case model emits markdown
    description = description.replace(/^\s*#+\s*/gm, "").replace(/^\s*[-*]\s+/gm, "");

    res.json({ description });
  } catch (err) {
    console.error("API /describe error:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});
// --------------------------------------

// Serve built frontend from /dist (Vite build output)
const DIST = path.join(__dirname, "dist");
app.use(express.static(DIST));

app.get("/healthz", (req, res) => res.type("text").send("ok"));

app.get("*", (req, res) => {
  res.sendFile(path.join(DIST, "index.html"));
});

const PORT = process.env.PORT || 3000; // Replit sets PORT
app.listen(PORT, () => {
  console.log(`GeoDescribe running on http://localhost:${PORT}`);
});
