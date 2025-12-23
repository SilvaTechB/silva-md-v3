// Instagram Downloader Plugin (Silva MD)

const axios = require("axios");

const handler = {
    help: ["ig", "igdl", "instagram"],
    tags: ["downloader", "media"],
    command: /^(ig|igdl|instagram)$/i,
    group: false,
    admin: false,
    botAdmin: false,
    owner: false,

    execute: async ({ jid, sock, message, args }) => {
        const sender = message.key.participant || message.key.remoteJid;
        const igUrl = args[0];

        if (!igUrl || !igUrl.includes("instagram.com")) {
            return await sock.sendMessage(jid, {
                text: "❌ *Invalid Instagram link*\n\nExample:\n.ig https://www.instagram.com/reel/xxxxx",
                contextInfo: {
                    mentionedJid: [sender],
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363200367779016@newsletter",
                        newsletterName: "Silva MD IG Hub 📸",
                        serverMessageId: 145
                    }
                }
            }, { quoted: message });
        }

        try {
            await sock.sendMessage(jid, {
                text: "📥 *Fetching Instagram video…*",
                contextInfo: {
                    mentionedJid: [sender],
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363200367779016@newsletter",
                        newsletterName: "Silva MD IG Hub 📸",
                        serverMessageId: 145
                    }
                }
            }, { quoted: message });

            const api = `https://api.nekolabs.web.id/dwn/instagram?url=${encodeURIComponent(igUrl)}`;
            const { data } = await axios.get(api);

            if (!data.success || !data.result?.url?.length) {
                throw new Error("No media found");
            }

            // Instagram API always returns videos here
            const videoUrl = data.result.url[0];

            await sock.sendMessage(jid, {
                video: { url: videoUrl },
                caption: "🎥 *Instagram Video*\n\nPowered by Silva MD",
                contextInfo: {
                    mentionedJid: [sender],
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363200367779016@newsletter",
                        newsletterName: "Silva MD IG Hub 📸",
                        serverMessageId: 145
                    }
                }
            }, { quoted: message });

        } catch (err) {
            await sock.sendMessage(jid, {
                text: `❌ *Instagram Download Error:*\n${err.message}`,
                contextInfo: {
                    mentionedJid: [sender],
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "120363200367779016@newsletter",
                        newsletterName: "Silva MD Errors ⚠️",
                        serverMessageId: 145
                    }
                }
            }, { quoted: message });
        }
    }
};

module.exports = { handler };