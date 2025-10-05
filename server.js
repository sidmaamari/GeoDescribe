// server.js (ESM) — GeoDescribe on Replit/Render
// Serves Vite build from /dist and exposes /api/describe (OpenAI vision)

import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// Node >=18 provides global fetch

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Accept base64 data URLs from the client (keep client downscaling to ~1024px)
app.use(express.json({ limit: "8mb" }));

/* ===========================
   /api/describe  (AI endpoint)
   =========================== */
app.post("/api/describe", async (req, res) => {
  try {
    const { form = {}, photoUrl = null, pxrfSummary = null } = req.body || {};

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    // ---- Build rich, geology-focused prompt ----
    // Compact context to save tokens
    const formBrief = JSON.stringify(form || {}, null, 0);
    const pxrfBrief = pxrfSummary ? JSON.stringify(pxrfSummary || {}, null, 0) : null;

    // Master vocabulary (guidance, not a hard list)
    const MASTER_TERMS =
      "Use standard geological terminology when relevant: " +
      "colour/hue (reddish-brown, ochre, grey), luster (waxy, vitreous, metallic), " +
      "textures (aphanitic, phaneritic, porphyritic, cryptocrystalline, conchoidal, clastic, brecciated, foliated, massive), " +
      "grain size classes (mud, silt, sand, granule, pebble, cobble, boulder) and qualitative terms (fine/medium/coarse), " +
      "structures (bedding, lamination, foliation, veining, boxwork, vugs), " +
      "minerals (quartz, feldspar, mica, calcite, dolomite, hematite, goethite, limonite, sulfides), " +
      "process terms (magmatic, volcanic, plutonic, sedimentary, diagenetic, metamorphic, hydrothermal, supergene), " +
      "alteration (silicification, sericitization, chloritization, hematization, epidotization, argillic/advanced argillic, propylitic)." ;

    // Strict style so outputs read like a field note
    const STYLE_RULES =
      "STYLE:\n" +
      "- Write two short paragraphs. No headings, bullets, or JSON.\n" +
      "- Paragraph 1 = observational description ONLY (colour, luster, texture/fabric, grain-size class if inferable, visible/likely minerals, alteration such as Fe-oxides). " +
      "Base primarily on the photo; use FORM only as context. Do NOT mention magnetism or HCl unless present in FORM.\n" +
      "- Paragraph 2 = concise scientific interpretation grounded in observations (process/setting, e.g., supergene oxidation, hydrothermal silica replacement, sedimentary chert, volcanic breccia, etc.). Avoid vague filler.\n" +
      "- END with EXACTLY one line:  Suggested rock name: <single best-fit lithologic term>";

    // Decision rules to avoid common mislabels (e.g., breccia vs. conchoidal silica)
    const DECISION_RULES =
      "DECISION RULES (very important):\n" +
      "- Do NOT call it a breccia unless you see multiple distinct clasts with clear clast–matrix boundaries or vein fills; conchoidal fracture ≠ clasts.\n" +
      "- If the specimen is homogeneous, very fine/cryptocrystalline silica with conchoidal fracture and waxy–dull luster, prefer chert (flint if dark; jasper if red/Fe-rich).\n" +
      "- Use cautious terms only when supported by visible cues (e.g., blue-green Cu carbonates → possible malachite/azurite).";

    // Build user content with optional image block
    const userContent = [
      {
        type: "text",
        text:
          "You are a professional field geologist. Produce a tight observation + interpretation, then choose one rock name.\n\n" +
          MASTER_TERMS + "\n\n" +
          STYLE_RULES + "\n\n" +
          DECISION_RULES + "\n\n" +
          `FORM (context): ${formBrief}\n` +
          (pxrfBrief ? `PXRF (optional): ${pxrfBrief}\n` : "")
      }
    ];
    if (photoUrl) {
      userContent.push({
        type: "image_url",
        image_url: { url: photoUrl, detail: "high" } // client should downscale to ~1024 px
      });
    }

    // Allow model override via env; default to widely-available vision model
    const MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
    const TEMPERATURE = process.env.OPENAI_TEMPERATURE
      ? Number(process.env.OPENAI_TEMPERATURE)
      : 0.15;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,          // e.g., "gpt-4o-mini" or "gpt-5" when available on your key
        temperature: TEMPERATURE,
        messages: [
          {
            role: "system",
            content:
              "You are an expert, no-fluff exploration geologist. " +
              "Write as if for a professional field notebook and avoid speculation beyond visible evidence.",
          },
          { role: "user", content: userContent },
        ],
      }),
    });

    const text = await r.text();
    if (!r.ok) {
      // Return upstream error to the client for quick debugging
      return res.status(r.status).json({ error: `OpenAI ${r.status}: ${text}` });
    }

    const data = JSON.parse(text);
    let description = data?.choices?.[0]?.message?.content?.trim() || "";

    // Normalize if the model sneaks in markdown headers/bullets
    description = description
      .replace(/^\s*#+\s*/gm, "")
      .replace(/^\s*[-*]\s+/gm, "");

    return res.json({ description, model: MODEL });
  } catch (err) {
    console.error("API /describe error:", err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

/* ===========================
   Static hosting for Vite build
   =========================== */
const DIST = path.join(__dirname, "dist");
app.use(express.static(DIST));

app.get("/healthz", (_req, res) => res.type("text").send("ok"));

app.get("*", (_req, res) => {
  res.sendFile(path.join(DIST, "index.html"));
});

const PORT = process.env.PORT || 3000; // Replit/Render set PORT
app.listen(PORT, () => {
  console.log(`GeoDescribe running on http://localhost:${PORT}`);
});
