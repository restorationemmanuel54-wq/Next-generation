const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const OpenAI = require("openai");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

/* =========================
   Ensure Sessions Folder
========================= */
if (!fs.existsSync("./sessions")) {
  fs.mkdirSync("./sessions");
}

/* =========================
   OpenAI Setup
========================= */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =========================
   Start WhatsApp Bot
========================= */
async function startBot(userId, socket) {
  try {
    const sessionPath = path.join("./sessions", userId);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { qr, connection } = update;

      // Send QR to frontend
      if (qr) {
        const qrImage = await QRCode.toDataURL(qr);
        socket.emit("qr", qrImage);
      }

      // Connected
      if (connection === "open") {
        socket.emit("status", "✅ Bot Connected Successfully");
      }

      // Disconnected
      if (connection === "close") {
        socket.emit("status", "❌ Bot Disconnected");
      }
    });

  } catch (err) {
    console.log("Bot Start Error:", err.message);
    socket.emit("status", "⚠️ Failed to start bot.");
  }
}

/* =========================
   AI Assistant Route
========================= */
app.post("/ask-ai", async (req, res) => {
  const { question } = req.body;

  if (!question) {
    return res.json({
      answer: "Ask something related to Nexora V2 bot system."
    });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are Nexora V2 AI assistant. ONLY answer questions related to Nexora bot, WhatsApp automation, deployment, or this website. If question is unrelated, politely refuse."
        },
        {
          role: "user",
          content: question
        }
      ],
      temperature: 0.6
    });

    res.json({
      answer: response.choices[0].message.content
    });

  } catch (error) {
    console.log("AI Error:", error.message);
    res.json({
      answer: "⚠️ AI system temporarily unavailable."
    });
  }
});

/* =========================
   Socket.io Connection
========================= */
io.on("connection", (socket) => {

  socket.on("start-qr", async ({ userId }) => {
    if (!userId) {
      socket.emit("status", "⚠️ Invalid User ID.");
      return;
    }

    await startBot(userId, socket);
  });

});

/* =========================
   Start Server
========================= */
server.listen(PORT, () => {
  console.log(`🚀 Nexora V2 Hacker Console running on port ${PORT}`);
});