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

/* ---------- KEYS ---------- */
const keysPath = "./keys.json";
let validKeys = [];
if (fs.existsSync(keysPath)) {
    validKeys = JSON.parse(fs.readFileSync(keysPath, "utf-8"));
}

/* ---------- OPENAI SETUP ---------- */
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ---------- ACTIVE BOTS ---------- */
const activeBots = new Map();

/* ---------- CREATE BOT ---------- */
async function createBot(userId, socket) {
    const sessionPath = path.join("./sessions", userId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({ auth: state, printQRInTerminal: false });
    activeBots.set(userId, sock);

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { qr, connection } = update;

        if (qr) {
            const qrImage = await QRCode.toDataURL(qr);
            socket.emit("qr", qrImage);
        }

        if (connection === "open") socket.emit("status", "✅ Bot Connected Successfully");
        if (connection === "close") {
            activeBots.delete(userId);
            socket.emit("status", "❌ Bot Disconnected");
        }
    });

    return sock;
}

/* ---------- SOCKET.IO ---------- */
io.on("connection", (socket) => {
    console.log("User connected");

    // QR LOGIN
    socket.on("start-qr", async ({ userId }) => {
        if (!userId) return socket.emit("status", "Enter username first");
        if (activeBots.has(userId)) return socket.emit("status", "Bot already running");
        await createBot(userId, socket);
    });

    // CODE LOGIN
    socket.on("start-code", async ({ userId, phone }) => {
        if (!userId || !phone) return socket.emit("status", "Enter username & phone");
        if (activeBots.has(userId)) return socket.emit("status", "Bot already running");

        try {
            const sock = await createBot(userId, socket);

            // Generate an 8-digit code
            const code = Math.floor(10000000 + Math.random() * 90000000).toString();

            // Send code to the frontend
            socket.emit("pair-code", code);

            // Optionally: send to WhatsApp user
            await sock.sendMessage(`${phone}@s.whatsapp.net`, { text: `Welcome to Nexora V2 Premium! Your 8-digit session code: ${code}` });

        } catch (err) {
            console.error(err);
            socket.emit("status", "❌ Failed to generate pairing code");
        }
    });
});

/* ---------- VALIDATE KEY ---------- */
app.post("/validate-key", (req, res) => {
    const { key } = req.body;
    if (!key) return res.json({ valid: false });

    const isValid = validKeys.includes(key);
    res.json({ valid: isValid });
});

/* ---------- MINI AI ---------- */
app.post("/ask-ai", async (req, res) => {
    const { question } = req.body;
    if (!question) return res.json({ answer: "Ask about Nexora bot system." });

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "You are Nexora V2 AI assistant. Only answer about bots, deployment, automation, and Nexora system." },
                { role: "user", content: question }
            ]
        });
        res.json({ answer: response.choices[0].message.content });
    } catch (err) {
        res.json({ answer: "AI temporarily unavailable." });
    }
});

/* ---------- START SERVER ---------- */
server.listen(PORT, () => console.log("🚀 Nexora V2 running on port " + PORT));