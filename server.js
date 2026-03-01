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

if (!fs.existsSync("./sessions")) fs.mkdirSync("./sessions");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const activeBots = new Map();

async function createBot(userId,socket){
    const sessionPath = path.join("./sessions",userId);
    const {state,saveCreds}=await useMultiFileAuthState(sessionPath);

    const sock = makeWASocket({auth:state,printQRInTerminal:false});
    activeBots.set(userId,sock);

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async(update)=>{
        const {qr,connection} = update;
        if(qr){
            const qrImage = await QRCode.toDataURL(qr);
            socket.emit("qr",qrImage);
        }
        if(connection==="open") socket.emit("status","✅ Bot Connected Successfully");
        if(connection==="close"){ activeBots.delete(userId); socket.emit("status","❌ Bot Disconnected"); }
    });

    return sock;
}

io.on("connection",(socket)=>{
    console.log("User connected");

    socket.on("start-qr", async({userId})=>{
        if(!userId) return socket.emit("status","Enter username first");
        if(activeBots.has(userId)) return socket.emit("status","Bot already running");
        await createBot(userId,socket);
    });

    socket.on("start-code", async({userId,phone})=>{
        if(!userId||!phone) return socket.emit("status","Enter username & phone");
        if(activeBots.has(userId)) return socket.emit("status","Bot already running");

        const sock = await createBot(userId,socket);
        setTimeout(async()=>{
            try{
                const code = Math.floor(100000+Math.random()*900000).toString();
                socket.emit("pair-code",code);
                await sock.sendMessage(`${phone}@s.whatsapp.net`, {text:`Welcome to Nexora V2 Premium! Your session code: ${code}`});
            }catch(err){
                console.error(err);
                socket.emit("status","❌ Failed to generate pairing code");
            }
        },3000);
    });
});

app.post("/ask-ai", async(req,res)=>{
    const {question}=req.body;
    if(!question) return res.json({answer:"Ask about Nexora bot system."});

    try{
        const response = await openai.chat.completions.create({
            model:"gpt-3.5-turbo",
            messages:[
                {role:"system", content:"You are Nexora V2 AI assistant. Only answer about bots, deployment, automation, and Nexora system."},
                {role:"user", content:question}
            ]
        });
        res.json({answer:response.choices[0].message.content});
    }catch(err){
        console.error(err);
        res.json({answer:"AI temporarily unavailable."});
    }
});

server.listen(PORT,()=>{console.log("🚀 Nexora V2 running on port "+PORT);});