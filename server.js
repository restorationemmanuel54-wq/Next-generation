const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const keysPath = path.join(__dirname, "keys.json");

if (!fs.existsSync("./sessions")) {
  fs.mkdirSync("./sessions", { recursive: true });
}

let activeBots = new Map();

/* ================= KEY VALIDATION ================= */

function validateKey(key) {
  if (!fs.existsSync(keysPath)) return { valid:false, message:"Key file missing" };

  const keys = JSON.parse(fs.readFileSync(keysPath));
  const found = keys.find(k => k.key === key);

  if (!found) return { valid:false, message:"Invalid key" };
  if (found.used) return { valid:false, message:"Key already used" };
  if (new Date() > new Date(found.expires)) return { valid:false, message:"Key expired" };

  return { valid:true };
}

/* ================= START BOT ================= */

async function startBot(userId, socket) {
  const { state, saveCreds } = await useMultiFileAuthState(sessions/${userId});

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false
  });

  activeBots.set(userId, sock);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { qr, connection, lastDisconnect } = update;

    if (qr) {
      const qrImage = await QRCode.toDataURL(qr);
      socket.emit("qr", qrImage);
    }

    if (connection === "open") {
      socket.emit("connected");
    }

    if (connection === "close") {
      activeBots.delete(userId);
      socket.emit("disconnected");

      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        startBot(userId, socket);
      }
    }
  });
}

/* ================= DEPLOY KEY ================= */

app.post("/validate-key", (req,res)=>{
  const { key } = req.body;
  const check = validateKey(key);

  if(!check.valid) return res.json(check);

  // mark as used
  const keys = JSON.parse(fs.readFileSync(keysPath));
  const index = keys.findIndex(k=>k.key===key);
  keys[index].used = true;
  fs.writeFileSync(keysPath, JSON.stringify(keys,null,2));

  res.json({ valid:true, message:"Welcome" });
});

/* ================= AI ROUTE ================= */

app.post("/ai", (req,res)=>{
  const q = req.body.question.toLowerCase();
  let answer = "I only answer questions about Nexora V2 panel.";

  if(q.includes("deploy"))
    answer = "Click Deploy, enter your key, choose login method, then enter session ID and press Deploy 🚀.";

  else if(q.includes("qr"))
    answer = "QR login lets you scan a QR code using WhatsApp linked devices.";

  else if(q.includes("code"))
    answer = "Code login generates a pairing code. Copy and paste it into WhatsApp to link.";

  else if(q.includes("session"))
    answer = "Session ID appears after login. Paste it into the session box and press Deploy 🚀.";

  res.json({answer});
});

/* ================= SOCKET ================= */

io.on("connection",(socket)=>{

  socket.on("start-qr", async ({userId})=>{
    await startBot(userId, socket);
  });

  socket.on("generate-code", ({phone})=>{
    const pairingCode = Math.floor(100000 + Math.random()*900000).toString();
    socket.emit("pairing-code", pairingCode);
  });

});

server.listen(PORT, ()=>{
  console.log("Nexora running on port " + PORT);
});