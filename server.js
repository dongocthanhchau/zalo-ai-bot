const express = require("express")

const app = express()
app.use(express.json())

const ZALO_BOT_TOKEN = process.env.ZALO_BOT_TOKEN || "1394369929164293156:zsgnmNfnTFKhJlwhFhzfbBennzfcfXMYwPCHOISzsIrYVkHyuvuiDKgQvgsOHpIk"
const LLM_API_URL = process.env.LLM_API_URL || "https://openrouter.ai/api/v1/chat/completions"
const LLM_API_KEY = process.env.LLM_API_KEY || "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"
const MODEL = process.env.MODEL || "openai/gpt-4o-mini"

console.log("=== Zalo AI Bot Started ===")
console.log("ZALO_BOT_TOKEN:", ZALO_BOT_TOKEN ? "set" : "NOT SET")
console.log("LLM_API_KEY:", LLM_API_KEY ? "set" : "NOT SET")

async function zaloAPI(endpoint, body) {
  const url = `https://bot-api.zaloplatforms.com/bot${ZALO_BOT_TOKEN}/${endpoint}`
  console.log("Calling Zalo API:", url)
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await response.json()
    console.log("Zalo API response:", JSON.stringify(data))
    return data
  } catch (err) {
    console.error("Zalo API error:", err.message)
    return { ok: false, error: err.message }
  }
}

async function callLLM(messages) {
  console.log("Calling LLM with model:", MODEL)
  try {
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
    console.log("LLM response:", JSON.stringify(data).substring(0, 500))
    return data.choices?.[0]?.message?.content || "Xin lỗi, có lỗi xảy ra."
  } catch (err) {
    console.error("LLM error:", err.message)
    return "Xin lỗi, có lỗi xảy ra: " + err.message
  }
}

app.post("/webhook", async (req, res) => {
  console.log("=== Webhook received ===")
  console.log("Body:", JSON.stringify(req.body, null, 2))

  const event = req.body

  if (event.event_name === "message.text.received") {
    const userId = event.result.message.from.id
    const userMessage = event.result.message.text

    console.log("User:", userId, "Message:", userMessage)

    // Gọi LLM
    const reply = await callLLM([
      { role: "system", content: "Bạn là trợ lý AI trả lời tin nhắn Zalo. Trả lời ngắn gọn, thân thiện bằng tiếng Việt." },
      { role: "user", content: userMessage },
    ])

    console.log("Reply:", reply)

    // Gửi phản hồi về Zalo
    const zaloResult = await zaloAPI("sendMessage", {
      chat_id: userId,
      text: reply,
    })

    console.log("Zalo send result:", JSON.stringify(zaloResult))
  }

  res.json({ ok: true })
})

app.get("/", (req, res) => res.send("Zalo AI Bot Running!"))

const PORT = process.env.PORT || 10000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))