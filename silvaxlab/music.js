const yts = require('yt-search')
const config = require('../config')

const handler = {
    help: ['play <song name>'],
    tags: ['music', 'media'],
    command: /^(play|song|music)$/i,
    group: false,
    admin: false,
    botAdmin: false,
    owner: false,

    execute: async ({ jid, sock, message, args }) => {
        try {
            const sender = message.key.participant || message.key.remoteJid
            const query = args.join(' ')

            if (!query) {
                return await sock.sendMessage(jid, {
                    text: `╭━━━━━━━━━━━━━━━━━━━━╮
┃   🎵 MUSIC PLAYER   ┃
╰━━━━━━━━━━━━━━━━━━━━╯

*Usage:*
${config.PREFIX}play <song name>
${config.PREFIX}song <song name>

*Example:*
${config.PREFIX}play Adele Hello

_Searches YouTube and sends the audio._`,
                    contextInfo: {
                        mentionedJid: [sender],
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363200367779016@newsletter',
                            newsletterName: 'SILVA MD MUSIC 🎶',
                            serverMessageId: 145
                        }
                    }
                }, { quoted: message })
            }

            await sock.sendMessage(jid, { react: { text: '🔍', key: message.key } })

            const searchResult = await yts(query)
            const videos = searchResult.videos

            if (!videos || videos.length === 0) {
                return await sock.sendMessage(jid, {
                    text: '❌ No results found for: ' + query
                }, { quoted: message })
            }

            const video = videos[0]

            if (video.seconds > 600) {
                return await sock.sendMessage(jid, {
                    text: '❌ Song too long! Max 10 minutes.'
                }, { quoted: message })
            }

            await sock.sendMessage(jid, { react: { text: '⬇️', key: message.key } })

            let audioUrl = null
            let downloadSuccess = false

            const apis = [
                `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${encodeURIComponent(video.url)}`,
                `https://api.dreaded.site/api/ytdl/audio?url=${encodeURIComponent(video.url)}`,
                `https://api.giftedtech.web.id/api/download/dlmp3?url=${encodeURIComponent(video.url)}`
            ]

            for (const api of apis) {
                try {
                    const axios = require('axios')
                    const { data } = await axios.get(api, { timeout: 30000 })
                    if (data && (data.result?.downloadUrl || data.result?.download_url || data.result?.url || data.url)) {
                        audioUrl = data.result?.downloadUrl || data.result?.download_url || data.result?.url || data.url
                        downloadSuccess = true
                        break
                    }
                } catch (e) {
                    continue
                }
            }

            if (!downloadSuccess || !audioUrl) {
                await sock.sendMessage(jid, {
                    image: { url: video.thumbnail },
                    caption: `🎶 *${video.title}*\n\n` +
                        `⏱ Duration: ${video.timestamp}\n` +
                        `👁 Views: ${video.views?.toLocaleString() || 'N/A'}\n` +
                        `📺 Channel: ${video.author?.name || 'Unknown'}\n` +
                        `🔗 ${video.url}\n\n` +
                        `_⚠️ Audio download temporarily unavailable. Use the link above._`,
                    contextInfo: {
                        mentionedJid: [sender],
                        forwardingScore: 999,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363200367779016@newsletter',
                            newsletterName: 'SILVA MD MUSIC 🎶',
                            serverMessageId: 145
                        }
                    }
                }, { quoted: message })
                return
            }

            await sock.sendMessage(jid, {
                audio: { url: audioUrl },
                mimetype: 'audio/mpeg',
                contextInfo: {
                    externalAdReply: {
                        title: video.title,
                        body: video.author?.name || 'Silva MD Music',
                        thumbnailUrl: video.thumbnail,
                        mediaType: 2,
                        mediaUrl: video.url,
                        sourceUrl: video.url
                    }
                }
            }, { quoted: message })

            await sock.sendMessage(jid, {
                text: `🎶 *Now Playing*\n\n` +
                    `• *Title:* ${video.title}\n` +
                    `• *Channel:* ${video.author?.name || 'Unknown'}\n` +
                    `• *Duration:* ${video.timestamp}\n` +
                    `• *Views:* ${video.views?.toLocaleString() || 'N/A'}\n\n` +
                    `_${config.BOT_NAME || 'Silva MD'} Music Player_`,
                contextInfo: {
                    mentionedJid: [sender],
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363200367779016@newsletter',
                        newsletterName: 'SILVA MD MUSIC 🎶',
                        serverMessageId: 145
                    }
                }
            }, { quoted: message })

            await sock.sendMessage(jid, { react: { text: '🎵', key: message.key } })

        } catch (err) {
            console.error('PLAY ERROR:', err)
            await sock.sendMessage(jid, {
                text: '❌ *Music Error*\nFailed to fetch or play the song. Try again later.',
                contextInfo: {
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363200367779016@newsletter',
                        newsletterName: 'SILVA MD MUSIC 🎶',
                        serverMessageId: 145
                    }
                }
            }, { quoted: message })
        }
    }
}

module.exports = { handler }
