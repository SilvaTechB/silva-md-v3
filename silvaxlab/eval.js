// Clean Eval Plugin - Silva MD Bot
const util = require('util')
const config = require('../config')

const handler = {
    help: ['eval', 'ev'],
    tags: ['owner'],
    command: /^(eval|ev)$/i,
    owner: true,

    execute: async ({ jid, sock, message, args }) => {
        try {
            const from = message.key.remoteJid
            const sender = message.key.participant || from
            const query = args.join(' ').trim()

            if (!query) {
                return sock.sendMessage(jid, {
                    text: `┏━━━━━━━━━━━━━━━━━━━━┓
┃   ᴇᴠᴀʟ ᴄᴏᴍᴍᴀɴᴅ    ┃
┗━━━━━━━━━━━━━━━━━━━━┛

ᴜsᴀɢᴇ:
${config.PREFIX}eval <code>

ᴇxᴀᴍᴘʟᴇs:
${config.PREFIX}eval message.key
${config.PREFIX}eval sock.user
${config.PREFIX}eval Object.keys(message)
${config.PREFIX}eval await sock.groupMetadata(from)

💡 Executes JavaScript code with full bot context`
                }, { quoted: message })
            }

            // Create safe execution context
            const context = {
                sock,
                message,
                mek: message,
                from,
                sender,
                jid,
                config,
                args,
                util,
                console,
                Buffer,
                JSON,
                Object,
                Array,
                String,
                Number,
                Math,
                Date,
                Promise,
                require
            }

            let result
            let executionTime
            const startTime = Date.now()

            try {
                // Create async function for eval to support await
                const asyncEval = new Function(
                    ...Object.keys(context),
                    `return (async () => { ${query.includes('return') ? query : `return ${query}`} })()`
                )

                result = await asyncEval(...Object.values(context))
                executionTime = Date.now() - startTime

            } catch (evalError) {
                executionTime = Date.now() - startTime
                
                return sock.sendMessage(jid, {
                    text: `┏━━━━━━━━━━━━━━━━━━━━┓
┃   ᴇᴠᴀʟ ᴇʀʀᴏʀ      ┃
┗━━━━━━━━━━━━━━━━━━━━┛

❌ ${evalError.name}: ${evalError.message}

ᴄᴏᴅᴇ:
${query}

⏱️ Failed after ${executionTime}ms`
                }, { quoted: message })
            }

            // Format the result
            let formattedResult
            const resultType = typeof result

            if (result === undefined) {
                formattedResult = 'undefined'
            } else if (result === null) {
                formattedResult = 'null'
            } else if (resultType === 'function') {
                formattedResult = `[Function: ${result.name || 'anonymous'}]`
            } else if (resultType === 'object') {
                // Use util.inspect for objects
                formattedResult = util.inspect(result, {
                    depth: 3,
                    colors: false,
                    maxArrayLength: 50,
                    breakLength: 80,
                    compact: false,
                    sorted: false,
                    getters: true
                })
            } else {
                formattedResult = String(result)
            }

            // Truncate if too long
            const maxLength = 3000
            if (formattedResult.length > maxLength) {
                formattedResult = formattedResult.substring(0, maxLength) + '\n\n... (truncated)'
            }

            const output = `┏━━━━━━━━━━━━━━━━━━━━┓
┃   ᴇᴠᴀʟ ʀᴇsᴜʟᴛ    ┃
┗━━━━━━━━━━━━━━━━━━━━┛

┏─『 ɪɴᴘᴜᴛ 』──⊷
│ ${query}
┗──────────────⊷

┏─『 ᴏᴜᴛᴘᴜᴛ 』──⊷
│ ᴛʏᴘᴇ: ${resultType}
│ ᴛɪᴍᴇ: ${executionTime}ms
┗──────────────⊷

${formattedResult}

━━━━━━━━━━━━━━━━━━━━
⚡ sɪʟᴠᴀ ᴍᴅ ᴅɪᴀɢɴᴏsᴛɪᴄ ᴇɴɢɪɴᴇ`

            await sock.sendMessage(jid, {
                text: output,
                contextInfo: {
                    mentionedJid: [sender],
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363200367779016@newsletter',
                        newsletterName: 'SILVA • EVAL LAB',
                        serverMessageId: Math.floor(Math.random() * 1000)
                    }
                }
            }, { quoted: message })

        } catch (err) {
            await sock.sendMessage(jid, {
                text: `┏━━━━━━━━━━━━━━━━━━━━┓
┃   sʏsᴛᴇᴍ ᴇʀʀᴏʀ    ┃
┗━━━━━━━━━━━━━━━━━━━━┛

❌ ${err.name}: ${err.message}

sᴛᴀᴄᴋ:
${err.stack}

⚠️ Internal evaluation failure`
            }, { quoted: message })
        }
    }
}

module.exports = { handler }
