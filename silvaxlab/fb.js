const axios = require("axios");

const handler = {
    help: ["fb", "fbdl", "facebook"],
    tags: ["downloader", "media"],
    command: /^(fb|fbdl|facebook)$/i,
    group: false,
    admin: false,
    botAdmin: false,
    owner: false,

    execute: async ({ jid, sock, message, args }) => {
        const sender = message.key.participant || message.key.remoteJid;
        const fbUrl = args[0];

        if (!fbUrl || !fbUrl.includes("facebook.com")) {
            return await sock.sendMessage(
                jid,
                {
                    text:
                        "❌ *Invalid Facebook link*\n\n" +
                        "Example:\n" +
                        ".fb https://www.facebook.com/share/v/xxxxx",
                    contextInfo: ctx(sender, "Silva MD FB Hub 📘")
                },
                { quoted: message }
            );
        }

        try {
            await sock.sendMessage(
                jid,
                {
                    text: "📥 *Fetching Facebook media…*",
                    contextInfo: ctx(sender, "Silva MD FB Hub 📘")
                },
                { quoted: message }
            );

            const api =
                "https://api-lite.silvatechinc.my.id/download/fbdown?url=" +
                encodeURIComponent(fbUrl);

            const { data } = await axios.get(api, { timeout: 15000 });

            if (!data.success || !data.result?.medias?.length) {
                throw new Error("No media found");
            }

            // Prefer highest quality (usually first item)
            const media = data.result.medias[0];

            if (media.type === "video") {
                await sock.sendMessage(
                    jid,
                    {
                        video: { url: media.url },
                        caption:
                            "🎥 *Facebook Video*\n\n" +
                            "Powered by *Silva MD*",
                        contextInfo: ctx(sender, "Silva MD FB Hub 📘")
                    },
                    { quoted: message }
                );
            } else {
                await sock.sendMessage(
                    jid,
                    {
                        text: "❌ Unsupported media type",
                        contextInfo: ctx(sender, "Silva MD Errors ⚠️")
                    },
                    { quoted: message }
                );
            }

        } catch (err) {
            await sock.sendMessage(
                jid,
                {
                    text:
                        "❌ *Facebook Download Error:*\n" +
                        err.message,
                    contextInfo: ctx(sender, "Silva MD Errors ⚠️")
                },
                { quoted: message }
            );
        }
    }
};

module.exports = { handler };


// 🧠 Shared contextInfo builder
function ctx(sender, name) {
    return {
        mentionedJid: [sender],
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: "120363200367779016@newsletter",
            newsletterName: name,
            serverMessageId: Math.floor(Math.random() * 1000)
        }
    };
}