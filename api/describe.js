// geodescribe/api/describe.js
// Vision-enabled endpoint: tries GPT-5 first, falls back to gpt-4o-mini.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // --- Safe body parsing (works in Node/Edge runtimes) ---
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

  // Compact, structured context
  const formBrief = JSON.stringify(form || {}, null, 0);
  const pxrfBrief = pxrfSummary ? JSON.stringify(pxrfSummary || {}, null, 0) : null;

  // Prompt: pure observation; no tests unless provided
  const userContent = [
    {
      type: "text",
      text:
        "You are an experienced field geologist. Write ONLY an observational field description based strictly on the photo and provided form data.\n\n" +
        "RULES:\n" +
        "- Describe only what is visible (colour, texture/fabric, grain size class if inferable, obvious minerals/alteration such as Fe-oxides). " +
        "Do NOT mention magnetism or HCl reaction unless explicitly provided in the form.\n" +
        "- No headings, no JSON, no bullets—just 1–2 short paragraphs suitable for a notebook entry.\n" +
        "- Use cautious language for uncertain identifications (e.g., 'possible copper-bearing minerals').\n\n" +
        `FORM DATA (for context): ${formBrief}\n` +
        (pxrfBrief ? `PXRF: ${pxrfBrief}\n` : ""),
    },
  ];

  if (photoUrl) {
    userContent.push({
      type: "image_url",
      image_url: { url: photoUrl, detail: "low" }, // 'low' keeps cost small; switch to 'high' if needed
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
        model,
        temperature: 0.4,
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
    return data?.choices?.[0]?.message?.content?.trim() || "";
  }

  // Try GPT-5 first; fall back if not permitted/available/quota issues
  const candidates = ["gpt-5", "gpt-4o-mini"]; // order matters
  for (let i = 0; i < candidates.length; i++) {
    try {
      const description = await callModel(candidates[i]);
      return res.status(200).json({ description, model: candidates[i] });
    } catch (e) {
      // Friendly messages for common cases; then try the next candidate
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
      // else, continue to next model
    }
  }
}
