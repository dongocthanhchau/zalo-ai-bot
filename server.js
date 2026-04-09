const express = require("express")
const fetch = require("node-fetch")

const app = express()
app.use(express.json())

const ZALO_BOT_TOKEN = process.env.ZALO_BOT_TOKEN
const LLM_API_URL = process.env.LLM_API_URL || "https://openrouter.ai/api/v1/chat/completions"
const LLM_API_KEY = process.env.LLM_API_KEY
const MODEL = process.env.MODEL || "openai/gpt-4o-mini"

const zaloAPI = (endpoint, body) =>
  fetch(`https://bot-api.zaloplatforms.com/bot${ZALO_BOT_TOKEN}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(r => r.json())

async function callLLM(messages) {
  const response = await fetch(LLM_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: 2000,
    }),
  })
  const data = await response.json()
  return data.choices?.[0]?.message?.content || "Xin lỗi, có lỗi xảy ra."
}

app.post("/webhook", async (req, res) => {
  const event = req.body
  console.log("Received:", JSON.stringify(event, null, 2))

  if (event.event_name === "message.text.received") {
    const userId = event.result.message.from.id
    const userMessage = event.result.message.text

    // Gọi LLM
    const reply = await callLLM([
      { role: "system", content: "Bạn là trợ lý AI trả lời tin nhắn Zalo. Trả lời ngắn gọn, thân thiện bằng tiếng Việt." },
      { role: "user", content: userMessage },
    ])

    // Gửi phản hồi về Zalo
    await zaloAPI("sendMessage", {
      chat_id: userId,
      text: reply,
    })

    console.log("Replied:", reply)
  }

  res.json({ ok: true })
})

app.get("/", (req, res) => res.send("Zalo AI Bot Running!"))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))