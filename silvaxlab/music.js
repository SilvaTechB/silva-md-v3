const axios = require("axios");

const handler = {
    help: ["play <song name>"],
    tags: ["song", "music"],
    command: /^play$/i,
    group: false,
    admin: false,
    botAdmin: false,
    owner: false,

    execute: async ({ jid, sock, message, args }) => {
        try {
            const sender = message.key.participant || message.key.remoteJid;
            const query = args.join(" ");

            if (!query) {
                return await sock.sendMessage(jid, {
                    text: "❌ Provide a song name.\nExample:\n.play Hello",
                    contextInfo: {
                        mentionedJid: [sender]
                    }
                }, { quoted: message });
            }

            const api = `https://api.nekolabs.web.id/dwn/youtube/play/v1?q=${encodeURIComponent(query)}`;
            const { data } = await axios.get(api);

            if (!data || !data.success) {
                return await sock.sendMessage(jid, {
                    text: "❌ Music not found.",
                    contextInfo: {
                        mentionedJid: [sender]
                    }
                }, { quoted: message });
            }

            const meta = data.result.metadata;
            const audioUrl = data.result.downloadUrl;

            // 🎵 Send audio
            await sock.sendMessage(jid, {
                audio: { url: audioUrl },
                mimetype: "audio/mpeg"
            }, { quoted: message });

            // 📰 Send newsletter-style info message
            await sock.sendMessage(jid, {
                text:
                    `🎶 *Now Playing*\n\n` +
                    `• *Title:* ${meta.title}\n` +
                    `• *Channel:* ${meta.channel}\n` +
                    `• *Duration:* ${meta.duration}`,
                contextInfo: {
                    mentionedJid: [sender],
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363200367779016@newsletter",
                        newsletterName: "Silva MD Music Hub 🎶",
                        serverMessageId: 145
                    }
                }
            }, { quoted: message });

        } catch (err) {
            console.error("PLAY ERROR:", err);

            await sock.sendMessage(jid, {
                text: "❌ *Music Error*\nFailed to fetch or play the song.",
                contextInfo: {
                    mentionedJid: [message.key.participant || message.key.remoteJid],
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363200367779016@newsletter",
                        newsletterName: "Silva MD Music Hub 🎶",
                        serverMessageId: 145
                    }
                }
            }, { quoted: message });
        }
    }
};

module.exports = { handler };