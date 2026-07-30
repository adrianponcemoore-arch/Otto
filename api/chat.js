// Vercel serverless function — uses Google's Gemini API (free tier).
// Set GEMINI_API_KEY in your Vercel project's Environment Variables.

const SYSTEM_PROMPT = `You are Otto, a friendly general-purpose AI assistant inside a mobile app. You help with everyday tasks: answering questions, writing, planning, brainstorming, summarizing, translating, describing images, reading documents, and casual conversation. You are not a licensed professional of any kind. When the user shares their location coordinates, use them to give helpful local context. In voice conversations, keep replies short and natural, like speaking.`;

function toGeminiContents(messages) {
  return messages.map((m) => {
    const role = m.role === "assistant" ? "model" : "user";
    const parts = [];
    if (typeof m.content === "string") {
      parts.push({ text: m.content });
    } else if (Array.isArray(m.content)) {
      for (const block of m.content) {
        if (block.type === "text") {
          parts.push({ text: block.text });
        } else if (block.type === "image" || block.type === "document") {
          parts.push({
            inline_data: {
              mime_type: block.source.media_type,
              data: block.source.data,
            },
          });
        }
      }
    }
    if (parts.length === 0) parts.push({ text: "" });
    return { role, parts };
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY env var" });
  }
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=" +
      process.env.GEMINI_API_KEY;
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: toGeminiContents(messages),
        generationConfig: { maxOutputTokens: 1024 },
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || "Upstream error";
      return res.status(r.status).json({ error: msg });
    }
    const text =
      (data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts.map((p) => p.text || "").join("\n")) ||
      "";
    return res.status(200).json({ content: [{ type: "text", text }] });
  } catch (e) {
    return res.status(500).json({ error: "Upstream request failed" });
  }
}
