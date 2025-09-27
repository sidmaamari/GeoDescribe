// geodescribe/api/describe.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // --- Safe body parsing for all cases ---
    let payload = req.body;
    if (!payload) {
      // In some runtimes, body may not be auto-parsed:
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString("utf8") || "{}";
      payload = JSON.parse(raw);
    } else if (typeof payload === "string") {
      payload = JSON.parse(payload || "{}");
    }

    const { form = {}, photoSummary = null, pxrfSummary = null } = payload;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    const prompt = `
You are an exploration geologist. Write a concise professional field description and interpretation.

FORM:
${JSON.stringify(form, null, 2)}

PHOTO SUMMARY:
${JSON.stringify(photoSummary || {}, null, 2)}

PXRF SUMMARY:
${JSON.stringify(pxrfSummary || {}, null, 2)}

Respond in markdown with:
- **Description** (colour, lustre, grain size, fabric, minerals/alteration, magnetism/HCl)
- **Interpretation** (likely rock type / context)
- **Sampling suggestions** (1–2 bullets if warranted)
Keep it under 180 words.
`.trim();

    // --- Call OpenAI via fetch (no SDK) ---
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        temperature: 0.4,
        messages: [
          { role: "system", content: "You are a concise, careful exploration geologist." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return res.status(500).json({ error: `Upstream ${aiRes.status}: ${errText}` });
    }

    const data = await aiRes.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || "";
    return res.status(200).json({ description: text });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
