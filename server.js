const express = require("express");
const path = require("path");
const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// prevent favicon 404
app.get('/favicon.ico', (req, res) => res.status(204));

// Generate Pairing Code Route
app.post("/generate-code", async (req, res) => {
    const phoneNumber = req.body.phone;

    if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number required" });
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState(`./sessions/${phoneNumber}`);

        const sock = makeWASocket({
            auth: state
        });

        sock.ev.on("creds.update", saveCreds);

        if (!sock.authState.creds.registered) {
            const code = await sock.requestPairingCode(phoneNumber);
            return res.json({ code });
        } else {
            return res.json({ message: "Already linked" });
        }

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to generate code" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));