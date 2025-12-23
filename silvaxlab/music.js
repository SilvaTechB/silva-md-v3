const axios = require('axios')
const ytSearch = require('yt-search')

const handler = {
  help: ['play', 'song', 'ytmusic', 'spotify'],
  tags: ['media'],
  command: /^(play|song|ytmusic|spotify)$/i,
  group: false,
  admin: false,
  botAdmin: false,
  owner: false,

  execute: async ({ jid, sock, message, text }) => {
    try {
      const sender = message.key.participant || message.key.remoteJid

      if (!text) {
        return sock.sendMessage(
          jid,
          { text: '❌ *What should I play?*\n\nExample:\n.play faded alan walker' },
          { quoted: message }
        )
      }

      await sock.sendMessage(
        jid,
        { text: '🎧 *Silva MD is searching your track…*\n🔎 Please wait a moment.' },
        { quoted: message }
      )

      // 🔍 YouTube search
      const search = await ytSearch(text)
      const video = search.videos?.[0]

      if (!video) {
        return sock.sendMessage(
          jid,
          { text: '❌ No matching songs found.' },
          { quoted: message }
        )
      }

      const link = video.url

      // 🌐 Fallback APIs
      const apis = [
        `https://api-rebix.zone.id/api/yta?url=${link}`,
        `https://api.ryzendesu.vip/api/downloader/ytmp3?url=${link}`
      ]

      let audioUrl, title, artist, thumbnail

      for (const api of apis) {
        try {
          const { data } = await axios.get(api)
          if (data?.status === 200 || data?.success) {
            audioUrl = data.result?.downloadUrl || data.url
            title = data.result?.title || video.title
            artist = data.result?.author || video.author.name
            thumbnail = data.result?.image || video.thumbnail
            break
          }
        } catch {
          continue
        }
      }

      if (!audioUrl) {
        return sock.sendMessage(
          jid,
          { text: '⚠️ All servers failed to fetch this song. Try again later.' },
          { quoted: message }
        )
      }

      // 🎴 Preview card
      await sock.sendMessage(
        jid,
        {
          image: { url: thumbnail },
          caption: `
🎧 *NOW PLAYING*

🎶 *Title:* ${title}
🎤 *Artist:* ${artist}
🌐 *Source:* YouTube

✨ Powered by *Silva MD*
          `.trim(),
          contextInfo: {
            mentionedJid: [sender],
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: '120363200367779016@newsletter',
              newsletterName: 'Silva MD Music Hub 🎶',
              serverMessageId: 145
            }
          }
        },
        { quoted: message }
      )

      // 🎵 Audio stream
      await sock.sendMessage(
        jid,
        {
          audio: { url: audioUrl },
          mimetype: 'audio/mp4',
          ptt: false,
          contextInfo: {
            mentionedJid: [sender]
          }
        },
        { quoted: message }
      )

      // 📁 MP3 file
      await sock.sendMessage(
        jid,
        {
          document: { url: audioUrl },
          mimetype: 'audio/mp3',
          fileName: `${title.replace(/[^a-zA-Z0-9 ]/g, '')}.mp3`,
          contextInfo: {
            mentionedJid: [sender]
          }
        },
        { quoted: message }
      )

      await sock.sendMessage(
        jid,
        { text: '✅ *Song delivered successfully!* Enjoy the vibes 🎶' },
        { quoted: message }
      )

    } catch (err) {
      console.error('Music Error:', err)
      await sock.sendMessage(
        jid,
        { text: `🚫 *Music error*\n\n${err.message}` },
        { quoted: message }
      )
    }
  }
}

module.exports = { handler }