const express = require("express")

const app = express()
app.use(express.json())

const ZALO_BOT_TOKEN = process.env.ZALO_BOT_TOKEN || "1394369929164293156:zsgnmNfnTFKhJlwhFhzfbBennzfcfXMYwPCHOISzsIrYVkHyuvuiDKgQvgsOHpIk"
const LLM_API_URL = process.env.LLM_API_URL || "https://openrouter.ai/api/v1/chat/completions"
const LLM_API_KEY = process.env.LLM_API_KEY || "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"
const MODEL = process.env.MODEL || "openai/gpt-4o-mini"

let lastEvent = null

console.log("=== Zalo AI Bot Started ===")
console.log("ZALO_BOT_TOKEN:", ZALO_BOT_TOKEN ? "set" : "NOT SET")
console.log("LLM_API_KEY:", LLM_API_KEY ? "set" : "NOT SET")

async function zaloAPI(endpoint, body) {
  const url = `https://bot-api.zaloplatforms.com/bot${ZALO_BOT_TOKEN}/${endpoint}`
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    return await response.json()
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

async function callLLM(messages) {
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
    return data.choices?.[0]?.message?.content || "Xin lỗi, có lỗi xảy ra."
  } catch (err) {
    return "Xin lỗi, có lỗi: " + err.message
  }
}

app.post("/webhook", async (req, res) => {
  console.log("=== WEBHOOK RECEIVED ===")
  console.log("Body:", JSON.stringify(req.body))
  
  lastEvent = req.body
  const event = req.body

  let responseMsg = "Đã nhận tin nhắn! "

  if (event.event_name === "message.text.received") {
    const userId = event.message?.from?.id || event.result?.message?.from?.id
    const userMessage = event.message?.text || event.result?.message?.text
    
    console.log(`User: ${userId}, Message: ${userMessage}`)
    
    if (userMessage) {
      const reply = await callLLM([
        { role: "system", content: "Bạn là trợ lý AI trả lời tin nhắn Zalo. Trả lời ngắn gọn, thân thiện bằng tiếng Việt." },
        { role: "user", content: userMessage },
      ])
      
      console.log("Reply:", reply)
      
      const zaloResult = await zaloAPI("sendMessage", {
        chat_id: userId,
        text: reply,
      })
      
      console.log("Zalo result:", JSON.stringify(zaloResult))
      responseMsg += zaloResult.ok ? "Đã gửi phản hồi!" : "Lỗi gửi: " + zaloResult.description
    }
  } else {
    responseMsg += "Event: " + event.event_name
  }

  res.json({ 
    ok: true, 
    message: responseMsg,
    event_name: event.event_name,
    debug: lastEvent
  })
})

app.get("/", (req, res) => res.send("Zalo AI Bot Running!"))

app.get("/debug", (req, res) => {
  res.json({
    lastEvent,
    message: lastEvent ? "Đã có tin nhắn!" : "Chưa có tin nhắn nào"
  })
})

const PORT = process.env.PORT || 10000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))