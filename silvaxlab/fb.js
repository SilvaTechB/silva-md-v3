const fg = require('api-dylux');

module.exports = {
    name: 'facebook',
    commands: ['facebook', 'fb', 'fbdl'],
    category: 'downloader',

    handler: async ({ sock, m, sender, args }) => {
        try {
            const url = args[0];

            if (!url || !/(facebook\.com|fb\.watch)/i.test(url)) {
                throw `📘 *Facebook Downloader*\n\n` +
                      `📌 Example:\n` +
                      `*.fb* https://www.facebook.com/watch/?v=xxxxx`;
            }

            const contextInfo = {
                mentionedJid: [sender],
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363200367779016@newsletter',
                    newsletterName: 'Silva MD FB Hub 📘',
                    serverMessageId: 201
                }
            };

            await sock.sendMessage(sender, {
                text: '📥 *Downloading Facebook video…*',
                contextInfo
            }, { quoted: m });

            const result = await fg.fbdl(url);

            if (!result?.videoUrl) {
                throw '❌ Failed to fetch Facebook video.';
            }

            await sock.sendMessage(sender, {
                video: { url: result.videoUrl },
                mimetype: 'video/mp4',
                caption:
`🎬 *FACEBOOK VIDEO*

📌 Title: ${result.title || 'Facebook Reel'}
⚡ Fast download
🚀 Powered by *Silva MD*`,
                contextInfo: {
                    ...contextInfo,
                    externalAdReply: {
                        title: 'Facebook Video Downloader',
                        body: 'Silva MD • Clean & Fast',
                        thumbnailUrl: 'https://files.catbox.moe/5uli5p.jpeg',
                        sourceUrl: url,
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            }, { quoted: m });

        } catch (err) {
            console.error('❌ FB DOWNLOAD ERROR:', err);

            await sock.sendMessage(sender, {
                text:
`⚠️ *Facebook Download Failed*

${String(err).replace(/^Error:\s*/i, '')}`,
                contextInfo: { mentionedJid: [sender] }
            }, { quoted: m });
        }
    }
};