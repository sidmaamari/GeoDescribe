import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Make sure you added this in Vercel settings
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { form, photoAnalysis } = req.body;

    // Basic validation
    if (!form) {
      return res.status(400).json({ error: "Missing form data" });
    }

    // Build a structured prompt for the model
    const prompt = `
You are a professional exploration geologist writing a concise sample description for a field database.
Summarize the geological characteristics of the rock based on the following details:

Sample ID: ${form.sampleId || "N/A"}
Project: ${form.project || "N/A"}
Location: Lat ${form.lat || "N/A"}, Lon ${form.lon || "N/A"}, Elevation: ${form.elevation || "N/A"} m
Host Unit / Formation: ${form.hostUnit || "N/A"}
Weathering Grade: ${form.weatheringGrade || "N/A"}
Hardness: ${form.hardness || "N/A"}
Colour (Fresh): ${form.colourFresh || "N/A"}
Colour (Weathered): ${form.colourWeathered || "N/A"}
Lustre: ${form.lustre || "N/A"}
Grain Size: ${form.grainSize || "N/A"}
Fabric: ${form.fabric || "N/A"}
Streak: ${form.streak || "N/A"}
Magnetism: ${form.magnetism || "N/A"}
HCl Reaction: ${form.hcl || "N/A"}
Specific Gravity: ${form.sg || "N/A"}
Minerals: ${(form.minerals || []).join(", ") || "N/A"}
Alteration: ${(form.alteration || []).join(", ") || "N/A"}
Sulfides: ${(form.sulfides || []).join(", ") || "N/A"}
Structures: ${form.structures || "N/A"}
Mineralization Notes: ${form.mineralizationNotes || "N/A"}

If any photo analysis is available:
${photoAnalysis ? `Photo suggests: ${photoAnalysis}` : "No photo analysis provided."}

Write the description in 2–3 short, professional sentences suitable for a geological log. Use formal geological terminology and avoid repetition.
    `;

    // Call GPT-4 for the description
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an expert exploration geologist." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
    });

    const text = completion.choices[0].message.content.trim();

    return res.status(200).json({ description: text });
  } catch (error) {
    console.error("Error generating geological description:", error);
    return res.status(500).json({ error: "Failed to generate geological description." });
  }
}