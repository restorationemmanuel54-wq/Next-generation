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
const activeBots = new Map();

if (!fs.existsSync("./sessions")) fs.mkdirSync("./sessions");

async function createBot(socket, phone) {
    const userId = phone.replace(/\D/g,''); // use phone as userId
    const sessionPath = path.join("./sessions", userId);
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({ auth: state, printQRInTerminal: false });
    activeBots.set(userId, sock);

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async update => {
        const { qr, connection } = update;

        // QR login
        if(qr){
            const qrImage = await QRCode.toDataURL(qr);
            socket.emit("qr", qrImage);
        }

        // Bot connected
        if(connection === "open"){
            socket.emit("status", "✅ Bot Connected!");
            
            // Send connected message with image
            try {
                await sock.sendMessage(`${phone}@s.whatsapp.net`, {
                    image: { url: "https://i.postimg.cc/qqfKZcJ5/IMG-20260228-WA0002.png" },
                    caption: "✅ Connected! You are now the Owner.\nSend *.menu* to start."
                });
            } catch(e){
                console.error("Failed to send connected message:", e);
            }
        }

        if(connection === "close"){
            activeBots.delete(userId);
            socket.emit("status", "❌ Bot Disconnected");
        }
    });

    // Code login: generate 8-digit code and emit
    if(phone){
        const code = Math.floor(10000000 + Math.random() * 90000000).toString();
        socket.emit("pair-code", code);
    }

    return sock;
}

io.on("connection", socket => {
    console.log("User connected");

    socket.on("start-qr", async () => {
        await createBot(socket);
    });

    socket.on("start-code", async ({ phone }) => {
        if(!phone) return socket.emit("status", "Enter phone number");
        await createBot(socket, phone);
    });
});

server.listen(PORT, () => console.log("🚀 Nexora V2 running on port", PORT));