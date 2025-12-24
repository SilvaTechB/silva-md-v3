const axios = require("axios");

const MOVIE_SEARCH_API = "https://movieapi.giftedtech.co.ke/api/search";
const MOVIE_SOURCES_API = "https://movieapi.giftedtech.co.ke/api/sources";

// In-memory selection store (per chat)
const movieCache = new Map();

module.exports = {
    pattern: "movie",
    alias: ["movies", "film"],
    desc: "Search and download movies",
    category: "download",

    async execute(sock, message, args) {
        const jid = message.key.remoteJid;
        const sender = message.key.participant || jid;

        const ctx = {
            contextInfo: {
                mentionedJid: [sender],
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: "120363200367779016@newsletter",
                    newsletterName: "Silva MD Movies 🎬",
                    serverMessageId: 145
                }
            }
        };

        // ===============================
        // 1️⃣ NUMBER SELECTION HANDLER
        // ===============================
        if (/^\d+$/.test(args[0])) {
            const index = Number(args[0]) - 1;
            const cached = movieCache.get(jid);

            if (!cached || !cached[index]) {
                return sock.sendMessage(
                    jid,
                    { text: "❌ Invalid selection. Please search again.", ...ctx },
                    { quoted: message }
                );
            }

            const movie = cached[index];

            await sock.sendMessage(
                jid,
                { text: `🎬 *Downloading:* ${movie.title}\n⏳ Please wait...`, ...ctx },
                { quoted: message }
            );

            try {
                // Fetch download sources
                const srcRes = await axios.get(
                    `${MOVIE_SOURCES_API}/${movie.subjectId}`
                );

                const sources = srcRes.data.results;
                const best =
                    sources.find(v => v.quality === "480p") ||
                    sources.find(v => v.quality === "360p") ||
                    sources[0];

                if (!best) throw new Error("No download source found");

                // Download MP4 as binary
                const videoRes = await axios.get(best.download_url, {
                    responseType: "arraybuffer",
                    headers: {
                        "User-Agent": "Mozilla/5.0",
                        "Referer": "https://movieapi.giftedtech.co.ke"
                    },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                });

                await sock.sendMessage(
                    jid,
                    {
                        document: Buffer.from(videoRes.data),
                        mimetype: "video/mp4",
                        fileName: `${movie.title} (${best.quality}).mp4`,
                        ...ctx
                    },
                    { quoted: message }
                );

                movieCache.delete(jid);

            } catch (err) {
                console.error(err);
                await sock.sendMessage(
                    jid,
                    { text: "❌ Failed to download movie.", ...ctx },
                    { quoted: message }
                );
            }
            return;
        }

        // ===============================
        // 2️⃣ SEARCH HANDLER
        // ===============================
        if (!args.length) {
            return sock.sendMessage(
                jid,
                { text: "📽️ Usage: `.movie Black Panther`", ...ctx },
                { quoted: message }
            );
        }

        const query = args.join(" ");

        try {
            const res = await axios.get(
                `${MOVIE_SEARCH_API}/${encodeURIComponent(query)}`
            );

            const items = res.data.results.items.slice(0, 10);

            if (!items.length) {
                return sock.sendMessage(
                    jid,
                    { text: "❌ No movies found.", ...ctx },
                    { quoted: message }
                );
            }

            movieCache.set(jid, items);

            let list = `🎬 *Movie Results for:* ${query}\n\n`;
            items.forEach((m, i) => {
                list += `${i + 1}. *${m.title}* (${m.releaseDate || "N/A"})\n`;
            });

            list += `\n📥 Reply with the *number* to download`;

            await sock.sendMessage(
                jid,
                { text: list, ...ctx },
                { quoted: message }
            );

        } catch (err) {
            console.error(err);
            await sock.sendMessage(
                jid,
                { text: "❌ Error searching movies.", ...ctx },
                { quoted: message }
            );
        }
    }
};