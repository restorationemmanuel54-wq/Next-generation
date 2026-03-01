const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

/* ---------- SESSIONS FOLDER ---------- */
if (!fs.existsSync("./sessions")) fs.mkdirSync("./sessions");

/* ---------- ACTIVE BOTS ---------- */
const activeBots = new Map();

/* ---------- CREATE BOT ---------- */
async function createBot(userId, socket) {
    const sessionPath = path.join("./sessions", userId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({ auth: state, printQRInTerminal: false });
    activeBots.set(userId, sock);

    sock.ev.on("creds.update", saveCreds);

    // Store pairing/code info
    let pairingCode = null;

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // QR generation
        if (qr) {
            const qrImage = await QRCode.toDataURL(qr);
            socket.emit("qr", qrImage);
        }

        // Connection open
        if (connection === "open") {
            socket.emit("status", "✅ Bot Connected Successfully");

            // Send connected message with image to the user
            const msgImagePath = path.join(__dirname, "connected.png"); // place your image in root
            if (fs.existsSync(msgImagePath)) {
                await sock.sendMessage(`${userId}@s.whatsapp.net`, {
                    image: { url: msgImagePath },
                    caption: "✅ Connected! You are now linked.\nSend *.menu* on WhatsApp."
                }).catch(console.error);
            } else {
                await sock.sendMessage(`${userId}@s.whatsapp.net`, { text: "✅ Connected! You are now linked." });
            }
        }

        // Connection close
        if (connection === "close") {
            activeBots.delete(userId);
            socket.emit("status", "❌ Bot Disconnected");

            // Auto-reconnect if not logged out
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut && reason !== 401) {
                createBot(userId, socket);
            } else {
                fs.rmSync(sessionPath, { recursive: true, force: true });
            }
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
    socket.on("start-code", async ({ userId }) => {
        if (!userId) return socket.emit("status", "Enter username first");
        if (activeBots.has(userId)) return socket.emit("status", "Bot already running");

        const sock = await createBot(userId, socket);

        // Generate 8-digit code
        const code = Math.floor(10000000 + Math.random() * 90000000).toString();
        socket.emit("pair-code", code);
    });
});

/* ---------- START SERVER ---------- */
server.listen(PORT, () => console.log(`🚀 Nexora V2 running on port ${PORT}`));