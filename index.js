const express = require("express");
const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");

const app = express();
app.use(express.json());

app.post("/generate-code", async (req, res) => {
    const phoneNumber = req.body.phone;

    if (!phoneNumber) {
        return res.json({ error: "Phone number required" });
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
        }

        res.json({ message: "Already linked" });

    } catch (err) {
        console.log(err);
        res.json({ error: "Failed to generate code" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running"));