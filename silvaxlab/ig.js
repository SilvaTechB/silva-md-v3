const axios = require("axios");

const handler = {
    help: ["ig <instagram link>"],
    tags: ["media", "downloader"],
    command: /^(ig|instagram)$/i,
    group: false,
    admin: false,
    botAdmin: false,
    owner: false,

    execute: async ({ jid, sock, message, args }) => {
        try {
            const sender = message.key.participant || message.key.remoteJid;
            const url = args[0];

            if (!url || !url.includes("instagram.com")) {
                return await sock.sendMessage(jid, {
                    text: "❌ Provide a valid Instagram link.\n\nExample:\n.ig https://www.instagram.com/reel/xxxx/",
                    contextInfo: {
                        mentionedJid: [sender]
                    }
                }, { quoted: message });
            }

            const api = `https://api.nekolabs.web.id/dwn/instagram?url=${encodeURIComponent(url)}`;
            const { data } = await axios.get(api);

            if (!data || !data.success || !data.result) {
                return await sock.sendMessage(jid, {
                    text: "❌ Failed to fetch Instagram media.",
                    contextInfo: {
                        mentionedJid: [sender]
                    }
                }, { quoted: message });
            }

            const media = Array.isArray(data.result) ? data.result : [data.result];

            for (const item of media) {
                if (!item.url) continue;

                const isVideo = item.type === "video";

                await sock.sendMessage(jid, isVideo ? {
                    video: { url: item.url },
                    caption: "📸 *Instagram Downloaded*",
                    contextInfo: {
                        mentionedJid: [sender],
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "120363200367779016@newsletter",
                            newsletterName: "Silva MD Media Hub 📥",
                            serverMessageId: 146
                        }
                    }
                } : {
                    image: { url: item.url },
                    caption: "📸 *Instagram Downloaded*",
                    contextInfo: {
                        mentionedJid: [sender],
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: "120363200367779016@newsletter",
                            newsletterName: "Silva MD Media Hub 📥",
                            serverMessageId: 146
                        }
                    }
                }, { quoted: message });
            }

        } catch (err) {
            console.error("INSTAGRAM ERROR:", err);

            await sock.sendMessage(jid, {
                text: "❌ *Instagram Error*\nUnable to download this post.",
                contextInfo: {
                    mentionedJid: [message.key.participant || message.key.remoteJid],
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363200367779016@newsletter",
                        newsletterName: "Silva MD Media Hub 📥",
                        serverMessageId: 146
                    }
                }
            }, { quoted: message });
        }
    }
};

module.exports = { handler };