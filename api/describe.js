export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { form, photoUrl } = req.body;

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  }

  try {
    const prompt = `
You are a professional field geologist AI trained on global rock classifications. 
Your task is to generate a scientifically accurate and **field-ready geological description** based on the provided photo and field data.

⚠️ STRICT RULES:
- Do NOT say "more analysis is needed" or "further study required".
- DO NOT comment on HCl reaction, magnetism, or hardness unless those are explicitly provided.
- Use **precise geological terminology** — sedimentary, igneous, metamorphic, alteration, breccia, etc.
- Provide **clear observations**, a **geological interpretation**, and a **rock name**.
- Your rock name MUST be one from real-world geology (e.g., basalt, rhyolite, chert, jasperoid, gossan, arkose, quartz arenite, amphibolite, greenschist, etc.).

---
📍 FIELD DATA:
${JSON.stringify(form, null, 2)}

📸 PHOTO:
${photoUrl ? `A rock photo is provided. Analyze its texture, colour, mineralogy, and structure visually.` : `No photo provided.`}

---
💡 OUTPUT FORMAT (strictly follow this format):

**Field Observations:**
- Describe texture, grain size, colour, structure, fabric, and visible minerals.

**Geological Interpretation:**
- Interpret the likely formation process and geological environment based on visual and field data.

**Suggested Rock Name:**
- Give the closest geological rock name (real name only, no descriptive labels like "quartz-rich rock").
    `;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // ✅ You can replace with "gpt-5" when available to your account
        temperature: 0.4,
        messages: [
          { role: "system", content: "You are an expert field geologist." },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Upstream API error: ${errText}`);
    }

    const data = await response.json();
    const description = data.choices?.[0]?.message?.content || "No description generated.";

    return res.status(200).json({ description });

  } catch (error) {
    console.error("Describe API error:", error);
    return res.status(500).json({ error: error.message });
  }
}
