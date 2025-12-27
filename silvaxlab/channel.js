// Channel JID Resolver - Silva MD Bot
const config = require('../config')

const handler = {
    help: ['channeljid', 'newsletterjid', 'getchannelid'],
    tags: ['tools'],
    command: /^(channeljid|newsletterjid|getchannelid)$/i,
    group: false,
    admin: false,
    botAdmin: false,
    owner: false,

    execute: async ({ jid, sock, message, args }) => {
        const sender = message.key.participant || message.key.remoteJid
        
        try {
            let channelJid = null
            let channelMeta = null
            let method = 'unknown'

            // ═══════════════════════════════════════
            // METHOD 1: Argument Provided
            // ═══════════════════════════════════════
            if (args[0]) {
                const input = args[0].trim()

                // Case A: Already a newsletter JID
                if (input.endsWith('@newsletter')) {
                    channelJid = input
                    method = 'Direct JID'
                    
                    // Fetch metadata using JID
                    try {
                        channelMeta = await sock.newsletterMetadata(channelJid)
                    } catch (e) {
                        console.log('Could not fetch metadata:', e.message)
                    }
                }
                // Case B: WhatsApp channel link or invite code
                else {
                    // Extract invite code from link if it's a full URL
                    let inviteCode = input
                    if (input.includes('whatsapp.com/channel/')) {
                        inviteCode = input.split('/channel/')[1]?.split('/')[0]?.split('?')[0]?.trim()
                        method = 'Invite Link'
                    } else {
                        method = 'Raw Invite Code'
                    }
                    
                    if (!inviteCode) {
                        throw new Error('Invalid channel link format')
                    }

                    // Try to subscribe to get the JID
                    try {
                        // Subscribe to channel using invite code
                        const subscribeResult = await sock.newsletterFollow(inviteCode)
                        
                        if (subscribeResult && subscribeResult.id) {
                            channelJid = subscribeResult.id
                            
                            // Now fetch metadata
                            try {
                                channelMeta = await sock.newsletterMetadata(channelJid)
                            } catch (metaErr) {
                                console.log('Subscribed but could not fetch metadata:', metaErr.message)
                            }
                        } else {
                            throw new Error('Could not resolve channel from invite code')
                        }
                    } catch (e) {
                        // If subscribe fails, try query
                        try {
                            const query = await sock.query({
                                tag: 'iq',
                                attrs: {
                                    type: 'get',
                                    xmlns: 'w:mex',
                                    to: '@s.whatsapp.net'
                                },
                                content: [{
                                    tag: 'invite',
                                    attrs: { code: inviteCode }
                                }]
                            })
                            
                            if (query && query.attrs && query.attrs.id) {
                                channelJid = query.attrs.id
                            } else {
                                throw new Error('Could not resolve channel')
                            }
                        } catch (queryErr) {
                            throw new Error(`Unable to resolve: ${e.message}`)
                        }
                    }
                }
            }
            // ═══════════════════════════════════════
            // METHOD 2: Current Chat (if it's a channel)
            // ═══════════════════════════════════════
            else {
                const currentJid = message.key.remoteJid
                
                if (currentJid.endsWith('@newsletter')) {
                    channelJid = currentJid
                    method = 'Current Chat'
                    
                    try {
                        channelMeta = await sock.newsletterMetadata(channelJid)
                    } catch (e) {
                        console.log('Could not fetch metadata:', e.message)
                    }
                } else {
                    return sock.sendMessage(jid, {
                        text: `┏━━━━━━━━━━━━━━━━━━━━┓
┃  ᴄʜᴀɴɴᴇʟ ᴊɪᴅ ᴛᴏᴏʟ  ┃
┗━━━━━━━━━━━━━━━━━━━━┛

❌ This is not a channel

ᴜsᴀɢᴇ:
${config.PREFIX}channeljid <link/code>

ᴇxᴀᴍᴘʟᴇs:
${config.PREFIX}channeljid https://whatsapp.com/channel/xyz
${config.PREFIX}channeljid ABC123XYZ
${config.PREFIX}channeljid 120363...@newsletter

💡 Or use in a channel to get its JID`,
                        contextInfo: createContext(sender, 'SILVA MD • CHANNELS')
                    }, { quoted: message })
                }
            }

            // ═══════════════════════════════════════
            // VALIDATION
            // ═══════════════════════════════════════
            if (!channelJid || !channelJid.endsWith('@newsletter')) {
                throw new Error('Failed to resolve channel JID')
            }

            // ═══════════════════════════════════════
            // FORMAT RESPONSE WITH METADATA
            // ═══════════════════════════════════════
            let metadataSection = ''
            
            if (channelMeta) {
                const name = channelMeta.name || channelMeta.subject || 'N/A'
                const subscribers = channelMeta.subscribers || channelMeta.subscriberCount || 'N/A'
                const description = channelMeta.description || 'No description'
                const verified = channelMeta.verified || channelMeta.verification === 'VERIFIED'
                const createdAt = channelMeta.creation_time ? new Date(channelMeta.creation_time * 1000).toLocaleDateString() : 'N/A'
                
                metadataSection = `
┏─『 ᴄʜᴀɴɴᴇʟ ᴅᴇᴛᴀɪʟs 』──⊷
│ ɴᴀᴍᴇ: ${name}
│ sᴜʙsᴄʀɪʙᴇʀs: ${subscribers}
│ ᴠᴇʀɪғɪᴇᴅ: ${verified ? '✅ Yes' : '❌ No'}
│ ᴄʀᴇᴀᴛᴇᴅ: ${createdAt}
│ ᴅᴇsᴄʀɪᴘᴛɪᴏɴ: 
│ ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}
┗──────────────⊷`
            } else {
                metadataSection = `
┏─『 ᴄʜᴀɴɴᴇʟ ᴅᴇᴛᴀɪʟs 』──⊷
│ ⚠️ Metadata unavailable
│ JID resolved but details not accessible
┗──────────────⊷`
            }

            const response = `┏━━━━━━━━━━━━━━━━━━━━┓
┃  ᴄʜᴀɴɴᴇʟ ʀᴇsᴏʟᴠᴇᴅ  ┃
┗━━━━━━━━━━━━━━━━━━━━┛

┏─『 ᴊɪᴅ ɪɴғᴏ 』──⊷
│ ${channelJid}
┗──────────────⊷

┏─『 ᴍᴇᴛʜᴏᴅ 』──⊷
│ ${method}
┗──────────────⊷
${metadataSection}

━━━━━━━━━━━━━━━━━━━━
⚡ sɪʟᴠᴀ ᴍᴅ ᴄʜᴀɴɴᴇʟ ᴛᴏᴏʟs`

            await sock.sendMessage(jid, {
                text: response,
                contextInfo: createContext(sender, 'SILVA MD • CHANNELS')
            }, { quoted: message })

        } catch (err) {
            console.error('ChannelJID Error:', err)
            
            await sock.sendMessage(jid, {
                text: `┏━━━━━━━━━━━━━━━━━━━━┓
┃  ʀᴇsᴏʟᴠᴇ ғᴀɪʟᴇᴅ    ┃
┗━━━━━━━━━━━━━━━━━━━━┛

❌ ${err.message}

┏─『 ᴄʜᴇᴄᴋʟɪsᴛ 』──⊷
│ ✓ Channel exists and is public
│ ✓ Link/code is valid
│ ✓ Bot has internet access
│ ✓ Invite code is not expired
┗──────────────⊷

ᴜsᴀɢᴇ:
${config.PREFIX}channeljid <link>
${config.PREFIX}channeljid <invite-code>

⚠️ Best method: Use inside the channel
💡 Or provide valid invite link`,
                contextInfo: createContext(sender, 'SILVA MD • ERROR')
            }, { quoted: message })
        }
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

module.exports = { handler }