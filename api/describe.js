// geodescribe/api/describe.js
export default async function handler(req, res) {
  // Allow only POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // --- Read and parse the incoming body safely ---
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

    const { form = {}, photoSummary = null, pxrfSummary = null } = payload;

    // --- Check that your API key is available ---
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    // --- Build the prompt for GPT ---
    const prompt = `
You are an exploration geologist. Write a concise field description and interpretation.

FORM DATA:
${JSON.stringify(form, null, 2)}

PHOTO SUMMARY:
${JSON.stringify(photoSummary || {}, null, 2)}

PXRF SUMMARY:
${JSON.stringify(pxrfSummary || {}, null, 2)}

Respond in markdown with:
- **Description**: Colour, lustre, grain size, fabric, minerals/alteration, magnetism/HCl
- **Interpretation**: Likely rock type and geological context
- **Sampling suggestions**: 1–2 short bullets (only if relevant)
Keep the total response under 180 words.
`.trim();

    // --- Call the OpenAI API ---
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // ✅ Stable and widely available model
        temperature: 0.4,
        messages: [
          { role: "system", content: "You are a concise, careful exploration geologist." },
          { role: "user", content: prompt },
        ],
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      return res.status(response.status).json({ error: `Upstream ${response.status}: ${text}` });
    }

    const data = JSON.parse(text);
    const description = data?.choices?.[0]?.message?.content?.trim() || "";

    return res.status(200).json({ description });
  } catch (err) {
    return res.status(500).json({ error: `Internal server error: ${String(err?.message || err)}` });
  }
}
