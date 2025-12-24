const axios = require("axios");

const SEARCH_API = "https://movieapi.giftedtech.co.ke/api/search";
const SOURCE_API = "https://movieapi.giftedtech.co.ke/api/sources";

// Store movie results per chat
global.movieStore = global.movieStore || new Map();

module.exports = {
    name: "movie",
    alias: ["movies", "film"],

    async execute(m, sock) {
        const jid = m.chat;
        const sender = m.sender;
        const text = m.text?.trim();

        const contextInfo = {
            mentionedJid: [sender],
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: "120363200367779016@newsletter",
                newsletterName: "Silva MD Movies 🎬",
                serverMessageId: 145
            }
        };

        if (!text) {
            return m.reply("📽️ *Usage:* `.movie Black Panther`");
        }

        // ===============================
        // NUMBER SELECTION
        // ===============================
        if (/^\d+$/.test(text)) {
            const index = Number(text) - 1;
            const stored = global.movieStore.get(jid);

            if (!stored || !stored[index]) {
                return sock.sendMessage(
                    jid,
                    { text: "❌ Invalid selection. Search again.", contextInfo },
                    { quoted: m }
                );
            }

            const movie = stored[index];

            await sock.sendMessage(
                jid,
                {
                    text: `🎬 *Downloading:* ${movie.title}\n⏳ Please wait...`,
                    contextInfo
                },
                { quoted: m }
            );

            try {
                const src = await axios.get(
                    `${SOURCE_API}/${movie.subjectId}`
                );

                const list = src.data.results;

                const chosen =
                    list.find(v => v.quality === "480p") ||
                    list.find(v => v.quality === "360p") ||
                    list[0];

                if (!chosen) throw new Error("No source");

                const video = await axios.get(chosen.download_url, {
                    responseType: "arraybuffer",
                    headers: {
                        "User-Agent": "Mozilla/5.0",
                        "Referer": "https://movieapi.giftedtech.co.ke"
                    },
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity
                });

                await sock.sendMessage(
                    jid,
                    {
                        document: Buffer.from(video.data),
                        mimetype: "video/mp4",
                        fileName: `${movie.title} (${chosen.quality}).mp4`,
                        contextInfo
                    },
                    { quoted: m }
                );

                global.movieStore.delete(jid);

            } catch (e) {
                console.error(e);
                return sock.sendMessage(
                    jid,
                    { text: "❌ Failed to download movie.", contextInfo },
                    { quoted: m }
                );
            }

            return;
        }

        // ===============================
        // SEARCH MOVIE
        // ===============================
        try {
            const res = await axios.get(
                `${SEARCH_API}/${encodeURIComponent(text)}`
            );

            const items = res.data.results.items.slice(0, 10);

            if (!items.length) {
                return sock.sendMessage(
                    jid,
                    { text: "❌ No movies found.", contextInfo },
                    { quoted: m }
                );
            }

            global.movieStore.set(jid, items);

            let msg = `🎬 *Movie Results for:* ${text}\n\n`;
            items.forEach((v, i) => {
                msg += `${i + 1}. *${v.title}* (${v.releaseDate || "N/A"})\n`;
            });

            msg += `\n📥 Reply with the *number* to download`;

            await sock.sendMessage(
                jid,
                { text: msg, contextInfo },
                { quoted: m }
            );

        } catch (e) {
            console.error(e);
            await sock.sendMessage(
                jid,
                { text: "❌ Error fetching movies.", contextInfo },
                { quoted: m }
            );
        }
    }
};