// geodescribe/api/describe.js
// Vision-enabled endpoint: sends form + image to OpenAI (gpt-4o-mini)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // --- Safe body parsing (works in Node/Edge) ---
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

  // Compact, structured context to reduce tokens
  const formBrief = JSON.stringify(form || {}, null, 0);
  const pxrfBrief = pxrfSummary ? JSON.stringify(pxrfSummary || {}, null, 0) : null;

  // Build a vision-enabled messages array
const userContent = [
  {
    type: "text",
    text:
      "You are an experienced field geologist. Your task is to write ONLY an **observational field description** of the rock sample based strictly on the photo and provided form data." +
      "\n\n✅ IMPORTANT RULES:\n" +
      "- Describe **only what is visible** (colour, texture, grain size, alteration, mineral presence) and **do not mention magnetism, acid reaction, or tests** unless they were explicitly provided in the form.\n" +
      "- Do not include JSON, field headers, or unnecessary structure. Write 1–2 short paragraphs that a geologist would write in a notebook.\n" +
      "- If you are uncertain about something, use cautious wording (e.g., 'possible copper-bearing minerals') instead of stating facts.\n" +
      "- Output must look like a final, readable description paragraph.\n\n" +
      `FORM DATA (for context): ${formBrief}\n` +
      (pxrfBrief ? `PXRF: ${pxrfBrief}\n` : ""),
  },
];

  // If an image is provided (URL or data: URI), include it for vision
  if (photoUrl) {
    userContent.push({
      type: "image_url",
      image_url: { url: photoUrl, detail: "low" }, // "low" keeps cost down & is plenty for field photos
    });
  }

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // vision-capable & cheap
        temperature: 0.4,
        messages: [
          { role: "system", content: "You are a precise, no-fluff exploration geologist." },
          { role: "user", content: userContent },
        ],
      }),
    });

    const text = await r.text();
    if (!r.ok) {
      return res.status(r.status).json({ error: `Upstream ${r.status}: ${text}` });
    }

    const data = JSON.parse(text);
    const description = data?.choices?.[0]?.message?.content?.trim() || "";
    return res.status(200).json({ description });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
