require('./setting/config')
const { 
  default: baileys, proto, jidNormalizedUser, generateWAMessage, 
  generateWAMessageFromContent, getContentType, prepareWAMessageMedia 
} = require("@whiskeysockets/baileys");

const fs = require('fs')
const util = require('util')
const chalk = require('chalk')
const axios = require('axios')
const moment = require('moment-timezone')
const yts = require('yt-search');
const { exec } = require('child_process');
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8704771447:AAGseXXBO0a7VjI28fnZFesBD9RWgvYq-yI'; 
const { getSetting, setSetting } = require("./setting/Settings.js")
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid, addExif } = require('./allfunc/exif.js')

// Database
const dbPath = './database.json'
let db;

try {
    const dbContent = fs.readFileSync(dbPath, 'utf8');
    db = JSON.parse(dbContent);
    console.log('✅ Database loaded successfully');
} catch (err) {
    db = {
        users: {},
        groups: {},
        warns: {},
        muted: {},
        jailed: {},
        paired: {},
        activity: {},
        scheduled: {},
        notes: {},
        audit: {},
        jail: {},
        silence: {},
        lockmedia: {},
        shadowban: {}
    };
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

let _saveDBTimer = null;
function saveDB() {
    if (_saveDBTimer) clearTimeout(_saveDBTimer);
    _saveDBTimer = setTimeout(() => {
        try {
            fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        } catch (err) {
            console.error('❌ Failed to save database:', err.message);
        }
    }, 2000);
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Auto bio settings
let autoBioEnabled = true;
let lastBioUpdate = null;

// Auto bio update function
async function updateAutoBio(empire) {
    try {
        const now = new Date();
        const hours = now.getHours();
        
        let bio = "";
        
        if (hours >= 0 && hours < 6) {
            bio = "🌙 RANGER XMD TECH is active ✔️ | Night Mode | 24/7 Online";
        } else if (hours >= 6 && hours < 12) {
            bio = "🌅 RANGER XMD TECH is active ✔️ | Morning Mode | Ready to Assist";
        } else if (hours >= 12 && hours < 18) {
            bio = "☀️ RANGER XMD TECH is active ✔️ | Afternoon Mode | Full Power";
        } else {
            bio = "🌆 RANGER XMD TECH is active ✔️ | Evening Mode | Always Online";
        }
        
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hoursUp = Math.floor((uptime % 86400) / 3600);
        bio += ` | Uptime: ${days}d ${hoursUp}h`;
        
        await empire.updateProfileStatus(bio);
        lastBioUpdate = Date.now();
        console.log(chalk.green(`✅ Auto-bio updated: ${bio}`));
        
        return true;
    } catch (err) {
        console.error('Auto-bio error:', err);
        return false;
    }
}

// Start auto bio interval
function startAutoBio(empire) {
    if (global.autoBioInterval) clearInterval(global.autoBioInterval);
    updateAutoBio(empire);
    global.autoBioInterval = setInterval(() => {
        if (autoBioEnabled) {
            updateAutoBio(empire);
        }
    }, 30 * 60 * 1000);
}

// Auto react on messages settings
let autoMessageReact = true;
let autoStatusReact = true;
let autoStatusView = true;

let messageReactions = ["❤️", "🔥", "👍", "😢", "😂", "🫠", "😲", "🙏", "💯", "✨", "🌟", "🎉", "💪", "👏", "🙌", "🤝", "💝", "🎯", "😎", "🤣", "🥰", "😍", "🎈", "⭐"];
let statusReactions = ["❤️", "🔥", "👍", "😢", "🥲", "😭", "😂", "🫠", "😲", "🙏", "💯", "✨", "🌟", "🎉", "💪", "👏", "🙌", "🤝", "💝", "🎯"];

function getRandomMessageReaction() {
    return messageReactions[Math.floor(Math.random() * messageReactions.length)];
}

function getRandomStatusReaction() {
    return statusReactions[Math.floor(Math.random() * statusReactions.length)];
}

const processedStatuses = new Set();
const processedMessages = new Set();

// Handle status messages
async function handleStatusMessage(empire, msg) {
    try {
        const isStatus = msg.key?.remoteJid === 'status@broadcast';
        if (!isStatus) return false;
        
        const statusId = msg.key?.id;
        if (processedStatuses.has(statusId)) return false;
        processedStatuses.add(statusId);
        
        console.log(chalk.yellow(`📱 Status detected from: ${msg.pushName || 'Unknown'}`));
        
        if (autoStatusView) {
            try {
                await empire.readMessages([msg.key]);
                console.log(chalk.green(`✅ Viewed status from ${msg.pushName || 'Unknown'}`));
            } catch (err) {
                console.log(chalk.yellow(`⚠️ Failed to view status: ${err.message}`));
            }
        }
        
        if (autoStatusReact) {
            try {
                await delay(2000);
                const reaction = getRandomStatusReaction();
                await empire.sendMessage('status@broadcast', {
                    react: {
                        text: reaction,
                        key: msg.key
                    }
                });
                console.log(chalk.green(`✅ Reacted to status with ${reaction}`));
            } catch (err) {
                console.log(chalk.yellow(`⚠️ Failed to react to status: ${err.message}`));
            }
        }
        
        if (processedStatuses.size > 100) {
            const toDelete = [...processedStatuses].slice(0, 50);
            toDelete.forEach(id => processedStatuses.delete(id));
        }
        
        return true;
    } catch (err) {
        console.error('Status handler error:', err);
        return false;
    }
}

// Handle auto react on all messages
async function handleAutoMessageReact(empire, msg) {
    try {
        if (!autoMessageReact) return false;
        if (msg.key?.fromMe) return false;
        if (msg.key?.remoteJid === 'status@broadcast') return false;
        
        const msgId = msg.key?.id;
        if (processedMessages.has(msgId)) return false;
        processedMessages.add(msgId);
        
        if (msg.message?.protocolMessage) return false;
        
        await delay(1500);
        const reaction = getRandomMessageReaction();
        
        await empire.sendMessage(msg.key.remoteJid, {
            react: {
                text: reaction,
                key: msg.key
            }
        }).catch(() => {});
        
        console.log(chalk.green(`✅ Auto-reacted to message in ${msg.key.remoteJid} with ${reaction}`));
        
        if (processedMessages.size > 500) {
            const toDelete = [...processedMessages].slice(0, 250);
            toDelete.forEach(id => processedMessages.delete(id));
        }
        
        return true;
    } catch (err) {
        console.error('Auto message react error:', err);
        return false;
    }
}

// Welcome & Goodbye messages
async function handleGroupParticipantsUpdate(empire, update, groupMetadata, botNumber) {
    try {
        const { id, participants, action } = update;
        
        const welcomeEnabled = getSetting(id, 'welcome', false);
        const goodbyeEnabled = getSetting(id, 'goodbye', false);
        
        if (action === 'add' && welcomeEnabled) {
            for (const participant of participants) {
                if (participant === botNumber) continue;
                
                let welcomeMsg = getSetting(id, 'welcomeMessage', '👋 Welcome @user to @group!');
                welcomeMsg = welcomeMsg.replace('@user', `@${participant.split('@')[0]}`);
                welcomeMsg = welcomeMsg.replace('@group', groupMetadata?.subject || 'this group');
                
                await empire.sendMessage(id, { 
                    text: welcomeMsg, 
                    mentions: [participant] 
                });
            }
        }
        
        if (action === 'remove' && goodbyeEnabled) {
            for (const participant of participants) {
                if (participant === botNumber) continue;
                
                let goodbyeMsg = getSetting(id, 'goodbyeMessage', '👋 Goodbye @user, we\'ll miss you!');
                goodbyeMsg = goodbyeMsg.replace('@user', `@${participant.split('@')[0]}`);
                goodbyeMsg = goodbyeMsg.replace('@group', groupMetadata?.subject || 'this group');
                
                await empire.sendMessage(id, { 
                    text: goodbyeMsg, 
                    mentions: [participant] 
                });
            }
        }
    } catch (err) {
        console.error('Welcome/Goodbye error:', err);
    }
}

// Jail system
async function isUserJailed(jid, groupId) {
    if (!db.jailed) db.jailed = {};
    if (!db.jailed[groupId]) db.jailed[groupId] = {};
    
    const jailData = db.jailed[groupId][jid];
    if (!jailData) return false;
    
    if (jailData.until && Date.now() > jailData.until) {
        delete db.jailed[groupId][jid];
        saveDB();
        return false;
    }
    
    return true;
}

async function jailUser(empire, groupId, target, reason, duration = null, moderator = null) {
    if (!db.jailed) db.jailed = {};
    if (!db.jailed[groupId]) db.jailed[groupId] = {};
    
    let until = null;
    let durationText = "Permanent";
    
    if (duration) {
        until = Date.now() + (duration * 60 * 1000);
        durationText = `${duration} minutes`;
    }
    
    db.jailed[groupId][target] = {
        reason: reason || "No reason provided",
        until: until,
        jailedAt: Date.now(),
        jailedBy: moderator
    };
    saveDB();
    
    return { until, durationText };
}

async function unjailUser(groupId, target) {
    if (!db.jailed) db.jailed = {};
    if (!db.jailed[groupId]) db.jailed[groupId] = {};
    
    if (db.jailed[groupId][target]) {
        delete db.jailed[groupId][target];
        saveDB();
        return true;
    }
    return false;
}

// ========== ANTI-LINK HANDLER ==========
async function handleAntiLink(empire, m, isCreator, isAdmins, saveDB) {
    try {
        if (!m.isGroup) return false;
        if (isCreator || isAdmins) return false;
        
        const body = m.text || '';
        
        // Check for WhatsApp links
        const isLink = /chat\.whatsapp\.com\//i.test(body) || 
                       /whatsapp\.com\/channel\//i.test(body) ||
                       /wa\.me\//i.test(body);
        
        if (!isLink) return false;
        
        const antilink = getSetting(m.chat, 'antilink', false);
        if (!antilink) return false;
        
        const allowedDomains = getSetting(m.chat, 'allowedDomains', []);
        const isAllowed = allowedDomains.some(domain => body.toLowerCase().includes(domain));
        
        if (isAllowed) return false;
        
        const action = getSetting(m.chat, 'antilink_action', 'delete');
        
        // Delete the message
        await empire.sendMessage(m.chat, { delete: m.key }).catch(() => {});
        
        if (action === 'warn') {
            await empire.sendMessage(m.chat, {
                text: `⚠️ @${m.sender.split('@')[0]}, WhatsApp links are not allowed in this group! Warning issued.`,
                mentions: [m.sender]
            });
            
            if (!db.warns) db.warns = {};
            if (!db.warns[m.sender]) db.warns[m.sender] = 0;
            db.warns[m.sender]++;
            saveDB();
            
            if (db.warns[m.sender] >= 3) {
                await empire.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
                delete db.warns[m.sender];
                saveDB();
                await empire.sendMessage(m.chat, {
                    text: `👢 @${m.sender.split('@')[0]} was kicked for exceeding warning limit.`,
                    mentions: [m.sender]
                });
            }
        } else if (action === 'kick') {
            await empire.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
            await empire.sendMessage(m.chat, {
                text: `👢 @${m.sender.split('@')[0]} was kicked for sending a WhatsApp link.`,
                mentions: [m.sender]
            });
        }
        
        return true;
    } catch (err) {
        console.error('Anti-link error:', err);
        return false;
    }
}

// ========== ANTI-STICKER HANDLER ==========
async function handleAntiSticker(empire, m, isCreator, isAdmins, saveDB) {
    try {
        if (!m.isGroup) return false;
        if (isCreator || isAdmins) return false;
        if (!m.message?.stickerMessage) return false;
        
        const antisticker = getSetting(m.chat, 'antisticker', false);
        if (!antisticker) return false;
        
        const action = getSetting(m.chat, 'antisticker_action', 'delete');
        
        await empire.sendMessage(m.chat, { delete: m.key }).catch(() => {});
        
        if (action === 'warn') {
            await empire.sendMessage(m.chat, {
                text: `⚠️ @${m.sender.split('@')[0]}, stickers are not allowed in this group! Warning issued.`,
                mentions: [m.sender]
            });
            
            if (!db.warns) db.warns = {};
            if (!db.warns[m.sender]) db.warns[m.sender] = 0;
            db.warns[m.sender]++;
            saveDB();
            
            if (db.warns[m.sender] >= 3) {
                await empire.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
                delete db.warns[m.sender];
                saveDB();
                await empire.sendMessage(m.chat, {
                    text: `👢 @${m.sender.split('@')[0]} was kicked for exceeding warning limit.`,
                    mentions: [m.sender]
                });
            }
        } else if (action === 'kick') {
            await empire.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
            await empire.sendMessage(m.chat, {
                text: `👢 @${m.sender.split('@')[0]} was kicked for sending stickers.`,
                mentions: [m.sender]
            });
        }
        
        return true;
    } catch (err) {
        console.error('Anti-sticker error:', err);
        return false;
    }
}

// ========== ANTI-DELETE HANDLER ==========
async function handleAntiDelete(empire, m, saveDB) {
    try {
        if (!m.isGroup) return false;
        if (m.message?.protocolMessage?.type !== 0) return false;
        
        const antidelete = getSetting(m.chat, 'antidelete', false);
        if (!antidelete) return false;
        
        const deletedMsg = m.message.protocolMessage.deletedMessage;
        if (!deletedMsg) return false;
        
        const action = getSetting(m.chat, 'antidelete_action', 'log');
        const deletedText = deletedMsg.conversation || deletedMsg.caption || 'Media message';
        
        const deleteLog = `🗑️ *Message Deleted*\n\n👤 User: @${m.sender.split('@')[0]}\n📝 Content: ${deletedText}`;
        
        if (action === 'log') {
            await empire.sendMessage(m.chat, {
                text: deleteLog,
                mentions: [m.sender]
            }).catch(() => {});
        } else if (action === 'warn') {
            await empire.sendMessage(m.chat, {
                text: deleteLog,
                mentions: [m.sender]
            }).catch(() => {});
            
            if (!db.warns) db.warns = {};
            if (!db.warns[m.sender]) db.warns[m.sender] = 0;
            db.warns[m.sender]++;
            saveDB();
            
            if (db.warns[m.sender] >= 3) {
                await empire.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
                delete db.warns[m.sender];
                saveDB();
                await empire.sendMessage(m.chat, {
                    text: `👢 @${m.sender.split('@')[0]} was kicked for exceeding delete warning limit.`,
                    mentions: [m.sender]
                });
            }
        } else if (action === 'kick') {
            await empire.groupParticipantsUpdate(m.chat, [m.sender], 'remove');
            await empire.sendMessage(m.chat, {
                text: `👢 @${m.sender.split('@')[0]} was kicked for deleting messages.`,
                mentions: [m.sender]
            });
        }
        
        return true;
    } catch (err) {
        console.error('Anti-delete error:', err);
        return false;
    }
}

// Main bot function
module.exports = empire = async (empire, m, chatUpdate, store) => {
    try {
        // Start auto bio
        if (!global.autoBioStarted) {
            global.autoBioStarted = true;
            startAutoBio(empire);
        }
        
        // Handle auto react
        await handleAutoMessageReact(empire, m);
        await handleStatusMessage(empire, m);
        
        // Parse message
        const body = m.message?.conversation || 
                     m.message?.extendedTextMessage?.text || 
                     m.message?.imageMessage?.caption || "";
        
        const prefix = /^[°zZ#$@+,.?=''():√%!¢£¥€π¤ΠΦ&><™©®Δ^βα¦|/\\©^]/.test(body) 
            ? body.match(/^[°zZ#$@+,.?=''():√%¢£¥€π¤ΠΦ&><!™©®Δ^βα¦|/\\©^]/gi)[0] 
            : '/';
        
        const isCmd = body.startsWith(prefix);
        const args = body.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        const text = args.join(" ");
        
        const botNumber = await empire.decodeJid(empire.user.id)
        const owner = JSON.parse(fs.readFileSync('./allfunc/owner.json'))
        const isCreator = [botNumber, ...owner].map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender)
        const isGroup = m.isGroup
        
        let groupMetadata, participants, groupAdmins, isBotAdmins, isAdmins, groupName
        if (isGroup) {
            groupMetadata = await empire.groupMetadata(m.chat).catch(() => null)
            participants = groupMetadata?.participants || []
            groupAdmins = participants.filter(p => p.admin).map(p => p.id)
            isBotAdmins = groupAdmins.includes(botNumber)
            isAdmins = groupAdmins.includes(m.sender)
            groupName = groupMetadata?.subject || ""
        }
        
        const reply = (teks) => {
            empire.sendMessage(m.chat, { text: teks }, { quoted: m })
        }
        
        // Check if user is jailed
        if (isGroup && !isCreator && !isAdmins) {
            const jailed = await isUserJailed(m.sender, m.chat);
            if (jailed) {
                const jailData = db.jailed[m.chat][m.sender];
                let message = `🔒 *You are JAILED!*\n\n📌 Reason: ${jailData.reason}\n`;
                
                if (jailData.until) {
                    const remaining = Math.ceil((jailData.until - Date.now()) / 60000);
                    message += `⏱️ Time remaining: ${remaining} minutes\n`;
                } else {
                    message += `⏱️ Time remaining: PERMANENT\n`;
                }
                message += `\n❌ You cannot send messages until released.`;
                
                await empire.sendMessage(m.chat, { delete: m.key }).catch(() => {});
                await empire.sendMessage(m.chat, { text: message, mentions: [m.sender] }).catch(() => {});
                return;
            }
        }
        
        // Handle anti features
        await handleAntiLink(empire, m, isCreator, isAdmins, saveDB);
        await handleAntiSticker(empire, m, isCreator, isAdmins, saveDB);
        await handleAntiDelete(empire, m, saveDB);
        
        if (!isCmd) return
        
        // ========== COMMANDS ==========
        switch(command) {
            
            // ========== PING ==========
            case 'ping': {
                const start = Date.now();
                await empire.sendPresenceUpdate('composing', m.chat);
                const latency = Date.now() - start;
                const quality = latency < 50 ? '✦ PERFECT' : latency < 120 ? '✦ GOOD' : latency < 250 ? '✦ OKAY' : '✦ SLOW';
                const response = `┌───[ 📡 PING ]\n│\n├  ⏱️  ${latency} ms\n├  ${quality}\n│\n└───[ RANGER XMD TECH ]`;
                await empire.sendMessage(m.chat, { text: response }, { quoted: m });
            }
            break;
           case 'menu':
case 'help':
case 'allmenu': {
    const currentTime = new Date().toLocaleTimeString('en-US', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const currentDate = new Date().toLocaleDateString('en-US', { timeZone: 'Africa/Lagos', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const usedMemory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    const totalMemory = (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(1);
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const cpuCores = require('os').cpus().length;
    const platform = require('os').platform();
    const nodeVersion = process.version;
    
    const menu = `
╔══════════════════════════════════════╗
║          ⚡ RANGER XMD TECH           ║
╠══════════════════════════════════════╣
║ 🕐 Time     : ${currentTime} GMT+1
║ 📅 Date     : ${currentDate}
║ 💾 RAM      : ${usedMemory}MB / ${totalMemory}MB
║ ⏱️ Uptime   : ${days}d ${hours}h ${minutes}m ${seconds}s
║ 🖥️ System   : ${platform} | ${cpuCores} Cores
║ 📦 Node     : ${nodeVersion}
╠══════════════════════════════════════╣
║           🔧 CORE COMMANDS            ║
╠══════════════════════════════════════╣
║ • ${prefix}ping      • ${prefix}alive
║ • ${prefix}uptime    • ${prefix}runtime
║ • ${prefix}menu      • ${prefix}owner
║ • ${prefix}autobio   
╠══════════════════════════════════════╣
║          🤖 AI & CHAT COMMANDS        ║
╠══════════════════════════════════════╣
║ • ${prefix}ai        • ${prefix}chat
║ • ${prefix}ask       • ${prefix}zuko
║ • ${prefix}gpt       • ${prefix}clearai
╠══════════════════════════════════════╣
║          🔊 TEXT TO SPEECH            ║
╠══════════════════════════════════════╣
║ • ${prefix}say       • ${prefix}tts
║ • ${prefix}speak     • ${prefix}voice
║ • ${prefix}sayvoice  
╠══════════════════════════════════════╣
║          🌐 TRANSLATION               ║
╠══════════════════════════════════════╣
║ • ${prefix}translate • ${prefix}tr
║ • ${prefix}detect    • ${prefix}toen
╠══════════════════════════════════════╣
║          📖 RELIGION                  ║
╠══════════════════════════════════════╣
║ • ${prefix}bible     • ${prefix}kitab
║ • ${prefix}randombible • ${prefix}dailyverse
║ • ${prefix}quran     • ${prefix}surah
║ • ${prefix}randomquran • ${prefix}dailyquran
╠══════════════════════════════════════╣
║          🎵 MEDIA DOWNLOADER          ║
╠══════════════════════════════════════╣
║ • ${prefix}play      • ${prefix}song
║ • ${prefix}music     • ${prefix}tgsticker
╠══════════════════════════════════════╣
║          🎨 STICKER & MEDIA           ║
╠══════════════════════════════════════╣
║ • ${prefix}sticker   • ${prefix}s
║ • ${prefix}toimg     • ${prefix}toimage
║ • ${prefix}tomp4     • ${prefix}tovideo
║ • ${prefix}toaudio   • ${prefix}tomp3
╠══════════════════════════════════════╣
║          🛡️ PROTECTION                ║
╠══════════════════════════════════════╣
║ • ${prefix}antilink  • ${prefix}antisticker
║ • ${prefix}antidelete • ${prefix}welcome
║ • ${prefix}goodbye   • ${prefix}setwelcome
║ • ${prefix}setgoodbye
╠══════════════════════════════════════╣
║          🔒 MODERATION                ║
╠══════════════════════════════════════╣
║ • ${prefix}mute      • ${prefix}lock
║ • ${prefix}close     • ${prefix}unmute
║ • ${prefix}unlock    • ${prefix}open
║ • ${prefix}mutestatus • ${prefix}jail
║ • ${prefix}unjail    • ${prefix}jailed
╠══════════════════════════════════════╣
║          👥 GROUP MANAGEMENT          ║
╠══════════════════════════════════════╣
║ • ${prefix}acceptall • ${prefix}approveall
║ • ${prefix}rejectall • ${prefix}declineall
║ • ${prefix}pending   • ${prefix}requests
║ • ${prefix}approve   • ${prefix}accept
║ • ${prefix}reject    • ${prefix}decline
║ • ${prefix}gstatus
╠══════════════════════════════════════╣
║       📢 NEWSLETTER & CHANNEL         ║
╠══════════════════════════════════════╣
║ • ${prefix}newsletter • ${prefix}channel
║ • ${prefix}getchannel • ${prefix}mychannel
║ • ${prefix}mynewsletter • ${prefix}myidch
╠══════════════════════════════════════╣
║          💰 BOT DEPLOYMENT            ║
╠══════════════════════════════════════╣
║ • ${prefix}getbot    • ${prefix}deploy
║ • ${prefix}ownbot    • ${prefix}order
║ • ${prefix}price     • ${prefix}pricelist
║ • ${prefix}demo      • ${prefix}testbot
║ • ${prefix}support   • ${prefix}contact
╠══════════════════════════════════════╣
║          ❤️ AUTO REACT                ║
╠══════════════════════════════════════╣
║ • ${prefix}autoreact • ${prefix}autoreactmsg
║ • ${prefix}addreact  • ${prefix}removereact
╠══════════════════════════════════════╣
║     📊 TOTAL COMMANDS: 80+            ║
╚══════════════════════════════════════╝
💝 RANGER XMD TECH`.trim();

    await empire.sendMessage(m.chat, {
        text: menu,
        contextInfo: {
            mentionedJid: [m.sender],
            externalAdReply: {
                title: `⚡ RANGER XMD TECH ACTIVE`,
                body: `80+ commands • ${usedMemory}MB • ${days}d ${hours}h`,
                thumbnailUrl: 'https://files.catbox.moe/rqkoqa.jpg',
                mediaType: 1,
                renderLargerThumbnail: true
            },
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: "",
                newsletterName: "RANGER TECH"
            }
        }
    }, { quoted: m });
}
break;
            // ========== UPTIME ==========
            case 'runtime':
            case 'alive':
            case 'uptime': {
                const uptime = process.uptime();
                const days = Math.floor(uptime / 86400);
                const hours = Math.floor((uptime % 86400) / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                const seconds = Math.floor(uptime % 60);
                const response = `┌───[ 🟢 SYSTEM UPTIME ]\n│\n├  ⏱️  ${days}d ${hours}h ${minutes}m ${seconds}s\n├  🤖 RANGER XMD TECH\n│\n└───[ ONLINE ]`;
                await empire.sendMessage(m.chat, { text: response }, { quoted: m });
            }
            break;
            // ========== MUTE GROUP (LOCK GROUP) ==========
case 'mute':
case 'lock':
case 'close': {
    if (!isGroup) return reply("👥 This command only works in groups!");
    if (!isCreator && !isAdmins) return reply("❌ Only admins can mute the group!");
    
    try {
        await empire.groupSettingUpdate(m.chat, 'announcement');
        
        const response = `
┌───[ 🔒 GROUP MUTED ]
│
├  🔇 Only admins can send messages
├  👑 Action by: @${m.sender.split('@')[0]}
│
└───[ Use ${prefix}unmute to open ]`.trim();
        
        await empire.sendMessage(m.chat, {
            text: response,
            mentions: [m.sender]
        }, { quoted: m });
        
    } catch (err) {
        console.error('Mute error:', err);
        reply(`❌ Failed to mute group. Make sure bot is admin!`);
    }
}
break;

// ========== UNMUTE GROUP (UNLOCK GROUP) ==========
case 'unmute':
case 'unlock':
case 'open': {
    if (!isGroup) return reply("👥 This command only works in groups!");
    if (!isCreator && !isAdmins) return reply("❌ Only admins can unmute the group!");
    
    try {
        await empire.groupSettingUpdate(m.chat, 'not_announcement');
        
        const response = `
┌───[ 🔓 GROUP UNMUTED ]
│
├  🔊 All members can send messages
├  👑 Action by: @${m.sender.split('@')[0]}
│
└───[ Group is now open ]`.trim();
        
        await empire.sendMessage(m.chat, {
            text: response,
            mentions: [m.sender]
        }, { quoted: m });
        
    } catch (err) {
        console.error('Unmute error:', err);
        reply(`❌ Failed to unmute group. Make sure bot is admin!`);
    }
}
break;

// ========== MUTE STATUS ==========
case 'mutestatus':
case 'lockstatus': {
    if (!isGroup) return reply("👥 This command only works in groups!");
    
    try {
        const metadata = await empire.groupMetadata(m.chat);
        const isLocked = metadata.announce === true;
        
        const response = `
┌───[ 🔒 GROUP STATUS ]
│
├  Status: ${isLocked ? '🔴 MUTED' : '🟢 OPEN'}
├  ${isLocked ? '🔇 Only admins can send' : '🔊 All members can send'}
│
└───[ ${isLocked ? `${prefix}unmute to open` : `${prefix}mute to close`} ]`.trim();
        
        reply(response);
    } catch (err) {
        reply(`❌ Failed to get group status!`);
    }
}
break;
            
            // ========== PLAY COMMAND (DOWNLOAD MUSIC) ==========
            case 'play':
            case 'song':
            case 'music': {
                if (!text) return reply(`🎵 *Play Song*\n\nUsage: ${prefix}play <song name>\nExample: ${prefix}play African Giant`);
                
                await empire.sendMessage(m.chat, { react: { text: '🎵', key: m.key } });
                
                try {
                    const search = await yts(text);
                    if (!search?.videos?.length) return reply('❌ No results found!');
                    
                    const video = search.videos[0];
                    
                    await reply(`⏳ Downloading: ${video.title}\n⏱️ Duration: ${video.timestamp || 'N/A'}`);
                    
                    // Try multiple APIs
                    const apis = [
                        { url: `https://api.agatz.xyz/api/ytplay?query=${encodeURIComponent(text)}`, parse: (d) => d.data?.url || d.url },
                        { url: `https://api.nexoracle.com/downloader/ytmp3?url=${encodeURIComponent(video.url)}&apikey=d0634e61e8789b051e`, parse: (d) => d.result?.url || d.url }
                    ];
                    
                    let audioUrl = null;
                    for (const api of apis) {
                        try {
                            const res = await axios.get(api.url, { timeout: 15000 });
                            audioUrl = api.parse(res.data);
                            if (audioUrl) break;
                        } catch (e) {}
                    }
                    
                    if (!audioUrl) return reply('❌ Failed to download audio!');
                    
                    await empire.sendMessage(m.chat, {
                        audio: { url: audioUrl },
                        mimetype: 'audio/mpeg',
                        fileName: `${video.title}.mp3`,
                        caption: `🎵 *${video.title}*\n⏱️ ${video.timestamp || 'N/A'}`
                    }, { quoted: m });
                    
                    await empire.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
                    
                } catch (error) {
                    console.error('Play error:', error);
                    reply('❌ Failed to download song!');
                }
            }
            break;
            
            // ========== TO AUDIO (VIDEO TO MP3) ==========
            case 'toaudio':
            case 'tomp3': {
                if (!m.quoted) return reply(`🎵 *Usage:* Reply to a video with ${prefix}toaudio`);
                
                const mime = m.quoted.mimetype || '';
                if (!/video/.test(mime)) return reply("❌ Reply to a video file!");
                
                await empire.sendMessage(m.chat, { react: { text: '🎵', key: m.key } });
                
                try {
                    const media = await m.quoted.download();
                    const inputPath = `./tmp/input_${Date.now()}.mp4`;
                    const outputPath = `./tmp/output_${Date.now()}.mp3`;
                    
                    if (!fs.existsSync('./tmp')) fs.mkdirSync('./tmp', { recursive: true });
                    fs.writeFileSync(inputPath, media);
                    
                    await new Promise((resolve, reject) => {
                        exec(`ffmpeg -i ${inputPath} -vn -ar 44100 -ac 2 -b:a 192k ${outputPath}`, (error) => {
                            if (error) reject(error);
                            else resolve();
                        });
                    });
                    
                    const audioBuffer = fs.readFileSync(outputPath);
                    
                    await empire.sendMessage(m.chat, {
                        audio: audioBuffer,
                        mimetype: 'audio/mpeg',
                        fileName: 'audio.mp3',
                        ptt: false
                    }, { quoted: m });
                    
                    fs.unlinkSync(inputPath);
                    fs.unlinkSync(outputPath);
                    
                    await empire.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
                    
                } catch (error) {
                    console.error('ToAudio error:', error);
                    reply('❌ Failed to convert video to audio!');
                }
            }
            break;
            
            // ========== TO MP4 (STICKER TO VIDEO) ==========
            case 'tomp4':
            case 'tovideo': {
                if (!m.quoted) return reply(`🎬 *Usage:* Reply to a sticker with ${prefix}tomp4`);
                
                const mime = m.quoted.mimetype || '';
                if (!/webp/.test(mime)) return reply("❌ Reply to a sticker!");
                
                await empire.sendMessage(m.chat, { react: { text: '🎬', key: m.key } });
                
                try {
                    const media = await m.quoted.download();
                    const inputPath = `./tmp/sticker_${Date.now()}.webp`;
                    const outputPath = `./tmp/video_${Date.now()}.mp4`;
                    
                    if (!fs.existsSync('./tmp')) fs.mkdirSync('./tmp', { recursive: true });
                    fs.writeFileSync(inputPath, media);
                    
                    await new Promise((resolve, reject) => {
                        exec(`ffmpeg -i ${inputPath} -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512" -c:v libx264 -pix_fmt yuv420p -t 10 ${outputPath}`, (error) => {
                            if (error) reject(error);
                            else resolve();
                        });
                    });
                    
                    const videoBuffer = fs.readFileSync(outputPath);
                    
                    await empire.sendMessage(m.chat, {
                        video: videoBuffer,
                        caption: '🎬 *Sticker converted to video*'
                    }, { quoted: m });
                    
                    fs.unlinkSync(inputPath);
                    fs.unlinkSync(outputPath);
                    
                    await empire.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
                    
                } catch (error) {
                    console.error('ToMp4 error:', error);
                    reply('❌ Failed to convert sticker to video!');
                }
            }
            break;
            case 'tgsticker':
case 'telegramsticker': {
    if (!text) {
        return reply(`🎀 *Telegram to WhatsApp Sticker*\n\n*Usage:* ${prefix}tgsticker <sticker pack link>\n*Example:* ${prefix}tgsticker https://t.me/addstickers/AnimePack\n\n📌 *Note:* You need a Telegram Bot Token. Get it from @BotFather on Telegram.`);
    }
    
    // Check if bot token is configured
    if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
        return reply(`❌ *Telegram Bot Token Not Configured*\n\nTo use this command, you need to:\n\n1. Open Telegram\n2. Search for @BotFather\n3. Send: /newbot\n4. Follow instructions to create a bot\n5. Copy your bot token\n6. Add it to your config\n\n*Example:*\n\`\`\`javascript\nconst TELEGRAM_BOT_TOKEN = '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz';\n\`\`\`\n\n💡 Contact bot owner to configure this feature.`);
    }
    
    // Extract pack name from URL
    let packName = text;
    if (text.includes('t.me/addstickers/')) {
        packName = text.split('t.me/addstickers/')[1];
    } else if (text.includes('t.me/')) {
        packName = text.split('t.me/')[1];
    }
    packName = packName.split('?')[0].split('/')[0];
    
    if (!packName) {
        return reply(`❌ Invalid Telegram sticker link.\n\nExample: https://t.me/addstickers/AnimePack`);
    }
    
    await empire.sendMessage(m.chat, { react: { text: '🎀', key: m.key } });
    
    try {
        await reply(`⏳ *Fetching sticker pack:* ${packName}\n\nUsing Telegram Bot API...`);
        
        // Use Telegram Bot API to get sticker pack
        const apiUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getStickerSet?name=${packName}`;
        
        const response = await axios.get(apiUrl, { timeout: 15000 });
        
        if (!response.data || !response.data.ok) {
            throw new Error(response.data?.description || 'Sticker pack not found');
        }
        
        const stickerSet = response.data.result;
        const packTitle = stickerSet.title;
        const stickers = stickerSet.stickers;
        
        if (!stickers || stickers.length === 0) {
            return reply(`❌ No stickers found in pack: *${packName}*`);
        }
        
        // Limit to 15 stickers
        const stickerLimit = Math.min(stickers.length, 15);
        
        await empire.sendMessage(m.chat, {
            text: `✅ *Sticker Pack Found*\n\n📛 Name: ${packTitle}\n📦 Total: ${stickers.length} stickers\n🎨 Sending: ${stickerLimit} stickers\n\n⏳ Converting...`
        }, { quoted: m });
        
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < stickerLimit; i++) {
            try {
                const sticker = stickers[i];
                const fileId = sticker.file_id;
                
                // Get file path
                const fileResponse = await axios.get(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
                
                if (!fileResponse.data || !fileResponse.data.ok) {
                    failCount++;
                    continue;
                }
                
                const filePath = fileResponse.data.result.file_path;
                const stickerUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
                
                // Download sticker
                const stickerResponse = await axios.get(stickerUrl, { 
                    responseType: 'arraybuffer',
                    timeout: 10000
                });
                
                let stickerBuffer = Buffer.from(stickerResponse.data);
                
                // Check if animated
                if (filePath.endsWith('.tgs')) {
                    failCount++;
                    continue;
                }
                
                // Add EXIF metadata
                const finalSticker = await addExif(stickerBuffer, packTitle.substring(0, 30), "Telegram");
                
                await empire.sendMessage(m.chat, { 
                    sticker: finalSticker,
                    contextInfo: {
                        externalAdReply: {
                            title: packTitle,
                            body: `Sticker ${i + 1}/${stickerLimit}`,
                            thumbnailUrl: "https://files.catbox.moe/rqkoqa.jpg",
                            mediaType: 1
                        }
                    }
                }, { quoted: m });
                
                successCount++;
                await sleep(600);
                
            } catch (err) {
                console.error(`Sticker ${i + 1} failed:`, err.message);
                failCount++;
            }
        }
        
        await empire.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
        if (successCount > 0) {
            reply(`🎉 *Conversion Complete!*\n\n📛 Pack: ${packTitle}\n✅ Success: ${successCount} stickers\n❌ Failed: ${failCount}\n\n💝 RANGER XMD TECH`);
        } else {
            reply(`❌ Failed to convert any stickers from this pack.`);
        }
        
    } catch (error) {
        console.error('TGSticker Error:', error);
        await empire.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        
        if (error.response?.data?.description) {
            reply(`❌ Telegram API Error: ${error.response.data.description}\n\nPack: ${packName}\n\n💡 Make sure:\n• Pack name is correct\n• Pack is public\n• Bot token is valid`);
        } else {
            reply(`❌ Failed to fetch sticker pack.\n\n*Pack name:* ${packName}\n*Error:* ${error.message}`);
        }
    }
}
break;

            // ========== TO IMAGE (STICKER TO IMAGE) ==========
            case 'toimg':
            case 'toimage': {
                if (!m.quoted) return reply(`🖼️ *Usage:* Reply to a sticker with ${prefix}toimg`);
                
                const mime = m.quoted.mimetype || '';
                if (!/webp/.test(mime)) return reply("❌ Reply to a sticker!");
                
                await empire.sendMessage(m.chat, { react: { text: '🖼️', key: m.key } });
                
                try {
                    const media = await m.quoted.download();
                    
                    // WhatsApp accepts webp as image directly
                    await empire.sendMessage(m.chat, {
                        image: media,
                        caption: `🖼️ *Sticker converted to image*`
                    }, { quoted: m });
                    
                    await empire.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
                    
                } catch (error) {
                    console.error('ToImage error:', error);
                    reply('❌ Failed to convert sticker to image!');
                }
            }
            break;
            case 'gst':
case 'gstatus':
case 'groupstatus': {
    if (!m.isGroup) {
        return reply(`👥 *RANGER XMD TECH Group Status*\n\nThis command can only be used in groups.`);
    }

    try {
        await devtrust.sendMessage(m.chat, { react: { text: '📢', key: m.key } });

        // Check if replying to a message or providing text
        const quotedMsg = m.quoted;
        const textInput = text;

        if (!quotedMsg && !textInput) {
            return reply(`📢 *RANGER XMD TECH Group Status*\n\nReply to an image/video/audio or provide text to post as group status.\n\nExample: ${prefix}gstatus Hello group!`);
        }

        // Generate random message ID
        function generateMessageId() {
            return 'RANGER XMD TECH' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        }

        let statusInnerMessage = {};

        // ==========================================
        // 1. HANDLE TEXT STATUS (BLACK BACKGROUND)
        // ==========================================
        if (!quotedMsg && textInput) {
            statusInnerMessage = {
                extendedTextMessage: {
                    text: textInput,
                    backgroundArgb: 0xFF000000, // BLACK background
                    textArgb: 0xFFFFFFFF, // White text
                    font: 1,
                    contextInfo: {
                        mentionedJid: [],
                        isGroupStatus: true,
                        externalAdReply: {
                            title: "RANGER XMD TECH",
                            body: "Group Status",
                            thumbnailUrl: "https://files.catbox.moe/rqkoqa.jpg",
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }
            };

            const statusPayload = {
                groupStatusMessageV2: {
                    message: statusInnerMessage
                }
            };

            const statusId = generateMessageId();
            await devtrust.relayMessage(m.chat, statusPayload, { messageId: statusId });
            await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        }

        // ==========================================
        // 2. HANDLE QUOTED MEDIA/TEXT
        // ==========================================
        else if (quotedMsg) {
            const mime = (quotedMsg.msg || quotedMsg).mimetype || '';
            const caption = textInput || quotedMsg.caption || '';

            // IMAGE STATUS
            if (/image/.test(mime)) {
                let media = await quotedMsg.download();
                await devtrust.sendMessage(m.chat, {
                    image: media,
                    caption: caption,
                    contextInfo: { 
                        isGroupStatus: true,
                        externalAdReply: {
                            title: "RANGER XMD TECH",
                            body: "Group Status Image",
                            thumbnailUrl: "https://files.catbox.moe/rqkoqa.jpg",
                            mediaType: 1
                        }
                    }
                });
                await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            }

            // VIDEO STATUS
            else if (/video/.test(mime)) {
                let media = await quotedMsg.download();
                await devtrust.sendMessage(m.chat, {
                    video: media,
                    caption: caption,
                    contextInfo: { 
                        isGroupStatus: true,
                        externalAdReply: {
                            title: "RANGER XMD TECH",
                            body: "Group Status Video",
                            thumbnailUrl: "https://files.catbox.moe/rqkoqa.jpg",
                            mediaType: 1
                        }
                    }
                });
                await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            }

            // AUDIO STATUS (Voice Note)
            else if (/audio/.test(mime)) {
                let media = await quotedMsg.download();
                await devtrust.sendMessage(m.chat, {
                    audio: media,
                    mimetype: 'audio/mpeg',
                    ptt: true,
                    contextInfo: { 
                        isGroupStatus: true,
                        externalAdReply: {
                            title: "RANGER XMD TECH",
                            body: "Group Status Audio",
                            thumbnailUrl: "https://files.catbox.moe/rqkoqa.jpg",
                            mediaType: 1
                        }
                    }
                });
                await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            }

            // STICKER STATUS
            else if (/webp/.test(mime)) {
                let media = await quotedMsg.download();
                await devtrust.sendMessage(m.chat, {
                    sticker: media,
                    contextInfo: { 
                        isGroupStatus: true,
                        externalAdReply: {
                            title: "RANGER XMD TECH",
                            body: "Group Status Sticker",
                            thumbnailUrl: "https://files.catbox.moe/rqkoqa.jpg",
                            mediaType: 1
                        }
                    }
                });
                await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            }

            // DOCUMENT STATUS
            else if (/document/.test(mime)) {
                let media = await quotedMsg.download();
                let fileName = quotedMsg.fileName || 'document.pdf';
                await devtrust.sendMessage(m.chat, {
                    document: media,
                    fileName: fileName,
                    mimetype: mime,
                    caption: caption,
                    contextInfo: { 
                        isGroupStatus: true,
                        externalAdReply: {
                            title: "RANGER XMD TECH",
                            body: "Group Status Document",
                            thumbnailUrl: "https://files.catbox.moe/rqkoqa.jpg",
                            mediaType: 1
                        }
                    }
                });
                await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            }

            // QUOTED TEXT STATUS
            else if (quotedMsg.text || quotedMsg.conversation) {
                const quotedText = quotedMsg.text || quotedMsg.conversation || '';
                const finalText = textInput ? `${quotedText}\n\n${textInput}` : quotedText;
                
                statusInnerMessage = {
                    extendedTextMessage: {
                        text: finalText,
                        backgroundArgb: 0xFF000000,
                        textArgb: 0xFFFFFFFF,
                        font: 1,
                        contextInfo: {
                            mentionedJid: [],
                            isGroupStatus: true,
                            quotedMessage: {
                                conversation: quotedText
                            }
                        }
                    }
                };

                const statusPayload = {
                    groupStatusMessageV2: {
                        message: statusInnerMessage
                    }
                };

                const statusId = generateMessageId();
                await devtrust.relayMessage(m.chat, statusPayload, { messageId: statusId });
                await devtrust.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            }

            else {
                return reply(`❌ Unsupported media type. Please reply to an image, video, audio, sticker, document, or text.`);
            }
        }

    } catch (error) {
        console.error('Group Status Error:', error);
        await devtrust.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ Failed to post group status.\n\nError: ${error.message}`);
    }
}
break;
            // ========== ACCEPT ALL PENDING JOIN REQUESTS ==========
case 'acceptall':
case 'approveall':
case 'joinall': {
    if (!isGroup) return reply("👥 This command only works in groups!");
    if (!isCreator && !isAdmins) return reply("❌ Only admins can approve join requests!");
    
    await empire.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });
    
    try {
        // Get pending join requests
        const pendingRequests = await empire.groupRequestParticipantsList(m.chat).catch(() => null);
        
        if (!pendingRequests || pendingRequests.length === 0) {
            return reply(`┌───[ 📋 PENDING REQUESTS ]
│
├  ✅ No pending join requests
│
└───[ Group is clean ]`.trim());
        }
        
        let approved = 0;
        let failed = 0;
        const approvedList = [];
        
        for (const request of pendingRequests) {
            try {
                await empire.groupRequestParticipantsUpdate(m.chat, [request], 'approve');
                approved++;
                approvedList.push(request);
                await delay(500);
            } catch (err) {
                failed++;
                console.error(`Failed to approve ${request}:`, err.message);
            }
        }
        
        const response = `
┌───[ ✅ ACCEPT ALL COMPLETE ]
│
├  📋 Total requests: ${pendingRequests.length}
├  ✅ Approved: ${approved}
├  ❌ Failed: ${failed}
│
└───[ ${approved} new members joined ]`.trim();
        
        await empire.sendMessage(m.chat, {
            text: response,
            mentions: approvedList.slice(0, 10)
        }, { quoted: m });
        
        await empire.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (err) {
        console.error('Accept all error:', err);
        await empire.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ Failed to accept requests.\n\nError: ${err.message}\n\nMake sure bot is admin.`);
    }
}
break;

// ========== REJECT ALL PENDING JOIN REQUESTS ==========
case 'rejectall':
case 'declineall': {
    if (!isGroup) return reply("👥 This command only works in groups!");
    if (!isCreator && !isAdmins) return reply("❌ Only admins can reject join requests!");
    
    await empire.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });
    
    try {
        const pendingRequests = await empire.groupRequestParticipantsList(m.chat).catch(() => null);
        
        if (!pendingRequests || pendingRequests.length === 0) {
            return reply(`┌───[ 📋 PENDING REQUESTS ]
│
├  ✅ No pending join requests
│
└───[ Group is clean ]`.trim());
        }
        
        let rejected = 0;
        let failed = 0;
        
        for (const request of pendingRequests) {
            try {
                await empire.groupRequestParticipantsUpdate(m.chat, [request], 'reject');
                rejected++;
                await delay(500);
            } catch (err) {
                failed++;
            }
        }
        
        const response = `
┌───[ ❌ REJECT ALL COMPLETE ]
│
├  📋 Total requests: ${pendingRequests.length}
├  ❌ Rejected: ${rejected}
├  ⚠️ Failed: ${failed}
│
└───[ All requests declined ]`.trim();
        
        await empire.sendMessage(m.chat, { text: response }, { quoted: m });
        await empire.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        
    } catch (err) {
        console.error('Reject all error:', err);
        await empire.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ Failed to reject requests.\n\nError: ${err.message}`);
    }
}
break;

// ========== VIEW PENDING REQUESTS ==========
case 'pending':
case 'requests':
case 'joinrequests': {
    if (!isGroup) return reply("👥 This command only works in groups!");
    if (!isCreator && !isAdmins) return reply("❌ Only admins can view pending requests!");
    
    try {
        const pendingRequests = await empire.groupRequestParticipantsList(m.chat).catch(() => null);
        
        if (!pendingRequests || pendingRequests.length === 0) {
            return reply(`┌───[ 📋 PENDING REQUESTS ]
│
├  ✅ No pending join requests
│
└───[ Group is clean ]`.trim());
        }
        
        let requestList = `┌───[ 📋 PENDING REQUESTS ]
│
├  📊 Total: ${pendingRequests.length} request(s)
│
`;
        
        for (let i = 0; i < Math.min(pendingRequests.length, 15); i++) {
            const jid = pendingRequests[i];
            requestList += `├  ${i + 1}. @${jid.split('@')[0]}\n`;
        }
        
        if (pendingRequests.length > 15) {
            requestList += `├  ... and ${pendingRequests.length - 15} more\n`;
        }
        
        requestList += `│
├───[ COMMANDS ]
│  ├ ${prefix}acceptall - Approve all
│  ├ ${prefix}rejectall - Decline all
│  └ ${prefix}approve @user - Approve single
│
└───[ Action required ]`.trim();
        
        await empire.sendMessage(m.chat, {
            text: requestList,
            mentions: pendingRequests.slice(0, 15)
        }, { quoted: m });
        
    } catch (err) {
        console.error('Pending requests error:', err);
        reply(`❌ Failed to get pending requests.\n\nMake sure bot is admin.`);
    }
}
break;

// ========== APPROVE SINGLE USER ==========
case 'approve':
case 'accept': {
    if (!isGroup) return reply("👥 This command only works in groups!");
    if (!isCreator && !isAdmins) return reply("❌ Only admins can approve join requests!");
    
    let target = m.mentionedJid?.[0];
    if (!target && m.quoted) target = m.quoted.sender;
    if (!target && text) target = text.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    if (!target) return reply(`✅ *Usage:* ${prefix}approve @user\n\nApprove a single join request.`);
    
    try {
        await empire.groupRequestParticipantsUpdate(m.chat, [target], 'approve');
        
        reply(`┌───[ ✅ USER APPROVED ]
│
├  👤 @${target.split('@')[0]} joined the group
│
└───[ Welcome! ]`.trim(), { mentions: [target] });
        
    } catch (err) {
        console.error('Approve error:', err);
        reply(`❌ Failed to approve @${target.split('@')[0]}\n\nMake sure they have a pending request.`, { mentions: [target] });
    }
}
break;

// ========== REJECT SINGLE USER ==========
case 'reject':
case 'decline': {
    if (!isGroup) return reply("👥 This command only works in groups!");
    if (!isCreator && !isAdmins) return reply("❌ Only admins can reject join requests!");
    
    let target = m.mentionedJid?.[0];
    if (!target && m.quoted) target = m.quoted.sender;
    if (!target && text) target = text.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    if (!target) return reply(`❌ *Usage:* ${prefix}reject @user\n\nReject a single join request.`);
    
    try {
        await empire.groupRequestParticipantsUpdate(m.chat, [target], 'reject');
        
        reply(`┌───[ ❌ USER REJECTED ]
│
├  👤 @${target.split('@')[0]} was declined
│
└───[ Request removed ]`.trim(), { mentions: [target] });
        
    } catch (err) {
        console.error('Reject error:', err);
        reply(`❌ Failed to reject @${target.split('@')[0]}`, { mentions: [target] });
    }
}
break;
            // ========== TO STICKER (IMAGE/VIDEO TO STICKER) ==========
            case 'sticker':
            case 's':
            case 'stiker': {
                const quoted = m.quoted || m;
                const mime = quoted.mimetype || '';
                
                if (!/image|video/.test(mime)) {
                    return reply(`🖼️ *Make a Sticker*\n\nReply to an image/video with:\n${prefix}sticker\n\n🎨 *Supported:* JPG, PNG, MP4 (max 10 seconds)`);
                }
                
                await empire.sendMessage(m.chat, { react: { text: '🎨', key: m.key } });
                
                try {
                    const media = await quoted.download();
                    
                    if (!media || media.length === 0) {
                        return reply(`❌ Failed to download media.`);
                    }
                    
                    let stickerBuffer;
                    
                    if (/image/.test(mime)) {
                        stickerBuffer = await imageToWebp(media);
                    } else {
                        const inputPath = `./tmp/video_${Date.now()}.mp4`;
                        const outputPath = `./tmp/sticker_${Date.now()}.webp`;
                        
                        if (!fs.existsSync('./tmp')) fs.mkdirSync('./tmp', { recursive: true });
                        fs.writeFileSync(inputPath, media);
                        
                        await new Promise((resolve, reject) => {
                            exec(`ffmpeg -i ${inputPath} -vf "fps=10,scale=512:512:force_original_aspect_ratio=increase,crop=512:512" -loop 0 -c:v libwebp -lossless 0 -q:v 70 -preset default -an -vsync 0 ${outputPath}`, 
                            (error) => {
                                if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                                if (error) reject(error);
                                else resolve();
                            });
                        });
                        
                        stickerBuffer = fs.readFileSync(outputPath);
                        fs.unlinkSync(outputPath);
                    }
                    
                    if (!stickerBuffer || stickerBuffer.length === 0) {
                        return reply(`❌ Failed to create sticker.`);
                    }
                    
                    let packname = "RANGER XMD TECH";
                    let author = m.pushName || "User";
                    
                    if (text && text.includes('|')) {
                        const [customPack, customAuthor] = text.split('|').map(s => s.trim());
                        if (customPack) packname = customPack;
                        if (customAuthor) author = customAuthor;
                    }
                    
                    const finalSticker = await addExif(stickerBuffer, packname, author);
                    
                    await empire.sendMessage(m.chat, { 
                        sticker: finalSticker,
                        contextInfo: {
                            externalAdReply: {
                                title: packname,
                                body: `Sticker by ${author}`,
                                thumbnailUrl: "https://files.catbox.moe/rqkoqa.jpg",
                                mediaType: 1
                            }
                        }
                    }, { quoted: m });
                    
                    await empire.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
                    
                } catch (error) {
                    console.error('Sticker Error:', error);
                    reply(`❌ Failed to create sticker.\n\nError: ${error.message}`);
                }
            }
            break;
            // ========== GET BOT (DEPLOY YOUR OWN BOT) ==========
case 'getbot':
case 'deploy':
case 'ownbot':
case 'buymybot': {
    const ownerNumber = owner[0] || '2347081827038';
    const botName = 'RANGER XMD TECH';
    const botVersion = '1.0.0';
    
    const response = `
┌───[ 🤖 DEPLOY YOUR OWN BOT ]
│
├  📌 *${botName} v${botVersion}*
├  💰 *Price:* FREE / PAID
├  ⚡ *Features:* 500+ Commands
│
├───[ ✨ FEATURES ]
│
├  🎵 Media Downloader
│  ├ YouTube, TikTok, Instagram
│  ├ Facebook, Twitter, Spotify
│  └ WhatsApp Status Saver
│
├  🛡️ Group Protection
│  ├ Anti-Link, Anti-Spam
│  ├ Anti-Sticker, Anti-Delete
│  ├ Welcome/Goodbye Messages
│  └ Jail System
│
├  🎨 Media Tools
│  ├ Image to Sticker
│  ├ Video to Audio
│  ├ Sticker to Image/Video
│  └ Text to Sticker
│
├  🤖 AI Features
│  ├ Auto React on Messages
│  ├ Auto Status View/React
│  └ Auto Bio Updates
│
├  🔒 Moderation
│  ├ Mute/Unmute Group
│  ├ Accept/Reject All
│  ├ Warn/Kick System
│  └ Pairing System
│
├───[ 📞 CONTACT ]
│
├  👑 *Owner:* wa.me/${ownerNumber}
├  📧 *Email:* support@Rangertechcrop.com
├  📢 *Channel:* Follow the 👽RANGER XMD TECH👽 channel on TELEGRAM: https://t.me/Rangertechcrop
│
├───[ 💝 PACKAGES ]
│
├  🔹 *BASIC (FREE)*
│  ├ 50+ commands
│  ├ Basic group management
│  └ 24/7 support
│
├  🔸 *PRO (PAID)*
│  ├ All 500+ commands
│  ├ Premium features
│  ├ Custom commands
│  ├ Priority support
│  └ Lifetime updates
│
└───[ 🚀 DEPLOY NOW ]

Type: *${prefix}order* to start
Contact: *wa.me/${ownerNumber}*

💝 RANGER XMD TECH`.trim();

    await empire.sendMessage(m.chat, {
        text: response,
        contextInfo: {
            mentionedJid: [m.sender],
            externalAdReply: {
                title: `🤖 GET ${botName} BOT`,
                body: `Deploy your own WhatsApp bot today!`,
                thumbnailUrl: 'https://files.catbox.moe/rqkoqa.jpg',
                mediaType: 1,
                renderLargerThumbnail: true,
                sourceUrl: `https://wa.me/${ownerNumber}`
            },
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: "",
                newsletterName: "RANGER XMD TECH"
            }
        }
    }, { quoted: m });
}
break;

// ========== ORDER BOT ==========
case 'order':
case 'orderbot':
case 'buy': {
    const ownerNumber = owner[0] || '2347081827038';
    
    const response = `
┌───[ 🛒 ORDER YOUR BOT ]
│
├  📝 *How to Order:*
│
├  1️⃣ Choose your package
│  ├ 🔹 BASIC (Free)
│  └ 🔸 PRO (Paid)
│
├  2️⃣ Contact owner
│  👑 wa.me/${ownerNumber}
│
├  3️⃣ Provide details
│  ├ Bot name
│  ├ Profile picture
│  └ Features needed
│
├  4️⃣ Payment (for PRO)
│  ├ 💳 OPay: ${ownerNumber}
│  ├ 📱 Dana: ${ownerNumber}
│  └ 💰 Price: Negotiable
│
├  5️⃣ Deployment
│  ├ Server setup
│  ├ Bot installation
│  └ Testing
│
└───[ ⏱️ Delivery: 1-24 hours ]

💝 RANGER XMD TECH`.trim();

    await empire.sendMessage(m.chat, {
        text: response,
        contextInfo: {
            externalAdReply: {
                title: `🛒 ORDER RANGER XMD TECH`,
                body: `Get your own WhatsApp bot now!`,
                thumbnailUrl: 'https://files.catbox.moe/rqkoqa.jpg',
                mediaType: 1,
                renderLargerThumbnail: true,
                sourceUrl: `https://wa.me/${ownerNumber}`
            },
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: "",
                newsletterName: "RANGER TECH "
            }
        }
    }, { quoted: m });
}
break;

// ========== PRICE LIST ==========
case 'price':
case 'pricelist':
case 'packages': {
    const ownerNumber = owner[0] || '2347081827038';
    
    const response = `
┌───[ 💰 PRICE LIST ]
│
├  🔹 *BASIC PACKAGE - FREE*
│  ├ 50+ Commands
│  ├ Basic Group Management
│  ├ Sticker Maker
│  ├ Music Downloader
│  ├ 1 Group Only
│  └ Community Support
│
├  🔸 *PRO PACKAGE - PAID*
│  ├ 500+ Commands
│  ├ ALL Features
│  ├ Unlimited Groups
│  ├ Custom Commands
│  ├ Auto Reply System
│  ├ Anti-Spam Protection
│  ├ Welcome/Goodbye Message
│  ├ Jail System
│  ├ Pairing System
│  ├ 24/7 Uptime
│  ├ Priority Support
│  └ Lifetime Updates
│
├  🔥 *ULTIMATE - CUSTOM*
│  ├ Everything in PRO
│  ├ Custom Development
│  ├ Source Code Access
│  ├ Server Setup
│  ├ Domain Included
│  └ 1 Year Maintenance
│
├───[ 💳 PAYMENT METHODS ]
│
├  📱 OPay: ${ownerNumber}
├  📱 Dana: ${ownerNumber}
├  💳 Bank Transfer
├  🍕 Buy Me a Coffee
│
└───[ 🚀 ORDER NOW ]

Contact: wa.me/${ownerNumber}
Command: ${prefix}order

💝 RANGER XMD TECH`.trim();

    await empire.sendMessage(m.chat, {
        text: response,
        contextInfo: {
            externalAdReply: {
                title: `💰 RANGER XMD TECH PRICES`,
                body: `Affordable WhatsApp bot packages`,
                thumbnailUrl: 'https://files.catbox.moe/rqkoqa.jpg',
                mediaType: 1,
                renderLargerThumbnail: true
            },
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: "",
                newsletterName: "RANGER TECH"
            }
        }
    }, { quoted: m });
}
break;

// ========== DEMO / TEST BOT ==========
case 'demo':
case 'testbot':
case 'trybot': {
    const ownerNumber = owner[0] || '2347081827038';
    
    const response = `
┌───[ 🎮 DEMO / TEST BOT ]
│
├  🤖 *Try RANGER XMD TECH Before Buying!*
│
├  ✅ *You're already using it!*
│
├  📊 *Features you can test now:*
│  ├ ${prefix}ping - Test latency
│  ├ ${prefix}sticker - Make stickers
│  ├ ${prefix}play - Download music
│  ├ ${prefix}antilink - Test protection
│  └ ${prefix}menu - Full command list
│
├───[ 🚀 GET YOUR OWN ]
│
├  Want your own bot with:
├  ✅ Your custom name
├  ✅ Your profile picture
├  ✅ 24/7 hosting
├  ✅ Lifetime updates
│
└───[ CONTACT OWNER ]

wa.me/${ownerNumber}
Type: ${prefix}order

💝 RANGER TECH`.trim();

    await empire.sendMessage(m.chat, {
        text: response,
        contextInfo: {
            externalAdReply: {
                title: `🎮 TEST RANGER XMD TECH`,
                body: `Experience all features before buying!`,
                thumbnailUrl: 'https://files.catbox.moe/rqkoqa.jpg',
                mediaType: 1,
                renderLargerThumbnail: true
            },
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: "",
                newsletterName: "RANGER XMD TECH"
            }
        }
    }, { quoted: m });
}
break;

// ========== SUPPORT / HELP ==========
case 'support':
case 'helpme':
case 'contact': {
    const ownerNumber = owner[0] || '2347081827038';
    
    const response = `
┌───[ 📞 SUPPORT & CONTACT ]
│
├  👑 *Bot Owner:* wa.me/${ownerNumber}
│
├  📢 *WhatsApp Channel:*
│  🔗 https://whatsapp.com/channel/0029Va...
│
├  📧 *Email:* support@Rangertechcrop.com
│
├  💬 *Support Group:*
│  🔗 https://t.me/+5c2OfuaxjiE4ZDBk/...
│
├───[ ❓ NEED HELP? ]
│
├  🔹 Report bugs
├  🔹 Request features
├  🔹 Buy premium
├  🔹 Deploy your bot
├  🔹 Custom development
│
└───[ ⏱️ Response: 1-24 hours ]

💝 RANGER TECH`.trim();

    await empire.sendMessage(m.chat, {
        text: response,
        contextInfo: {
            externalAdReply: {
                title: `📞 SUPPORT CENTER`,
                body: `Contact us for any questions!`,
                thumbnailUrl: 'https://files.catbox.moe/rqkoqa.jpg',
                mediaType: 1,
                renderLargerThumbnail: true,
                sourceUrl: `https://wa.me/${ownerNumber}`
            },
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: "",
                newsletterName: "RANGER TECH"
            }
        }
    }, { quoted: m });
}
break;
// ========== GET NEWSLETTER INFO ==========
case 'newsletter':
case 'channel':
case 'getchannel':
case 'newsletterinfo': {
    if (!text) {
        return reply(`📢 *NEWSLETTER INFO*

*Usage:* ${prefix}newsletter <link or invite code>

*Examples:*
${prefix}newsletter https://whatsapp.com/channel/0029Va...
${prefix}newsletter 0029Va...

*Aliases:*
${prefix}channel, ${prefix}getchannel, ${prefix}newsletterinfo

💝 RANGER TECH`);
    }

    await empire.sendMessage(m.chat, { react: { text: '📢', key: m.key } });

    // Extract channel ID from link or direct code
    let channelId = text;
    if (text.includes('whatsapp.com/channel/')) {
        channelId = text.split('whatsapp.com/channel/')[1].split('/')[0];
    }
    
    // Clean the ID
    channelId = channelId.replace(/[^0-9A-Za-z]/g, '');

    if (!channelId || channelId.length < 10) {
        return reply(`❌ *Invalid Newsletter Link*

Please provide a valid WhatsApp channel link or invite code.

*Example:* ${prefix}newsletter https://whatsapp.com/channel/0029Va...`);
    }

    try {
        // Try to get newsletter metadata
        const newsletterData = await empire.newsletterMetadata("invite", channelId).catch(() => null);
        
        if (!newsletterData) {
            // Try alternative method
            const metadata = await empire.newsletterMetadata(channelId).catch(() => null);
            if (!metadata) {
                throw new Error('Channel not found');
            }
            newsletterData = metadata;
        }

        // Extract information
        const name = newsletterData.name || newsletterData.title || 'Unknown Channel';
        const id = newsletterData.id || newsletterData.inviteCode || channelId;
        const subscribers = newsletterData.subscribers || newsletterData.members || 'N/A';
        const description = newsletterData.description || newsletterData.about || 'No description';
        const verified = newsletterData.verification === 'VERIFIED' || newsletterData.verified === true;
        const created = newsletterData.creationTime ? new Date(newsletterData.creationTime * 1000).toLocaleDateString() : 'Unknown';
        const language = newsletterData.language || newsletterData.lang || 'Unknown';
        const picture = newsletterData.picture || newsletterData.icon || null;

        const formattedSubscribers = typeof subscribers === 'number' ? subscribers.toLocaleString() : subscribers;

        const response = `
┌───[ 📢 NEWSLETTER INFO ]
│
├  📛 *Name:* ${name}
├  🆔 *ID:* ${id}
├  👥 *Subscribers:* ${formattedSubscribers}
│
├───[ ℹ️ DETAILS ]
│
├  ✅ *Verified:* ${verified ? 'Yes ⭐' : 'No'}
├  📅 *Created:* ${created}
├  🌐 *Language:* ${language}
│
├───[ 📝 DESCRIPTION ]
│
├  ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}
│
├───[ 🔗 LINKS ]
│
├  🔗 *Invite Link:* 
│  https://whatsapp.com/channel/${id}
│
└───[ 💝 RANGER TECH ]`.trim();

        if (picture) {
            await empire.sendMessage(m.chat, {
                image: { url: picture },
                caption: response,
                contextInfo: {
                    mentionedJid: [m.sender],
                    externalAdReply: {
                        title: `📢 ${name}`,
                        body: `${formattedSubscribers} subscribers • ${verified ? 'Verified ✓' : 'Unverified'}`,
                        thumbnailUrl: picture,
                        mediaType: 1,
                        renderLargerThumbnail: true,
                        sourceUrl: `https://whatsapp.com/channel/${id}`
                    },
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "",
                        newsletterName: "RANGER TECH"
                    }
                }
            }, { quoted: m });
        } else {
            await empire.sendMessage(m.chat, {
                text: response,
                contextInfo: {
                    mentionedJid: [m.sender],
                    externalAdReply: {
                        title: `📢 ${name}`,
                        body: `${formattedSubscribers} subscribers • ${verified ? 'Verified ✓' : 'Unverified'}`,
                        thumbnailUrl: 'https://files.catbox.moe/rqkoqa.jpg',
                        mediaType: 1,
                        renderLargerThumbnail: true,
                        sourceUrl: `https://whatsapp.com/channel/${id}`
                    },
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "",
                        newsletterName: "RANGER TECH"
                    }
                }
            }, { quoted: m });
        }

        await empire.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    } catch (error) {
        console.error('Newsletter error:', error);
        await empire.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        
        const errorResponse = `
┌───[ ❌ NEWSLETTER ERROR ]
│
├  ⚠️ *Could not fetch newsletter*
│
├───[ POSSIBLE REASONS ]
│
├  🔹 Invalid channel ID/link
├  🔹 Channel is private
├  🔹 Channel doesn't exist
├  🔹 API rate limited
│
├───[ TRY THIS ]
│
├  📝 *Example format:*
│  ${prefix}newsletter https://whatsapp.com/channel/0029Va...
│
└───[ 💝 RANGER TECH ]`.trim();
        
        reply(errorResponse);
    }
}
break;

// ========== MY NEWSLETTER (YOUR OWN CHANNEL) ==========
case 'mychannel':
case 'mynewsletter':
case 'myidch': {
    const ownerNumber = owner[0] || '2347081827038';
    
    const response = `
┌───[ 🇮🇩 RANGER XMD TECH OFFICIAL CHANNEL ]
│
├  📢 *WhatsApp Newsletter*
│
├  📛 *Name:* RANGER XMD TECH Indonesia
├  🆔 *ID:* 120363405724402785
├  👥 *Subscribers:* 1,000+
├  ✅ *Verified:* Yes
│
├───[ 📝 DESCRIPTION ]
│
├  Official WhatsApp channel for
├  RANGER XMD TECH bot updates, news,
├  tutorials, and giveaways.
│
├───[ 🔗 JOIN NOW ]
│
├  🔗 *Link:* 
│  https://whatsapp.com/channel/0029Va...
│
├───[ 📞 CONTACT ]
│
├  👑 Owner: wa.me/${ownerNumber}
│
└───[ 💝 RANGER TECH ]

*Click the link above to join!*`.trim();

    await empire.sendMessage(m.chat, {
        text: response,
        contextInfo: {
            mentionedJid: [m.sender],
            externalAdReply: {
                title: `🇮🇩 RANGER XMD TECH CHANNEL`,
                body: `Join our official WhatsApp channel!`,
                thumbnailUrl: 'https://files.catbox.moe/rqkoqa.jpg',
                mediaType: 1,
                renderLargerThumbnail: true,
                sourceUrl: 'https://whatsapp.com/channel/0029Va...'
            },
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: "",
                newsletterName: "RANGER TECH"
            }
        }
    }, { quoted: m });
}
break;
// ========== BIBLE COMMANDS ==========
case 'bible':
case 'kitab':
case 'bibleverse': {
    if (!text) {
        return reply(`📖 *BIBLE VERSE*

*Usage:* ${prefix}bible <book> <chapter>:<verse>

*Examples:*
${prefix}bible John 3:16
${prefix}bible Genesis 1:1
${prefix}bible Psalms 23
${prefix}bible Romans 8:28

*Available Books:*
Genesis, Exodus, Leviticus, Numbers, Deuteronomy, Joshua, Judges, Ruth, 1 Samuel, 2 Samuel, 1 Kings, 2 Kings, 1 Chronicles, 2 Chronicles, Ezra, Nehemiah, Esther, Job, Psalms, Proverbs, Ecclesiastes, Song of Solomon, Isaiah, Jeremiah, Lamentations, Ezekiel, Daniel, Hosea, Joel, Amos, Obadiah, Jonah, Micah, Nahum, Habakkuk, Zephaniah, Haggai, Zechariah, Malachi, Matthew, Mark, Luke, John, Acts, Romans, 1 Corinthians, 2 Corinthians, Galatians, Ephesians, Philippians, Colossians, 1 Thessalonians, 2 Thessalonians, 1 Timothy, 2 Timothy, Titus, Philemon, Hebrews, James, 1 Peter, 2 Peter, 1 John, 2 John, 3 John, Jude, Revelation

💝 RANGER TECH`);
    }

    await empire.sendMessage(m.chat, { react: { text: '📖', key: m.key } });

    // Parse the input: "John 3:16" or "John 3" or "John"
    let book = '';
    let chapter = '';
    let verse = '';

    const parts = text.trim().split(/\s+/);
    book = parts[0];
    
    if (parts[1]) {
        const chapterVerse = parts[1];
        if (chapterVerse.includes(':')) {
            const [chap, vers] = chapterVerse.split(':');
            chapter = chap;
            verse = vers || '';
        } else {
            chapter = chapterVerse;
            verse = '';
        }
    }

    if (!chapter) {
        return reply(`❌ Please specify chapter and verse.

*Example:* ${prefix}bible John 3:16
*Or:* ${prefix}bible Psalms 23`);
    }

    try {
        // Build API URL
        let apiUrl = '';
        if (verse) {
            apiUrl = `https://bible-api.com/${encodeURIComponent(book)}%20${chapter}:${verse}?translation=kjv`;
        } else {
            apiUrl = `https://bible-api.com/${encodeURIComponent(book)}%20${chapter}?translation=kjv`;
        }

        const response = await axios.get(apiUrl, { timeout: 10000 });
        
        if (!response.data || response.data.error) {
            throw new Error('Verse not found');
        }

        const data = response.data;
        const reference = data.reference || `${book} ${chapter}:${verse || '1-' + data.verses?.length || ''}`;
        const text_verse = data.text || data.verses?.map(v => v.text).join(' ') || 'Verse not found';

        const responseText = `
┌───[ 📖 HOLY BIBLE ]
│
├  📍 *Reference:* ${reference}
│
├───[ 📝 VERSE ]
│
├  ${text_verse.substring(0, 500)}${text_verse.length > 500 ? '...' : ''}
│
├───[ 📚 TRANSLATION ]
│
├  📖 King James Version (KJV)
│
└───[ 💝 RANGER TECH ]`.trim();

        await empire.sendMessage(m.chat, {
            text: responseText,
            contextInfo: {
                mentionedJid: [m.sender],
                externalAdReply: {
                    title: `📖 ${reference}`,
                    body: `Holy Bible - King James Version`,
                    thumbnailUrl: 'https://files.catbox.moe/rqkoqa.jpg',
                    mediaType: 1,
                    renderLargerThumbnail: true
                },
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: "",
                    newsletterName: "RANGER TECH"
                }
            }
        }, { quoted: m });

        await empire.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    } catch (error) {
        console.error('Bible error:', error);
        await empire.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ *Verse not found*

Check your reference:
*Example:* ${prefix}bible John 3:16
*Or:* ${prefix}bible Psalms 23:1

Make sure the book, chapter, and verse are correct.`);
    }
}
break;

// ========== RANDOM BIBLE VERSE ==========
case 'randombible':
case 'dailyverse':
case 'verseoftheday': {
    await empire.sendMessage(m.chat, { react: { text: '📖', key: m.key } });

    try {
        const response = await axios.get('https://bible-api.com/?random=1&translation=kjv', { timeout: 10000 });
        
        if (!response.data) {
            throw new Error('No verse found');
        }

        const data = response.data;
        const reference = data.reference || 'Unknown';
        const text_verse = data.text || 'Verse not found';

        const responseText = `
┌───[ 📖 VERSE OF THE DAY ]
│
├  📍 *Reference:* ${reference}
│
├───[ 📝 VERSE ]
│
├  ${text_verse.substring(0, 500)}${text_verse.length > 500 ? '...' : ''}
│
├───[ 🙏 BLESSINGS ]
│
├  May this verse bless your day!
│
└───[ 💝 RANGER TECH ]`.trim();

        await empire.sendMessage(m.chat, {
            text: responseText,
            contextInfo: {
                mentionedJid: [m.sender],
                externalAdReply: {
                    title: `📖 ${reference}`,
                    body: `Verse of the Day`,
                    thumbnailUrl: 'https://files.catbox.moe/rqkoqa.jpg',
                    mediaType: 1,
                    renderLargerThumbnail: true
                },
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: "",
                    newsletterName: "RANGER TECH"
                }
            }
        }, { quoted: m });

        await empire.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    } catch (error) {
        console.error('Random Bible error:', error);
        await empire.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ *Failed to fetch verse*

Please try again later.`);
    }
}
break;

// ========== QURAN COMMANDS ==========
case 'quran':
case 'quranverse':
case 'surah': {
    if (!text) {
        return reply(`🕋 *QURAN VERSE*

*Usage:* ${prefix}quran <surah>:<ayat>
*Or:* ${prefix}quran <surah>

*Examples:*
${prefix}quran 1:1
${prefix}quran 1
${prefix}quran 112:1-4
${prefix}quran 36

*Info:*
• 114 Surahs in total
• Ayah range 1-286 (depends on surah)
• English translation (Saheeh International)

💝 RANGER TECH`);
    }

    await empire.sendMessage(m.chat, { react: { text: '🕋', key: m.key } });

    let surah = '';
    let ayah = '';
    let endAyah = '';

    // Parse: "1:1" or "1" or "1:1-4"
    if (text.includes(':')) {
        const [surahNum, ayahRange] = text.split(':');
        surah = surahNum;
        
        if (ayahRange.includes('-')) {
            const [start, end] = ayahRange.split('-');
            ayah = start;
            endAyah = end;
        } else {
            ayah = ayahRange;
            endAyah = ayah;
        }
    } else {
        surah = text;
        ayah = '';
        endAyah = '';
    }

    try {
        let apiUrl = '';
        
        if (ayah && endAyah && ayah !== endAyah) {
            // Range of ayahs
            apiUrl = `https://api.alquran.cloud/v1/surah/${surah}/quran-uthmani`;
        } else if (ayah) {
            // Single ayah
            apiUrl = `https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/editions/quran-uthmani,en.saheeh`;
        } else {
            // Whole surah
            apiUrl = `https://api.alquran.cloud/v1/surah/${surah}/editions/quran-uthmani,en.saheeh`;
        }

        const response = await axios.get(apiUrl, { timeout: 10000 });
        
        if (!response.data || response.data.code !== 200) {
            throw new Error('Surah/Ayah not found');
        }

        let responseText = '';
        
        if (ayah && endAyah && ayah !== endAyah) {
            // Handle range
            const data = response.data.data;
            const surahName = data.name || `Surah ${surah}`;
            const englishName = data.englishName || '';
            
            let verses = '';
            for (let i = parseInt(ayah); i <= parseInt(endAyah) && i <= data.ayahs.length; i++) {
                const verse = data.ayahs[i - 1];
                verses += `${i}. ${verse.text}\n\n`;
                if (verses.length > 1000) break;
            }
            
            responseText = `
┌───[ 🕋 HOLY QURAN ]
│
├  📍 *Surah:* ${surahName} (${englishName})
├  📖 *Ayahs:* ${ayah}-${endAyah}
│
├───[ 📝 ARABIC TEXT ]
│
├  ${verses.substring(0, 1500)}${verses.length > 1500 ? '...' : ''}
│
└───[ 💝 RANGER TECH ]`.trim();
            
        } else if (ayah) {
            // Single ayah
            const data = response.data.data;
            const arabic = data[0]?.text || '';
            const translation = data[1]?.text || '';
            const surahName = data[0]?.surah?.name || `Surah ${surah}`;
            const ayahNumber = data[0]?.numberInSurah || ayah;
            
            responseText = `
┌───[ 🕋 HOLY QURAN ]
│
├  📍 *Reference:* ${surahName}:${ayahNumber}
│
├───[ 🇸🇦 ARABIC ]
│
├  ${arabic.substring(0, 500)}${arabic.length > 500 ? '...' : ''}
│
├───[ 🇬🇧 TRANSLATION ]
│
├  ${translation.substring(0, 500)}${translation.length > 500 ? '...' : ''}
│
└───[ 💝 RANGER TECH ]`.trim();
            
        } else {
            // Whole surah info
            const data = response.data.data;
            const surahName = data.name || `Surah ${surah}`;
            const englishName = data.englishName || '';
            const englishNameTranslation = data.englishNameTranslation || '';
            const numberOfAyahs = data.numberOfAyahs || data.ayahs?.length || 0;
            const revelationType = data.revelationType || 'Meccan/Medinan';
            
            // Get first 5 ayahs as preview
            let preview = '';
            if (data.ayahs) {
                for (let i = 0; i < Math.min(5, data.ayahs.length); i++) {
                    preview += `${i+1}. ${data.ayahs[i].text.substring(0, 100)}...\n\n`;
                }
            }
            
            responseText = `
┌───[ 🕋 HOLY QURAN ]
│
├  📍 *Surah:* ${surahName} (${englishName})
├  📖 *Meaning:* ${englishNameTranslation}
├  📊 *Ayahs:* ${numberOfAyahs}
├  📌 *Revelation:* ${revelationType}
│
├───[ 📝 PREVIEW (First 5 Ayahs) ]
│
├  ${preview.substring(0, 800)}${preview.length > 800 ? '...' : ''}
│
├───[ 🔗 READ FULL ]
│
├  Use: ${prefix}quran ${surah}:1-${numberOfAyahs}
│
└───[ 💝 RANGER TECH ]`.trim();
        }

        await empire.sendMessage(m.chat, {
            text: responseText,
            contextInfo: {
                mentionedJid: [m.sender],
                externalAdReply: {
                    title: `🕋 Holy Quran`,
                    body: `Surah ${surah}${ayah ? `:${ayah}` : ''}`,
                    thumbnailUrl: 'https://files.catbox.moe/rqkoqa.jpg',
                    mediaType: 1,
                    renderLargerThumbnail: true
                },
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: "",
                    newsletterName: "RANGER TECH"
                }
            }
        }, { quoted: m });

        await empire.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    } catch (error) {
        console.error('Quran error:', error);
        await empire.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ *Surah/Ayah not found*

*Valid examples:*
${prefix}quran 1:1 (First ayah of Fatiha)
${prefix}quran 112 (Surah Al-Ikhlas)
${prefix}quran 36:1-10 (Range of ayahs)

Surah numbers: 1-114
Ayah numbers: 1-286 (depends on surah)`);
    }
}
break;

// ========== RANDOM QURAN AYAH ==========
case 'randomquran':
case 'dailyquran':
case 'quranoftheday': {
    await empire.sendMessage(m.chat, { react: { text: '🕋', key: m.key } });

    try {
        // Get random surah (1-114)
        const randomSurah = Math.floor(Math.random() * 114) + 1;
        
        // Get surah info first to know number of ayahs
        const surahInfo = await axios.get(`https://api.alquran.cloud/v1/surah/${randomSurah}`, { timeout: 5000 });
        
        if (!surahInfo.data || surahInfo.data.code !== 200) {
            throw new Error('Surah not found');
        }
        
        const numberOfAyahs = surahInfo.data.data.numberOfAyahs;
        const randomAyah = Math.floor(Math.random() * numberOfAyahs) + 1;
        
        // Get the random ayah
        const response = await axios.get(`https://api.alquran.cloud/v1/ayah/${randomSurah}:${randomAyah}/editions/quran-uthmani,en.saheeh`, { timeout: 10000 });
        
        if (!response.data || response.data.code !== 200) {
            throw new Error('Ayah not found');
        }

        const data = response.data.data;
        const arabic = data[0]?.text || '';
        const translation = data[1]?.text || '';
        const surahName = data[0]?.surah?.name || `Surah ${randomSurah}`;
        const ayahNumber = data[0]?.numberInSurah || randomAyah;

        const responseText = `
┌───[ 🕋 AYAH OF THE DAY ]
│
├  📍 *Reference:* ${surahName}:${ayahNumber}
│
├───[ 🇸🇦 ARABIC ]
│
├  ${arabic.substring(0, 500)}${arabic.length > 500 ? '...' : ''}
│
├───[ 🇬🇧 TRANSLATION ]
│
├  ${translation.substring(0, 500)}${translation.length > 500 ? '...' : ''}
│
├───[ 🤲 BLESSINGS ]
│
├  May this ayah bring peace to your heart!
│
└───[ 💝 RANGER TECH ]`.trim();

        await empire.sendMessage(m.chat, {
            text: responseText,
            contextInfo: {
                mentionedJid: [m.sender],
                externalAdReply: {
                    title: `🕋 Quran Ayah of the Day`,
                    body: `${surahName}:${ayahNumber}`,
                    thumbnailUrl: 'https://files.catbox.moe/rqkoqa.jpg',
                    mediaType: 1,
                    renderLargerThumbnail: true
                },
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: "l",
                    newsletterName: "RANGER TECH"
                }
            }
        }, { quoted: m });

        await empire.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    } catch (error) {
        console.error('Random Quran error:', error);
        await empire.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ *Failed to fetch ayah*

Please try again later.`);
    }
}
break;
// ========== AI CHATBOT ==========
case 'ai':
case 'chat':
case 'bot':
case 'ask':
case 'zuko':
case 'gpt':
case 'ai chat': {
    if (!text) {
        return reply(`🤖 *RANGER AI CHATBOT*

*Usage:* ${prefix}ai <your message>
*Example:* ${prefix}ai Hello, how are you?

*Features:*
• Natural conversation
• Can remember context
• Answers questions
• Writing assistance
• Code generation
• Problem solving
• General knowledge

*Commands:*
• ${prefix}ai <text> - Chat with AI
• ${prefix}clearai - Clear conversation history
• ${prefix}aihelp - Show help

*Powered by Multiple AI Engines*
💝 RANGER TECH`);
    }

    await empire.sendMessage(m.chat, { react: { text: '🤖', key: m.key } });
    await empire.sendPresenceUpdate('composing', m.chat);

    // Store conversation history per user
    if (!global.aiHistory) global.aiHistory = {};
    if (!global.aiHistory[m.sender]) {
        global.aiHistory[m.sender] = [];
    }

    // Add user message to history
    global.aiHistory[m.sender].push({ role: 'user', content: text });

    // Keep last 15 messages for context
    if (global.aiHistory[m.sender].length > 15) {
        global.aiHistory[m.sender] = global.aiHistory[m.sender].slice(-15);
    }

    // Build conversation context
    let conversationContext = '';
    for (const msg of global.aiHistory[m.sender]) {
        conversationContext += `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.content}\n`;
    }
    conversationContext += `AI: `;

    await reply(`🤖 *RANGER AI is thinking...*

📝 *You:* ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}

⏳ Generating response...`);

    let aiResponse = null;
    let usedApi = null;

    // ========== API 1: Omegatech Claude ==========
    try {
        const claudeRes = await axios.get(`https://omegatech-api.dixonomega.tech/api/ai/Claude?text=${encodeURIComponent(conversationContext)}`, {
            timeout: 30000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (claudeRes.data?.success && claudeRes.data?.result) {
            aiResponse = claudeRes.data.result;
            usedApi = 'Claude AI';
        }
    } catch (e) {
        console.log('Claude API failed:', e.message);
    }

    // ========== API 2: Omegatech LlamaCoder ==========
    if (!aiResponse) {
        try {
            const llamaRes = await axios.get(`https://omegatech-api.dixonomega.tech/api/ai/llamacoder?prompt=${encodeURIComponent(conversationContext)}&quality=low`, {
                timeout: 30000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (llamaRes.data?.success && llamaRes.data?.rawOutput) {
                aiResponse = llamaRes.data.rawOutput;
                usedApi = 'LlamaCoder';
            }
        } catch (e) {
            console.log('LlamaCoder API failed:', e.message);
        }
    }

    // ========== API 3: GPT-4 (Chateverywhere) ==========
    if (!aiResponse) {
        try {
            const gptRes = await axios.post('https://chateverywhere.app/api/chat/', {
                model: { id: 'gpt-4', name: 'GPT-4' },
                messages: [{ content: conversationContext, role: 'user' }],
                temperature: 0.7
            }, {
                timeout: 30000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (gptRes.data) {
                aiResponse = gptRes.data;
                usedApi = 'GPT-4';
            }
        } catch (e) {
            console.log('GPT-4 API failed:', e.message);
        }
    }

    // ========== API 4: Free GPT API ==========
    if (!aiResponse) {
        try {
            const freeGpt = await axios.get(`https://api.yanzbotz.my.id/api/ai/gpt?text=${encodeURIComponent(conversationContext)}`, {
                timeout: 30000
            });
            if (freeGpt.data?.result) {
                aiResponse = freeGpt.data.result;
                usedApi = 'Free GPT';
            }
        } catch (e) {
            console.log('Free GPT API failed:', e.message);
        }
    }

    // ========== API 5: GPT API (alternative) ==========
    if (!aiResponse) {
        try {
            const altGpt = await axios.get(`https://api.nexoracle.com/ai/gpt?q=${encodeURIComponent(conversationContext)}&apikey=d0634e61e8789b051e`, {
                timeout: 30000
            });
            if (altGpt.data?.result || altGpt.data?.response) {
                aiResponse = altGpt.data.result || altGpt.data.response;
                usedApi = 'GPT-3.5';
            }
        } catch (e) {
            console.log('Alt GPT API failed:', e.message);
        }
    }

    // ========== API 6: SimSimi (Fun responses) ==========
    if (!aiResponse) {
        try {
            const simiRes = await axios.get(`https://api.simsimi.net/v2/?text=${encodeURIComponent(text)}&lc=en`, {
                timeout: 15000
            });
            if (simiRes.data?.success) {
                aiResponse = simiRes.data.success;
                usedApi = 'SimSimi';
            }
        } catch (e) {
            console.log('SimSimi API failed:', e.message);
        }
    }

    // ========== API 7: Blackbox AI ==========
    if (!aiResponse) {
        try {
            const blackboxRes = await axios.get(`https://api.agatz.xyz/api/blackbox?text=${encodeURIComponent(text)}`, {
                timeout: 30000
            });
            if (blackboxRes.data?.response) {
                aiResponse = blackboxRes.data.response;
                usedApi = 'Blackbox AI';
            }
        } catch (e) {
            console.log('Blackbox API failed:', e.message);
        }
    }

    // ========== FALLBACK RESPONSES ==========
    if (!aiResponse) {
        const fallbacks = [
            "I'm here! What would you like to chat about? 😊",
            "Interesting! Tell me more about that.",
            "I understand. How can I help you further?",
            "That's cool! Want to ask me something else?",
            `Hello ${m.pushName || 'User'}! I'm RANGER AI. What's on your mind today?`,
            "I'm listening. Go ahead with your question!",
            "Great question! Let me think about that...",
            "Thanks for your message! Can you tell me more?",
            "I appreciate you chatting with me! Ask me anything.",
            "I'm here 24/7 to help you with any questions!"
        ];
        aiResponse = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        usedApi = 'RANGER AI';
    }

    // Clean response
    aiResponse = aiResponse.replace(/<\|im_end\|>/g, '').replace(/<\|im_start\|>.*?assistant/g, '').trim();

    // Add AI response to history
    global.aiHistory[m.sender].push({ role: 'assistant', content: aiResponse });

    // Split long response
    const chunks = aiResponse.match(/[\s\S]{1,2900}/g) || [aiResponse];

    let msg = `🤖 *RANGER AI RESPONSE*

━━━━━━━━━━━━━━━━━━━━━━━
📝 *You:* ${text.substring(0, 150)}${text.length > 150 ? '...' : ''}

💬 *RANGER AI:* ${chunks[0]}
━━━━━━━━━━━━━━━━━━━━━━━`;

    await reply(msg);

    // Send remaining chunks
    for (let i = 1; i < chunks.length; i++) {
        await delay(500);
        await reply(chunks[i]);
    }

    // Send footer
    await reply(`⚡ *Powered by:* ${usedApi}
💡 *Continue chatting:* ${prefix}ai <message>
🗑️ *Clear history:* ${prefix}clearai
💝 RANGER TECH`);

    await empire.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    // Update activity
    if (!db.activity) db.activity = {};
    if (!db.activity[m.sender]) db.activity[m.sender] = { messages: 0, commands: 0, lastActive: Date.now() };
    db.activity[m.sender].commands++;
    saveDB();

}
break;

// ========== CLEAR AI HISTORY ==========
case 'clearai':
case 'clearhistory':
case 'resetai':
case 'aireset': {
    if (!global.aiHistory) global.aiHistory = {};

    if (global.aiHistory[m.sender]) {
        delete global.aiHistory[m.sender];
        
        const response = `
┌───[ 🗑️ AI HISTORY CLEARED ]
│
├  ✅ Your conversation history has been deleted
│
├───[ 💡 TIP ]
│
├  Start fresh with: ${prefix}ai <message>
│
└───[ 💝 RANGER TECH ]`.trim();
        
        reply(response);
    } else {
        reply(`┌───[ 📭 NO HISTORY ]
│
├  No conversation history found
│
├  Start chatting: ${prefix}ai hello
│
└───[ 💝 RANGER TECH ]`.trim());
    }
}
break;
// ========== SAY COMMAND (TEXT TO SPEECH) ==========
case 'say':
case 'tts':
case 'speak':
case 'voice': {
    if (!text) {
        return reply(`🔊 *TEXT TO SPEECH*

*Usage:* ${prefix}say <text>
*Example:* ${prefix}say Hello world!

*Language Options:*
${prefix}say:en Hello - English
${prefix}say:id Halo - Indonesian
${prefix}say:fr Bonjour - French
${prefix}say:es Hola - Spanish
${prefix}say:ar مرحبا - Arabic
${prefix}say:ja こんにちは - Japanese
${prefix}say:zh 你好 - Chinese
${prefix}say:hi नमस्ते - Hindi
${prefix}say:yo Ẹ káàárọ̀ - Yoruba
${prefix}say:ig Nnọọ - Igbo
${prefix}say:ha Sannu - Hausa

*Features:*
• High quality voice
• Multiple languages
• Sends as voice note
• Auto language detection

💝 RANGER TECH`);
    }

    await empire.sendMessage(m.chat, { react: { text: '🔊', key: m.key } });
    await empire.sendPresenceUpdate('composing', m.chat);

    // Parse language from command (e.g., .say:en Hello)
    let lang = 'en';
    let message = text;

    const cmdMatch = body.match(/^say:([a-z]{2,5})\s+(.+)/i);
    if (cmdMatch) {
        lang = cmdMatch[1].toLowerCase();
        message = cmdMatch[2];
    }

    // Language mapping for Google TTS
    const langCodes = {
        'en': 'en-US', 'id': 'id-ID', 'fr': 'fr-FR', 'es': 'es-ES',
        'ar': 'ar-SA', 'ja': 'ja-JP', 'zh': 'zh-CN', 'hi': 'hi-IN',
        'yo': 'yo-NG', 'ig': 'ig-NG', 'ha': 'ha-NG', 'pt': 'pt-PT',
        'de': 'de-DE', 'it': 'it-IT', 'ru': 'ru-RU', 'ko': 'ko-KR',
        'nl': 'nl-NL', 'tr': 'tr-TR', 'pl': 'pl-PL', 'sv': 'sv-SE',
        'da': 'da-DK', 'no': 'no-NO', 'fi': 'fi-FI', 'el': 'el-GR',
        'he': 'he-IL', 'th': 'th-TH', 'vi': 'vi-VN'
    };

    const ttsLang = langCodes[lang] || langCodes['en'];

    await reply(`🔊 *Converting text to speech...*

🌐 Language: ${lang.toUpperCase()}
📝 Text: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}
⏳ Please wait...`);

    let audioBuffer = null;
    let usedApi = null;

    // ========== API 1: Google Translate TTS ==========
    try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(message)}&tl=${lang}&client=tw-ob`;
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://translate.google.com/',
                'Accept': 'audio/mpeg'
            }
        });
        audioBuffer = Buffer.from(res.data);
        usedApi = 'Google TTS';
    } catch (e) {
        console.log('Google TTS failed:', e.message);
    }

    // ========== API 2: VoiceRSS TTS ==========
    if (!audioBuffer) {
        try {
            const url = `https://api.voicerss.org/?key=apikey&hl=${ttsLang}&src=${encodeURIComponent(message)}&c=MP3&f=44khz_16bit_stereo`;
            const res = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const buf = Buffer.from(res.data);
            if (buf.toString('utf8', 0, 7) !== 'ERROR: ') {
                audioBuffer = buf;
                usedApi = 'VoiceRSS';
            }
        } catch (e) {
            console.log('VoiceRSS failed:', e.message);
        }
    }

    // ========== API 3: StreamElements TTS ==========
    if (!audioBuffer) {
        try {
            const voiceMap = {
                'en': 'Brian', 'id': 'Aria', 'fr': 'Mathieu', 'es': 'Penelope',
                'ar': 'Zeina', 'ja': 'Mizuki', 'zh': 'Zhiyu', 'hi': 'Aditi'
            };
            const voice = voiceMap[lang] || 'Brian';
            const url = `https://api.streamelements.com/kappa/v2/speech?voice=${voice}&text=${encodeURIComponent(message.substring(0, 300))}`;
            const res = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 15000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            audioBuffer = Buffer.from(res.data);
            usedApi = 'StreamElements';
        } catch (e) {
            console.log('StreamElements failed:', e.message);
        }
    }

    if (!audioBuffer) {
        await empire.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return reply(`❌ *TTS FAILED*

All voice services are currently unavailable.

Please try again later or use a different language.

💝 RANGER TECH`);
    }

    // Convert to OGG/Opus for WhatsApp voice note
    let finalBuffer = audioBuffer;
    let isPtt = true;

    try {
        const { spawn } = require('child_process');
        const inputPath = `./tmp/tts_input_${Date.now()}.mp3`;
        const outputPath = `./tmp/tts_output_${Date.now()}.ogg`;

        if (!fs.existsSync('./tmp')) fs.mkdirSync('./tmp', { recursive: true });
        fs.writeFileSync(inputPath, audioBuffer);

        await new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
                '-i', inputPath,
                '-vn',
                '-c:a', 'libopus',
                '-b:a', '64k',
                '-ar', '48000',
                '-ac', '1',
                '-f', 'ogg',
                outputPath
            ]);

            ffmpeg.on('close', (code) => {
                if (code !== 0) reject(new Error(`FFmpeg exit ${code}`));
                else resolve();
            });
            ffmpeg.on('error', reject);
        });

        if (fs.existsSync(outputPath)) {
            finalBuffer = fs.readFileSync(outputPath);
            fs.unlinkSync(outputPath);
        }
        fs.unlinkSync(inputPath);

    } catch (e) {
        console.log('FFmpeg conversion failed, using original:', e.message);
        isPtt = false;
    }

    // Get language name
    const languageNames = {
        'en': 'English', 'id': 'Indonesian', 'fr': 'French', 'es': 'Spanish',
        'ar': 'Arabic', 'ja': 'Japanese', 'zh': 'Chinese', 'hi': 'Hindi',
        'yo': 'Yoruba', 'ig': 'Igbo', 'ha': 'Hausa', 'pt': 'Portuguese',
        'de': 'German', 'it': 'Italian', 'ru': 'Russian', 'ko': 'Korean'
    };
    const languageName = languageNames[lang] || lang.toUpperCase();

    await empire.sendMessage(m.chat, {
        audio: finalBuffer,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: isPtt,
        fileName: `voice_${lang}.ogg`
    }, { quoted: m });

    await empire.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    // Send info message
    const infoResponse = `
┌───[ 🔊 VOICE NOTE SENT ]
│
├  📝 *Text:* ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}
├  🌐 *Language:* ${languageName} (${lang.toUpperCase()})
├  ⚡ *Engine:* ${usedApi}
│
└───[ 💝 RANGER TECH ]`.trim();

    await empire.sendMessage(m.chat, {
        text: infoResponse,
        contextInfo: {
            externalAdReply: {
                title: `🔊 Text to Speech`,
                body: `${languageName} voice note`,
                thumbnailUrl: 'https://files.catbox.moe/rqkoqa.jpg',
                mediaType: 1,
                renderLargerThumbnail: true
            },
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: "",
                newsletterName: "RANGER TECH"
            }
        }
    }, { quoted: m });

}
break;

// ========== SAY WITH SPECIFIC VOICE ==========
case 'sayvoice':
case 'ttsvoice': {
    if (!text) {
        return reply(`🎤 *TTS WITH VOICE*

*Usage:* ${prefix}sayvoice <voice> <text>

*Voices:*
• male - Male voice
• female - Female voice
• brian - Brian (English)
• aria - Aria (English)
• emma - Emma (English)
• john - John (English)

*Example:*
${prefix}sayvoice female Hello everyone

💝 RANGER TECH`);
    }

    await empire.sendMessage(m.chat, { react: { text: '🎤', key: m.key } });

    const parts = text.split(' ');
    const voiceType = parts[0].toLowerCase();
    const messageText = parts.slice(1).join(' ');

    if (!messageText) {
        return reply(`❌ Please provide text after the voice type.

*Example:* ${prefix}sayvoice female Hello world`);
    }

    const voiceMap = {
        'male': 'Brian',
        'female': 'Aria',
        'brian': 'Brian',
        'aria': 'Aria',
        'emma': 'Emma',
        'john': 'John',
        'joey': 'Joey',
        'justin': 'Justin'
    };

    const voice = voiceMap[voiceType] || 'Brian';

    try {
        const url = `https://api.streamelements.com/kappa/v2/speech?voice=${voice}&text=${encodeURIComponent(messageText.substring(0, 300))}`;
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 15000
        });

        let audioBuffer = Buffer.from(res.data);

        // Convert to voice note format
        let finalBuffer = audioBuffer;
        let isPtt = true;

        try {
            const { spawn } = require('child_process');
            const inputPath = `./tmp/voice_input_${Date.now()}.mp3`;
            const outputPath = `./tmp/voice_output_${Date.now()}.ogg`;

            if (!fs.existsSync('./tmp')) fs.mkdirSync('./tmp', { recursive: true });
            fs.writeFileSync(inputPath, audioBuffer);

            await new Promise((resolve, reject) => {
                const ffmpeg = spawn('ffmpeg', [
                    '-i', inputPath,
                    '-vn',
                    '-c:a', 'libopus',
                    '-b:a', '64k',
                    '-ar', '48000',
                    '-ac', '1',
                    '-f', 'ogg',
                    outputPath
                ]);

                ffmpeg.on('close', (code) => {
                    if (code !== 0) reject(new Error(`FFmpeg exit ${code}`));
                    else resolve();
                });
                ffmpeg.on('error', reject);
            });

            if (fs.existsSync(outputPath)) {
                finalBuffer = fs.readFileSync(outputPath);
                fs.unlinkSync(outputPath);
            }
            fs.unlinkSync(inputPath);

        } catch (e) {
            console.log('FFmpeg conversion failed:', e.message);
            isPtt = false;
        }

        await empire.sendMessage(m.chat, {
            audio: finalBuffer,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: isPtt
        }, { quoted: m });

        await empire.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

        reply(`┌───[ 🎤 VOICE NOTE ]
│
├  🎙️ *Voice:* ${voice}
├  📝 *Text:* ${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}
│
└───[ 💝 RANGER TECH ]`.trim());

    } catch (error) {
        console.error('SayVoice error:', error);
        await empire.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ Failed to generate voice note.

Try using: ${prefix}say ${messageText}`);
    }
}
break;
// ========== TRANSLATION COMMAND ==========
case 'translate':
case 'tr':
case 'terjemah':
case 'translator': {
    if (!text) {
        return reply(`🌐 *TRANSLATION COMMAND*

*Usage:* ${prefix}translate <lang> | <text>
*Example:* ${prefix}translate id | Hello world

*Or auto-detect:*
${prefix}translate <text>

*Language codes:*
🇬🇧 en - English       🇮🇩 id - Indonesian
🇫🇷 fr - French        🇪🇸 es - Spanish
🇩🇪 de - German        🇮🇹 it - Italian
🇵🇹 pt - Portuguese    🇳🇱 nl - Dutch
🇷🇺 ru - Russian       🇯🇵 ja - Japanese
🇰🇷 ko - Korean        🇨🇳 zh - Chinese
🇸🇦 ar - Arabic        🇮🇳 hi - Hindi
🇹🇷 tr - Turkish       🇵🇱 pl - Polish
🇸🇪 sv - Swedish       🇩🇰 da - Danish
🇳🇴 no - Norwegian     🇫🇮 fi - Finnish
🇬🇷 el - Greek         🇨🇿 cs - Czech
🇭🇺 hu - Hungarian     🇷🇴 ro - Romanian
🇻🇳 vi - Vietnamese    🇹🇭 th - Thai
🇳🇬 yo - Yoruba        🇳🇬 ig - Igbo
🇳🇬 ha - Hausa

💝 RANGER TECH`);
    }

    await empire.sendMessage(m.chat, { react: { text: '🌐', key: m.key } });
    await empire.sendPresenceUpdate('composing', m.chat);

    let targetLang = 'en';
    let sourceText = text;

    // Parse format: translate id | Hello world
    if (text.includes('|')) {
        const parts = text.split('|');
        targetLang = parts[0].trim().toLowerCase();
        sourceText = parts.slice(1).join('|').trim();
    }

    if (!sourceText) {
        return reply(`❌ Please provide text to translate.

*Example:* ${prefix}translate id | Hello world`);
    }

    await reply(`🌐 *Translating...*

📝 Text: ${sourceText.substring(0, 100)}${sourceText.length > 100 ? '...' : ''}
🎯 Target: ${targetLang.toUpperCase()}
⏳ Please wait...`);

    let translation = null;
    let detectedLang = null;
    let usedApi = null;

    // ========== API 1: LibreTranslate (Free) ==========
    try {
        const res = await axios.post('https://libretranslate.com/translate', {
            q: sourceText,
            source: 'auto',
            target: targetLang,
            format: 'text'
        }, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.data && res.data.translatedText) {
            translation = res.data.translatedText;
            detectedLang = res.data.detectedLanguage?.language || 'auto';
            usedApi = 'LibreTranslate';
        }
    } catch (e) {
        console.log('LibreTranslate failed:', e.message);
    }

    // ========== API 2: MyMemory Translate ==========
    if (!translation) {
        try {
            const res = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(sourceText)}&langpair=auto|${targetLang}`, {
                timeout: 10000
            });

            if (res.data && res.data.responseData && res.data.responseData.translatedText) {
                translation = res.data.responseData.translatedText;
                usedApi = 'MyMemory';
            }
        } catch (e) {
            console.log('MyMemory failed:', e.message);
        }
    }

    // ========== API 3: Google Translate (via third-party) ==========
    if (!translation) {
        try {
            const res = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(sourceText)}`, {
                timeout: 10000
            });

            if (res.data && res.data[0]) {
                translation = res.data[0].map(item => item[0]).join('');
                usedApi = 'Google Translate';
            }
        } catch (e) {
            console.log('Google Translate failed:', e.message);
        }
    }

    // ========== API 4: Lingva Translate ==========
    if (!translation) {
        try {
            const res = await axios.get(`https://lingva.ml/api/v1/auto/${targetLang}/${encodeURIComponent(sourceText)}`, {
                timeout: 10000
            });

            if (res.data && res.data.translation) {
                translation = res.data.translation;
                usedApi = 'Lingva';
            }
        } catch (e) {
            console.log('Lingva failed:', e.message);
        }
    }

    if (!translation) {
        await empire.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return reply(`❌ *TRANSLATION FAILED*

All translation services are currently unavailable.

Please try again later or check your language code.

*Example:* ${prefix}translate id | Hello world

💝 RANGER TECH`);
    }

    // Clean translation
    translation = translation.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

    // Get language names
    const languageNames = {
        'en': 'English', 'id': 'Indonesian', 'fr': 'French', 'es': 'Spanish',
        'de': 'German', 'it': 'Italian', 'pt': 'Portuguese', 'nl': 'Dutch',
        'ru': 'Russian', 'ja': 'Japanese', 'ko': 'Korean', 'zh': 'Chinese',
        'ar': 'Arabic', 'hi': 'Hindi', 'tr': 'Turkish', 'pl': 'Polish',
        'sv': 'Swedish', 'da': 'Danish', 'no': 'Norwegian', 'fi': 'Finnish',
        'el': 'Greek', 'cs': 'Czech', 'hu': 'Hungarian', 'ro': 'Romanian',
        'vi': 'Vietnamese', 'th': 'Thai', 'yo': 'Yoruba', 'ig': 'Igbo', 'ha': 'Hausa'
    };

    const targetName = languageNames[targetLang] || targetLang.toUpperCase();
    const sourceName = detectedLang ? (languageNames[detectedLang] || detectedLang.toUpperCase()) : 'Unknown';

    const response = `
┌───[ 🌐 TRANSLATION RESULT ]
│
├  📝 *Original (${sourceName}):*
│  ${sourceText.substring(0, 300)}${sourceText.length > 300 ? '...' : ''}
│
├───[ ➡️ TRANSLATION (${targetName}) ]
│
├  ${translation.substring(0, 800)}${translation.length > 800 ? '...' : ''}
│
├───[ ℹ️ INFO ]
│
├  🎯 Target: ${targetName}
├  ⚡ Engine: ${usedApi}
│
└───[ 💝 RANGER TECH ]`.trim();

    // Split if too long
    if (response.length > 3000) {
        const chunks = response.match(/[\s\S]{1,2900}/g) || [response];
        for (const chunk of chunks) {
            await empire.sendMessage(m.chat, { text: chunk }, { quoted: m });
            await delay(500);
        }
    } else {
        await empire.sendMessage(m.chat, {
            text: response,
            contextInfo: {
                mentionedJid: [m.sender],
                externalAdReply: {
                    title: `🌐 Translation (${targetName})`,
                    body: `Translated from ${sourceName}`,
                    thumbnailUrl: 'https://files.catbox.moe/rqkoqa.jpg',
                    mediaType: 1,
                    renderLargerThumbnail: true
                },
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: "",
                    newsletterName: "RANGER TECH"
                }
            }
        }, { quoted: m });
    }

    await empire.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
}
break;

// ========== DETECT LANGUAGE ==========
case 'detect':
case 'langdetect':
case 'detectlanguage': {
    if (!text) {
        return reply(`🔍 *DETECT LANGUAGE*

*Usage:* ${prefix}detect <text>
*Example:* ${prefix}detect Hello world

Detects the language of the provided text.

💝 RANGER TECH`);
    }

    await empire.sendMessage(m.chat, { react: { text: '🔍', key: m.key } });

    try {
        const res = await axios.post('https://libretranslate.com/detect', {
            q: text,
            api_key: ''
        }, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.data && res.data[0]) {
            const detected = res.data[0];
            const languageNames = {
                'en': 'English', 'id': 'Indonesian', 'fr': 'French', 'es': 'Spanish',
                'de': 'German', 'it': 'Italian', 'pt': 'Portuguese', 'nl': 'Dutch',
                'ru': 'Russian', 'ja': 'Japanese', 'ko': 'Korean', 'zh': 'Chinese',
                'ar': 'Arabic', 'hi': 'Hindi', 'tr': 'Turkish', 'yo': 'Yoruba',
                'ig': 'Igbo', 'ha': 'Hausa', 'sw': 'Swahili', 'zu': 'Zulu'
            };

            const langName = languageNames[detected.language] || detected.language.toUpperCase();
            const confidence = (detected.confidence * 100).toFixed(1);

            const response = `
┌───[ 🔍 LANGUAGE DETECTION ]
│
├  📝 *Text:* ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}
│
├───[ 📊 RESULT ]
│
├  🌐 *Language:* ${langName} (${detected.language.toUpperCase()})
├  📊 *Confidence:* ${confidence}%
│
├───[ 💡 TRANSLATE ]
│
├  Use: ${prefix}translate ${detected.language} | ${text.substring(0, 50)}...
│
└───[ 💝 RANGER TECH ]`.trim();

            await empire.sendMessage(m.chat, {
                text: response,
                contextInfo: {
                    externalAdReply: {
                        title: `🔍 Language Detection`,
                        body: `${langName} - ${confidence}% confidence`,
                        thumbnailUrl: 'https://files.catbox.moe/rqkoqa.jpg',
                        mediaType: 1,
                        renderLargerThumbnail: true
                    },
                    forwardingScore: 999,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: "",
                        newsletterName: "RANGER TECH"
                    }
                }
            }, { quoted: m });

            await empire.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        } else {
            reply(`❌ Could not detect language. Please try again with longer text.`);
        }

    } catch (error) {
        console.error('Detect language error:', error);
        await empire.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ Language detection failed.

Please try again later.`);
    }
}
break;

// ========== TRANSLATE TO ENGLISH (SHORTCUT) ==========
case 'toen':
case 'toenglish': {
    if (!text) {
        return reply(`🇬🇧 *TRANSLATE TO ENGLISH*

*Usage:* ${prefix}toen <text>
*Example:* ${prefix}toen Hola mundo

💝 RANGER TECH`);
    }

    // Reuse translate command with target 'en'
    const fakeText = `en | ${text}`;
    
    await empire.sendMessage(m.chat, { react: { text: '🇬🇧', key: m.key } });
    
    // Call translate logic
    try {
        const res = await axios.post('https://libretranslate.com/translate', {
            q: text,
            source: 'auto',
            target: 'en',
            format: 'text'
        }, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.data && res.data.translatedText) {
            const translation = res.data.translatedText;
            const detectedLang = res.data.detectedLanguage?.language || 'auto';

            const languageNames = {
                'en': 'English', 'id': 'Indonesian', 'fr': 'French', 'es': 'Spanish',
                'de': 'German', 'it': 'Italian', 'pt': 'Portuguese', 'nl': 'Dutch',
                'ru': 'Russian', 'ja': 'Japanese', 'ko': 'Korean', 'zh': 'Chinese',
                'ar': 'Arabic', 'hi': 'Hindi', 'tr': 'Turkish', 'yo': 'Yoruba',
                'ig': 'Igbo', 'ha': 'Hausa'
            };

            const sourceName = languageNames[detectedLang] || detectedLang.toUpperCase();

            const response = `
┌───[ 🇬🇧 TRANSLATION TO ENGLISH ]
│
├  📝 *Original (${sourceName}):*
│  ${text.substring(0, 200)}${text.length > 200 ? '...' : ''}
│
├───[ ➡️ ENGLISH ]
│
├  ${translation.substring(0, 800)}${translation.length > 800 ? '...' : ''}
│
└───[ 💝 RANGER TECH ]`.trim();

            await empire.sendMessage(m.chat, { text: response }, { quoted: m });
            await empire.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        } else {
            throw new Error('No translation');
        }
    } catch (error) {
        console.error('ToEn error:', error);
        await empire.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        reply(`❌ Translation failed.

Try using: ${prefix}translate en | ${text}`);
    }
}
break;
// ========== AI HELP ==========
case 'aihelp':
case 'aiinfo':
case 'chathelp': {
    const response = `
┌───[ 🤖 RANGER AI CHATBOT ]
│
├  📌 *Commands:*
│
├  • ${prefix}ai <text> - Chat with AI
│  • ${prefix}clearai - Clear history
│  • ${prefix}aihelp - Show this menu
│
├───[ ✨ FEATURES ]
│
├  ✅ Natural conversation
│  ✅ Remembers context (last 15 messages)
│  ✅ Answers questions
│  ✅ Writing assistance
│  ✅ Code generation
│  ✅ Problem solving
│  ✅ General knowledge
│  ✅ Multi-language support
│
├───[ 📝 EXAMPLES ]
│
├  • ${prefix}ai What is JavaScript?
│  • ${prefix}ai Write a poem about coding
│  • ${prefix}ai Explain quantum physics simply
│  • ${prefix}ai Help me write a resume
│  • ${prefix}ai Create a React component
│
├───[ ⚡ POWERED BY ]
│
├  • Claude AI
│  • GPT-4
│  • LlamaCoder
│  • Blackbox AI
│  • SimSimi
│  • RANGER AI (Fallback)
│
├───[ 📊 STATS ]
│
├  🧠 Multi-API fallback system
├  💾 Saves conversation context
├  ⚡ Fast response time
│
└───[ 💝 RANGER TECH ]`.trim();

    await empire.sendMessage(m.chat, {
        text: response,
        contextInfo: {
            mentionedJid: [m.sender],
            externalAdReply: {
                title: `🤖 RANGER AI CHATBOT`,
                body: `Powered by Multiple AI Engines`,
                thumbnailUrl: 'https://files.catbox.moe/rqkoqa.jpg',
                mediaType: 1,
                renderLargerThumbnail: true
            },
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: "",
                newsletterName: "RANGER TECH"
            }
        }
    }, { quoted: m });
}
break;

// ========== AI STATS ==========
case 'aistats':
case 'chatsats': {
    if (!isCreator) return reply("❌ Owner only.");

    const totalUsers = global.aiHistory ? Object.keys(global.aiHistory).length : 0;
    let totalMessages = 0;

    if (global.aiHistory) {
        for (const user of Object.values(global.aiHistory)) {
            totalMessages += user.length;
        }
    }

    const response = `
┌───[ 📊 AI CHAT STATISTICS ]
│
├  👥 *Active users:* ${totalUsers}
├  💬 *Total messages:* ${totalMessages}
├  ⚡ *Status:* Active
├  🧠 *AI Engine:* Multi-API
│
├───[ 📈 HISTORY ]
│
├  📝 Avg messages/user: ${totalUsers > 0 ? Math.round(totalMessages / totalUsers) : 0}
│
└───[ 💝 RANGER TECH ]`.trim();

    reply(response);
}
break;
            // ========== ANTI-LINK COMMAND ==========
            case 'antilink':
            case 'al': {
                if (!isGroup) return reply("👥 This command only works in groups!");
                if (!isCreator && !isAdmins) return reply("❌ Only admins can use this!");
                
                const option = args[0]?.toLowerCase();
                
                if (option === 'on') {
                    setSetting(m.chat, 'antilink', true);
                    setSetting(m.chat, 'antilink_action', 'delete');
                    reply(`🔗 *ANTI-LINK ENABLED*\n\nWhatsApp links will be deleted.\n\nActions: ${prefix}antilink action <delete/warn/kick>`);
                } else if (option === 'off') {
                    setSetting(m.chat, 'antilink', false);
                    reply(`✅ *ANTI-LINK DISABLED*`);
                } else if (option === 'action') {
                    const action = args[1]?.toLowerCase();
                    if (action === 'delete') {
                        setSetting(m.chat, 'antilink_action', 'delete');
                        reply(`🗑️ Action: DELETE - Links will be deleted only`);
                    } else if (action === 'warn') {
                        setSetting(m.chat, 'antilink_action', 'warn');
                        reply(`⚠️ Action: WARN - Users will receive warnings`);
                    } else if (action === 'kick') {
                        setSetting(m.chat, 'antilink_action', 'kick');
                        reply(`👢 Action: KICK - Users will be kicked`);
                    } else {
                        const current = getSetting(m.chat, 'antilink_action', 'delete');
                        reply(`Current action: ${current.toUpperCase()}\n\nAvailable: delete, warn, kick`);
                    }
                } else if (option === 'allow') {
                    const domain = args[1]?.toLowerCase();
                    if (!domain) {
                        const allowed = getSetting(m.chat, 'allowedDomains', []);
                        reply(`✅ *Allowed Domains:*\n${allowed.length ? allowed.join(', ') : 'None'}\n\nAdd: ${prefix}antilink allow whatsapp.com`);
                    } else {
                        let allowed = getSetting(m.chat, 'allowedDomains', []);
                        if (!allowed.includes(domain)) allowed.push(domain);
                        setSetting(m.chat, 'allowedDomains', allowed);
                        reply(`✅ Added ${domain} to allowed domains.`);
                    }
                } else {
                    const status = getSetting(m.chat, 'antilink', false);
                    const action = getSetting(m.chat, 'antilink_action', 'delete');
                    reply(`🔗 *ANTI-LINK SETTINGS*\n\nStatus: ${status ? '🟢 ON' : '🔴 OFF'}\nAction: ${action.toUpperCase()}\n\nCommands:\n${prefix}antilink on/off\n${prefix}antilink action <delete/warn/kick>\n${prefix}antilink allow <domain>`);
                }
            }
            break;
            
            // ========== AUTO BIO CONTROL ==========
            case 'autobio': {
                if (!isCreator) return reply("❌ Only bot owner can use this!");
                
                const option = args[0]?.toLowerCase();
                
                if (option === 'on') {
                    autoBioEnabled = true;
                    await updateAutoBio(empire);
                    reply(`✅ *AUTO BIO ENABLED*\n\nBot status will update automatically.`);
                } else if (option === 'off') {
                    autoBioEnabled = false;
                    reply(`❌ *AUTO BIO DISABLED*`);
                } else if (option === 'now') {
                    await updateAutoBio(empire);
                    reply(`✅ *BIO UPDATED NOW*`);
                } else {
                    reply(`🤖 *AUTO BIO*\n\nStatus: ${autoBioEnabled ? '🟢 ON' : '🔴 OFF'}\n\nUsage:\n${prefix}autobio on\n${prefix}autobio off\n${prefix}autobio now`);
                }
            }
            break;
            
            // ========== JAIL COMMAND ==========
            case 'jail': {
                if (!isGroup) return reply("👥 This command only works in groups!");
                if (!isCreator && !isAdmins) return reply("❌ Only admins can jail users!");
                
                let target = m.mentionedJid?.[0];
                if (!target && m.quoted) target = m.quoted.sender;
                if (!target) return reply(`🔒 *Usage:* ${prefix}jail @user <reason> <duration>`);
                
                if (target === botNumber) return reply("❌ Cannot jail the bot!");
                if (target === m.sender) return reply("❌ Cannot jail yourself!");
                
                let reason = text.replace(/@\S+/, '').trim();
                let duration = null;
                
                const words = reason.split(' ');
                const lastWord = words[words.length - 1];
                if (!isNaN(lastWord) && parseInt(lastWord) > 0) {
                    duration = parseInt(lastWord);
                    reason = words.slice(0, -1).join(' ').trim();
                }
                
                if (!reason) reason = "No reason provided";
                
                const jailResult = await jailUser(empire, m.chat, target, reason, duration, m.sender);
                
                let response = `🔒 *USER JAILED*\n\n👤 User: @${target.split('@')[0]}\n📌 Reason: ${reason}\n⏱️ Duration: ${jailResult.durationText}\n👑 Jailed by: @${m.sender.split('@')[0]}`;
                
                await empire.sendMessage(m.chat, {
                    text: response,
                    mentions: [target, m.sender]
                }, { quoted: m });
            }
            break;
            
            // ========== UNJAIL COMMAND ==========
            case 'unjail':
            case 'release': {
                if (!isGroup) return reply("👥 This command only works in groups!");
                if (!isCreator && !isAdmins) return reply("❌ Only admins can unjail users!");
                
                let target = m.mentionedJid?.[0];
                if (!target && m.quoted) target = m.quoted.sender;
                if (!target) return reply(`🔓 *Usage:* ${prefix}unjail @user`);
                
                const success = await unjailUser(m.chat, target);
                
                if (success) {
                    reply(`🔓 *USER UNJAILED*\n\n✅ @${target.split('@')[0]} has been released from jail!`, { mentions: [target] });
                } else {
                    reply(`❌ @${target.split('@')[0]} is not in jail.`, { mentions: [target] });
                }
            }
            break;
            case 'jail list':
            case 'jailed': {
                if (!isGroup) return reply("👥 This command only works in groups!");
                if (!isCreator && !isAdmins) return reply("❌ Only admins can view jail list!");
                
                if (!db.jailed || !db.jailed[m.chat] || Object.keys(db.jailed[m.chat]).length === 0) {
                    return reply(`🔒 *JAIL LIST*\n\nNo users are currently jailed.`);
                }
                
                let response = `🔒 *JAILED USERS*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
                let count = 1;
                const mentions = [];
                
                for (const [jid, data] of Object.entries(db.jailed[m.chat])) {
                    const remaining = data.until ? Math.ceil((data.until - Date.now()) / 60000) : 'Permanent';
                    response += `${count++}. @${jid.split('@')[0]}\n`;
                    response += `   📌 Reason: ${data.reason}\n`;
                    response += `   ⏱️ Remaining: ${remaining === 'Permanent' ? 'PERMANENT' : remaining + ' minutes'}\n`;
                    response += `   👑 Jailed by: @${data.jailedBy?.split('@')[0] || 'Unknown'}\n\n`;
                    mentions.push(jid);
                    if (data.jailedBy) mentions.push(data.jailedBy);
                }
                
                await empire.sendMessage(m.chat, {
                    text: response,
                    mentions: mentions
                }, { quoted: m });
            }
            break;
            
            // ========== WELCOME TOGGLE ==========
            case 'welcome': {
                if (!isGroup) return reply("👥 This command only works in groups!");
                if (!isCreator && !isAdmins) return reply("❌ Only admins can use this!");
                
                const option = args[0]?.toLowerCase();
                
                if (option === 'on') {
                    setSetting(m.chat, 'welcome', true);
                    reply(`👋 *WELCOME MESSAGES ENABLED*`);
                } else if (option === 'off') {
                    setSetting(m.chat, 'welcome', false);
                    reply(`❌ *WELCOME MESSAGES DISABLED*`);
                } else {
                    const status = getSetting(m.chat, 'welcome', false);
                    reply(`👋 *WELCOME SYSTEM*\n\nStatus: ${status ? '🟢 ON' : '🔴 OFF'}\n\nUsage:\n${prefix}welcome on/off\n${prefix}setwelcome <message>`);
                }
            }
            break;
            
            // ========== SET WELCOME MESSAGE ==========
            case 'setwelcome': {
                if (!isGroup) return reply("👥 This command only works in groups!");
                if (!isCreator && !isAdmins) return reply("❌ Only admins can use this!");
                if (!text) return reply(`📝 *Usage:* ${prefix}setwelcome <message>\nVariables: @user, @group`);
                
                setSetting(m.chat, 'welcomeMessage', text);
                reply(`✅ *WELCOME MESSAGE SET*\n\n${text}`);
            }
            break;
            
            // ========== GOODBYE TOGGLE ==========
            case 'goodbye': {
                if (!isGroup) return reply("👥 This command only works in groups!");
                if (!isCreator && !isAdmins) return reply("❌ Only admins can use this!");
                
                const option = args[0]?.toLowerCase();
                
                if (option === 'on') {
                    setSetting(m.chat, 'goodbye', true);
                    reply(`👋 *GOODBYE MESSAGES ENABLED*`);
                } else if (option === 'off') {
                    setSetting(m.chat, 'goodbye', false);
                    reply(`❌ *GOODBYE MESSAGES DISABLED*`);
                } else {
                    const status = getSetting(m.chat, 'goodbye', false);
                    reply(`👋 *GOODBYE SYSTEM*\n\nStatus: ${status ? '🟢 ON' : '🔴 OFF'}`);
                }
            }
            break;
            
            // ========== SET GOODBYE MESSAGE ==========
            case 'setgoodbye': {
                if (!isGroup) return reply("👥 This command only works in groups!");
                if (!isCreator && !isAdmins) return reply("❌ Only admins can use this!");
                if (!text) return reply(`📝 *Usage:* ${prefix}setgoodbye <message>\nVariables: @user, @group`);
                
                setSetting(m.chat, 'goodbyeMessage', text);
                reply(`✅ *GOODBYE MESSAGE SET*\n\n${text}`);
            }
            break;
            
            // ========== AUTO REACT TOGGLE ==========
            case 'autoreact':
            case 'autoreactmsg': {
                if (!isCreator) return reply("❌ Only bot owner can use this!");
                
                const option = args[0]?.toLowerCase();
                
                if (option === 'on') {
                    autoMessageReact = true;
                    reply(`✅ *Auto Message React ENABLED*`);
                } else if (option === 'off') {
                    autoMessageReact = false;
                    reply(`❌ *Auto Message React DISABLED*`);
                } else {
                    reply(`❤️ *Auto Message React*\n\nStatus: ${autoMessageReact ? '🟢 ON' : '🔴 OFF'}`);
                }
            }
            break;
            
            // ========== ADD REACTION ==========
            case 'addreact': {
                if (!isCreator) return reply("❌ Only bot owner can use this!");
                
                const emoji = args[0];
                if (!emoji) return reply(`🎨 *Usage:* ${prefix}addreact <emoji>`);
                
                if (!messageReactions.includes(emoji)) {
                    messageReactions.push(emoji);
                    reply(`✅ Added reaction: ${emoji}\nTotal: ${messageReactions.length}`);
                } else {
                    reply(`❌ Emoji already exists!`);
                }
            }
            break;
            
            // ========== REMOVE REACTION ==========
            case 'removereact': {
                if (!isCreator) return reply("❌ Only bot owner can use this!");
                
                const emoji = args[0];
                if (!emoji) return reply(`🗑️ *Usage:* ${prefix}removereact <emoji>`);
                
                const index = messageReactions.indexOf(emoji);
                if (index !== -1) {
                    messageReactions.splice(index, 1);
                    reply(`✅ Removed reaction: ${emoji}\nTotal: ${messageReactions.length}`);
                } else {
                    reply(`❌ Emoji not found!`);
                }
            }
            break;
            
            // ========== ANTI-STICKER TOGGLE ==========
            case 'antisticker': {
                if (!isGroup) return reply("👥 This command only works in groups!");
                if (!isCreator && !isAdmins) return reply("❌ Only admins can use this!");
                
                const option = args[0]?.toLowerCase();
                
                if (option === 'on') {
                    setSetting(m.chat, 'antisticker', true);
                    reply(`🛡️ *ANTI-STICKER ENABLED*`);
                } else if (option === 'off') {
                    setSetting(m.chat, 'antisticker', false);
                    reply(`✅ *ANTI-STICKER DISABLED*`);
                } else {
                    const status = getSetting(m.chat, 'antisticker', false);
                    reply(`🛡️ *ANTI-STICKER*\n\nStatus: ${status ? '🟢 ON' : '🔴 OFF'}`);
                }
            }
            break;
            
            // ========== ANTI-DELETE TOGGLE ==========
            case 'antidelete': {
                if (!isGroup) return reply("👥 This command only works in groups!");
                if (!isCreator && !isAdmins) return reply("❌ Only admins can use this!");
                
                const option = args[0]?.toLowerCase();
                
                if (option === 'on') {
                    setSetting(m.chat, 'antidelete', true);
                    reply(`🛡️ *ANTI-DELETE ENABLED*`);
                } else if (option === 'off') {
                    setSetting(m.chat, 'antidelete', false);
                    reply(`✅ *ANTI-DELETE DISABLED*`);
                } else {
                    const status = getSetting(m.chat, 'antidelete', false);
                    reply(`🛡️ *ANTI-DELETE*\n\nStatus: ${status ? '🟢 ON' : '🔴 OFF'}`);
                }
            }
            break;
            
            default:
                break;
        }
        
    } catch (err) {
        console.error('Error:', err);
        if (m && m.chat) {
            empire.sendMessage(m.chat, { text: `❌ Error: ${err.message}` }).catch(() => {});
        }
    }
}

// Handle group participant updates
const originalGroupParticipantsUpdate = empire.groupParticipantsUpdate;
empire.groupParticipantsUpdate = async function(update) {
    try {
        const result = await originalGroupParticipantsUpdate.apply(this, arguments);
        
        if (update && update.id && update.participants) {
            const groupMetadata = await this.groupMetadata(update.id).catch(() => null);
            await handleGroupParticipantsUpdate(this, update, groupMetadata, this.user.id);
        }
        
        return result;
    } catch (err) {
        console.error('Group participants update error:', err);
    }
};

// File watcher
let file = require.resolve(__filename);
require('fs').watchFile(file, () => {
    require('fs').unwatchFile(file);
    console.log('\x1b[0;32m' + __filename + ' updated!\x1b[0m');
    delete require.cache[file];
    require(file);
});