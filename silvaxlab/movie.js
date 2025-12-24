const axios = require("axios");

const movieCache = new Map(); // stores search results per chat

const handler = {
    help: ["movie"],
    tags: ["movie", "download"],
    command: /^movie$/i,

    execute: async ({ sock, jid, message, args }) => {
        const sender = message.key.participant || message.key.remoteJid;
        const query = args.join(" ");

        // ===============================
        // STEP 2: USER REPLIES WITH NUMBER
        // ===============================
        if (!query && message.message?.extendedTextMessage?.text) {
            const choice = parseInt(message.message.extendedTextMessage.text.trim());
            const cached = movieCache.get(jid);

            if (!cached || isNaN(choice) || !cached[choice - 1]) return;

            const selected = cached[choice - 1];

            await sock.sendMessage(jid, {
                text: `🎬 *Fetching movie…*\n\n*${selected.title}*`,
                contextInfo: ctx(sender)
            }, { quoted: message });

            try {
                const src = await axios.get(
                    `https://movieapi.giftedtech.co.ke/api/sources/${selected.subjectId}`
                );

                const best =
                    src.data.results.find(v => v.quality === "480p") ||
                    src.data.results.find(v => v.quality === "360p") ||
                    src.data.results[0];

                if (!best?.download_url) throw new Error("No download source");

                // 🔥 DOWNLOAD THE MP4 MANUALLY
                const video = await axios.get(best.download_url, {
                    responseType: "arraybuffer",
                    headers: {
                        "User-Agent": "Mozilla/5.0",
                        "Referer": "https://movieapi.giftedtech.co.ke"
                    },
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity
                });

                await sock.sendMessage(jid, {
                    document: Buffer.from(video.data),
                    mimetype: "video/mp4",
                    fileName: `${selected.title} (${best.quality}).mp4`,
                    contextInfo: ctx(sender)
                }, { quoted: message });

                movieCache.delete(jid);

            } catch (err) {
                console.error(err);
                await sock.sendMessage(jid, {
                    text: "❌ Failed to download movie.",
                    contextInfo: ctx(sender)
                }, { quoted: message });
            }

            return;
        }

        // ===============================
        // STEP 1: SEARCH MOVIE
        // ===============================
        if (!query) {
            return sock.sendMessage(jid, {
                text: "🎥 *Movie search*\n\nExample:\n.movie Black Panther",
                contextInfo: ctx(sender)
            }, { quoted: message });
        }

        const res = await axios.get(
            `https://movieapi.giftedtech.co.ke/api/search/${encodeURIComponent(query)}`
        );

        const items = res.data.results.items.slice(0, 10);
        movieCache.set(jid, items);

        let text = `🎬 *Movie Results*\nReply with a number\n\n`;

        items.forEach((m, i) => {
            text +=
                `*${i + 1}.* ${m.title} (${m.releaseDate?.split("-")[0] || "N/A"})\n` +
                `⭐ IMDb: ${m.imdbRatingValue || "N/A"}\n\n`;
        });

        text += `📥 Sent as document\n⚡ Powered by Gifted Movies`;

        await sock.sendMessage(jid, {
            text,
            contextInfo: ctx(sender)
        }, { quoted: message });
    }
};

module.exports = { handler };

function ctx(sender) {
    return {
        mentionedJid: [sender],
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: "120363200367779016@newsletter",
            newsletterName: "Silva MD Movies 🎬",
            serverMessageId: 99
        }
    };
}