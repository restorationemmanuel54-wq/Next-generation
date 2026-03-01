const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require("@whiskeysockets/baileys");
const OpenAI = require("openai");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

/* ---------- CREATE SESSION FOLDER ---------- */
if (!fs.existsSync("./sessions")) {
  fs.mkdirSync("./sessions");
}

/* ---------- OPENAI ---------- */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ---------- BOT CREATOR ---------- */
async function createBot(userId, socket) {
  const sessionPath = path.join("./sessions", userId);

  const { state, saveCreds } =
    await useMultiFileAuthState(sessionPath);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ["Nexora V2", "Chrome", "1.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;

    /* ✅ SEND QR TO WEBSITE */
    if (qr) {
      console.log("QR Generated");
      const qrImage = await QRCode.toDataURL(qr);
      socket.emit("qr", qrImage);
    }

    /* ✅ CONNECTED */
    if (connection === "open") {
      console.log("Bot Connected");
      socket.emit("status", "✅ Bot Connected Successfully");
    }

    /* ✅ HANDLE DISCONNECT SAFELY */
    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      socket.emit("status", "⚠️ Connection Closed");

      if (shouldReconnect) {
        createBot(userId, socket);
      }
    }
  });

  return sock;
}

/* ---------- SOCKET EVENTS ---------- */
io.on("connection", (socket) => {

  console.log("User connected");

  /* QR LOGIN */
  socket.on("start-qr", async ({ userId }) => {
    await createBot(userId, socket);
  });

  /* PAIR CODE LOGIN */
  socket.on("start-code", async ({ userId, phone }) => {
    const sock = await createBot(userId, socket);

    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phone);
        socket.emit("pair-code", code);
      } catch (err) {
        console.log(err);
        socket.emit("status", "❌ Failed to generate pairing code");
      }
    }, 3000);
  });
});

/* ---------- MINI AI ---------- */
app.post("/ask-ai", async (req, res) => {
  const { question } = req.body;

  if (!question)
    return res.json({ answer: "Ask about Nexora bot system." });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are Nexora V2 AI assistant. Only answer about bots, automation, deployment and Nexora system."
        },
        { role: "user", content: question }
      ]
    });

    res.json({
      answer: response.choices[0].message.content
    });

  } catch {
    res.json({ answer: "AI temporarily unavailable." });
  }
});

/* ---------- START SERVER ---------- */
server.listen(PORT, () => {
  console.log("🚀 Nexora V2 running on port " + PORT);
});