module.exports = {
    // Session & Authentication
    SESSION_ID: process.env.SESSION_ID || '',
    PREFIX: process.env.PREFIX || '.',
    BOT_NAME: process.env.BOT_NAME || 'Silva MD',
    OWNER_NUMBER: process.env.OWNER_NUMBER || '',
    
    // Bot Settings
    BOT_MODE: process.env.BOT_MODE || 'public', // public, private
    DEBUG_MODE: process.env.DEBUG_MODE === 'true',
    AUTO_READ: process.env.AUTO_READ !== 'false',
    AUTO_TYPING: process.env.AUTO_TYPING === 'true',
    AUTO_REPLY: process.env.AUTO_REPLY === 'true',
    
    // Status Handler Settings
    AUTO_STATUS_SEEN: process.env.AUTO_STATUS_SEEN === 'true',
    AUTO_STATUS_LIKE: process.env.AUTO_STATUS_LIKE === 'true' || process.env.AUTO_STATUS_REACT === 'true',
    AUTO_STATUS_VIEW: process.env.AUTO_STATUS_VIEW === 'true' || process.env.AUTO_STATUS_SEEN === 'true',
    AUTO_STATUS_REACT: process.env.AUTO_STATUS_REACT === 'true',
    AUTO_STATUS_REPLY: process.env.AUTO_STATUS_REPLY === 'true',
    AUTO_STATUS_MSG: process.env.AUTO_STATUS_MSG || '✅ Status viewed by Silva MD',
    STATUS_SAVER: process.env.STATUS_SAVER === 'true' || process.env.STATUS_Saver === 'true',
    STATUS_REPLY: process.env.STATUS_REPLY === 'true',
    STATUS_MSG: process.env.STATUS_MSG || 'SILVA MD 💖 SUCCESSFULLY VIEWED YOUR STATUS',
    CUSTOM_REACT_EMOJIS: process.env.CUSTOM_REACT_EMOJIS || '❤️,🔥,💯,😍,👏',
    AUTO_REACT_NEWSLETTER: process.env.AUTO_REACT_NEWSLETTER === 'true',
    
    // Status Save Settings
    STATUS_SAVE_TO_OWNER: process.env.STATUS_SAVE_TO_OWNER === 'true',
    STATUS_SAVE_PATH: process.env.STATUS_SAVE_PATH || './status_saves',
    
    // Antidelete Settings
    ANTI_DELETE: process.env.ANTI_DELETE === 'true' || process.env.ANTIDELETE === 'true',
    ANTI_DELETE_GROUP: process.env.ANTI_DELETE_GROUP === 'true',
    ANTI_DELETE_PRIVATE: process.env.ANTI_DELETE_PRIVATE === 'true',
    
    // Bot Owner Settings
    CONNECTED_NUMBER: process.env.CONNECTED_NUMBER || '',
    
    // Plugin Settings
    PLUGINS_DIR: process.env.PLUGINS_DIR || 'silvaxlab',
    
    // Allowed Users (for private mode)
    ALLOWED_USERS: process.env.ALLOWED_USERS ? 
        process.env.ALLOWED_USERS.split(',') : [],
    
    // Bot Info
    VERSION: '3.0.0',
    AUTHOR: 'Silva Tech Nexus',
    GITHUB: 'https://github.com/SilvaTechB/silva-md-bot',
    
    // Messages
    MESSAGES: {
        groupOnly: '⚠️ This command only works in groups.',
        adminOnly: '⚠️ This command requires admin privileges.',
        ownerOnly: '⚠️ This command is only for the bot owner.'
    }
};
