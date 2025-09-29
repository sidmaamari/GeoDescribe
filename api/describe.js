// geodescribe/api/describe.js
// Strict, observation-first vision endpoint: clear description + interpretation,
// and a mandatory final line: "Suggested rock name: <name>"

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // --- Safe body parsing (Node/Edge) ---
  let payload = {};
  try {
    let raw = "";
    const td = new TextDecoder();
    for await (const chunk of req) {
      raw += typeof chunk === "string" ? chunk : td.decode(chunk, { stream: true });
    }
    payload = raw ? JSON.parse(raw) : {};
  } catch (e) {
    return res.status(400).json({ error: "Invalid JSON body", details: String(e?.message || e) });
  }

  const { form = {}, photoUrl = null, pxrfSummary = null } = payload;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  }

  // Compact context (keeps token usage down)
  const formBrief = JSON.stringify(form || {}, null, 0);
  const pxrfBrief = pxrfSummary ? JSON.stringify(pxrfSummary || {}, null, 0) : null;

  // ----- STRICT STYLE RULES -----
  // We instruct the model to: (1) write only what is observable,
  // (2) avoid vague/filler sentences, (3) never mention unperformed tests,
  // and (4) end with a single conclusive "Suggested rock name: <name>" line.
  const styleRules =
    "OUTPUT RULES:\n" +
    "- Two short paragraphs, plain text (no headings or bullets).\n" +
    "- Paragraph 1 = observational description ONLY (colour, texture/fabric, grain-size class if inferable, visible/likely minerals, alteration features such as Fe-oxides). Base this primarily on the photo; use form data if helpful. Do not invent details.\n" +
    "- Paragraph 2 = scientific interpretation (genetic/process or setting) derived from the observations. Be concise and grounded in what is visible.\n" +
    "- Never mention magnetism or HCl reaction unless explicitly provided in FORM.\n" +
    "- Avoid vague filler such as: 'warrants further examination', 'requires further study', 'interesting assemblage', 'overall' wrap-ups, or generic cautionary sentences.\n" +
    "- Use decisive wording when justified by evidence. Use 'possible X' only if supported by visible cues (e.g., blue-green Cu-carbonates, metallic sulfide luster, etc.).\n" +
    "- END with a single line on its own: 'Suggested rock name: <best-fit lithologic name>'\n" +
    "- If identification is genuinely inconclusive, write your best constrained class (e.g., 'felsic volcanic breccia' or 'Fe-oxide–altered sedimentary rock'). As a last resort, use 'Suggested rock name: indeterminate—insufficient observable constraints'.";

  const userText =
    "You are an experienced field geologist. Produce a concise, observation-led description and interpretation from the image and form.\n\n" +
    styleRules + "\n\n" +
    `FORM DATA (for context): ${formBrief}\n` +
    (pxrfBrief ? `PXRF (optional): ${pxrfBrief}\n` : "");

  // Build the vision message
  const userContent = [{ type: "text", text: userText }];
  if (photoUrl) {
    userContent.push({
      type: "image_url",
      image_url: { url: photoUrl, detail: "low" }, // "low" is cost-efficient and sufficient for field photos
    });
  }

  async function callModel(model) {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,                // e.g., "gpt-4o-mini" or others you enable
        temperature: 0.3,     // slightly lower for crisper, less hedgy prose
        messages: [
          { role: "system", content: "You are a precise, no-fluff exploration geologist." },
          { role: "user", content: userContent },
        ],
      }),
    });

    const text = await r.text();
    if (!r.ok) {
      const err = new Error(`Upstream ${r.status}: ${text.slice(0, 1200)}`);
      err.status = r.status;
      throw err;
    }
    const data = JSON.parse(text);
    let out = data?.choices?.[0]?.message?.content?.trim() || "";

    // Light post-filter to remove any stray headings/bullets if model disobeys
    out = out.replace(/^\s*#+\s*/gm, "");          // strip markdown headings
    out = out.replace(/^\s*[-*]\s+/gm, "");        // strip bullets
    return out;
  }

  // You can list multiple models and try them in order if you want.
  // If you later gain access to newer models, put them first.
  const candidates = ["gpt-4o-mini"]; // add "gpt-5" first if/when your key has access
  for (let i = 0; i < candidates.length; i++) {
    try {
      const description = await callModel(candidates[i]);
      return res.status(200).json({ description, model: candidates[i] });
    } catch (e) {
      if (i === candidates.length - 1) {
        const status = e.status || 500;
        const msg =
          status === 401
            ? "OpenAI 401: key lacks required scopes or wrong workspace/project."
            : status === 404
            ? "OpenAI 404: model unavailable on this account."
            : status === 429
            ? "OpenAI 429: quota exceeded or rate-limited."
            : `Upstream ${status}: ${String(e.message || e)}`;
        return res.status(500).json({ error: msg });
      }
      // else: try next model
    }
  }
}
