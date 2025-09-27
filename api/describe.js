async function generateWith(model) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      messages: [
        { role: "system", content: "You are a concise, careful exploration geologist." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    const err = new Error(txt);
    err.status = r.status;
    throw err;
  }
  const data = await r.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

let description;
try {
  // Start with an accessible model
  description = await generateWith("gpt-4o-mini");
} catch (e) {
  // Optional: try a secondary model if you want
  if (e.status === 429 || e.status === 503) {
    try {
      description = await generateWith("gpt-3.5-turbo");
    } catch (e2) {
      return res.status(500).json({ error: `Fallback failed: ${String(e2.message || e2)}` });
    }
  } else if (e.status === 401) {
    return res.status(500).json({ error: "API key lacks model.request scope or model access." });
  } else {
    return res.status(500).json({ error: `Upstream ${e.status || ""}: ${String(e.message || e)}` });
  }
}

return res.status(200).json({ description });
