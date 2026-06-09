// bot.js - RANGER XMD TECH  ◈ NEON GHOST EDITION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

require('dotenv').config();
require('./setting/config');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const chalk = require('chalk');
const os = require('os');
const axios = require('axios');
const { BOT_TOKEN } = require('./empirestore/token');
const { autoLoadPairs } = require('./autoload');

const startpairing = require('./pair');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INITIALIZATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE PATHS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const DATA_DIR            = path.join(__dirname, 'empirestore');
const adminFilePath       = path.join(DATA_DIR, 'admin.json');
const userFilePath        = path.join(DATA_DIR, 'users.json');
const userStatsPath       = path.join(DATA_DIR, 'user_stats.json');
const welcomeSettingsPath = path.join(DATA_DIR, 'welcome_settings.json');
const goodbyeSettingsPath = path.join(DATA_DIR, 'goodbye_settings.json');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DATA STORAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
let adminIDs      = [];
let userIDs       = new Set();
let userStats     = {};
let welcomeSettings = {};
let goodbyeSettings = {};

const cooldowns = new Map();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ◈ RANGER XMD TECH — NEON GHOST DESIGN SYSTEM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const Z = {
    // Glyphs
    gem:   '◈',
    pulse: '▸',
    bolt:  '⚡',
    orb:   '◉',
    dash:  '⟩',
    pin:   '⌖',
    star:  '✦',
    ring:  '◌',

    // Branding
    name: 'RANGER XMD TECH',
    tag:  '◈ RANGER XMD TECH  ·  NEON GHOST EDITION',

    // Box builders
    top: (w = 36) => `┌${'─'.repeat(w)}┐`,
    sep: (w = 36) => `├${'─'.repeat(w)}┤`,
    bot: (w = 36) => `└${'─'.repeat(w)}┘`,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SOCIAL LINKS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const LINKS = {
    channel: 'https://t.me/Rangertechcrop',
    group:   'https://t.me/Rangertechcropcrop',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const BANNER_URL = 'https://files.catbox.moe/rqkoqa.jpg';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MEMBERSHIP CONFIG
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const REQUIRE_MEMBERSHIP = true;
const REQUIRED_CHANNELS  = [
    { link: '@Rangertechcrop', name: '◈ RANGER XMD TECH CHANNEL' },
];
const REQUIRED_GROUP = '@Rangertechcropcrop';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const exists = async (fp) => {
    try { await fs.access(fp); return true; } catch { return false; }
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ensureDirectoryExists = async (d) => {
    try { await fs.mkdir(d, { recursive: true }); }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
};

function runtime(seconds) {
    seconds = Number(seconds);
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
    return parts.join(' ');
}

const formatNumber = (n) => {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DATA LOAD / SAVE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const loadAdminIDs = async () => {
    const ownerID = '8361355527';
    const defaultAdmins = [ownerID];
    await ensureDirectoryExists(DATA_DIR);
    if (!(await exists(adminFilePath))) {
        await fs.writeFile(adminFilePath, JSON.stringify(defaultAdmins, null, 2));
        adminIDs = defaultAdmins;
        console.log(chalk.green('✓ Created admin.json'));
    } else {
        try {
            const raw = await fs.readFile(adminFilePath, 'utf8');
            adminIDs = JSON.parse(raw);
            if (!Array.isArray(adminIDs)) adminIDs = defaultAdmins;
        } catch (err) {
            console.error(chalk.red('✗ Error loading admin.json:'), err);
            adminIDs = defaultAdmins;
        }
    }
    console.log(chalk.cyan(`◈ Loaded ${adminIDs.length} admin(s)`));
};

const loadUserIDs = async () => {
    if (await exists(userFilePath)) {
        try {
            const raw = await fs.readFile(userFilePath, 'utf8');
            const users = JSON.parse(raw);
            userIDs = new Set(Array.isArray(users) ? users : []);
            console.log(chalk.cyan(`◈ Loaded ${userIDs.size} user(s)`));
        } catch { userIDs = new Set(); }
    }
};

const saveUserIDs = async () => {
    try { await fs.writeFile(userFilePath, JSON.stringify([...userIDs], null, 2)); }
    catch (err) { console.error(chalk.red('✗ Error saving users.json:'), err); }
};

const loadUserStats = async () => {
    if (await exists(userStatsPath)) {
        try { userStats = JSON.parse(await fs.readFile(userStatsPath, 'utf8')); }
        catch { userStats = {}; }
    }
};

const saveUserStats = async () => {
    try { await fs.writeFile(userStatsPath, JSON.stringify(userStats, null, 2)); }
    catch (err) { console.error(chalk.red('Error saving user stats:'), err); }
};

const loadWelcomeSettings = async () => {
    if (await exists(welcomeSettingsPath)) {
        try { welcomeSettings = JSON.parse(await fs.readFile(welcomeSettingsPath, 'utf8')); }
        catch { welcomeSettings = {}; }
    }
};

const saveWelcomeSettings = async () => {
    try { await fs.writeFile(welcomeSettingsPath, JSON.stringify(welcomeSettings, null, 2)); }
    catch (err) { console.error(chalk.red('Error saving welcome settings:'), err); }
};

const loadGoodbyeSettings = async () => {
    if (await exists(goodbyeSettingsPath)) {
        try { goodbyeSettings = JSON.parse(await fs.readFile(goodbyeSettingsPath, 'utf8')); }
        catch { goodbyeSettings = {}; }
    }
};

const saveGoodbyeSettings = async () => {
    try { await fs.writeFile(goodbyeSettingsPath, JSON.stringify(goodbyeSettings, null, 2)); }
    catch (err) { console.error(chalk.red('Error saving goodbye settings:'), err); }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// USER TRACKING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const trackUser = async (userId) => {
    const id = userId.toString();
    if (!userIDs.has(id)) {
        userIDs.add(id);
        await saveUserIDs();
        console.log(chalk.green(`✦ New user: ${id}`));
    }
};

const updateUserStats = async (userId, command) => {
    const id = userId.toString();
    if (!userStats[id]) userStats[id] = { totalCommands: 0, lastSeen: Date.now(), commands: {} };
    userStats[id].totalCommands++;
    userStats[id].lastSeen = Date.now();
    userStats[id].commands[command] = (userStats[id].commands[command] || 0) + 1;
    await saveUserStats();
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MEMBERSHIP CHECK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const checkMembership = async (userId) => {
    if (!REQUIRE_MEMBERSHIP)
        return { hasJoinedGroup: true, hasJoinedAllChannels: true, hasJoinedAll: true, missingChannels: [] };
    try {
        const groupMember   = await bot.getChatMember(REQUIRED_GROUP, userId).catch(() => null);
        const channelChecks = await Promise.all(
            REQUIRED_CHANNELS.map(c => bot.getChatMember(c.link, userId).catch(() => null))
        );
        const valid = ['member', 'administrator', 'creator'];
        const hasJoinedGroup       = groupMember && valid.includes(groupMember.status);
        const hasJoinedAllChannels = channelChecks.every(m => m && valid.includes(m.status));
        return {
            hasJoinedGroup,
            hasJoinedAllChannels,
            hasJoinedAll: hasJoinedGroup && hasJoinedAllChannels,
            missingChannels: REQUIRED_CHANNELS.filter((_, i) => !channelChecks[i])
        };
    } catch (error) {
        console.error(chalk.red('Membership check error:'), error.message);
        return { hasJoinedGroup: false, hasJoinedAllChannels: false, hasJoinedAll: false, missingChannels: REQUIRED_CHANNELS };
    }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ◈ UI ENGINE — NEON GHOST STYLE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Builds a styled caption from a title + array of line strings.
 * Each line is wrapped inside │  ...  automatically.
 */
const buildCaption = (title, lines) => {
    const W      = 36;
    const header = `${Z.top(W)}\n│  ${Z.bolt} *${title}*\n${Z.sep(W)}`;
    const body   = lines.map(l => `│  ${l}`).join('\n');
    const footer = `${Z.sep(W)}\n│  _${Z.tag}_\n${Z.bot(W)}`;
    return `${header}\n${body}\n${footer}`;
};

const sendPanel = async (chatId, title, lines, buttons = null) => {
    const caption = buildCaption(title, lines);
    const opts    = { caption, parse_mode: 'Markdown' };
    if (buttons) opts.reply_markup = { inline_keyboard: buttons };
    return bot.sendPhoto(chatId, BANNER_URL, opts);
};

const editPanel = async (chatId, messageId, title, lines, buttons = null) => {
    const caption = buildCaption(title, lines);
    const opts    = { chat_id: chatId, message_id: messageId };
    if (buttons) opts.reply_markup = { inline_keyboard: buttons };
    return bot.editMessageMedia(
        { type: 'photo', media: BANNER_URL, caption, parse_mode: 'Markdown' }, opts
    );
};

// ─── Reusable button rows ───────────────
const mainButtons = () => [
    [{ text: '📡 CHANNEL', url: LINKS.channel }, { text: '👥 GROUP', url: LINKS.group }],
    [{ text: '❓ HELP', callback_data: 'help_msg' }]
];

const joinButtons = () => [
    [{ text: '📡 JOIN CHANNEL', url: LINKS.channel }],
    [{ text: '👥 JOIN GROUP',   url: LINKS.group }],
    [{ text: '✅ VERIFY ACCESS', callback_data: 'check_membership' }]
];

const sendJoinRequirement = (chatId) => sendPanel(chatId, 'ACCESS REQUIRED', [
    `${Z.orb} *Members Only Zone*`,
    ``,
    `${Z.dash} Join the channel & group below`,
    `${Z.dash} Then tap *VERIFY ACCESS*`,
    ``,
    `${Z.star} *Required:*`,
    `  ${Z.pulse} RANGER XMD TECH Channel`,
    `  ${Z.pulse} RANGER XMD TECH Group`,
], joinButtons());

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MIDDLEWARE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const withCooldown = (command, seconds = 3) => (handler) => async (msg, match) => {
    const key = `${msg.from.id}_${command}`;
    const now = Date.now();
    const cd  = cooldowns.get(key);
    if (cd && now - cd < seconds * 1000) {
        const left = Math.ceil((seconds * 1000 - (now - cd)) / 1000);
        return sendPanel(msg.chat.id, 'SLOW DOWN', [`⏳ Wait *${left}s* before using this again.`]);
    }
    cooldowns.set(key, now);
    return handler(msg, match);
};

const requireMembership = (handler) => async (msg, match) => {
    const chatId  = msg.chat.id;
    const userId  = msg.from.id;
    const command = msg.text?.split(' ')[0]?.replace('/', '') || 'unknown';
    await trackUser(userId);
    await updateUserStats(userId, command);
    if (!REQUIRE_MEMBERSHIP || adminIDs.includes(userId.toString())) return handler(msg, match);
    const m = await checkMembership(userId);
    if (!m.hasJoinedAll) return sendJoinRequirement(chatId);
    return handler(msg, match);
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /start
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/start/, requireMembership(async (msg) => {
    const name = msg.from.first_name;
    await sendPanel(msg.chat.id, `WELCOME, ${name.toUpperCase()}`, [
        `${Z.star} Hey *${name}*, you're in.`,
        `${Z.orb} *RANGER XMD TECH* — WhatsApp automation hub.`,
        ``,
        `${Z.gem} *PAIRING*`,
        `  ${Z.pulse} /pair \`number\`  — Connect WhatsApp`,
        `  ${Z.pulse} /delpair \`number\`  — Remove device`,
        `  ${Z.pulse} /listpair confirm  — View devices`,
        ``,
        `${Z.gem} *UTILITIES*`,
        `  ${Z.pulse} /ping  /runtime  /profile`,
        `  ${Z.pulse} /leaderboard  /report`,
        ``,
        `${Z.gem} *GROUP TOOLS*`,
        `  ${Z.pulse} /welcome  /goodbye`,
    ], mainButtons());
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /help
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/help/, async (msg) => {
    await sendPanel(msg.chat.id, 'COMMAND GUIDE', [
        `${Z.gem} *PAIRING*`,
        `  ${Z.pulse} /pair \`number\`  — Pair device`,
        `  ${Z.pulse} /delpair \`number\`  — Remove device`,
        `  ${Z.pulse} /listpair confirm  — List devices`,
        ``,
        `${Z.gem} *STATS & INFO*`,
        `  ${Z.pulse} /ping  — Latency check`,
        `  ${Z.pulse} /runtime  — Bot uptime`,
        `  ${Z.pulse} /profile  — Your profile`,
        `  ${Z.pulse} /leaderboard  — Top users`,
        ``,
        `${Z.gem} *GROUP TOOLS*`,
        `  ${Z.pulse} /welcome  — Welcome messages`,
        `  ${Z.pulse} /goodbye  — Goodbye messages`,
        `  ${Z.pulse} /report \`msg\`  — Report issue`,
    ], [
        [{ text: '📡 CHANNEL', url: LINKS.channel }, { text: '👥 GROUP', url: LINKS.group }],
        [{ text: '🚀 START', callback_data: 'start_bot' }]
    ]);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /ping
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/ping/, requireMembership(withCooldown('ping', 5)(async (msg) => {
    const start   = Date.now();
    const sentMsg = await bot.sendPhoto(msg.chat.id, BANNER_URL, {
        caption: `${Z.bolt} *Pinging...*`, parse_mode: 'Markdown'
    });
    const latency    = Date.now() - start;
    const apiLatency = sentMsg.date - msg.date;
    const bar        = latency < 100 ? '▰▰▰▰▰' : latency < 200 ? '▰▰▰▰▱' : latency < 500 ? '▰▰▰▱▱' : '▰▰▱▱▱';
    const quality    = latency < 100 ? 'Excellent' : latency < 200 ? 'Good' : latency < 500 ? 'Slow' : 'Very Slow';
    const dot        = latency < 100 ? '🟢' : latency < 200 ? '🟡' : latency < 500 ? '🟠' : '🔴';

    await editPanel(msg.chat.id, sentMsg.message_id, 'PONG', [
        `${dot} *Response*    ${latency}ms  \`${bar}\``,
        `${Z.pin} *API Delay*   ${apiLatency}ms`,
        `${Z.star} *Quality*     ${quality}`,
    ]);
})));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /runtime
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/runtime/, requireMembership(async (msg) => {
    const uptime = runtime(process.uptime());
    const memory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    await sendPanel(msg.chat.id, 'SYSTEM STATUS', [
        `🟢 *Status*    Online`,
        `⏱  *Uptime*    ${uptime}`,
        `💾  *Memory*    ${memory} MB`,
        `👥  *Users*     ${formatNumber(userIDs.size)} registered`,
    ]);
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /profile
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/profile/, requireMembership(async (msg) => {
    const userId   = msg.from.id;
    const name     = msg.from.first_name;
    const username = msg.from.username ? `@${msg.from.username}` : 'None';
    const stat     = userStats[userId] || { totalCommands: 0, lastSeen: Date.now(), commands: {} };
    const lastSeen = new Date(stat.lastSeen).toLocaleString();
    const cmdCount = Object.keys(stat.commands || {}).length;
    const top      = Object.entries(stat.commands || {}).sort((a, b) => b[1] - a[1])[0];

    await sendPanel(msg.chat.id, 'YOUR PROFILE', [
        `${Z.orb} *${name}*`,
        `${Z.pulse} ID:         \`${userId}\``,
        `${Z.pulse} Username:   ${username}`,
        ``,
        `${Z.gem} *ACTIVITY*`,
        `${Z.pulse} Commands:   ${stat.totalCommands}`,
        `${Z.pulse} Unique:      ${cmdCount}`,
        `${Z.pulse} Top cmd:    ${top ? '/' + top[0] : '—'}`,
        `${Z.pulse} Last seen:  ${lastSeen}`,
    ]);
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /leaderboard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/leaderboard/, requireMembership(async (msg) => {
    const top = Object.entries(userStats)
        .sort((a, b) => b[1].totalCommands - a[1].totalCommands)
        .slice(0, 10);
    if (top.length === 0)
        return sendPanel(msg.chat.id, 'LEADERBOARD', [`${Z.ring} No data yet — use some commands!`]);
    const medals = ['🥇', '🥈', '🥉', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
    const lines  = [`${Z.gem} *Rankings*`, ``];
    top.forEach(([uid, s], i) => lines.push(`${medals[i]}  \`${uid.slice(-6)}\`  —  *${s.totalCommands}* cmds`));
    await sendPanel(msg.chat.id, 'TOP USERS', lines);
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /stats  (admin)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/stats/, async (msg) => {
    if (!adminIDs.includes(msg.from.id.toString()))
        return sendPanel(msg.chat.id, 'ADMIN ONLY', [`🔒 *Access Denied*`]);
    const totalCmds = Object.values(userStats).reduce((s, u) => s + (u.totalCommands || 0), 0);
    await sendPanel(msg.chat.id, 'BOT STATISTICS', [
        `👥  *Users*       ${formatNumber(userIDs.size)}`,
        `${Z.bolt}  *Commands*    ${formatNumber(totalCmds)}`,
        `⏱   *Uptime*      ${runtime(process.uptime())}`,
        `💾  *Memory*      ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
        `👑  *Admins*      ${adminIDs.length}`,
    ]);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /welcome
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/welcome$/, requireMembership(async (msg) => {
    if (!adminIDs.includes(msg.from.id.toString()))
        return sendPanel(msg.chat.id, 'ADMIN ONLY', [`🔒 *Access Denied*`]);
    await sendPanel(msg.chat.id, 'WELCOME SETTINGS', [
        `${Z.gem} *Configuration*`,
        `${Z.pulse} /welcome on  — Enable`,
        `${Z.pulse} /welcome off  — Disable`,
        `${Z.pulse} /welcome set \`msg\`  — Custom`,
        ``,
        `${Z.gem} *Variables*`,
        `${Z.pulse} {name}   — Member name`,
        `${Z.pulse} {group}  — Group name`,
        `${Z.pulse} {count}  — Member count`,
    ]);
}));

bot.onText(/\/welcome (on|off|set .+)/, requireMembership(async (msg, match) => {
    const chatId = msg.chat.id;
    if (!adminIDs.includes(msg.from.id.toString()))
        return sendPanel(chatId, 'ADMIN ONLY', [`🔒 *Access Denied*`]);
    await loadWelcomeSettings();
    if (!welcomeSettings[chatId]) welcomeSettings[chatId] = { enabled: false, message: '' };
    const action = match[1];
    if (action === 'on') {
        welcomeSettings[chatId].enabled = true;
        await saveWelcomeSettings();
        await sendPanel(chatId, 'WELCOME', [`✅ *Welcome messages ENABLED*`]);
    } else if (action === 'off') {
        welcomeSettings[chatId].enabled = false;
        await saveWelcomeSettings();
        await sendPanel(chatId, 'WELCOME', [`❌ *Welcome messages DISABLED*`]);
    } else if (action.startsWith('set')) {
        const custom = action.replace('set ', '');
        welcomeSettings[chatId].message = custom;
        welcomeSettings[chatId].enabled = true;
        await saveWelcomeSettings();
        await sendPanel(chatId, 'WELCOME', [`✅ *Custom welcome set:*`, ``, `"${custom}"`]);
    }
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /goodbye
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/goodbye$/, requireMembership(async (msg) => {
    if (!adminIDs.includes(msg.from.id.toString()))
        return sendPanel(msg.chat.id, 'ADMIN ONLY', [`🔒 *Access Denied*`]);
    await sendPanel(msg.chat.id, 'GOODBYE SETTINGS', [
        `${Z.gem} *Configuration*`,
        `${Z.pulse} /goodbye on  — Enable`,
        `${Z.pulse} /goodbye off  — Disable`,
        `${Z.pulse} /goodbye set \`msg\`  — Custom`,
        ``,
        `${Z.gem} *Variables*`,
        `${Z.pulse} {name}   — Member name`,
        `${Z.pulse} {group}  — Group name`,
    ]);
}));

bot.onText(/\/goodbye (on|off|set .+)/, requireMembership(async (msg, match) => {
    const chatId = msg.chat.id;
    if (!adminIDs.includes(msg.from.id.toString()))
        return sendPanel(chatId, 'ADMIN ONLY', [`🔒 *Access Denied*`]);
    await loadGoodbyeSettings();
    if (!goodbyeSettings[chatId]) goodbyeSettings[chatId] = { enabled: false, message: '' };
    const action = match[1];
    if (action === 'on') {
        goodbyeSettings[chatId].enabled = true;
        await saveGoodbyeSettings();
        await sendPanel(chatId, 'GOODBYE', [`✅ *Goodbye messages ENABLED*`]);
    } else if (action === 'off') {
        goodbyeSettings[chatId].enabled = false;
        await saveGoodbyeSettings();
        await sendPanel(chatId, 'GOODBYE', [`❌ *Goodbye messages DISABLED*`]);
    } else if (action.startsWith('set')) {
        const custom = action.replace('set ', '');
        goodbyeSettings[chatId].message = custom;
        goodbyeSettings[chatId].enabled = true;
        await saveGoodbyeSettings();
        await sendPanel(chatId, 'GOODBYE', [`✅ *Custom goodbye set:*`, ``, `"${custom}"`]);
    }
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /pair
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/pair (.+)/, requireMembership(withCooldown('pair', 10)(async (msg, match) => {
    const chatId = msg.chat.id;
    const number = match[1].trim();
    try {
        if (!number || /[a-z]/i.test(number) || !/^\d{7,15}$/.test(number) || number.startsWith('0'))
            return sendPanel(chatId, 'INVALID NUMBER', [`⚠️ *Usage:* /pair 234XXXXXXXXX`]);

        await sendPanel(chatId, 'PAIRING', [`⏳ *Processing your request...*`]);

        const jid = number.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        await startpairing(jid);
        await sleep(4000);

        const pairingFile = path.join(DATA_DIR, 'pairing', 'pairing.json');
        if (!(await exists(pairingFile)))
            return sendPanel(chatId, 'PAIRING FAILED', [`❌ *Failed to generate code*`, `Please try again.`]);

        const cu    = await fs.readFile(pairingFile, 'utf-8');
        const cuObj = JSON.parse(cu);
        const clean = number.replace(/[^0-9]/g, '');

        await sendPanel(chatId, 'PAIRING SUCCESSFUL', [
            `✅ *Device Linked!*`,
            ``,
            `📱 Number   ${clean}`,
            `🔐 Code     \`${cuObj.code}\``,
            ``,
            `${Z.dash} Open WhatsApp`,
            `${Z.dash} Linked Devices › Link a Device`,
            `${Z.dash} Enter the code above`,
        ]);
    } catch (error) {
        console.error(chalk.red('Pair error:'), error);
        sendPanel(chatId, 'PAIRING FAILED', [`❌ *Error:* ${error.message || 'Please try again'}`]);
    }
})));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /delpair
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/delpair (.+)/, requireMembership(async (msg, match) => {
    const chatId = msg.chat.id;
    const number = match[1].trim();
    try {
        if (!number || /[a-z]/i.test(number) || !/^\d{7,15}$/.test(number))
            return sendPanel(chatId, 'INVALID NUMBER', [`⚠️ *Usage:* /delpair 234XXXXXXXXX`]);

        const jidSuffix   = `${number}@s.whatsapp.net`;
        const pairingPath = path.join(DATA_DIR, 'pairing');

        if (!(await exists(pairingPath)))
            return sendPanel(chatId, 'NOT FOUND', [`❌ *No sessions found*`]);

        const entries = await fs.readdir(pairingPath, { withFileTypes: true });
        const matched = entries.find(e => e.isDirectory() && e.name === jidSuffix);

        if (!matched)
            return sendPanel(chatId, 'NOT FOUND', [`❌ *${number} is not paired*`]);

        await fs.rm(path.join(pairingPath, matched.name), { recursive: true, force: true });
        await sendPanel(chatId, 'DEVICE REMOVED', [
            `✅ *Unlinked Successfully*`,
            ``,
            `📱 ${number} has been removed.`,
        ]);
        console.log(chalk.green(`🗑️ Deleted: ${number}`));
    } catch (err) {
        console.error(chalk.red('Delpair error:'), err);
        sendPanel(chatId, 'DELETE FAILED', [`❌ *Error:* ${err.message}`]);
    }
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /listpair  (admin)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/listpair confirm/, async (msg) => {
    const chatId = msg.chat.id;
    if (!adminIDs.includes(msg.from.id.toString()))
        return sendPanel(chatId, 'ADMIN ONLY', [`🔒 *Access Denied*`]);
    try {
        const pairingPath = path.join(DATA_DIR, 'pairing');
        if (!(await exists(pairingPath)))
            return sendPanel(chatId, 'PAIRED DEVICES', [`❌ *No devices found*`]);

        const entries = await fs.readdir(pairingPath, { withFileTypes: true });
        const devices = entries
            .filter(e => e.isDirectory() && e.name !== 'pairing.json' && e.name.endsWith('@s.whatsapp.net'))
            .map(e => e.name);

        if (devices.length === 0)
            return sendPanel(chatId, 'PAIRED DEVICES', [`❌ *No devices found*`]);

        const lines = [`${Z.gem} *${devices.length} device(s) linked*`, ``];
        devices.forEach((d, i) => lines.push(`${Z.pulse} ${i + 1}. \`${d.split('@')[0]}\``));
        await sendPanel(chatId, 'PAIRED DEVICES', lines);
    } catch (err) {
        console.error(chalk.red('Listpair error:'), err);
        sendPanel(chatId, 'ERROR', [`❌ *Failed to load devices*`]);
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// /report
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.onText(/\/report (.+)/, requireMembership(async (msg, match) => {
    const chatId    = msg.chat.id;
    const userId    = msg.from.id;
    const username  = msg.from.username ? `@${msg.from.username}` : 'No username';
    const firstName = msg.from.first_name || 'User';
    const reportMsg = match[1].trim();

    const lines = [
        `${Z.orb} *${firstName}*`,
        `${Z.pulse} ID:      \`${userId}\``,
        `${Z.pulse} Handle:  ${username}`,
        ``,
        `${Z.gem} *Message*`,
        `${reportMsg}`,
    ];

    let sent = 0;
    for (const adminId of adminIDs) {
        try { await sendPanel(adminId, 'NEW REPORT', lines); sent++; }
        catch (e) { console.error(`Failed to reach admin ${adminId}:`, e.message); }
    }
    await sendPanel(chatId, 'REPORT SENT', [`✅ *Report delivered to ${sent} admin(s)*`]);
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CALLBACK HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.on('callback_query', async (q) => {
    const msg    = q.message;
    const data   = q.data;
    const userId = q.from.id;
    const chatId = msg.chat.id;
    const msgId  = msg.message_id;
    const name   = q.from.first_name;

    await trackUser(userId);

    if (data === 'check_membership') {
        try {
            await bot.answerCallbackQuery(q.id, { text: '🔍 Checking membership...' });
            const m = await checkMembership(userId);

            if (m.hasJoinedAll) {
                await editPanel(chatId, msgId, `WELCOME, ${name.toUpperCase()}`, [
                    `✅ *Access Granted, ${name}!*`,
                    ``,
                    `${Z.gem} *PAIRING*`,
                    `  ${Z.pulse} /pair  /delpair  /listpair`,
                    ``,
                    `${Z.gem} *INFO*`,
                    `  ${Z.pulse} /ping  /runtime  /profile`,
                    `  ${Z.pulse} /leaderboard`,
                ], mainButtons());
            } else {
                await editPanel(chatId, msgId, 'ACCESS DENIED', [
                    `🔒 *Not verified yet, ${name}.*`,
                    ``,
                    `${Z.dash} You haven't joined all required channels.`,
                    `${Z.dash} Subscribe below and tap *VERIFY* again.`,
                ], joinButtons());
            }
        } catch (error) {
            console.error(chalk.red('Callback error:'), error);
            await bot.answerCallbackQuery(q.id, { text: '❌ Error checking membership' });
        }

    } else if (data === 'start_bot') {
        await bot.answerCallbackQuery(q.id);
        await editPanel(chatId, msgId, 'WELCOME BACK', [
            `${Z.star} Hey *${name}*, welcome back!`,
            ``,
            `${Z.gem} *PAIRING*`,
            `  ${Z.pulse} /pair  /delpair  /listpair`,
            ``,
            `${Z.gem} *INFO*`,
            `  ${Z.pulse} /ping  /runtime  /profile`,
            `  ${Z.pulse} /leaderboard`,
            ``,
            `${Z.gem} *GROUP*`,
            `  ${Z.pulse} /welcome  /goodbye  /report`,
        ], mainButtons());

    } else if (data === 'help_msg') {
        await bot.answerCallbackQuery(q.id);
        await editPanel(chatId, msgId, 'COMMAND GUIDE', [
            `${Z.gem} *PAIRING*`,
            `  ${Z.pulse} /pair  /delpair  /listpair`,
            ``,
            `${Z.gem} *INFO*`,
            `  ${Z.pulse} /ping  /runtime  /profile`,
            `  ${Z.pulse} /leaderboard  /report`,
            ``,
            `${Z.gem} *GROUP*`,
            `  ${Z.pulse} /welcome  /goodbye`,
        ], [
            [{ text: '🚀 START', callback_data: 'start_bot' }],
            [{ text: '📡 CHANNEL', url: LINKS.channel }, { text: '👥 GROUP', url: LINKS.group }]
        ]);
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GROUP EVENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.on('new_chat_members', async (msg) => {
    const chatId    = msg.chat.id;
    const newMember = msg.new_chat_members[0];
    await loadWelcomeSettings();
    if (welcomeSettings[chatId]?.enabled) {
        let text = (welcomeSettings[chatId].message || 'Welcome {name} to {group}! 🎉')
            .replace('{name}',  newMember.first_name)
            .replace('{group}', msg.chat.title || 'this group')
            .replace('{count}', msg.chat.members_count || '');
        await bot.sendPhoto(chatId, BANNER_URL, { caption: text, parse_mode: 'Markdown' }).catch(() => {});
    }
});

bot.on('left_chat_member', async (msg) => {
    const chatId     = msg.chat.id;
    const leftMember = msg.left_chat_member;
    await loadGoodbyeSettings();
    if (goodbyeSettings[chatId]?.enabled) {
        let text = (goodbyeSettings[chatId].message || 'Goodbye {name}! 😢')
            .replace('{name}',  leftMember.first_name)
            .replace('{group}', msg.chat.title || 'this group');
        await bot.sendPhoto(chatId, BANNER_URL, { caption: text, parse_mode: 'Markdown' }).catch(() => {});
    }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UNKNOWN COMMAND
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const VALID_COMMANDS = [
    '/start', '/pair', '/delpair', '/listpair', '/ping', '/runtime',
    '/help', '/report', '/welcome', '/goodbye', '/stats', '/profile', '/leaderboard'
];

bot.on('message', async (msg) => {
    if (!msg.text?.startsWith('/')) return;
    const cmd = msg.text.split(' ')[0];
    if (VALID_COMMANDS.includes(cmd)) return;
    await trackUser(msg.from.id);
    if (!adminIDs.includes(msg.from.id.toString()) && REQUIRE_MEMBERSHIP) {
        const m = await checkMembership(msg.from.id);
        if (!m.hasJoinedAll) return sendJoinRequirement(msg.chat.id);
    }
    sendPanel(msg.chat.id, 'UNKNOWN COMMAND', [
        `❓ *Command not found.*`,
        ``,
        `${Z.dash} Type /help to see all commands.`,
    ]);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ERROR HANDLERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.on('polling_error', (e) => console.error(chalk.red('Polling error:'), e.message));
bot.on('webhook_error',  (e) => console.error(chalk.red('Webhook error:'), e.message));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BOOT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(async () => {
    console.log(chalk.magenta(`
┌──────────────────────────────────────────┐
│   ◈  RANGER XMD TECH  ·  NEON GHOST EDITION    │
│        Initializing systems...           │
└──────────────────────────────────────────┘`));

    await ensureDirectoryExists(DATA_DIR);
    await ensureDirectoryExists(path.join(DATA_DIR, 'pairing'));
    await loadAdminIDs();
    await loadUserIDs();
    await loadUserStats();
    await loadWelcomeSettings();
    await loadGoodbyeSettings();

    console.log(chalk.green(`
┌──────────────────────────────────────────┐
│  ◈  RANGER XMD TECH — NEON GHOST EDITION       │
│  ✦  Status    Online                     │
│  👥  Users    ${userIDs.size.toString().padEnd(6)}                      │
│  👑  Admins   ${adminIDs.length.toString().padEnd(6)}                      │
│  📡  Channel  t.me/zukoxmd               │
│  👥  Group    t.me/Rangertechcrop              │
└──────────────────────────────────────────┘`));

    console.log(chalk.cyan(`✦ Membership: ${REQUIRE_MEMBERSHIP ? 'ENABLED' : 'DISABLED'}`));
    console.log(chalk.cyan('✦ Welcome/Goodbye: ENABLED'));
    console.log(chalk.cyan('✦ Report system: ENABLED'));
    console.log(chalk.green('✦ All systems online!\n'));

    setTimeout(async () => {
        try {
            console.log(chalk.cyan('📱 Auto-loading paired devices...'));
            const result = await autoLoadPairs({ batchSize: 1 });
            if (result.success) {
                console.log(chalk.green(`✦ Auto-load done: ${result.successful}/${result.total} connected`));
                if (result.failedUsers?.length)
                    console.log(chalk.yellow(`⚠️ Failed: ${result.failedUsers.length}`));
            } else {
                console.log(chalk.yellow(`⚠️ Auto-load skipped: ${result.message}`));
            }
        } catch (err) {
            console.error(chalk.red('✗ Auto-load failed:'), err.message);
        }
    }, 8000);
})();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHUTDOWN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const shutdown = async () => {
    console.log(chalk.yellow('\n◈ Shutting down RANGER XMD TECH...'));
    await saveUserIDs();
    await saveUserStats();
    await saveWelcomeSettings();
    await saveGoodbyeSettings();
    bot.stopPolling();
    console.log(chalk.green('✦ Data saved. Goodbye!'));
    process.exit(0);
};

process.once('SIGINT',  shutdown);
process.once('SIGTERM', shutdown);
process.on('uncaughtException',  (e) => console.error(chalk.red('Uncaught Exception:'), e));
process.on('unhandledRejection', (r) => console.error(chalk.red('Unhandled Rejection:'), r));
