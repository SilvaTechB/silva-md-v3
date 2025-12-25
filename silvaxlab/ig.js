const { igdl } = require('ruhend-scraper');

module.exports = {
    name: 'instagram',
    commands: ['instagram', 'ig', 'igdl', 'insta'],
    category: 'downloader',

    handler: async ({ sock, m, sender, args }) => {
        try {
            const url = args[0];

            if (!url || !/instagram\.com/i.test(url)) {
                throw `📸 *Instagram Downloader*\n\n` +
                      `📌 Example:\n` +
                      `*.ig* https://www.instagram.com/reel/xxxxx`;
            }

            const contextInfo = {
                mentionedJid: [sender],
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363200367779016@newsletter',
                    newsletterName: 'Silva MD IG Hub 📸',
                    serverMessageId: 301
                }
            };

            await sock.sendMessage(sender, {
                text: '📥 *Fetching Instagram media…*',
                contextInfo
            }, { quoted: m });

            const result = await igdl(url);

            if (!result?.data?.length) {
                throw '❌ No downloadable media found.';
            }

            const medias = result.data.slice(0, 5);

            for (const media of medias) {
                if (!media.url) continue;

                await sock.sendMessage(sender, {
                    video: { url: media.url },
                    mimetype: 'video/mp4',
                    caption:
`🎥 *INSTAGRAM VIDEO*

⚡ High quality
🛡 Clean source
🚀 Powered by *Silva MD*`,
                    contextInfo: {
                        ...contextInfo,
                        externalAdReply: {
                            title: 'Instagram Video Downloader',
                            body: 'Silva MD • Reliable Engine',
                            thumbnailUrl: 'https://files.catbox.moe/5uli5p.jpeg',
                            sourceUrl: url,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: m });
            }

        } catch (err) {
            console.error('❌ IG DOWNLOAD ERROR:', err);

            await sock.sendMessage(sender, {
                text:
`⚠️ *Instagram Download Failed*

${String(err).replace(/^Error:\s*/i, '')}`,
                contextInfo: { mentionedJid: [sender] }
            }, { quoted: m });
        }
    }
};