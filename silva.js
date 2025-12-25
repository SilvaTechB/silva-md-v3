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
    proto,
    extractMessageContent
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
    level: config.DEBUG_MODE ? 'debug' : 'error',
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
// 🔧 UTILITY FUNCTIONS (FIXED FOR LID OWNER DETECTION)
// ==============================
class FunctionsWrapper {
    constructor() {
        this.tempDir = path.join(__dirname, './temp');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
        this.botNumber = null;
        this.botLid = null; // Store bot's LID
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
        botLogger.log('DEBUG', `[OWNER CHECK] Checking if sender is owner: ${sender}`);
        
        // First: If message is from the bot itself (fromMe), it's automatically owner
        // We'll handle this in the message handler by checking fromMe flag
        
        // Extract phone number or LID from sender
        let phoneNumber = '';
        let isLid = false;
        
        if (sender.includes('@lid')) {
            // Handle LID format: 81712071631074@lid
            phoneNumber = sender.split('@')[0];
            isLid = true;
            botLogger.log('DEBUG', `[OWNER CHECK] Sender is LID: ${phoneNumber}`);
        } else if (sender.includes('@s.whatsapp.net')) {
            // Handle standard JID format: 254700143167@s.whatsapp.net
            phoneNumber = sender.split('@')[0];
            botLogger.log('DEBUG', `[OWNER CHECK] Sender is JID: ${phoneNumber}`);
        } else if (sender.includes(':')) {
            // Handle other formats with colon
            phoneNumber = sender.split(':')[0];
        } else {
            phoneNumber = sender;
        }
        
        // Clean the phone number (remove non-digits)
        const cleanSender = phoneNumber.replace(/[^0-9]/g, '');
        botLogger.log('DEBUG', `[OWNER CHECK] Cleaned sender: ${cleanSender}`);
        
        // Check 1: Is this the bot's LID?
        if (isLid && this.botLid) {
            const cleanBotLid = this.botLid.replace(/[^0-9]/g, '');
            if (cleanSender === cleanBotLid) {
                botLogger.log('DEBUG', '[OWNER CHECK] Sender is bot LID - GRANTING OWNER');
                return true;
            }
        }
        
        // Check 2: Is this the bot's phone number?
        if (this.botNumber) {
            const cleanBotNum = this.botNumber.replace(/[^0-9]/g, '');
            botLogger.log('DEBUG', `[OWNER CHECK] Bot number: ${cleanBotNum}`);
            if (cleanSender === cleanBotNum) {
                botLogger.log('DEBUG', '[OWNER CHECK] Sender is bot number - GRANTING OWNER');
                return true;
            }
        }
        
        // Check 3: Check against config owner numbers
        let ownerNumbers = [];
        if (config.OWNER_NUMBER) {
            if (Array.isArray(config.OWNER_NUMBER)) {
                ownerNumbers = config.OWNER_NUMBER.map(num => {
                    const cleanNum = num.replace(/[^0-9]/g, '');
                    botLogger.log('DEBUG', `[OWNER CHECK] Config owner: ${num} -> ${cleanNum}`);
                    return cleanNum;
                });
            } else if (typeof config.OWNER_NUMBER === 'string') {
                const cleanNum = config.OWNER_NUMBER.replace(/[^0-9]/g, '');
                ownerNumbers = [cleanNum];
                botLogger.log('DEBUG', `[OWNER CHECK] Config owner: ${config.OWNER_NUMBER} -> ${cleanNum}`);
            }
        }
        
        // Check 4: Also check connected number from config
        if (config.CONNECTED_NUMBER) {
            const connectedNumber = config.CONNECTED_NUMBER.replace(/[^0-9]/g, '');
            ownerNumbers.push(connectedNumber);
            botLogger.log('DEBUG', `[OWNER CHECK] Connected number from config: ${connectedNumber}`);
        }
        
        // Remove duplicates
        ownerNumbers = [...new Set(ownerNumbers)];
        botLogger.log('DEBUG', `[OWNER CHECK] All owner numbers to check: ${ownerNumbers.join(', ')}`);
        
        // Check if sender matches any owner number
        const isOwner = ownerNumbers.some(ownerNum => {
            const match = cleanSender === ownerNum || 
                         cleanSender.endsWith(ownerNum) || 
                         ownerNum.endsWith(cleanSender);
            if (match) {
                botLogger.log('DEBUG', `[OWNER CHECK] Match found: ${cleanSender} === ${ownerNum}`);
            }
            return match;
        });
        
        botLogger.log('DEBUG', `[OWNER CHECK] Final result for ${cleanSender}: ${isOwner}`);
        return isOwner;
    }

    setBotNumber(number) {
        if (number) {
            this.botNumber = number.replace(/[^0-9]/g, '');
            botLogger.log('INFO', `🤖 Bot connected as: ${this.botNumber}`);
            
            // Also store as owner if not already in config
            if (config.OWNER_NUMBER) {
                const ownerNumbers = Array.isArray(config.OWNER_NUMBER) ? 
                    config.OWNER_NUMBER : [config.OWNER_NUMBER];
                const cleanBotNum = this.botNumber.replace(/[^0-9]/g, '');
                
                // Check if bot number is already in owner list
                const isAlreadyOwner = ownerNumbers.some(ownerNum => 
                    ownerNum.replace(/[^0-9]/g, '') === cleanBotNum
                );
                
                if (!isAlreadyOwner) {
                    botLogger.log('INFO', `✅ Added bot number ${this.botNumber} to owner list`);
                }
            }
        }
    }

    setBotLid(lid) {
        if (lid) {
            this.botLid = lid.split('@')[0]; // Store just the number part
            botLogger.log('INFO', `🔑 Bot LID detected: ${this.botLid}`);
        }
    }

    isAllowed(sender, jid) {
        // Owner is always allowed
        if (this.isOwner(sender)) {
            botLogger.log('INFO', `✅ Owner access granted for: ${sender}`);
            return true;
        }
        
        if (config.BOT_MODE === 'public') return true;
        
        if (config.BOT_MODE === 'private') {
            // Allow groups in private mode
            if (jid.endsWith('@g.us')) return true;
            
            // Check allowed users
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

    // Extract text from message - UPDATED TO FIX EXTRACTION
    extractText(message) {
        try {
            if (!message) return '';
            
            const content = extractMessageContent(message);
            if (!content) return '';
            
            // Check different message types
            if (typeof content === 'string') {
                return content;
            }
            
            if (content.conversation) {
                return content.conversation;
            }
            
            if (content.text) {
                return content.text;
            }
            
            if (content.extendedTextMessage?.text) {
                return content.extendedTextMessage.text;
            }
            
            if (content.imageMessage?.caption) {
                return content.imageMessage.caption;
            }
            
            if (content.videoMessage?.caption) {
                return content.videoMessage.caption;
            }
            
            if (content.documentMessage?.caption) {
                return content.documentMessage.caption;
            }
            
            if (content.audioMessage?.caption) {
                return content.audioMessage.caption;
            }
            
            return '';
        } catch (error) {
            botLogger.log('ERROR', `extractText error: ${error.message}`);
            return '';
        }
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
                    // Check permissions - SPECIAL HANDLING FOR FROM_ME MESSAGES
                    if (handler.owner && !this.functions.isOwner(sender)) {
                        // If message is from bot itself (fromMe), allow it
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
// 🤖 MAIN BOT CLASS (FULLY FIXED VERSION)
// ==============================
class SilvaBot {
    constructor() {
        this.sock = null;
        this.store = new MessageStore();
        this.groupCache = new NodeCache({ stdTTL: 300, useClones: false });
        this.pluginManager = new PluginManager();
        this.isConnected = false;
        this.functions = new FunctionsWrapper();
        
        // Settings
        this.antiDeleteEnabled = config.ANTIDELETE || true;
        this.recentDeletedMessages = [];
        this.maxDeletedMessages = 20;
        
        // Status settings from config
        this.autoStatusView = config.AUTO_STATUS_SEEN || false;
        this.autoStatusLike = config.AUTO_STATUS_REACT || false;
        this.autoStatusReply = config.AUTO_STATUS_REPLY || false;
        this.statusSaver = config.Status_Saver === 'true' || false;
        this.statusReply = config.STATUS_REPLY === 'true' || false;
        
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
            antidelete: this.antideleteCommand.bind(this),
            statusview: this.statusviewCommand.bind(this),
            statussaver: this.statussaverCommand.bind(this)
        };
    }

    async init() {
        try {
            botLogger.log('BOT', "🚀 Starting " + config.BOT_NAME + " v" + config.VERSION);
            botLogger.log('INFO', "Mode: " + (config.BOT_MODE || 'public'));
            botLogger.log('INFO', "Owner: " + (config.OWNER_NUMBER || 'Not configured'));
            botLogger.log('INFO', "Prefix: " + config.PREFIX);
            botLogger.log('INFO', "Status Saver: " + (this.statusSaver ? '✅ Enabled' : '❌ Disabled'));
            
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
                // Don't filter status at socket level
                shouldIgnoreJid: (jid) => {
                    if (!jid || typeof jid !== 'string') return false;
                    return jid.includes('@newsletter');
                },
                getMessage: async (key) => {
                    try {
                        const msg = await this.store.getMessage(key);
                        return msg || { conversation: '' };
                    } catch (error) {
                        return { conversation: '' };
                    }
                },
                printQRInTerminal: false // Disabled as per warning
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

    // ==============================
    // 📱 STATUS HANDLER METHODS
    // ==============================

    unwrapStatus(msg) {
        try {
            let content = msg.message;
            
            if (content?.viewOnceMessageV2?.message) {
                content = content.viewOnceMessageV2.message;
            } else if (content?.viewOnceMessage?.message) {
                content = content.viewOnceMessage.message;
            } else if (content?.ephemeralMessage?.message) {
                content = content.ephemeralMessage.message;
            }
            
            const msgType = Object.keys(content || {})[0] || '';
            
            return { inner: content, msgType };
        } catch (error) {
            botLogger.log('ERROR', `Unwrap status error: ${error.message}`);
            return { inner: msg.message || {}, msgType: '' };
        }
    }

    async saveStatusMedia(message, msgType, caption) {
        try {
            const stream = await downloadMediaMessage(
                message,
                'stream',
                {},
                {
                    logger,
                    reuploadRequest: this.sock.updateMediaMessage
                }
            );

            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            const extMap = {
                imageMessage: 'jpg',
                videoMessage: 'mp4',
                audioMessage: 'ogg',
                documentMessage: 'pdf',
                stickerMessage: 'webp'
            };

            const filename = `status_${Date.now()}.${extMap[msgType] || 'bin'}`;
            const statusDir = path.join(__dirname, 'status_saver');
            
            if (!fs.existsSync(statusDir)) {
                fs.mkdirSync(statusDir, { recursive: true });
            }
            
            const filePath = path.join(statusDir, filename);
            fs.writeFileSync(filePath, buffer);

            const botJid = this.sock.user.id.split(':')[0] + '@s.whatsapp.net';

            const msgContent = {
                caption: caption || '',
                mimetype: message.message?.[msgType]?.mimetype
            };

            if (msgType === 'imageMessage') {
                msgContent.image = fs.readFileSync(filePath);
            } else if (msgType === 'videoMessage') {
                msgContent.video = fs.readFileSync(filePath);
            } else if (msgType === 'audioMessage') {
                msgContent.audio = fs.readFileSync(filePath);
                msgContent.mimetype = 'audio/ogg; codecs=opus';
            } else if (msgType === 'stickerMessage') {
                msgContent.sticker = fs.readFileSync(filePath);
            }

            await this.sock.sendMessage(botJid, msgContent);
            
            botLogger.log('SUCCESS', `✅ Status saved: ${filename}`);
            return true;
        } catch (error) {
            botLogger.log('ERROR', `Media Save Error: ${error.message}`);
            return false;
        }
    }

    // ==============================
    // 🎯 SETUP EVENTS METHOD (FIXED)
    // ==============================

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
                
                if (sock.user && sock.user.id) {
                    const botNumber = sock.user.id.split(':')[0];
                    this.functions.setBotNumber(botNumber);
                    botLogger.log('INFO', '🤖 Bot connected as: ' + botNumber);
                    this.detectBotLid();
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
Status View: ${this.autoStatusView ? '✅' : '❌'}
Status React: ${this.autoStatusLike ? '✅' : '❌'}
Status Saver: ${this.statusSaver ? '✅' : '❌'}
Connected Number: ${this.functions.botNumber || 'Unknown'}
                            `.trim();

                            await this.sendMessage(ownerJid, { text: messageText });
                        }
                        botLogger.log('INFO', 'Sent connected message to owner(s)');
                    } catch (error) {
                        botLogger.log('ERROR', 'Failed to send owner message: ' + error.message);
                    }
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // ✅ FIXED messages.upsert handler - UPDATED TO HANDLE COMMANDS PROPERLY
        sock.ev.on('messages.upsert', async (m) => {
            try {
                const { messages, type } = m;
                
                if (!messages || messages.length === 0) return;
                
                // Process only notify type for commands
                if (type !== 'notify') return;
                
                for (const message of messages) {
                    try {
                        if (!message.message) continue;

                        const jid = message.key.remoteJid;
                        const isStatus = jid === 'status@broadcast';

                        // Skip newsletters
                        if (jid.includes('@newsletter')) continue;

                        // ===== STATUS HANDLING =====
                        if (isStatus) {
                            await this.handleStatusUpdate(message);
                            continue;
                        }

                        // ===== REGULAR MESSAGE HANDLING =====
                        await this.handleRegularMessage(message);

                    } catch (error) {
                        botLogger.log('ERROR', "Message handling error: " + error.message);
                    }
                }
            } catch (error) {
                botLogger.log('ERROR', "Messages upsert error: " + error.message);
            }
        });

        // Message updates for anti-delete
        sock.ev.on('messages.update', async (updates) => {
            if (!this.antiDeleteEnabled) return;
            
            for (const update of updates) {
                try {
                    if (update.update?.message === null) {
                        await this.handleMessageDelete(update);
                    }
                } catch (error) {
                    botLogger.log('ERROR', "Message update error: " + error.message);
                }
            }
        });

        // Group participants updates
        sock.ev.on('group-participants.update', async (event) => {
            try {
                if (sock.user && sock.user.id) {
                    const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    if (event.action === 'add' && event.participants.includes(botJid)) {
                        await this.sendMessage(event.id, {
                            text: '🤖 *' + config.BOT_NAME + ' Activated!*\nType ' + config.PREFIX + 'menu for commands'
                        });
                        botLogger.log('INFO', 'Bot added to group: ' + event.id);
                    }
                }
            } catch (error) {
                botLogger.log('WARNING', 'Group event error: ' + error.message);
            }
        });
    }

    // ==============================
    // 🔥 UPDATED: STATUS HANDLER
    // ==============================
    async handleStatusUpdate(message) {
        try {
            const statusId = message.key.id;
            const userJid = message.key.participant;
            
            if (!userJid) {
                botLogger.log('WARNING', 'Status without participant JID');
                return;
            }

            botLogger.log('STATUS', `📱 Status from ${userJid}`);

            const { inner, msgType } = this.unwrapStatus(message);

            if (!inner || !msgType) {
                botLogger.log('WARNING', 'Could not unwrap status message');
                return;
            }

            // Auto-view status
            if (this.autoStatusView) {
                try {
                    await this.sock.readMessages([message.key]);
                    botLogger.log('STATUS', `👁️ Viewed status from ${userJid}`);
                } catch (e) {
                    botLogger.log('WARNING', `Status view failed: ${e.message}`);
                }
            }

            // Auto-react to status
            if (this.autoStatusLike) {
                try {
                    await this.functions.sleep(1000);
                    
                    const emojis = (config.CUSTOM_REACT_EMOJIS || '❤️,🔥,💯,😍,👏').split(',');
                    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)].trim();
                    
                    await this.sock.sendMessage('status@broadcast', {
                        react: {
                            text: randomEmoji,
                            key: message.key
                        }
                    });
                    
                    botLogger.log('STATUS', `❤️ Reacted with: ${randomEmoji}`);
                } catch (e) {
                    botLogger.log('WARNING', `Status reaction failed: ${e.message}`);
                }
            }

            // Save status media
            if (this.statusSaver && ['imageMessage', 'videoMessage', 'audioMessage'].includes(msgType)) {
                try {
                    await this.functions.sleep(2000);
                    
                    const userName = await this.getContactName(userJid) || 'Unknown';
                    let caption = `📥 *AUTO STATUS SAVER*\n\n*👤 From:* ${userName}\n*📅 Time:* ${new Date().toLocaleString()}`;

                    if (inner[msgType]?.caption) {
                        caption += `\n*💬 Caption:* ${inner[msgType].caption}`;
                    }

                    const downloadMsg = {
                        key: message.key,
                        message: inner
                    };

                    await this.saveStatusMedia(downloadMsg, msgType, caption);
                    
                    if (this.statusReply) {
                        await this.functions.sleep(1000);
                        const replyMsg = config.STATUS_MSG || '👀 Status viewed!';
                        await this.sock.sendMessage(userJid, { text: replyMsg });
                    }
                    
                    botLogger.log('SUCCESS', `✅ Saved ${msgType} from ${userName}`);
                } catch (e) {
                    botLogger.log('ERROR', `Status save failed: ${e.message}`);
                }
            }

            // Handle text status
            if (this.statusSaver && msgType === 'extendedTextMessage') {
                try {
                    const userName = await this.getContactName(userJid) || 'Unknown';
                    const textContent = inner.extendedTextMessage?.text || '';
                    
                    const caption = `📥 *AUTO STATUS SAVER*\n\n*👤 From:* ${userName}\n*💬 Text:* ${textContent}\n*📅 Time:* ${new Date().toLocaleString()}`;
                    
                    const botJid = this.sock.user.id.split(':')[0] + '@s.whatsapp.net';
                    await this.sock.sendMessage(botJid, { text: caption });
                    
                    if (this.statusReply) {
                        const replyMsg = config.STATUS_MSG || '👀 Status viewed!';
                        await this.sock.sendMessage(userJid, { text: replyMsg });
                    }
                    
                    botLogger.log('SUCCESS', `✅ Saved text status from ${userName}`);
                } catch (e) {
                    botLogger.log('ERROR', `Text status save failed: ${e.message}`);
                }
            }
        } catch (e) {
            botLogger.log('ERROR', `Status handler error: ${e.message}`);
        }
    }

    // ==============================
    // 🔥 UPDATED: REGULAR MESSAGE HANDLER - FIXED COMMAND DETECTION
    // ==============================
    async handleRegularMessage(message) {
        try {
            const jid = message.key.remoteJid;
            const sender = message.key.participant || jid;
            const isGroup = jid.endsWith('@g.us');
            const isFromMe = message.key.fromMe;
            
            botLogger.log('DEBUG', `📨 Received message from: ${sender} in ${jid}`);

            // Store message for anti-delete
            try {
                await this.store.setMessage(message.key, message);
            } catch (e) {
                botLogger.log('WARNING', `Failed to store message: ${e.message}`);
            }

            // Detect bot LID from outgoing messages
            if (isFromMe && sender.includes('@lid') && !this.functions.botLid) {
                const lid = sender.split('@')[0];
                this.functions.setBotLid(lid + '@lid');
                botLogger.log('INFO', '🔑 Bot LID detected: ' + lid + '@lid');
            }

            // Extract text from message using updated function
            let text = this.functions.extractText(message.message);
            
            if (!text) {
                botLogger.log('DEBUG', 'No text content found in message');
                return; // Skip if no text
            }

            // Log incoming message
            botLogger.log('MESSAGE', `📨 From: ${sender.split('@')[0]} | Group: ${isGroup} | Text: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);

            // Command handling - FIXED TO USE CONFIG.PREFIX
            if (text && text.startsWith(config.PREFIX)) {
                botLogger.log('COMMAND', `⚡ Command detected: ${text}`);
                await this.handleCommand(message, text, jid, sender, isGroup, isFromMe);
            } else if (text && text.startsWith('/')) {
                // Alternative prefix check
                botLogger.log('COMMAND', `⚡ Alternative command detected: ${text}`);
                await this.handleCommand(message, text, jid, sender, isGroup, isFromMe);
            } else if (isFromMe && text.includes(config.BOT_NAME)) {
                // Self-command detection
                botLogger.log('COMMAND', `🤖 Self-command detected: ${text}`);
                await this.handleCommand(message, text, jid, sender, isGroup, isFromMe);
            }

        } catch (error) {
            botLogger.log('ERROR', "Regular message handling error: " + error.message);
        }
    }

    // ==============================
    // 🔥 UPDATED: COMMAND HANDLER - IMPROVED LOGGING
    // ==============================
    async handleCommand(message, text, jid, sender, isGroup, isFromMe) {
        try {
            botLogger.log('COMMAND', `⚡ Processing command: ${text} from ${sender}`);
            
            const isOwner = isFromMe ? true : this.functions.isOwner(sender);
            botLogger.log('DEBUG', `Owner check: ${sender} -> ${isOwner}`);
            
            // Extract command text
            let cmdText = '';
            if (text.startsWith(config.PREFIX)) {
                cmdText = text.slice(config.PREFIX.length).trim();
            } else if (text.startsWith('/')) {
                cmdText = text.slice(1).trim();
            } else {
                cmdText = text.trim();
            }
            
            if (!cmdText) {
                botLogger.log('WARNING', 'Empty command text');
                return;
            }
            
            await this.sock.sendPresenceUpdate('composing', jid);
            
            // Try plugin commands first
            const executed = await this.pluginManager.executeCommand({
                text: cmdText,
                jid,
                sender,
                isGroup,
                args: cmdText.split(/ +/).slice(1),
                message,
                sock: this.sock,
                bot: this
            });
            
            await this.sock.sendPresenceUpdate('paused', jid);
            
            // If no plugin handled it, try built-in commands
            if (!executed) {
                const args = cmdText.split(/ +/);
                const command = args.shift().toLowerCase();
                
                botLogger.log('COMMAND', `🛠️ Checking built-in command: ${command}`);
                
                if (this.commands[command]) {
                    botLogger.log('COMMAND', `✅ Executing built-in: ${command}`);
                    await this.commands[command]({
                        jid,
                        sender,
                        isGroup,
                        args,
                        message,
                        sock: this.sock,
                        bot: this
                    });
                } else {
                    botLogger.log('COMMAND', `❌ Command not found: ${command}`);
                    if (config.AUTO_REPLY && !isFromMe) {
                        await this.sock.sendMessage(jid, {
                            text: '❓ Unknown command. Type ' + config.PREFIX + 'help'
                        }, { quoted: message });
                    }
                }
            }
        } catch (error) {
            botLogger.log('ERROR', "Command handling error: " + error.message);
            botLogger.log('ERROR', "Stack: " + error.stack);
            try {
                await this.sock.sendMessage(jid, {
                    text: '❌ Error executing command: ' + error.message
                }, { quoted: message });
            } catch (e) {
                // Silent fail
            }
        }
    }

    // ==============================
    // 🚨 ANTI-DELETE HANDLER
    // ==============================
    async handleMessageDelete(update) {
        if (!this.antiDeleteEnabled || !update.key) return;
        
        try {
            const deletedMessage = await this.store.getMessage(update.key);
            
            if (!deletedMessage || deletedMessage.key?.fromMe) return;
            
            await this.store.saveDeletedMessage(update.key, deletedMessage);
            
            const sender = deletedMessage.key.participant || deletedMessage.key.remoteJid;
            const text = this.functions.extractText(deletedMessage.message);
            
            this.recentDeletedMessages.unshift({
                key: update.key,
                sender: sender,
                senderName: await this.getContactName(sender),
                text: text || '[Media]',
                message: deletedMessage,
                timestamp: deletedMessage.messageTimestamp,
                deletedAt: Date.now()
            });
            
            if (this.recentDeletedMessages.length > this.maxDeletedMessages) {
                this.recentDeletedMessages.pop();
            }
            
            const jid = update.key.remoteJid;
            const timeAgo = Math.floor((Date.now() - (deletedMessage.messageTimestamp * 1000)) / 1000);
            
            if (jid.endsWith('@g.us')) {
                await this.sock.sendMessage(jid, {
                    text: `🚨 *Message Deleted*\n\n` +
                          `👤 *Sender:* @${sender.split('@')[0]}\n` +
                          `💬 *Message:* ${text || '[Media]'}\n` +
                          `⏰ *Sent:* ${timeAgo}s ago\n\n` +
                          `Type \`${config.PREFIX}antidelete recover 1\` to recover`,
                    mentions: [sender]
                });
            }
            
            botLogger.log('INFO', '🚨 Anti-delete: Saved deleted message from ' + sender);
        } catch (error) {
            botLogger.log('ERROR', 'Anti-delete error: ' + error.message);
        }
    }

    async getContactName(jid) {
        try {
            const contact = await this.sock.onWhatsApp(jid);
            if (contact && contact[0]) {
                return contact[0].notify || contact[0].name || jid.split('@')[0];
            }
            return jid.split('@')[0];
        } catch {
            return jid.split('@')[0];
        }
    }

    async detectBotLid() {
        try {
            if (this.functions.botNumber) {
                const botJid = this.functions.botNumber + '@s.whatsapp.net';
                await delay(1000);
                await this.sock.sendMessage(botJid, {
                    text: '🤖 *Bot Activated!*\nType ' + config.PREFIX + 'help for commands'
                });
            }
        } catch (error) {
            botLogger.log('ERROR', 'Failed to detect bot LID: ' + error.message);
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
            botLogger.log('ERROR', 'Session cleanup error: ' + error.message);
        }
    }

    // ==============================
    // 💬 COMMAND HANDLERS
    // ==============================
    
    async statusviewCommand(context) {
        const { jid, sock, message, args, sender } = context;
        const isOwner = message.key.fromMe ? true : this.functions.isOwner(sender);
        
        if (!isOwner) {
            await sock.sendMessage(jid, { text: '⚠️ Owner only command' }, { quoted: message });
            return;
        }
        
        const action = args[0]?.toLowerCase();
        
        if (!action) {
            await sock.sendMessage(jid, {
                text: `📊 *Status Auto Settings*\n\n` +
                      `Auto View: ${this.autoStatusView ? '✅' : '❌'}\n` +
                      `Auto Like: ${this.autoStatusLike ? '✅' : '❌'}\n` +
                      `Auto Reply: ${this.autoStatusReply ? '✅' : '❌'}\n\n` +
                      `*Commands:*\n` +
                      `• ${config.PREFIX}statusview on\n` +
                      `• ${config.PREFIX}statusview off\n` +
                      `• ${config.PREFIX}statusview view\n` +
                      `• ${config.PREFIX}statusview like\n` +
                      `• ${config.PREFIX}statusview reply`
            }, { quoted: message });
            return;
        }
        
        switch(action) {
            case 'on':
                this.autoStatusView = true;
                this.autoStatusLike = true;
                this.autoStatusReply = true;
                await sock.sendMessage(jid, { text: '✅ All status features enabled!' }, { quoted: message });
                break;
                
            case 'off':
                this.autoStatusView = false;
                this.autoStatusLike = false;
                this.autoStatusReply = false;
                await sock.sendMessage(jid, { text: '❌ All status features disabled.' }, { quoted: message });
                break;
                
            case 'view':
                this.autoStatusView = !this.autoStatusView;
                await sock.sendMessage(jid, {
                    text: `Auto-view: ${this.autoStatusView ? '✅ Enabled' : '❌ Disabled'}`
                }, { quoted: message });
                break;
                
            case 'like':
                this.autoStatusLike = !this.autoStatusLike;
                await sock.sendMessage(jid, {
                    text: `Auto-like: ${this.autoStatusLike ? '✅ Enabled' : '❌ Disabled'}`
                }, { quoted: message });
                break;
                
            case 'reply':
                this.autoStatusReply = !this.autoStatusReply;
                await sock.sendMessage(jid, {
                    text: `Auto-reply: ${this.autoStatusReply ? '✅ Enabled' : '❌ Disabled'}`
                }, { quoted: message });
                break;
                
            default:
                await sock.sendMessage(jid, {
                    text: '❓ Invalid option'
                }, { quoted: message });
        }
    }
    
    async statussaverCommand(context) {
        const { jid, sock, message, args, sender } = context;
        const isOwner = message.key.fromMe ? true : this.functions.isOwner(sender);
        
        if (!isOwner) {
            await sock.sendMessage(jid, { text: '⚠️ Owner only command' }, { quoted: message });
            return;
        }
        
        const action = args[0]?.toLowerCase();
        
        if (!action) {
            await sock.sendMessage(jid, {
                text: `💾 *Status Saver*\n\n` +
                      `Saver: ${this.statusSaver ? '✅' : '❌'}\n` +
                      `Reply: ${this.statusReply ? '✅' : '❌'}\n\n` +
                      `*Commands:*\n` +
                      `• ${config.PREFIX}statussaver on\n` +
                      `• ${config.PREFIX}statussaver off\n` +
                      `• ${config.PREFIX}statussaver save\n` +
                      `• ${config.PREFIX}statussaver reply`
            }, { quoted: message });
            return;
        }
        
        switch(action) {
            case 'on':
                this.statusSaver = true;
                this.statusReply = true;
                await sock.sendMessage(jid, { text: '✅ Status saver and reply enabled!' }, { quoted: message });
                break;
                
            case 'off':
                this.statusSaver = false;
                this.statusReply = false;
                await sock.sendMessage(jid, { text: '❌ Status saver and reply disabled.' }, { quoted: message });
                break;
                
            case 'save':
                this.statusSaver = !this.statusSaver;
                await sock.sendMessage(jid, {
                    text: `Status Saver: ${this.statusSaver ? '✅ Enabled' : '❌ Disabled'}`
                }, { quoted: message });
                break;
                
            case 'reply':
                this.statusReply = !this.statusReply;
                await sock.sendMessage(jid, {
                    text: `Status Reply: ${this.statusReply ? '✅ Enabled' : '❌ Disabled'}`
                }, { quoted: message });
                break;
                
            default:
                await sock.sendMessage(jid, {
                    text: '❓ Invalid option'
                }, { quoted: message });
        }
    }

    async antideleteCommand(context) {
        const { jid, sock, message, args, sender } = context;
        const isOwner = message.key.fromMe ? true : this.functions.isOwner(sender);
        
        if (!args[0]) {
            const status = this.antiDeleteEnabled ? '✅ Enabled' : '❌ Disabled';
            await sock.sendMessage(jid, {
                text: `🚨 *Anti-Delete System*\n\n` +
                      `Status: ${status}\n` +
                      `Stored Messages: ${this.recentDeletedMessages.length}\n\n` +
                      `*Commands:*\n` +
                      `• ${config.PREFIX}antidelete on - Enable (Owner)\n` +
                      `• ${config.PREFIX}antidelete off - Disable (Owner)\n` +
                      `• ${config.PREFIX}antidelete list - Show recent\n` +
                      `• ${config.PREFIX}antidelete recover [num] - Recover message\n` +
                      `• ${config.PREFIX}antidelete clear - Clear cache (Owner)`
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
                await sock.sendMessage(jid, { text: '✅ Anti-delete enabled!' }, { quoted: message });
                break;
                
            case 'off':
                if (!isOwner) {
                    await sock.sendMessage(jid, { text: '⚠️ Owner only command' }, { quoted: message });
                    return;
                }
                this.antiDeleteEnabled = false;
                await sock.sendMessage(jid, { text: '❌ Anti-delete disabled.' }, { quoted: message });
                break;
                
            case 'list':
                if (this.recentDeletedMessages.length > 0) {
                    let listText = '📋 *Recently Deleted Messages*\n\n';
                    this.recentDeletedMessages.forEach((msg, index) => {
                        const timeAgo = Math.floor((Date.now() - msg.deletedAt) / 1000);
                        listText += `${index + 1}. ${msg.senderName} - ${timeAgo}s ago\n`;
                        if (msg.text && msg.text !== '[Media]') {
                            const preview = msg.text.length > 50 ? msg.text.substring(0, 50) + '...' : msg.text;
                            listText += `   ${preview}\n`;
                        } else {
                            listText += `   ${msg.text}\n`;
                        }
                    });
                    listText += `\nUse \`${config.PREFIX}antidelete recover [number]\` to recover.`;
                    await sock.sendMessage(jid, { text: listText }, { quoted: message });
                } else {
                    await sock.sendMessage(jid, { text: '📭 No deleted messages stored.' }, { quoted: message });
                }
                break;
                
            case 'recover':
                const index = parseInt(args[1]) - 1;
                if (isNaN(index) || index < 0 || index >= this.recentDeletedMessages.length) {
                    await sock.sendMessage(jid, {
                        text: `❌ Invalid message number. Use \`${config.PREFIX}antidelete list\` to see available messages.`
                    }, { quoted: message });
                    return;
                }
                
                const deletedMsg = this.recentDeletedMessages[index];
                
                try {
                    if (deletedMsg.message && deletedMsg.message.message) {
                        await sock.sendMessage(jid, {
                            forward: deletedMsg.message,
                            contextInfo: {
                                mentionedJid: [deletedMsg.sender],
                                forwardingScore: 1,
                                isForwarded: false
                            }
                        });
                    } else if (deletedMsg.text && deletedMsg.text !== '[Media]') {
                        await sock.sendMessage(jid, {
                            text: `🔁 *Message Recovered*\n\n*From:* ${deletedMsg.senderName}\n*Text:* ${deletedMsg.text}`,
                            mentions: [deletedMsg.sender]
                        });
                    } else {
                        await sock.sendMessage(jid, {
                            text: `⚠️ Could not recover media message from ${deletedMsg.senderName}`
                        });
                    }
                    
                    await sock.sendMessage(jid, {
                        text: `✅ *Message Recovered*\n\nFrom: ${deletedMsg.senderName}\nDeleted: ${Math.floor((Date.now() - deletedMsg.deletedAt) / 1000)}s ago`
                    }, { quoted: message });
                    
                    this.recentDeletedMessages.splice(index, 1);
                } catch (error) {
                    await sock.sendMessage(jid, {
                        text: `❌ Failed to recover message: ${error.message}`
                    }, { quoted: message });
                }
                break;
                
            case 'clear':
                if (!isOwner) {
                    await sock.sendMessage(jid, { text: '⚠️ Owner only command' }, { quoted: message });
                    return;
                }
                const count = this.recentDeletedMessages.length;
                this.recentDeletedMessages = [];
                await sock.sendMessage(jid, {
                    text: `🗑️ Cleared ${count} deleted messages from cache.`
                }, { quoted: message });
                break;
                
            default:
                await sock.sendMessage(jid, {
                    text: `❓ Invalid option. Use \`${config.PREFIX}antidelete\` for help.`
                }, { quoted: message });
        }
    }

    async helpCommand(context) {
        const { jid, sock, message } = context;
        const plugins = this.pluginManager.getCommandList();
        
        let helpText = `🤖 *${config.BOT_NAME} Help Menu*\n\n`;
        helpText += `📌 *Prefix:* ${config.PREFIX}\n`;
        helpText += `🔧 *Mode:* ${config.BOT_MODE || 'public'}\n`;
        helpText += `📦 *Version:* ${config.VERSION}\n\n`;
        
        helpText += `*📋 Built-in Commands:*\n`;
        helpText += `• ${config.PREFIX}help - Show this menu\n`;
        helpText += `• ${config.PREFIX}menu - Main menu\n`;
        helpText += `• ${config.PREFIX}ping - Check bot status\n`;
        helpText += `• ${config.PREFIX}owner - Owner information\n`;
        helpText += `• ${config.PREFIX}plugins - List plugins\n`;
        helpText += `• ${config.PREFIX}stats - Bot statistics\n`;
        helpText += `• ${config.PREFIX}antidelete - Recover deleted messages\n`;
        helpText += `• ${config.PREFIX}statusview - Auto status settings\n`;
        helpText += `• ${config.PREFIX}statussaver - Status saver settings\n`;
        
        if (plugins.length > 0) {
            helpText += `\n*🔌 Loaded Plugins:*\n`;
            for (const cmd of plugins) {
                helpText += `• ${config.PREFIX}${cmd.command} - ${cmd.help}\n`;
            }
        }
        
        helpText += `\n📍 *Powered by Silva Tech*`;
        
        await sock.sendMessage(jid, { text: helpText }, { quoted: message });
    }

    async menuCommand(context) {
        const { jid, sock, message } = context;
        const menuText = `
┌─「 *${config.BOT_NAME}* 」─
│
│ ⚡ *BOT STATUS*
│ • Mode: ${config.BOT_MODE || 'public'}
│ • Prefix: ${config.PREFIX}
│ • Version: ${config.VERSION}
│ • Anti-delete: ${this.antiDeleteEnabled ? '✅' : '❌'}
│ • Status Saver: ${this.statusSaver ? '✅' : '❌'}
│ • Uptime: ${(process.uptime() / 3600).toFixed(2)}h
│
│ 📋 *CORE COMMANDS*
│ • ${config.PREFIX}ping - Check bot status
│ • ${config.PREFIX}help - Show help menu
│ • ${config.PREFIX}owner - Show owner info
│ • ${config.PREFIX}menu - This menu
│ • ${config.PREFIX}plugins - List plugins
│ • ${config.PREFIX}stats - Bot statistics
│ • ${config.PREFIX}antidelete - Message recovery
│
│ 📱 *STATUS COMMANDS*
│ • ${config.PREFIX}statusview - Auto view/react
│ • ${config.PREFIX}statussaver - Save statuses
│
│ └─「 *SILVA TECH* 」
        `.trim();
        
        await sock.sendMessage(jid, { text: menuText }, { quoted: message });
    }

    async pingCommand(context) {
        const { jid, sock, message } = context;
        const start = Date.now();
        await sock.sendMessage(jid, { text: '🏓 Pong!' }, { quoted: message });
        const latency = Date.now() - start;
        
        const statusText = `
📊 *Status Report*

⚡ *Latency:* ${latency}ms
⏱️ *Uptime:* ${(process.uptime() / 3600).toFixed(2)}h
💾 *RAM:* ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB
🌐 *Connection:* ${this.isConnected ? 'Connected ✅' : 'Disconnected ❌'}
🚨 *Anti-delete:* ${this.antiDeleteEnabled ? 'Enabled ✅' : 'Disabled ❌'}
📱 *Status Saver:* ${this.statusSaver ? 'Enabled ✅' : 'Disabled ❌'}
🤖 *Bot Number:* ${this.functions.botNumber || 'Unknown'}
🔑 *Bot LID:* ${this.functions.botLid || 'Not detected'}
        `.trim();
        
        await sock.sendMessage(jid, { text: statusText }, { quoted: message });
    }

    async ownerCommand(context) {
        const { jid, sock, message } = context;
        let ownerText = '👑 *Bot Owner Information*\n\n';
        
        if (this.functions.botNumber) {
            ownerText += `🤖 *Connected Bot:* ${this.functions.botNumber}\n`;
        }
        
        if (this.functions.botLid) {
            ownerText += `🔑 *Bot LID:* ${this.functions.botLid}\n`;
        }
        
        ownerText += '\n';
        
        if (config.OWNER_NUMBER) {
            if (Array.isArray(config.OWNER_NUMBER)) {
                config.OWNER_NUMBER.forEach((num, idx) => {
                    ownerText += `📞 *Owner ${idx + 1}:* ${num}\n`;
                });
            } else {
                ownerText += `📞 *Owner:* ${config.OWNER_NUMBER}\n`;
            }
        } else {
            ownerText += '📞 *Owner:* Not configured\n';
        }
        
        ownerText += `\n⚡ *${config.BOT_NAME}* v${config.VERSION}\n`;
        ownerText += '📍 *Powered by Silva Tech*';
        
        await sock.sendMessage(jid, { text: ownerText }, { quoted: message });
    }

    async statsCommand(context) {
        const { jid, sock, message } = context;
        
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        
        const statsText = `
📊 *Bot Statistics*

⏱️ *Uptime:* ${hours}h ${minutes}m
💾 *Memory:* ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)}MB
📦 *Platform:* ${process.platform}
🔌 *Plugins:* ${this.pluginManager.getCommandList().length}
🚨 *Deleted Messages:* ${this.recentDeletedMessages.length}/${this.maxDeletedMessages}
👁️ *Auto-View:* ${this.autoStatusView ? '✅' : '❌'}
❤️ *Auto-React:* ${this.autoStatusLike ? '✅' : '❌'}
💾 *Status Saver:* ${this.statusSaver ? '✅' : '❌'}
🌐 *Status:* ${this.isConnected ? 'Connected ✅' : 'Disconnected ❌'}
🤖 *Bot:* ${config.BOT_NAME} v${config.VERSION}
📱 *Number:* ${this.functions.botNumber || 'Unknown'}
🔑 *LID:* ${this.functions.botLid || 'Not detected'}
        `.trim();
        
        await sock.sendMessage(jid, { text: statsText }, { quoted: message });
    }

    async pluginsCommand(context) {
        const { jid, sock, message } = context;
        const plugins = this.pluginManager.getCommandList();
        
        let pluginsText = '📦 *Loaded Plugins*\n\n';
        pluginsText += `*Total:* ${plugins.length}\n\n`;
        
        if (plugins.length === 0) {
            pluginsText += '❌ No plugins loaded.\n';
            pluginsText += 'Check the silvaxlab folder.';
        } else {
            for (const plugin of plugins) {
                pluginsText += `• \`${config.PREFIX}${plugin.command}\`\n`;
                pluginsText += `  ${plugin.help}\n\n`;
            }
        }
        
        await sock.sendMessage(jid, { text: pluginsText }, { quoted: message });
    }

    async startCommand(context) {
        const { jid, sock, message } = context;
        
        const startText = `
✨ *Welcome to ${config.BOT_NAME}!*

I am an advanced WhatsApp bot with powerful features.

📌 *Configuration:*
• Mode: ${config.BOT_MODE || 'public'}
• Prefix: ${config.PREFIX}
• Anti-delete: ${this.antiDeleteEnabled ? 'Enabled ✅' : 'Disabled ❌'}
• Status Saver: ${this.statusSaver ? 'Enabled ✅' : 'Disabled ❌'}

🚀 *Get Started:*
Type \`${config.PREFIX}help\` to see all commands
Type \`${config.PREFIX}menu\` to see the main menu

📍 *Powered by Silva Tech*
        `.trim();
        
        await sock.sendMessage(jid, { text: startText }, { quoted: message });
    }

    async sendMessage(jid, content, options = {}) {
        try {
            if (this.sock && this.isConnected) {
                const result = await this.sock.sendMessage(jid, content, options);
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

// Export bot instance
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
    botLogger.log('ERROR', `Stack: ${error.stack}`);
});

process.on('unhandledRejection', (reason, promise) => {
    botLogger.log('ERROR', `Unhandled Rejection: ${reason}`);
});

// Start the bot
bot.init();
