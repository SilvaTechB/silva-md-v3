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
    botAdmin: false, // Changed to false - we'll check manually
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
        
        // Auto-register event listener on first use
        if (!eventListenerRegistered) {
            registerEventListener(sock)
            eventListenerRegistered = true
        }
        
        // Manual bot admin check
        try {
            const metadata = await sock.groupMetadata(jid)
            const botNumber = sock.user.id.split(':')[0]
            const botJid = botNumber + '@s.whatsapp.net'
            
            const botParticipant = metadata.participants.find(p => 
                p.id === botJid || 
                p.id.split('@')[0] === botNumber ||
                p.id.includes(botNumber)
            )
            
            const isBotAdmin = botParticipant && (botParticipant.admin === 'admin' || botParticipant.admin === 'superadmin')
            
            if (!isBotAdmin) {
                return sock.sendMessage(jid, {
                    text: `┏━━━━━━━━━━━━━━━━━━━━┓
┃   ʙᴏᴛ ɴᴏᴛ ᴀᴅᴍɪɴ    ┃
┗━━━━━━━━━━━━━━━━━━━━┛

❌ Bot needs admin privileges to use anti-demote protection

📋 Current Status:
• Bot: @${botNumber}
• Is Admin: ${isBotAdmin ? 'Yes' : 'No'}
• Permission: ${botParticipant?.admin || 'None'}

💡 Make bot admin first, then try again`,
                    mentions: [botJid],
                    contextInfo: createContext(sender, 'SILVA MD • ANTIDEMOTE')
                }, { quoted: message })
            }
        } catch (error) {
            console.error('[ANTIDEMOTE] Bot admin check failed:', error)
        }
        const cmd = message.message?.conversation || 
                   message.message?.extendedTextMessage?.text || ''
        const command = cmd.split(' ')[0].replace(config.PREFIX, '').toLowerCase()

        try {
            // Get group protected users
            if (!protectedUsers.has(jid)) {
                protectedUsers.set(jid, {
                    enabled: false,
                    users: []
                })
            }

            const groupProtection = protectedUsers.get(jid)

            switch(command) {
                // ========================================
                // TOGGLE ANTI-DEMOTE
                // ========================================
                case 'antidemote':
                    const action = args[0]?.toLowerCase()

                    if (!action || !['on', 'off', 'enable', 'disable'].includes(action)) {
                        return sock.sendMessage(jid, {
                            text: `┏━━━━━━━━━━━━━━━━━━━━┓
┃   ᴀɴᴛɪ-ᴅᴇᴍᴏᴛᴇ       ┃
┗━━━━━━━━━━━━━━━━━━━━┛

📊 Status: ${groupProtection.enabled ? '✅ ENABLED' : '❌ DISABLED'}
🛡️ Protected Users: ${groupProtection.users.length}

ᴜsᴀɢᴇ:
${config.PREFIX}antidemote on/off

ᴄᴏᴍᴍᴀɴᴅs:
• ${config.PREFIX}antidemote on - Enable protection
• ${config.PREFIX}antidemote off - Disable protection
• ${config.PREFIX}protect @user - Add user to protection
• ${config.PREFIX}unprotect @user - Remove protection
• ${config.PREFIX}protected - List protected users

💡 When enabled, if someone tries to demote a protected admin:
  1. The demoted user is re-promoted
  2. The attacker is demoted
  3. Owner & sudo users are immune`,
                            contextInfo: createContext(sender, 'SILVA MD • ANTIDEMOTE')
                        }, { quoted: message })
                    }

                    if (action === 'on' || action === 'enable') {
                        groupProtection.enabled = true
                        await sock.sendMessage(jid, {
                            text: `✅ Anti-Demote Protection ENABLED!

🛡️ Protected users will be automatically re-promoted
⚔️ Attackers will be demoted
🔒 Protected users: ${groupProtection.users.length}

💡 Add users with: ${config.PREFIX}protect @user`,
                            contextInfo: createContext(sender, 'SILVA MD • ANTIDEMOTE')
                        }, { quoted: message })
                    } else {
                        groupProtection.enabled = false
                        await sock.sendMessage(jid, {
                            text: `❌ Anti-Demote Protection DISABLED

⚠️ Protected users can now be demoted normally
📋 Protected list still saved: ${groupProtection.users.length} users

💡 Enable again with: ${config.PREFIX}antidemote on`,
                            contextInfo: createContext(sender, 'SILVA MD • ANTIDEMOTE')
                        }, { quoted: message })
                    }
                    break

                // ========================================
                // PROTECT USER
                // ========================================
                case 'protect':
                    const mentions1 = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
                    
                    if (mentions1.length === 0) {
                        return sock.sendMessage(jid, {
                            text: `┏━━━━━━━━━━━━━━━━━━━━┓
┃   ᴘʀᴏᴛᴇᴄᴛ ᴜsᴇʀ     ┃
┗━━━━━━━━━━━━━━━━━━━━┛

ᴜsᴀɢᴇ:
${config.PREFIX}protect @user @user2...

💡 Tag users to add to protection list
🛡️ Protected users cannot be demoted`,
                            contextInfo: createContext(sender, 'SILVA MD • ANTIDEMOTE')
                        }, { quoted: message })
                    }

                    let added = 0
                    let alreadyProtected = 0

                    for (const userJid of mentions1) {
                        const cleanUser = userJid.split('@')[0]
                        
                        if (groupProtection.users.includes(cleanUser)) {
                            alreadyProtected++
                        } else {
                            groupProtection.users.push(cleanUser)
                            added++
                        }
                    }

                    let responseText = `✅ Protection Updated!\n\n`
                    if (added > 0) {
                        responseText += `🛡️ Added ${added} user(s) to protection\n`
                    }
                    if (alreadyProtected > 0) {
                        responseText += `⚠️ ${alreadyProtected} user(s) already protected\n`
                    }
                    responseText += `\n📊 Total Protected: ${groupProtection.users.length}`
                    responseText += `\n🔒 Anti-Demote: ${groupProtection.enabled ? '✅ ENABLED' : '❌ DISABLED'}`

                    await sock.sendMessage(jid, {
                        text: responseText,
                        mentions: mentions1,
                        contextInfo: createContext(sender, 'SILVA MD • ANTIDEMOTE')
                    }, { quoted: message })
                    break

                // ========================================
                // UNPROTECT USER
                // ========================================
                case 'unprotect':
                    const mentions2 = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
                    
                    if (mentions2.length === 0) {
                        return sock.sendMessage(jid, {
                            text: `┏━━━━━━━━━━━━━━━━━━━━┓
┃   ᴜɴᴘʀᴏᴛᴇᴄᴛ ᴜsᴇʀ   ┃
┗━━━━━━━━━━━━━━━━━━━━┛

ᴜsᴀɢᴇ:
${config.PREFIX}unprotect @user @user2...

💡 Tag users to remove from protection`,
                            contextInfo: createContext(sender, 'SILVA MD • ANTIDEMOTE')
                        }, { quoted: message })
                    }

                    let removed = 0
                    let notProtected = 0

                    for (const userJid of mentions2) {
                        const cleanUser = userJid.split('@')[0]
                        const index = groupProtection.users.indexOf(cleanUser)
                        
                        if (index !== -1) {
                            groupProtection.users.splice(index, 1)
                            removed++
                        } else {
                            notProtected++
                        }
                    }

                    let responseText2 = `✅ Protection Updated!\n\n`
                    if (removed > 0) {
                        responseText2 += `🔓 Removed ${removed} user(s) from protection\n`
                    }
                    if (notProtected > 0) {
                        responseText2 += `⚠️ ${notProtected} user(s) were not protected\n`
                    }
                    responseText2 += `\n📊 Total Protected: ${groupProtection.users.length}`

                    await sock.sendMessage(jid, {
                        text: responseText2,
                        mentions: mentions2,
                        contextInfo: createContext(sender, 'SILVA MD • ANTIDEMOTE')
                    }, { quoted: message })
                    break

                // ========================================
                // LIST PROTECTED USERS
                // ========================================
                case 'protected':
                    if (groupProtection.users.length === 0) {
                        return sock.sendMessage(jid, {
                            text: `┏━━━━━━━━━━━━━━━━━━━━┓
┃   ᴘʀᴏᴛᴇᴄᴛᴇᴅ ᴜsᴇʀs  ┃
┗━━━━━━━━━━━━━━━━━━━━┛

❌ No protected users

💡 Add users with:
${config.PREFIX}protect @user

🔒 Status: ${groupProtection.enabled ? 'ENABLED' : 'DISABLED'}`,
                            contextInfo: createContext(sender, 'SILVA MD • ANTIDEMOTE')
                        }, { quoted: message })
                    }

                    let protectedText = `┏━━━━━━━━━━━━━━━━━━━━┓
┃   ᴘʀᴏᴛᴇᴄᴛᴇᴅ ᴜsᴇʀs  ┃
┗━━━━━━━━━━━━━━━━━━━━┛

🛡️ Total: ${groupProtection.users.length}
🔒 Status: ${groupProtection.enabled ? '✅ ENABLED' : '❌ DISABLED'}\n\n`

                    const protectedJids = []
                    groupProtection.users.forEach((user, i) => {
                        const userJid = user + '@s.whatsapp.net'
                        protectedJids.push(userJid)
                        protectedText += `${i + 1}. @${user}\n`
                    })

                    protectedText += `\n💡 Manage with:
• ${config.PREFIX}protect @user - Add
• ${config.PREFIX}unprotect @user - Remove
• ${config.PREFIX}antidemote on/off - Toggle`

                    await sock.sendMessage(jid, {
                        text: protectedText,
                        mentions: protectedJids,
                        contextInfo: createContext(sender, 'SILVA MD • ANTIDEMOTE')
                    }, { quoted: message })
                    break

                default:
                    await sock.sendMessage(jid, {
                        text: '❌ Unknown command',
                        contextInfo: createContext(sender, 'SILVA MD • ERROR')
                    }, { quoted: message })
            }

        } catch (error) {
            await sock.sendMessage(jid, {
                text: `┏━━━━━━━━━━━━━━━━━━━━┓
┃   ᴇʀʀᴏʀ            ┃
┗━━━━━━━━━━━━━━━━━━━━┛

❌ ${error.message}

💡 Make sure bot has admin rights`,
                contextInfo: createContext(sender, 'SILVA MD • ERROR')
            }, { quoted: message })
        }
    }
}

// ========================================
// AUTO-REGISTER EVENT LISTENER (NO SILVA.JS EDIT NEEDED!)
// ========================================
function registerEventListener(sock) {
    console.log('[ANTIDEMOTE] Registering event listener...')
    
    sock.ev.on('group-participants.update', async (update) => {
        await handleGroupUpdate(update, sock)
    })
    
    console.log('[ANTIDEMOTE] ✅ Event listener registered!')
}

// ========================================
// EVENT HANDLER FOR GROUP PARTICIPANT UPDATES
// ========================================
async function handleGroupUpdate(update, sock) {
    try {
        const { id: groupJid, participants, action, author } = update

        // Only handle demote actions
        if (action !== 'demote') return

        // Check if anti-demote is enabled for this group
        const groupProtection = protectedUsers.get(groupJid)
        if (!groupProtection || !groupProtection.enabled) return

        console.log(`[ANTIDEMOTE] Demote detected in ${groupJid}`)
        console.log(`[ANTIDEMOTE] Action by: ${author}`)
        console.log(`[ANTIDEMOTE] Victims: ${participants.join(', ')}`)

        // Import permission checker
        const { isSudo, isOwner } = require('../lib/permissions')

        // Check if attacker is owner/sudo (immune)
        if (isOwner(author) || isSudo(author)) {
            console.log(`[ANTIDEMOTE] Attacker is owner/sudo - allowing demote`)
            return
        }

        // Check each demoted user
        for (const victimJid of participants) {
            const cleanVictim = victimJid.split('@')[0]

            // Check if victim is protected
            if (groupProtection.users.includes(cleanVictim)) {
                console.log(`[ANTIDEMOTE] Protected user ${cleanVictim} was demoted!`)

                // Wait a moment to ensure WhatsApp processes the demote
                await new Promise(resolve => setTimeout(resolve, 2000))

                try {
                    // 1. Re-promote the victim
                    await sock.groupParticipantsUpdate(groupJid, [victimJid], 'promote')
                    console.log(`[ANTIDEMOTE] Re-promoted victim: ${cleanVictim}`)

                    // 2. Demote the attacker
                    await sock.groupParticipantsUpdate(groupJid, [author], 'demote')
                    console.log(`[ANTIDEMOTE] Demoted attacker: ${author}`)

                    // 3. Send notification
                    await sock.sendMessage(groupJid, {
                        text: `🛡️ *ANTI-DEMOTE PROTECTION ACTIVATED*

⚔️ Attack Detected!
👤 Attacker: @${author.split('@')[0]}
🛡️ Protected User: @${cleanVictim}

✅ Actions Taken:
1. Re-promoted protected user
2. Demoted attacker

⚠️ Protected users cannot be demoted!

Type ${config.PREFIX}protected to see protected users`,
                        mentions: [author, victimJid]
                    })

                } catch (error) {
                    console.error(`[ANTIDEMOTE] Failed to execute protection:`, error)
                    
                    // Send error notification
                    await sock.sendMessage(groupJid, {
                        text: `⚠️ *ANTI-DEMOTE PROTECTION FAILED*

❌ Could not restore @${cleanVictim}

Possible reasons:
• Bot lost admin rights
• Network issue
• Rate limit

Please manually promote the user back.`,
                        mentions: [victimJid]
                    })
                }
            }
        }

    } catch (error) {
        console.error('[ANTIDEMOTE] Error in handleGroupUpdate:', error)
    }
}

// Helper function for context info
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
    protectedUsers // Export for testing/debugging
}