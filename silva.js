// ==============================
// 📦 IMPORTS SECTION
// ==============================
const {
    makeWASocket,
    DisconnectReason,
    useMultiFileAuthState,
    downloadMediaMessage,
    getContentType,
    Browsers,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    delay,
    proto
} = require('@whiskeysockets/baileys');

const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const NodeCache = require('node-cache');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

// Import configuration
const config = require('./config.js');

// Global Context Info
const globalContextInfo = {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
        newsletterJid: '120363200367779016@newsletter',
        newsletterName: '◢◤ Silva Tech Nexus ◢◤',
        serverMessageId: 144
    }
};

// ==============================
// 🪵 LOGGER SECTION (ENHANCED FOR DEBUGGING)
// ==============================
const logger = pino({
    level: config.DEBUG_MODE ? 'debug' : 'fatal', // Changed from 'error' to 'fatal'
    transport: config.DEBUG_MODE ? {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
        }
    } : undefined
});

// Enhanced logger for bot messages
class BotLogger {
    log(type, message) {
        const timestamp = new Date().toISOString();
        const colors = {
            SUCCESS: '\x1b[32m',
            ERROR: '\x1b[31m',
            INFO: '\x1b[36m',
            WARNING: '\x1b[33m',
            BOT: '\x1b[35m',
            DEBUG: '\x1b[90m',
            MESSAGE: '\x1b[34m',
            COMMAND: '\x1b[95m',
            STATUS: '\x1b[93m',
            RESET: '\x1b[0m'
        };
        console.log(`${colors[type] || colors.INFO}[${type}] ${timestamp} - ${message}${colors.RESET}`);
    }
}

const botLogger = new BotLogger();

// ==============================
// 🔐 SESSION MANAGEMENT
// ==============================
async function loadSession() {
    try {
        const credsPath = './sessions/creds.json';
        
        if (!fs.existsSync('./sessions')) {
            fs.mkdirSync('./sessions', { recursive: true });
        }
        
        // Clean old sessions if needed
        if (fs.existsSync(credsPath)) {
            try {
                fs.unlinkSync(credsPath);
                botLogger.log('INFO', "♻️ Old session removed");
            } catch (e) {
                // Ignore error
            }
        }

        if (!config.SESSION_ID || typeof config.SESSION_ID !== 'string') {
            botLogger.log('WARNING', "SESSION_ID missing, using QR");
            return false;
        }

        const [header, b64data] = config.SESSION_ID.split('~');

        if (header !== "Silva" || !b64data) {
            botLogger.log('ERROR', "Invalid session format");
            return false;
        }

        const cleanB64 = b64data.replace('...', '');
        const compressedData = Buffer.from(cleanB64, 'base64');
        const decompressedData = zlib.gunzipSync(compressedData);

        fs.writeFileSync(credsPath, decompressedData, "utf8");
        botLogger.log('SUCCESS', "✅ Session loaded successfully");
        return true;
    } catch (e) {
        botLogger.log('ERROR', "Session Error: " + e.message);
        return false;
    }
}

// ==============================
// 🔧 UTILITY FUNCTIONS
// ==============================
class FunctionsWrapper {
    constructor() {
        this.tempDir = path.join(__dirname, './temp');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
        this.botNumber = null;
        this.botLid = null;
    }

    async isAdmin(message, sock) {
        if (!message.key.remoteJid.endsWith('@g.us')) return false;
        
        try {
            const metadata = await sock.groupMetadata(message.key.remoteJid);
            const participant = message.key.participant || message.key.remoteJid;
            const adminList = metadata.participants.filter(p => p.admin).map(p => p.id);
            return adminList.includes(participant);
        } catch {
            return false;
        }
    }

    isOwner(sender) {
        if (sender === this.botLid || sender === this.botNumber) {
            return true;
        }
        
        let phoneNumber = '';
        let isLid = false;
        
        if (sender.includes('@lid')) {
            phoneNumber = sender.split('@')[0];
            isLid = true;
        } else if (sender.includes('@s.whatsapp.net')) {
            phoneNumber = sender.split('@')[0];
        } else if (sender.includes(':')) {
            phoneNumber = sender.split(':')[0];
        } else {
            phoneNumber = sender;
        }
        
        const cleanSender = phoneNumber.replace(/[^0-9]/g, '');
        
        if (isLid && this.botLid) {
            const cleanBotLid = this.botLid.replace(/[^0-9]/g, '');
            if (cleanSender === cleanBotLid) {
                return true;
            }
        }
        
        if (this.botNumber) {
            const cleanBotNum = this.botNumber.replace(/[^0-9]/g, '');
            if (cleanSender === cleanBotNum) {
                return true;
            }
        }
        
        let ownerNumbers = [];
        if (config.OWNER_NUMBER) {
            if (Array.isArray(config.OWNER_NUMBER)) {
                ownerNumbers = config.OWNER_NUMBER.map(num => num.replace(/[^0-9]/g, ''));
            } else if (typeof config.OWNER_NUMBER === 'string') {
                ownerNumbers = [config.OWNER_NUMBER.replace(/[^0-9]/g, '')];
            }
        }
        
        if (config.CONNECTED_NUMBER) {
            const connectedNumber = config.CONNECTED_NUMBER.replace(/[^0-9]/g, '');
            ownerNumbers.push(connectedNumber);
        }
        
        ownerNumbers = [...new Set(ownerNumbers)];
        
        return ownerNumbers.some(ownerNum => {
            return cleanSender === ownerNum || 
                   cleanSender.endsWith(ownerNum) || 
                   ownerNum.endsWith(cleanSender);
        });
    }

    setBotNumber(number) {
        if (number) {
            this.botNumber = number.replace(/[^0-9]/g, '');
            botLogger.log('INFO', `🤖 Bot connected as: ${this.botNumber}`);
        }
    }

    setBotLid(lid) {
        if (lid) {
            this.botLid = lid.split('@')[0];
            botLogger.log('INFO', `🔑 Bot LID detected: ${this.botLid}`);
        }
    }

    isAllowed(sender, jid) {
        if (this.isOwner(sender)) {
            return true;
        }
        
        if (config.BOT_MODE === 'public') return true;
        
        if (config.BOT_MODE === 'private') {
            if (jid.endsWith('@g.us')) return true;
            
            if (config.ALLOWED_USERS && Array.isArray(config.ALLOWED_USERS)) {
                const senderNumber = sender.split('@')[0].replace(/[^0-9]/g, '');
                const allowedNumbers = config.ALLOWED_USERS.map(num => num.replace(/[^0-9]/g, ''));
                return allowedNumbers.includes(senderNumber);
            }
            return false;
        }
        
        return true;
    }

    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    formatJid(number) {
        if (!number) return null;
        const cleaned = number.replace(/[^0-9]/g, '');
        if (cleaned.length < 10) return null;
        return cleaned + '@s.whatsapp.net';
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    extractText(message) {
        if (!message) return '';
        
        if (message.conversation) {
            return message.conversation;
        } else if (message.extendedTextMessage?.text) {
            return message.extendedTextMessage.text;
        } else if (message.imageMessage?.caption) {
            return message.imageMessage.caption;
        } else if (message.videoMessage?.caption) {
            return message.videoMessage.caption;
        } else if (message.documentMessage?.caption) {
            return message.documentMessage.caption;
        } else if (message.audioMessage?.caption) {
            return message.audioMessage.caption;
        }
        return '';
    }

    decodeJid(jid) {
        if (!jid) return '';
        if (typeof jid !== 'string') return jid;
        if (jid.includes('@s.whatsapp.net')) return jid;
        if (jid.includes('@lid')) return jid;
        return jid + '@s.whatsapp.net';
    }
}

// ==============================
// 💾 STORE IMPLEMENTATION
// ==============================
class MessageStore {
    constructor() {
        this.messageCache = new NodeCache({ stdTTL: 3600 });
        this.chatCache = new NodeCache({ stdTTL: 300 });
        this.deletedMessages = new Map();
        this.statusCache = new NodeCache({ stdTTL: 300 }); // Cache status for 5 minutes
        this.statusProcessed = new Set(); // Track processed status IDs
    }

    async getMessage(key) {
        return this.messageCache.get(key.id);
    }

    async setMessage(key, message) {
        this.messageCache.set(key.id, message);
    }

    async getChat(jid) {
        return this.chatCache.get(jid);
    }

    async setChat(jid, chat) {
        this.chatCache.set(jid, chat);
    }

    async saveDeletedMessage(key, message) {
        if (message && !message.key?.fromMe) {
            this.deletedMessages.set(key.id, {
                ...message,
                timestamp: Date.now(),
                deletedAt: Date.now()
            });
            
            setTimeout(() => {
                this.deletedMessages.delete(key.id);
            }, 300000);
        }
    }

    async getDeletedMessage(keyId) {
        return this.deletedMessages.get(keyId);
    }

    // Status handling methods
    async isStatusProcessed(statusId) {
        return this.statusProcessed.has(statusId) || this.statusCache.has(statusId);
    }

    async markStatusAsProcessed(statusId) {
        this.statusProcessed.add(statusId);
        this.statusCache.set(statusId, true, 300); // 5 minutes cache
    }

    async clearStatusCache() {
        this.statusProcessed.clear();
        this.statusCache.flushAll();
    }
}

// ==============================
// 🧩 PLUGIN MANAGER
// ==============================
class PluginManager {
    constructor() {
        this.commandHandlers = new Map();
        this.pluginInfo = new Map();
        this.functions = new FunctionsWrapper();
    }

    async loadPlugins(dir = 'silvaxlab') {
        try {
            const pluginDir = path.join(__dirname, dir);
            
            if (!fs.existsSync(pluginDir)) {
                fs.mkdirSync(pluginDir, { recursive: true });
                botLogger.log('INFO', "Created plugin directory: " + dir);
                this.createExamplePlugins(pluginDir);
                return;
            }

            const pluginFiles = fs.readdirSync(pluginDir)
                .filter(file => file.endsWith('.js') && !file.startsWith('_'));

            botLogger.log('INFO', "Found " + pluginFiles.length + " plugin(s) in " + dir);

            for (const file of pluginFiles) {
                try {
                    const pluginPath = path.join(pluginDir, file);
                    delete require.cache[require.resolve(pluginPath)];
                    
                    const pluginModule = require(pluginPath);
                    
                    if (pluginModule && pluginModule.handler && pluginModule.handler.command) {
                        const handler = pluginModule.handler;
                        this.commandHandlers.set(handler.command, handler);
                        
                        this.pluginInfo.set(handler.command.source, {
                            help: handler.help || [],
                            tags: handler.tags || [],
                            group: handler.group || false,
                            admin: handler.admin || false,
                            botAdmin: handler.botAdmin || false,
                            owner: handler.owner || false,
                            filename: file
                        });
                        
                        botLogger.log('SUCCESS', "✅ Loaded plugin: " + file.replace('.js', ''));
                    } else {
                        botLogger.log('WARNING', "Plugin " + file + " has invalid format");
                    }
                } catch (error) {
                    botLogger.log('ERROR', "Failed to load plugin " + file + ": " + error.message);
                }
            }
        } catch (error) {
            botLogger.log('ERROR', "Plugin loading error: " + error.message);
        }
    }

    createExamplePlugins(pluginDir) {
        // Create example plugins if needed
        const plugins = [];
        for (const plugin of plugins) {
            fs.writeFileSync(path.join(pluginDir, plugin.name), plugin.content);
            botLogger.log('INFO', "Created plugin: " + plugin.name);
        }
    }

    async executeCommand(context) {
        const { text, jid, sender, isGroup, message, sock, args } = context;
        
        botLogger.log('COMMAND', `🔄 Processing command: ${text} from ${sender}`);
        
        // Check if user is allowed
        if (!this.functions.isAllowed(sender, jid)) {
            if (config.BOT_MODE === 'private') {
                await sock.sendMessage(jid, { 
                    text: '🔒 Private mode: Contact owner for access.' 
                }, { quoted: message });
                return true;
            }
            return false;
        }
        
        for (const [commandRegex, handler] of this.commandHandlers.entries()) {
            const commandMatch = text.split(' ')[0];
            if (commandRegex.test(commandMatch)) {
                try {
                    // Check permissions
                    if (handler.owner && !this.functions.isOwner(sender)) {
                        if (!message.key.fromMe) {
                            await sock.sendMessage(jid, { text: '⚠️ Owner only command' }, { quoted: message });
                            return true;
                        }
                    }
                    
                    if (handler.group && !isGroup) {
                        await sock.sendMessage(jid, { text: '⚠️ Group only command' }, { quoted: message });
                        return true;
                    }
                    
                    if (handler.admin && isGroup) {
                        const isAdmin = await this.functions.isAdmin(message, sock);
                        if (!isAdmin) {
                            await sock.sendMessage(jid, { text: '⚠️ Admin required' }, { quoted: message });
                            return true;
                        }
                    }
                    
                    if (handler.botAdmin && isGroup) {
                        try {
                            const metadata = await sock.groupMetadata(jid);
                            const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                            const botParticipant = metadata.participants.find(p => p.id === botJid);
                            if (!botParticipant || !botParticipant.admin) {
                                await sock.sendMessage(jid, { text: '⚠️ Bot needs admin rights' }, { quoted: message });
                                return true;
                            }
                        } catch (e) {
                            // Ignore error
                        }
                    }
                    
                    // Execute command
                    botLogger.log('COMMAND', `✅ Executing plugin command: ${commandMatch} for ${sender}`);
                    await handler.execute(context);
                    return true;
                    
                } catch (error) {
                    botLogger.log('ERROR', "Command error: " + error.message);
                    await sock.sendMessage(jid, { 
                        text: '❌ Error: ' + error.message
                    }, { quoted: message });
                    return true;
                }
            }
        }
        return false;
    }

    getCommandList() {
        const commands = [];
        for (const [regex, info] of this.pluginInfo) {
            commands.push({
                command: regex.replace(/[\/\^$]/g, ''),
                help: info.help[0] || 'No description',
                tags: info.tags,
                group: info.group,
                admin: info.admin
            });
        }
        return commands;
    }
}

// ==============================
// 🤖 MAIN BOT CLASS WITH INSTANT STATUS PROCESSING
// ==============================
class SilvaBot {
    constructor() {
        this.sock = null;
        this.store = new MessageStore();
        this.groupCache = new NodeCache({ stdTTL: 300, useClones: false });
        this.pluginManager = new PluginManager();
        this.isConnected = false;
        this.functions = new FunctionsWrapper();
        
        // Settings from config
        this.antiDeleteEnabled = config.ANTIDELETE || true;
        this.recentDeletedMessages = [];
        this.maxDeletedMessages = 20;
        
        // Status settings from config
        this.autoStatusView = config.AUTO_STATUS_VIEW === 'true' || config.AUTO_STATUS_VIEW === true;
        this.autoStatusReact = config.AUTO_STATUS_REACT === 'true' || config.AUTO_STATUS_REACT === true;
        this.statusEmoji = config.STATUS_EMOJI || '💚';
        
        // Status processing - NO QUEUES, INSTANT PROCESSING
        this.statusProcessing = new Set(); // Track statuses being processed
        
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000;
        this.keepAliveInterval = null;
        
        // Built-in commands
        this.commands = {
            help: this.helpCommand.bind(this),
            menu: this.menuCommand.bind(this),
            ping: this.pingCommand.bind(this),
            owner: this.ownerCommand.bind(this),
            stats: this.statsCommand.bind(this),
            plugins: this.pluginsCommand.bind(this),
            start: this.startCommand.bind(this),
            antidelete: this.antideleteCommand.bind(this)
        };
    }

    async init() {
        try {
            botLogger.log('BOT', "🚀 Starting " + config.BOT_NAME + " v" + config.VERSION);
            botLogger.log('INFO', "Mode: " + (config.BOT_MODE || 'public'));
            botLogger.log('INFO', "Owner: " + (config.OWNER_NUMBER || 'Not configured'));
            botLogger.log('INFO', "Prefix: " + config.PREFIX);
            botLogger.log('INFO', "Auto Status View: " + (this.autoStatusView ? '✅ Enabled' : '❌ Disabled'));
            botLogger.log('INFO', "Auto Status React: " + (this.autoStatusReact ? '✅ Enabled' : '❌ Disabled'));
            botLogger.log('INFO', "Status Reaction Emoji: " + this.statusEmoji);
            
            if (config.SESSION_ID) {
                await loadSession();
            }

            await this.pluginManager.loadPlugins('silvaxlab');
            await this.connect();
        } catch (error) {
            botLogger.log('ERROR', "Init failed: " + error.message);
            setTimeout(() => this.init(), 10000);
        }
    }

    async connect() {
        try {
            this.reconnectAttempts++;
            
            if (this.reconnectAttempts > this.maxReconnectAttempts) {
                botLogger.log('ERROR', 'Max reconnection attempts reached');
                this.reconnectAttempts = 0;
                setTimeout(() => this.init(), 30000);
                return;
            }

            const { state, saveCreds } = await useMultiFileAuthState('./sessions');
            const { version } = await fetchLatestBaileysVersion();
            
            this.sock = makeWASocket({
                version,
                logger: logger,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger)
                },
                browser: Browsers.macOS(config.BOT_NAME),
                markOnlineOnConnect: true,
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                defaultQueryTimeoutMs: 60000,
                cachedGroupMetadata: async (jid) => this.groupCache.get(jid),
                retryRequestDelayMs: 3000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 25000,
                emitOwnEvents: true,
                fireInitQueries: true,
                mobile: false,
                shouldIgnoreJid: (jid) => {
                    if (!jid || typeof jid !== 'string') {
                        return false;
                    }
                    return jid.includes('@newsletter');
                },
                getMessage: async (key) => {
                    try {
                        return await this.store.getMessage(key);
                    } catch (error) {
                        return null;
                    }
                },
                printQRInTerminal: true
            });

            this.setupEvents(saveCreds);
            botLogger.log('SUCCESS', '✅ Bot initialized');
            this.reconnectAttempts = 0;
        } catch (error) {
            botLogger.log('ERROR', "Connection error: " + error.message);
            await this.handleReconnect(error);
        }
    }

    async handleReconnect(error) {
        const delayTime = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
        botLogger.log('WARNING', "Reconnecting in " + (delayTime/1000) + "s (Attempt " + this.reconnectAttempts + "/" + this.maxReconnectAttempts + ")");
        
        await this.functions.sleep(delayTime);
        await this.connect();
    }

    setupEvents(saveCreds) {
        const sock = this.sock;

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                botLogger.log('INFO', '📱 QR Code Generated');
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'close') {
                this.isConnected = false;
                this.stopKeepAlive();
                
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = lastDisconnect?.error?.message;
                
                botLogger.log('WARNING', "Connection closed. Status: " + statusCode + ", Reason: " + reason);
                
                if (statusCode === DisconnectReason.loggedOut) {
                    botLogger.log('ERROR', 'Logged out. Please scan QR again.');
                    this.cleanupSessions();
                    setTimeout(() => this.init(), 10000);
                } else {
                    await this.handleReconnect(lastDisconnect?.error);
                }
            } else if (connection === 'open') {
                this.isConnected = true;
                this.reconnectAttempts = 0;
                botLogger.log('SUCCESS', '🔗 Connected to WhatsApp');
                
                // Set bot's connected number
                if (sock.user && sock.user.id) {
                    const botNumber = sock.user.id.split(':')[0];
                    this.functions.setBotNumber(botNumber);
                }
                
                this.startKeepAlive();
                
                // Send connection message to owner
                if (config.OWNER_NUMBER) {
                    try {
                        await delay(2000);

                        const ownerNumbers = Array.isArray(config.OWNER_NUMBER)
                            ? config.OWNER_NUMBER
                            : [config.OWNER_NUMBER];

                        for (const ownerNum of ownerNumbers) {
                            const ownerJid = this.functions.formatJid(ownerNum);
                            if (!ownerJid) continue;

                            const now = new Date().toLocaleString();

                            const messageText = `
✅ *${config.BOT_NAME} Connected!*
Mode: ${config.BOT_MODE || 'public'}
Time: ${now}
Anti-delete: ${this.antiDeleteEnabled ? '✅' : '❌'}
Auto Status View: ${this.autoStatusView ? '✅' : '❌'}
Auto Status React: ${this.autoStatusReact ? '✅' : '❌'}
Status Emoji: ${this.statusEmoji}
Connected Number: ${this.functions.botNumber || 'Unknown'}
                            `.trim();

                            await this.sendMessage(ownerJid, {
                                text: messageText,
                                contextInfo: {
                                    mentionedJid: [ownerJid],
                                    forwardingScore: 999,
                                    isForwarded: true,
                                    forwardedNewsletterMessageInfo: {
                                        newsletterJid: "120363200367779016@newsletter",
                                        newsletterName: "SILVA WELCOMES YOU 💖🥰",
                                        serverMessageId: 143
                                    }
                                }
                            });
                        }
                        botLogger.log('INFO', 'Sent connected message to owner(s)');
                    } catch (error) {
                        botLogger.log('ERROR', 'Failed to send owner message: ' + error.message);
                    }
                }
            }
        });

        // Suppress status decryption errors (they're normal)
        const originalConsoleError = console.error;
        console.error = function(...args) {
            const msg = args.join(' ');
            if (msg.includes('No session found to decrypt message') ||
                msg.includes('failed to decrypt message') ||
                msg.includes('status@broadcast')) {
                return; // Suppress status decryption errors
            }
            originalConsoleError.apply(console, args);
        };

        sock.ev.on('creds.update', saveCreds);

        // ==============================
        // 🔄 MESSAGE HANDLING WITH INSTANT STATUS PROCESSING
        // ==============================
        sock.ev.on('messages.upsert', async (m) => {
            try {
                const { messages, type } = m;
                
                if (!messages || !Array.isArray(messages)) return;
                
                // ADD THIS DEBUG LOGGING
                console.log('📥 RAW MESSAGE EVENT:', {
                    type: type,
                    count: messages.length,
                    jids: messages.map(msg => msg.key.remoteJid)
                });
                
                // Separate status from regular messages
                const statusMessages = [];
                const regularMessages = [];
                
                for (const message of messages) {
                    console.log('🔍 Processing message from:', message.key.remoteJid);
                    
                    if (message.key.remoteJid === 'status@broadcast') {
                        statusMessages.push(message);
                    } else if (!message.key.remoteJid.includes('@newsletter') && 
                               !message.key.remoteJid.includes('@broadcast')) {
                        regularMessages.push(message);
                    }
                }
                
                console.log('✅ Status messages:', statusMessages.length);
                console.log('✅ Regular messages:', regularMessages.length);
                
                // INSTANT STATUS PROCESSING - Fire immediately, no await
                if (statusMessages.length > 0) {
                    for (const msg of statusMessages) {
                        this.processStatusInstant(msg).catch(() => {});
                    }
                }
                
                // Process regular messages
                if (regularMessages.length > 0) {
                    console.log('📨 ABOUT TO HANDLE REGULAR MESSAGES');
                    await this.handleMessages({ messages: regularMessages, type });
                }
                
            } catch (error) {
                console.log('❌ ERROR in messages.upsert:', error);
            }
        });

        // Handle status updates separately
        sock.ev.on('status.update', async (update) => {
            try {
                if (update && update.jid && update.status) {
                    botLogger.log('STATUS', `📊 New status from: ${update.jid}`);
                    // You could also process status updates here if needed
                }
            } catch (error) {
                botLogger.log('ERROR', "Status update error: " + error.message);
            }
        });

        // Handle message updates
        sock.ev.on('messages.update', async (updates) => {
            for (const update of updates) {
                try {
                    if (update.update && (update.update === 'delete' || update.update.messageStubType === 7)) {
                        await this.handleMessageDelete(update);
                    }
                } catch (error) {
                    botLogger.log('ERROR', "Message update error: " + error.message);
                }
            }
        });

        // Handle message delete events
        sock.ev.on('messages.delete', async (deletion) => {
            try {
                await this.handleBulkMessageDelete(deletion);
            } catch (error) {
                botLogger.log('ERROR', "Message delete error: " + error.message);
            }
        });

        // Handle group participants updates
        sock.ev.on('group-participants.update', async (event) => {
            try {
                if (this.sock.user && this.sock.user.id) {
                    const botJid = this.sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    if (event.action === 'add' && event.participants.includes(botJid)) {
                        await this.sendMessage(event.id, {
                            text: '🤖 *' + config.BOT_NAME + ' Activated!*\nType ' + config.PREFIX + 'menu for commands'
                        });
                        botLogger.log('INFO', 'Bot added to group: ' + event.id);
                    }
                }
            } catch (error) {
                // Silent fail
            }
        });

        // Log outgoing messages
        sock.ev.on('messages.upsert', async (m) => {
            if (m.type === 'notify') {
                for (const msg of m.messages || []) {
                    if (msg.key.fromMe) {
                        botLogger.log('MESSAGE', `📤 Sent message to: ${msg.key.remoteJid}`);
                    }
                }
            }
        });
    }

    // ==============================
    // ⚡ INSTANT STATUS PROCESSING FUNCTION (NO QUEUES, NO DELAYS)
    // ==============================
    async processStatusInstant(message) {
        try {
            // Skip if not a status message
            if (message.key.remoteJid !== 'status@broadcast') return;
            
            const statusId = message.key.id;
            const participant = message.key.participant || message.participant;
            
            if (!statusId || !participant) return;
            
            // Skip if already processed
            if (this.statusProcessing.has(statusId) || await this.store.isStatusProcessed(statusId)) {
                return;
            }
            
            // Mark immediately
            this.statusProcessing.add(statusId);
            await this.store.markStatusAsProcessed(statusId);
            
            // Get random emoji if multiple configured
            let reactionEmoji = this.statusEmoji || '💚';
            if (reactionEmoji.includes(',')) {
                const emojis = reactionEmoji.split(',').map(e => e.trim());
                reactionEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            }
            
            const botJid = this.functions.decodeJid(this.sock.user.id);
            
            // Execute view and react in PARALLEL (both fire instantly)
            const promises = [];
            
            if (this.autoStatusView === true) {
                promises.push(
                    this.sock.readMessages([message.key]).catch(() => {})
                );
            }
            
            if (this.autoStatusReact === true) {
                promises.push(
                    this.sock.sendMessage('status@broadcast', {
                        react: {
                            key: message.key,
                            text: reactionEmoji,
                        },
                    }, { statusJidList: [participant, botJid] }).catch(() => {})
                );
            }
            
            // Fire and forget - don't wait
            if (promises.length > 0) {
                Promise.allSettled(promises).then(() => {
                    botLogger.log('STATUS', `✅ Processed status from ${participant.split('@')[0]}`);
                    this.statusProcessing.delete(statusId);
                }).catch(() => {
                    this.statusProcessing.delete(statusId);
                });
            } else {
                this.statusProcessing.delete(statusId);
            }
            
        } catch (error) {
            // Silent fail for decryption errors
            const statusId = message.key?.id;
            if (statusId) {
                this.statusProcessing.delete(statusId);
            }
        }
    }

    // Detect bot's LID by checking messages sent by the bot
    async detectBotLid() {
        try {
            // Send a test message to ourselves to detect LID
            if (this.functions.botNumber) {
                const botJid = this.functions.botNumber + '@s.whatsapp.net';
                await delay(1000);
                await this.sock.sendMessage(botJid, {
                    text: '🤖 *Bot Activated!*\nType ' + config.PREFIX + 'help for commands'
                });
                botLogger.log('INFO', 'Test message sent to detect LID');
            }
        } catch (error) {
            botLogger.log('ERROR', 'Failed to detect bot LID: ' + error.message);
        }
    }

    // Handle single message delete - AUTOMATIC, NO COMMAND
    async handleMessageDelete(update) {
        if (!this.antiDeleteEnabled || !update.key) return;
        
        try {
            const deletedMessage = await this.store.getMessage(update.key);
            if (deletedMessage && !deletedMessage.key?.fromMe) {
                const sender = deletedMessage.key.participant || deletedMessage.key.remoteJid;
                const text = this.functions.extractText(deletedMessage.message);
                const jid = update.key.remoteJid;
                
                // Automatically forward the deleted message
                if (deletedMessage.message) {
                    // Send in same chat
                    if (jid.endsWith('@g.us')) {
                        // In groups, show who deleted
                        await this.sock.sendMessage(jid, {
                            text: `🚨 @${sender.split('@')[0]} deleted a message:`,
                            mentions: [sender]
                        });
                    }
                    
                    // Forward the actual message
                    await this.sock.sendMessage(jid, deletedMessage.message);
                    
                    botLogger.log('INFO', '🚨 Anti-delete: Forwarded deleted message from ' + sender);
                } else if (text) {
                    // Text only message
                    await this.sock.sendMessage(jid, {
                        text: `🚨 Deleted message:\n\n${text}`,
                        mentions: [sender]
                    });
                }
            }
        } catch (error) {
            // Silent fail
        }
    }

    // Handle bulk message delete
    async handleBulkMessageDelete(deletion) {
        if (!this.antiDeleteEnabled) return;
        
        try {
            if (deletion.keys && Array.isArray(deletion.keys)) {
                for (const key of deletion.keys) {
                    await this.handleMessageDelete({ key: key });
                }
            }
        } catch (error) {
            botLogger.log('ERROR', 'Bulk delete error: ' + error.message);
        }
    }

    // Get contact name
    async getContactName(jid) {
        try {
            const contact = await this.sock.onWhatsApp(jid);
            return contact && contact[0] ? contact[0].name || contact[0].jid.split('@')[0] : jid.split('@')[0];
        } catch {
            return jid.split('@')[0];
        }
    }

    startKeepAlive() {
        this.stopKeepAlive();
        this.keepAliveInterval = setInterval(async () => {
            if (this.sock && this.isConnected) {
                try {
                    await this.sock.sendPresenceUpdate('available');
                } catch (error) {
                    // Silent fail
                }
            }
        }, 20000);
    }

    stopKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }

    cleanupSessions() {
        try {
            const sessionsDir = './sessions';
            if (fs.existsSync(sessionsDir)) {
                fs.rmSync(sessionsDir, { recursive: true, force: true });
                fs.mkdirSync(sessionsDir, { recursive: true });
                botLogger.log('INFO', 'Sessions cleaned');
            }
        } catch (error) {
            // Silent fail
        }
    }

    async handleMessages(m) {
        console.log('🎯 handleMessages CALLED!');
        
        if (!m.messages || !Array.isArray(m.messages)) {
            console.log('❌ No messages in handleMessages');
            return;
        }
        
        console.log('✅ Messages to process:', m.messages.length);
        
        for (const message of m.messages) {
            try {
                // Skip invalid messages
                if (!message.key || !message.key.remoteJid) continue;
                
                // Skip status broadcasts and newsletter messages
                if (message.key.remoteJid === 'status@broadcast' || 
                    message.key.remoteJid.includes('@newsletter') ||
                    message.key.remoteJid.includes('@broadcast')) {
                    continue;
                }

                // Store message
                await this.store.setMessage(message.key, message);

                const jid = message.key.remoteJid;
                const sender = message.key.participant || jid;
                const isGroup = jid.endsWith('@g.us');
                const isFromMe = message.key.fromMe;
                
                // Extract text from message
                let text = '';
                if (message.message?.conversation) {
                    text = message.message.conversation;
                } else if (message.message?.extendedTextMessage?.text) {
                    text = message.message.extendedTextMessage.text;
                } else if (message.message?.imageMessage?.caption) {
                    text = message.message.imageMessage.caption;
                } else if (message.message?.videoMessage?.caption) {
                    text = message.message.videoMessage.caption;
                } else if (message.message?.documentMessage?.caption) {
                    text = message.message.documentMessage.caption;
                } else if (message.message?.audioMessage?.caption) {
                    text = message.message.audioMessage?.caption || '';
                }

                // Log received message
                if (text) {
                    console.log('📝 TEXT EXTRACTED:', text);
                    console.log('🔍 STARTS WITH PREFIX?', text.startsWith(config.PREFIX));
                    console.log('📌 PREFIX IS:', config.PREFIX);
                    botLogger.log('MESSAGE', `📨 Received: "${text.substring(0, 50)}" from ${sender.split('@')[0]}`);
                }

                // Check if message starts with prefix
                if (text && text.startsWith(config.PREFIX)) {
                    botLogger.log('COMMAND', `⚡ Command detected: ${text} from ${sender}`);
                    
                    const isOwner = isFromMe ? true : this.functions.isOwner(sender);
                    const cmdText = text.slice(config.PREFIX.length).trim();
                    const args = cmdText.split(/ +/);
                    const command = args[0].toLowerCase();
                    
                    botLogger.log('COMMAND', `🔄 Processing: ${command} with args: ${args.slice(1).join(', ')}`);
                    
                    // Try plugin commands first
                    const executed = await this.pluginManager.executeCommand({
                        text: cmdText,
                        jid,
                        sender,
                        isGroup,
                        args: args.slice(1),
                        message,
                        sock: this.sock,
                        bot: this
                    });
                    
                    // If no plugin handled it, try built-in commands
                    if (!executed) {
                        botLogger.log('COMMAND', `🔍 Checking built-in commands for: ${command}`);
                        
                        if (this.commands[command]) {
                            botLogger.log('COMMAND', `✅ Executing built-in: ${command}`);
                            await this.commands[command]({
                                jid,
                                sender,
                                isGroup,
                                args: args.slice(1),
                                message,
                                sock: this.sock,
                                bot: this
                            });
                        } else {
                            // Unknown command
                            botLogger.log('COMMAND', `❌ Unknown command: ${command}`);
                            if (config.AUTO_REPLY) {
                                await this.sock.sendMessage(jid, {
                                    text: '❓ Unknown command. Type ' + config.PREFIX + 'help for available commands.'
                                }, { quoted: message });
                            }
                        }
                    } else {
                        botLogger.log('COMMAND', `✅ Plugin executed: ${command}`);
                    }
                }

            } catch (error) {
                botLogger.log('ERROR', "Message handling error: " + error.message);
                botLogger.log('ERROR', "Stack: " + error.stack);
            }
        }
    }

    // ==============================
    // 💬 COMMAND HANDLERS
    // ==============================
    
    async antideleteCommand(context) {
        const { jid, sock, message, args, sender } = context;
        const isOwner = message.key.fromMe ? true : this.functions.isOwner(sender);
        
        if (!args[0]) {
            const status = this.antiDeleteEnabled ? '✅ Enabled' : '❌ Disabled';
            await sock.sendMessage(jid, {
                text: '🚨 *Anti-Delete System*\n\n' +
                      `Status: ${status}\n` +
                      `Stored Messages: ${this.recentDeletedMessages.length}\n\n` +
                      `• \`${config.PREFIX}antidelete on\` - Enable (Owner only)\n` +
                      `• \`${config.PREFIX}antidelete off\` - Disable (Owner only)\n` +
                      `• \`${config.PREFIX}antidelete list\` - Show recent\n` +
                      `• \`${config.PREFIX}antidelete recover [num]\` - Recover message`
            }, { quoted: message });
            return;
        }
        
        const action = args[0].toLowerCase();
        
        switch(action) {
            case 'on':
                if (!isOwner) {
                    await sock.sendMessage(jid, { text: '⚠️ Owner only command' }, { quoted: message });
                    return;
                }
                this.antiDeleteEnabled = true;
                await sock.sendMessage(jid, {
                    text: '✅ Anti-delete enabled!'
                }, { quoted: message });
                break;
                
            case 'off':
                if (!isOwner) {
                    await sock.sendMessage(jid, { text: '⚠️ Owner only command' }, { quoted: message });
                    return;
                }
                this.antiDeleteEnabled = false;
                await sock.sendMessage(jid, {
                    text: '❌ Anti-delete disabled.'
                }, { quoted: message });
                break;
                
            case 'list':
                if (this.recentDeletedMessages.length > 0) {
                    let listText = '📋 *Recently Deleted Messages*\n\n';
                    this.recentDeletedMessages.forEach((msg, index) => {
                        const timeAgo = Math.floor((Date.now() - msg.deletedAt) / 1000);
                        listText += `${index + 1}. ${msg.senderName} - ${timeAgo}s ago\n`;
                        if (msg.text && msg.text.length > 50) {
                            listText += `   ${msg.text.substring(0, 50)}...\n`;
                        } else if (msg.text) {
                            listText += `   ${msg.text}\n`;
                        }
                    });
                    listText += '\nUse `' + config.PREFIX + 'antidelete recover [number]` to recover.';
                    await sock.sendMessage(jid, { text: listText }, { quoted: message });
                } else {
                    await sock.sendMessage(jid, {
                        text: 'No deleted messages stored.'
                    }, { quoted: message });
                }
                break;
                
            case 'recover':
                const index = parseInt(args[1]) - 1;
                if (index >= 0 && index < this.recentDeletedMessages.length) {
                    const deletedMsg = this.recentDeletedMessages[index];
                    
                    if (deletedMsg.message) {
                        await sock.sendMessage(jid, {
                            forward: deletedMsg.message,
                            contextInfo: {
                                mentionedJid: [deletedMsg.sender],
                                forwardingScore: 999,
                                isForwarded: true
                            }
                        });
                        
                        await sock.sendMessage(jid, {
                            text: `🔁 *Message Recovered*\n\nFrom: ${deletedMsg.senderName}\nDeleted: ${Math.floor((Date.now() - deletedMsg.deletedAt) / 1000)}s ago`
                        }, { quoted: message });
                    } else if (deletedMsg.text) {
                        await sock.sendMessage(jid, {
                            text: `🔁 *Message Recovered*\n\nFrom: ${deletedMsg.senderName}\n\n${deletedMsg.text}`,
                            mentions: [deletedMsg.sender]
                        }, { quoted: message });
                    }
                    
                    this.recentDeletedMessages.splice(index, 1);
                } else {
                    await sock.sendMessage(jid, {
                        text: 'Invalid message number. Use `' + config.PREFIX + 'antidelete list` to see available messages.'
                    }, { quoted: message });
                }
                break;
                
            default:
                await sock.sendMessage(jid, {
                    text: 'Invalid option. Use `' + config.PREFIX + 'antidelete` for help.'
                }, { quoted: message });
        }
    }

    async helpCommand(context) {
        const { jid, sock, message } = context;
        const plugins = this.pluginManager.getCommandList();
        
        let helpText = '*Silva MD Help Menu*\n\n';
        helpText += 'Prefix: ' + config.PREFIX + '\n';
        helpText += 'Mode: ' + (config.BOT_MODE || 'public') + '\n\n';
        helpText += '*Built-in Commands:*\n';
        helpText += '• ' + config.PREFIX + 'help - This menu\n';
        helpText += '• ' + config.PREFIX + 'menu - Main menu\n';
        helpText += '• ' + config.PREFIX + 'ping - Check status\n';
        helpText += '• ' + config.PREFIX + 'owner - Owner info\n';
        helpText += '• ' + config.PREFIX + 'plugins - List plugins\n';
        helpText += '• ' + config.PREFIX + 'stats - Bot statistics\n';
        helpText += '• ' + config.PREFIX + 'antidelete - Recover deleted messages\n';
        
        if (plugins.length > 0) {
            helpText += '\n*Loaded Plugins:*\n';
            for (const cmd of plugins) {
                helpText += '• ' + config.PREFIX + cmd.command + ' - ' + cmd.help + '\n';
            }
        }
        
        helpText += '\n📍 *Silva Tech Nexus*';
        
        await sock.sendMessage(jid, { text: helpText }, { quoted: message });
    }

    async menuCommand(context) {
        const { jid, sock, message } = context;
        const menuText = '┌─「 *Silva MD* 」─\n' +
                        '│\n' +
                        '│ ⚡ *BOT STATUS*\n' +
                        '│ • Mode: ' + (config.BOT_MODE || 'public') + '\n' +
                        '│ • Prefix: ' + config.PREFIX + '\n' +
                        '│ • Version: ' + config.VERSION + '\n' +
                        '│ • Anti-delete: ' + (this.antiDeleteEnabled ? '✅' : '❌') + '\n' +
                        '│ • Auto Status View: ' + (this.autoStatusView ? '✅' : '❌') + '\n' +
                        '│ • Auto Status React: ' + (this.autoStatusReact ? '✅' : '❌') + '\n' +
                        '│\n' +
                        '│ 📋 *CORE COMMANDS*\n' +
                        '│ • ' + config.PREFIX + 'ping - Check bot status\n' +
                        '│ • ' + config.PREFIX + 'help - Show help\n' +
                        '│ • ' + config.PREFIX + 'owner - Show owner info\n' +
                        '│ • ' + config.PREFIX + 'menu - This menu\n' +
                        '│ • ' + config.PREFIX + 'plugins - List plugins\n' +
                        '│ • ' + config.PREFIX + 'stats - Bot statistics\n' +
                        '│ • ' + config.PREFIX + 'antidelete - Recover deleted messages\n' +
                        '│\n' +
                        '│ 🎨 *MEDIA COMMANDS*\n' +
                        '│ • ' + config.PREFIX + 'sticker - Create sticker\n' +
                        '│\n' +
                        '│ └─「 *SILVA TECH* 」';
        
        await sock.sendMessage(jid, { text: menuText }, { quoted: message });
    }

    async pingCommand(context) {
        const { jid, sock, message } = context;
        const start = Date.now();
        await sock.sendMessage(jid, { text: '🏓 Pong!' }, { quoted: message });
        const latency = Date.now() - start;
        
        await sock.sendMessage(jid, {
            text: '*Status Report*\n\n⚡ Latency: ' + latency + 'ms\n📊 Uptime: ' + (process.uptime() / 3600).toFixed(2) + 'h\n💾 RAM: ' + (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + 'MB\n🌐 Connection: ' + (this.isConnected ? 'Connected ✅' : 'Disconnected ❌') + '\n🚨 Anti-delete: ' + (this.antiDeleteEnabled ? 'Enabled ✅' : 'Disabled ❌') + '\n👁️ Auto Status View: ' + (this.autoStatusView ? 'Enabled ✅' : 'Disabled ❌') + '\n❤️ Auto Status React: ' + (this.autoStatusReact ? 'Enabled ✅' : 'Disabled ❌') + '\n🤖 Bot Number: ' + (this.functions.botNumber || 'Unknown')
        }, { quoted: message });
    }

    async ownerCommand(context) {
        const { jid, sock, message } = context;
        let ownerText = '👑 *Bot Owner*\n\n';
        
        if (this.functions.botNumber) {
            ownerText += `🤖 Connected Bot: ${this.functions.botNumber}\n`;
        }
        
        if (this.functions.botLid) {
            ownerText += `🔑 Bot LID: ${this.functions.botLid}\n`;
        }
        
        if (config.OWNER_NUMBER) {
            if (Array.isArray(config.OWNER_NUMBER)) {
                config.OWNER_NUMBER.forEach((num, idx) => {
                    ownerText += `📞 Owner ${idx + 1}: ${num}\n`;
                });
            } else {
                ownerText += `📞 Owner: ${config.OWNER_NUMBER}\n`;
            }
        }
        
        ownerText += `⚡ ${config.BOT_NAME} v${config.VERSION}`;
        
        await sock.sendMessage(jid, {
            text: ownerText
        }, { quoted: message });
    }

    async statsCommand(context) {
        const { jid, sock, message } = context;
        const statsText = '📊 *Bot Statistics*\n\n' +
                         '⏱️ Uptime: ' + (process.uptime() / 3600).toFixed(2) + 'h\n' +
                         '💾 Memory: ' + (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + 'MB\n' +
                         '📦 Platform: ' + process.platform + '\n' +
                         '🔌 Plugins: ' + this.pluginManager.getCommandList().length + '\n' +
                         '🚨 Deleted Msgs: ' + this.recentDeletedMessages.length + '\n' +
                         '👁️ Auto-View: ' + (this.autoStatusView ? '✅' : '❌') + '\n' +
                         '❤️ Auto-React: ' + (this.autoStatusReact ? '✅' : '❌') + '\n' +
                         '🎭 React Emoji: ' + this.statusEmoji + '\n' +
                         '🌐 Status: ' + (this.isConnected ? 'Connected ✅' : 'Disconnected ❌') + '\n' +
                         '🤖 Bot: ' + config.BOT_NAME + ' v' + config.VERSION + '\n' +
                         '📱 Connected as: ' + (this.functions.botNumber || 'Unknown');
        
        await sock.sendMessage(jid, { text: statsText }, { quoted: message });
    }

    async pluginsCommand(context) {
        const { jid, sock, message } = context;
        const plugins = this.pluginManager.getCommandList();
        let pluginsText = '📦 *Loaded Plugins*\n\nTotal: ' + plugins.length + '\n\n';
        
        if (plugins.length === 0) {
            pluginsText += 'No plugins loaded.\nCheck silvaxlab folder.';
        } else {
            for (const plugin of plugins) {
                pluginsText += '• ' + config.PREFIX + plugin.command + ' - ' + plugin.help + '\n';
            }
        }
        
        await sock.sendMessage(jid, { text: pluginsText }, { quoted: message });
    }

    async startCommand(context) {
        const { jid, sock, message } = context;
        const startText = '✨ *Welcome to Silva MD!*\n\n' +
                         'I am an advanced WhatsApp bot with plugin support.\n\n' +
                         'Mode: ' + (config.BOT_MODE || 'public') + '\n' +
                         'Prefix: ' + config.PREFIX + '\n' +
                         'Anti-delete: ' + (this.antiDeleteEnabled ? 'Enabled ✅' : 'Disabled ❌') + '\n' +
                         'Auto Status View: ' + (this.autoStatusView ? 'Enabled ✅' : 'Disabled ❌') + '\n' +
                         'Auto Status React: ' + (this.autoStatusReact ? 'Enabled ✅' : 'Disabled ❌') + '\n\n' +
                         'Type ' + config.PREFIX + 'help for commands';
        
        await sock.sendMessage(jid, { 
            text: startText
        }, { quoted: message });
    }

    async sendMessage(jid, content, options = {}) {
        try {
            if (this.sock && this.isConnected) {
                botLogger.log('MESSAGE', `📤 Sending message to: ${jid}`);
                const result = await this.sock.sendMessage(jid, content, { ...globalContextInfo, ...options });
                return result;
            } else {
                botLogger.log('WARNING', 'Cannot send message: Bot not connected');
                return null;
            }
        } catch (error) {
            botLogger.log('ERROR', "Send error: " + error.message);
            return null;
        }
    }
}

// ==============================
// 🚀 BOT INSTANCE CREATION
// ==============================
const bot = new SilvaBot();

// Export bot instance for index.js
module.exports = {
    bot,
    config,
    logger: botLogger,
    functions: new FunctionsWrapper()
};

// ==============================
// 🛡️ ERROR HANDLERS
// ==============================
process.on('uncaughtException', (error) => {
    botLogger.log('ERROR', `Uncaught Exception: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
    botLogger.log('ERROR', `Unhandled Rejection at: ${promise}, reason: ${reason}`);
});
