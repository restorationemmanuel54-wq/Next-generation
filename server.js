const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const QRCode = require("qrcode");
const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const OpenAI = require("openai");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

if (!fs.existsSync("./sessions")) fs.mkdirSync("./sessions");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function startBot(userId, socket){

  const { state, saveCreds } = await useMultiFileAuthState(`sessions/${userId}`);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal:false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update)=>{
    const { qr, connection } = update;

    if(qr){
      const qrImage = await QRCode.toDataURL(qr);
      socket.emit("qr", qrImage);
    }

    if(connection === "open"){
      socket.emit("status","Bot Connected Successfully");
    }

    if(connection === "close"){
      socket.emit("status","Bot Disconnected");
    }
  });
}

app.post("/ask-ai", async (req,res)=>{
  const { question } = req.body;
  if(!question) return res.json({ answer:"Ask something about Nexora V2." });

  try{
    const response = await openai.chat.completions.create({
      model:"gpt-3.5-turbo",
      messages:[
        { role:"system", content:"You are Nexora V2 AI. Only answer Nexora related questions." },
        { role:"user", content:question }
      ]
    });

    res.json({ answer: response.choices[0].message.content });

  }catch(err){
    res.json({ answer:"AI system temporarily unavailable." });
  }
});

io.on("connection",(socket)=>{
  socket.on("start-qr", async ({userId})=>{
    if(!userId) return;
    await startBot(userId, socket);
  });
});

server.listen(PORT, ()=>{
  console.log("🚀 Nexora V2 Hacker Console Running on port " + PORT);
});