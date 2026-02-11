// Anti-Demote Protection Plugin - Silva MD Bot
// Standalone plugin - no Silva.js modifications needed!
const config = require('../config')

// Store protected users per group (persists in memory)
const protectedUsers = new Map()

// Auto-load flag
let eventListenerRegistered = false

const handler = {
    help: ['antidemote', 'protect', 'unprotect', 'protected'],
    tags: ['group', 'admin'],
    command: /^(antidemote|protect|unprotect|protected)$/i,
    group: true,
    admin: false,
    botAdmin: false, // manual check
    owner: false,

    // Auto-register event listener on first command use
    init: async (sock) => {
        if (!eventListenerRegistered && sock) {
            registerEventListener(sock)
            eventListenerRegistered = true
        }
    },

    execute: async ({ jid, sock, message, args }) => {
        const sender = message.key.participant || message.key.remoteJid

        // Ensure listener is registered
        if (!eventListenerRegistered) {
            registerEventListener(sock)
            eventListenerRegistered = true
        }

        // =================================================
        // ✅ RELIABLE BOT ADMIN CHECK (FIXED)
        // =================================================
        try {
            const metadata = await sock.groupMetadata(jid)
            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net'

            const isBotAdmin = metadata.participants.some(p =>
                (p.id === botJid || p.phoneNumber === botJid) &&
                (p.admin === 'admin' || p.admin === 'superadmin')
            )

            if (!isBotAdmin) {
                return sock.sendMessage(jid, {
                    text: `┏━━━━━━━━━━━━━━━━━━━━┓
┃   ʙᴏᴛ ɴᴏᴛ ᴀᴅᴍɪɴ    ┃
┗━━━━━━━━━━━━━━━━━━━━┛

❌ Bot needs admin privileges to use anti-demote protection

💡 Please promote the bot to admin and try again`,
                    contextInfo: createContext(sender, 'SILVA MD • ANTIDEMOTE')
                }, { quoted: message })
            }

        } catch (error) {
            console.error('[ANTIDEMOTE] Bot admin check failed:', error)
        }

        const cmd =
            message.message?.conversation ||
            message.message?.extendedTextMessage?.text ||
            ''

        const command = cmd.split(' ')[0]
            .replace(config.PREFIX, '')
            .toLowerCase()

        try {
            if (!protectedUsers.has(jid)) {
                protectedUsers.set(jid, {
                    enabled: false,
                    users: []
                })
            }

            const groupProtection = protectedUsers.get(jid)

            switch (command) {

                // ========================================
                // TOGGLE ANTI-DEMOTE
                // ========================================
                case 'antidemote': {
                    const action = args[0]?.toLowerCase()

                    if (!action || !['on', 'off', 'enable', 'disable'].includes(action)) {
                        return sock.sendMessage(jid, {
                            text: `┏━━━━━━━━━━━━━━━━━━━━┓
┃   ᴀɴᴛɪ-ᴅᴇᴍᴏᴛᴇ       ┃
┗━━━━━━━━━━━━━━━━━━━━┛

📊 Status: ${groupProtection.enabled ? '✅ ENABLED' : '❌ DISABLED'}
🛡️ Protected Users: ${groupProtection.users.length}

ᴜsᴀɢᴇ:
${config.PREFIX}antidemote on/off`,
                            contextInfo: createContext(sender, 'SILVA MD • ANTIDEMOTE')
                        }, { quoted: message })
                    }

                    groupProtection.enabled = action === 'on' || action === 'enable'

                    await sock.sendMessage(jid, {
                        text: groupProtection.enabled
                            ? `✅ Anti-Demote Protection ENABLED`
                            : `❌ Anti-Demote Protection DISABLED`,
                        contextInfo: createContext(sender, 'SILVA MD • ANTIDEMOTE')
                    }, { quoted: message })
                    break
                }

                // ========================================
                // PROTECT USER
                // ========================================
                case 'protect': {
                    const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || []

                    if (!mentions.length) {
                        return sock.sendMessage(jid, {
                            text: `Usage:\n${config.PREFIX}protect @user`,
                            contextInfo: createContext(sender, 'SILVA MD • ANTIDEMOTE')
                        }, { quoted: message })
                    }

                    let added = 0
                    for (const jid of mentions) {
                        const user = jid.split('@')[0]
                        if (!groupProtection.users.includes(user)) {
                            groupProtection.users.push(user)
                            added++
                        }
                    }

                    await sock.sendMessage(jid, {
                        text: `🛡️ Added ${added} user(s) to protection`,
                        mentions,
                        contextInfo: createContext(sender, 'SILVA MD • ANTIDEMOTE')
                    }, { quoted: message })
                    break
                }

                // ========================================
                // UNPROTECT USER
                // ========================================
                case 'unprotect': {
                    const mentions = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || []

                    let removed = 0
                    for (const jid of mentions) {
                        const user = jid.split('@')[0]
                        const index = groupProtection.users.indexOf(user)
                        if (index !== -1) {
                            groupProtection.users.splice(index, 1)
                            removed++
                        }
                    }

                    await sock.sendMessage(jid, {
                        text: `🔓 Removed ${removed} user(s) from protection`,
                        mentions,
                        contextInfo: createContext(sender, 'SILVA MD • ANTIDEMOTE')
                    }, { quoted: message })
                    break
                }

                // ========================================
                // LIST PROTECTED USERS
                // ========================================
                case 'protected': {
                    if (!groupProtection.users.length) {
                        return sock.sendMessage(jid, {
                            text: `❌ No protected users`,
                            contextInfo: createContext(sender, 'SILVA MD • ANTIDEMOTE')
                        }, { quoted: message })
                    }

                    const mentions = groupProtection.users.map(u => u + '@s.whatsapp.net')
                    const list = groupProtection.users
                        .map((u, i) => `${i + 1}. @${u}`)
                        .join('\n')

                    await sock.sendMessage(jid, {
                        text: `🛡️ Protected Users:\n\n${list}`,
                        mentions,
                        contextInfo: createContext(sender, 'SILVA MD • ANTIDEMOTE')
                    }, { quoted: message })
                    break
                }
            }

        } catch (err) {
            console.error('[ANTIDEMOTE] Error:', err)
            await sock.sendMessage(jid, {
                text: `❌ Error: ${err.message}`,
                contextInfo: createContext(sender, 'SILVA MD • ERROR')
            }, { quoted: message })
        }
    }
}

// ========================================
// AUTO-REGISTER EVENT LISTENER
// ========================================
function registerEventListener(sock) {
    if (!sock?.ev) return
    sock.ev.on('group-participants.update', update =>
        handleGroupUpdate(update, sock)
    )
}

// ========================================
// HANDLE DEMOTE EVENTS
// ========================================
async function handleGroupUpdate(update, sock) {
    const { id, participants, action, author } = update
    if (action !== 'demote') return

    const protection = protectedUsers.get(id)
    if (!protection?.enabled) return

    const { isOwner, isSudo } = require('../lib/permissions')
    if (isOwner(author) || isSudo(author)) return

    for (const victim of participants) {
        const clean = victim.split('@')[0]
        if (!protection.users.includes(clean)) continue

        try {
            await new Promise(r => setTimeout(r, 2000))
            await sock.groupParticipantsUpdate(id, [victim], 'promote')
            await sock.groupParticipantsUpdate(id, [author], 'demote')

            await sock.sendMessage(id, {
                text: `🛡️ *ANTI-DEMOTE ACTIVATED*\n\nProtected user restored.`,
                mentions: [victim, author]
            })
        } catch (err) {
            console.error('[ANTIDEMOTE] Protection failed:', err)
        }
    }
}

// ========================================
// CONTEXT HELPER
// ========================================
function createContext(sender, name) {
    return {
        mentionedJid: [sender],
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: '120363200367779016@newsletter',
            newsletterName: name,
            serverMessageId: Math.floor(Math.random() * 1000)
        }
    }
}

module.exports = {
    handler,
    handleGroupUpdate,
    protectedUsers
}