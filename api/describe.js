// geodescribe/api/describe.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true, note: "GET ok (function is alive)" });
  }
  // Read body safely without Buffer (works in Node/Edge)
  let raw = "";
  try {
    const td = new TextDecoder();
    for await (const chunk of req) {
      raw += typeof chunk === "string" ? chunk : td.decode(chunk, { stream: true });
    }
  } catch (e) {
    return res.status(400).json({ ok: false, error: "Body read failed: " + String(e?.message || e) });
  }
  return res.status(200).json({ ok: true, received: raw || "(empty)" });
}
