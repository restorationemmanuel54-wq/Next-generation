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

/* ---------- SESSIONS FOLDER ---------- */
if (!fs.existsSync("./sessions")) fs.mkdirSync("./sessions");

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

    /* QR LOGIN */
    socket.on("start-qr", async ({ userId }) => {
        if (!userId) return socket.emit("status", "Enter username first");
        if (activeBots.has(userId)) return socket.emit("status", "Bot already running");
        await createBot(userId, socket);
    });

    /* CODE LOGIN */
    socket.on("start-code", async ({ userId, phone }) => {
        if (!userId || !phone) return socket.emit("status", "Enter username & phone");
        if (activeBots.has(userId)) return socket.emit("status", "Bot already running");

        const sock = await createBot(userId, socket);

        setTimeout(async () => {
            try {
                const code = Math.floor(100000 + Math.random() * 900000).toString();
                socket.emit("pair-code", code);

                await sock.sendMessage(`${phone}@s.whatsapp.net`, {
                    text: `Welcome to Nexora V2 Premium! Your session code: ${code}`
                });
            } catch (err) {
                console.error(err);
                socket.emit("status", "❌ Failed to generate pairing code");
            }
        }, 2000); // faster pairing
    });
});

/* ---------- MINI AI ---------- */
app.post("/ask-ai", async (req, res) => {
    const { question } = req.body;
    if (!question) return res.json({ answer: "Ask about Nexora bot system." });

    try {
        // simulate typing delay
        const typingSimulation = async (msg, interval = 50) => {
            let output = "";
            for (let i = 0; i < msg.length; i++) {
                output += msg[i];
                // send partial update every few characters
                if (i % 15 === 0) res.write(output);
                await new Promise(r => setTimeout(r, interval));
            }
            return output;
        };

        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "You are Nexora V2 AI assistant. Only answer about bots, deployment, automation, and Nexora system." },
                { role: "user", content: question }
            ],
            temperature: 0.3,
            max_tokens: 350
        });

        let answer = response.choices[0].message.content;
        // optional: slow response to feel like typing (comment out if instant)
        // answer = await typingSimulation(answer, 5);

        res.json({ answer });
    } catch (err) {
        console.error(err);
        res.json({ answer: "AI temporarily unavailable. Try again in a moment." });
    }
});

/* ---------- START SERVER ---------- */
server.listen(PORT, () => {
    console.log("🚀 Nexora V2 running on port " + PORT);
});