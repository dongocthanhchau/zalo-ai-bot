const express = require("express")

const app = express()
app.use(express.json())

const ZALO_BOT_TOKEN = process.env.ZALO_BOT_TOKEN
const LLM_API_URL = process.env.LLM_API_URL || "https://openrouter.ai/api/v1/chat/completions"
const LLM_API_KEY = process.env.LLM_API_KEY
const MODEL = process.env.MODEL || "google/gemma-2-9b-it:free"

let lastEvent = null
const tasks = [] // { id, userId, message, remindTime, sent }

console.log("=== Zalo AI Bot Started ===")
console.log("ZALO_BOT_TOKEN:", ZALO_BOT_TOKEN ? "set" : "NOT SET")
console.log("LLM_API_KEY:", LLM_API_KEY ? "set" : "NOT SET")

if (!ZALO_BOT_TOKEN || !LLM_API_KEY) {
  console.error("ERROR: Missing required env vars! Please set ZALO_BOT_TOKEN and LLM_API_KEY")
  process.exit(1)
}

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

function parseTimeFromMessage(msg) {
  const now = new Date()
  let remindTime = null
  
  // Parse patterns like "15:30", "14:00", "9:00"
  const timeMatch = msg.match(/(\d{1,2}):(\d{2})(?:\s|$)/)
  if (timeMatch) {
    const hours = parseInt(timeMatch[1])
    const minutes = parseInt(timeMatch[2])
    const today = new Date()
    today.setHours(hours, minutes, 0, 0)
    
    // If time has passed today, schedule for tomorrow
    if (today < now) {
      today.setDate(today.getDate() + 1)
    }
    remindTime = today
  }
  
  // Parse patterns like "30 phút", "1 tiếng", "2h"
  const minutesMatch = msg.match(/(\d+)\s*(phut|phút|p|tien|t|tiếng|gio)/i)
  if (minutesMatch) {
    const mins = parseInt(minutesMatch[1])
    remindTime = new Date(now.getTime() + mins * 60000)
  }
  
  // Parse patterns like "ngày mai 8h", "mai 9:00"
  if (msg.includes("ngày mai") || msg.includes("mai ")) {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    if (timeMatch) {
      const hours = parseInt(timeMatch[1])
      const minutes = parseInt(timeMatch[2])
      tomorrow.setHours(hours, minutes, 0, 0)
      remindTime = tomorrow
    }
  }
  
  // Parse "buổi sáng", "buổi chiều" with hour
  if (msg.includes("sáng") || msg.includes("sang")) {
    const match = msg.match(/(\d{1,2})\s*(?:giờ|h)/i)
    if (match) {
      const hours = parseInt(match[1])
      if (hours >= 6 && hours <= 11) {
        const today = new Date()
        today.setHours(hours, 0, 0, 0)
        if (today < now) today.setDate(today.getDate() + 1)
        remindTime = today
      }
    }
  }
  
  if (msg.includes("chiều") || msg.includes("chieu")) {
    const match = msg.match(/(\d{1,2})\s*(?:giờ|h)/i)
    if (match) {
      const hours = parseInt(match[1])
      if (hours >= 13 && hours <= 18) {
        const today = new Date()
        today.setHours(hours, 0, 0, 0)
        if (today < now) today.setDate(today.getDate() + 1)
        remindTime = today
      }
    }
  }
  
  return remindTime
}

function extractTask(msg) {
  // Common task patterns
  const taskPatterns = [
    /nhắc\s+(tôi\s+)?(.+)/i,
    / напомина(?:ть|ние)\s+(?:mình\s+)?(.+)/i,
    / remind\s+(?:me\s+)?(.+)/i,
    /(.+)\slúc\s+(\d{1,2}:\d{2})/i,
    /(.+)\s+ngày\s+mai/i,
    /(.+)\s+(\d+\s*(?:phút|tiếng|giờ))/i,
  ]
  
  for (const pattern of taskPatterns) {
    const match = msg.match(pattern)
    if (match) {
      return match[1] || match[2] || msg
    }
  }
  
  // If no explicit task pattern, check if message contains time - treat as reminder
  if (parseTimeFromMessage(msg)) {
    return msg.replace(/nhắc|remind напоминание/gi, "").trim()
  }
  
  return null
}

// Check reminders every minute
setInterval(async () => {
  const now = new Date()
  
  for (const task of tasks) {
    if (!task.sent && task.remindTime <= now) {
      console.log(`Sending reminder: ${task.message} at ${task.remindTime}`)
      
      const reply = await callLLM([
        { role: "system", content: "Bạn là trợ lý AI nhắc nhở công việc. Trả lời thân thiện, ngắn gọn." },
        { role: "user", content: `Nhắc người dùng: ${task.message}` },
      ])
      
      await zaloAPI("sendMessage", {
        chat_id: task.userId,
        text: "🔔 NHẮC NHỞ: " + reply,
      })
      
      task.sent = true
    }
  }
  
  // Clean up old tasks (keep last 100)
  while (tasks.length > 100) {
    tasks.shift()
  }
}, 60000) // Check every minute

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
      // Check for task/reminder requests
      const taskContent = extractTask(userMessage)
      const remindTime = parseTimeFromMessage(userMessage)
      
      if (taskContent && remindTime) {
        // This is a reminder request
        tasks.push({
          id: Date.now(),
          userId,
          message: taskContent,
          remindTime,
          sent: false
        })
        
        const timeStr = remindTime.toLocaleString("vi-VN", { 
          hour: '2-digit', 
          minute: '2-digit',
          day: '2-digit',
          month: '2-digit'
        })
        
        const reply = `Đã đặt nhắc nhở cho "${taskContent}" vào lúc ${timeStr} ⏰`
        
        await zaloAPI("sendMessage", {
          chat_id: userId,
          text: reply,
        })
        
        console.log("Reminder set:", taskContent, "at", remindTime)
      } else {
        // Regular chat - use LLM
        const reply = await callLLM([
          { role: "system", content: "Bạn là trợ lý AI trả lời tin nhắn Zalo. Trả lời ngắn gọn, thân thiện bằng tiếng Việt. Nếu người dùng muốn đặt nhắc nhở, hãy gợi ý cách đặt ví dụ: 'nhắc tôi 15:30 làm việc' hoặc 'nhắc 30 phút nữa'." },
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
    }
  } else if (event.event_name === "message.sticker.received") {
    // Handle sticker - send friendly response
    const userId = event.message?.from?.id || event.result?.message?.from?.id
    await zaloAPI("sendMessage", {
      chat_id: userId,
      text: "Cảm ơn sticker! 🎉 Bạn cần gì giúp không?",
    })
  } else {
    responseMsg += "Event: " + event.event_name
  }

  res.json({ 
    ok: true, 
    message: responseMsg,
    event_name: event.event_name,
    tasks_count: tasks.length,
    debug: lastEvent
  })
})

app.get("/", (req, res) => res.send("Zalo AI Bot Running!"))

app.get("/debug", (req, res) => {
  res.json({
    lastEvent,
    tasks: tasks.map(t => ({ id: t.id, message: t.message, remindTime: t.remindTime, sent: t.sent })),
    message: lastEvent ? "Đã có tin nhắn!" : "Chưa có tin nhắn nào"
  })
})

app.get("/tasks", (req, res) => {
  res.json({ tasks: tasks })
})

const PORT = process.env.PORT || 10000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))