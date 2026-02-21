// Keep alive untuk Replit
const http = require('http');
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Client is running!\n');
}).listen(8080);

const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

// ===== DUAL CLIENT SETUP =====
const botClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ]
});

const userClient = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// ===== KONFIGURASI =====
const TOKEN = process.env.DISCORD_TOKEN;
const PORT = process.env.PORT || 3000;
const CLIENT_ID = '1468634707658019072';

// Channel IDs
const GL_CHANNEL_ID = '1427420155738062922';
const STATUS_CHANNEL_ID = '1469699989977432239';
const SCRIPT_CHANNEL_ID = '1469939821337251981';

// Role IDs untuk admin
const ADMIN_COMMAND_ROLES = [
    '1421010720304402443',
    '1424421572520706169'
];

// ID untuk user khusus
const BOT_CREATOR_ID = '929200608190300212'; // @mi._chel
const SPECIAL_USER_ID = '914818330022535209'; // User khusus untuk auto-reply 1

// Auto-reply messages untuk tag user 914818330022535209
const USER1_AUTO_REPLY = [
    "lagi maen ama pacarnya",
    "si eja lagi nonton youtube keknya",
    "si zax gatau kemana jir",
    `biasanya tidur si eza`
];

// Auto-reply messages anime untuk tag/reply bot
const ANIME_AUTO_REPLY = [
    "Omae wa nani no tame ni umaretekita no?",
    "Omae wa kyou de shinu no yo. Jigoku ni ochiro.",
    "Shinobu-sama to, tsuishin shite... moshikashitara, watashi... tanjiru no miteru dake ka mo.",
    "Kanjou ga, nai...",
    "Me ga samete, yokatta...",
    "Nage kettei."
];

// ===== VARIABEL STATUS =====
let botStartTime = null;
let statusMessageId = '1469726250854518906';
let commandCount = 0;
let lastCommandCount = 0;
let lastStatusUpdate = 0;
let botStartTimeFormatted = 'N/A';
const STATUS_UPDATE_INTERVAL = 60000;

// ===== SISTEM BLOK SPAM =====
const blockedUsers = new Map();
const BLOCK_DURATION = 10000;
const SPAM_COMMAND_THRESHOLD = 8;
const SPAM_TIME_WINDOW = 10000;
const userCommandHistory = new Map();

// ===== SISTEM AUTO-REPLY KHUSUS =====
let autoReplyUser1 = true;
let autoReplyUser2 = true;
const lastReplyTime = new Map();
const REPLY_COOLDOWN = 300000;

// ===== SISTEM TIMEOUT UNTUK USER 2 =====
const user2TagWarnings = new Map();
const TIMEOUT_DURATION = 3600000;

// ===== FUNGSI BANTUAN =====
function getUser1AutoReply() {
    return USER1_AUTO_REPLY[Math.floor(Math.random() * USER1_AUTO_REPLY.length)];
}

function getAnimeAutoReply() {
    return ANIME_AUTO_REPLY[Math.floor(Math.random() * ANIME_AUTO_REPLY.length)];
}

async function getFooterWithAvatar(userTag) {
    try {
        const creator = await botClient.users.fetch(BOT_CREATOR_ID);
        return { 
            text: `Bot by ${creator.tag} • Requested by ${userTag}`,
            iconURL: creator.displayAvatarURL({ extension: 'png', size: 64 })
        };
    } catch (error) {
        return { 
            text: `Bot by @mi._chel • Requested by ${userTag}`
        };
    }
}

async function getGeneralFooter() {
    try {
        const creator = await botClient.users.fetch(BOT_CREATOR_ID);
        return { 
            text: `Bot by ${creator.tag}`,
            iconURL: creator.displayAvatarURL({ extension: 'png', size: 64 })
        };
    } catch (error) {
        return { 
            text: `Bot by @mi._chel`
        };
    }
}

function formatUptime() {
    if (!botStartTime) return 'N/A';

    const now = Date.now();
    const uptime = now - botStartTime;

    const seconds = Math.floor((uptime / 1000) % 60);
    const minutes = Math.floor((uptime / (1000 * 60)) % 60);
    const hours = Math.floor((uptime / (1000 * 60 * 60)) % 24);
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(' ');
}

function formatDateWIB() {
    const now = new Date();
    const wibOffset = 7 * 60 * 60 * 1000;
    const wibTime = new Date(now.getTime() + wibOffset);

    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    const dayName = days[wibTime.getUTCDay()];
    const date = wibTime.getUTCDate();
    const month = months[wibTime.getUTCMonth()];
    const year = wibTime.getUTCFullYear();

    const hours = wibTime.getUTCHours().toString().padStart(2, '0');
    const minutes = wibTime.getUTCMinutes().toString().padStart(2, '0');
    const seconds = wibTime.getUTCSeconds().toString().padStart(2, '0');

    return `${dayName}, ${date} ${month} ${year} | ${hours}:${minutes}:${seconds} WIB`;
}

function isUserBlocked(userId) {
    const blockData = blockedUsers.get(userId);
    if (!blockData) return false;

    if (Date.now() >= blockData.blockUntil) {
        blockedUsers.delete(userId);
        return false;
    }

    return true;
}

function blockUser(userId, reason = 'Spamming commands') {
    const blockUntil = Date.now() + BLOCK_DURATION;
    blockedUsers.set(userId, {
        blockUntil,
        reason,
        blockedAt: Date.now()
    });

    setTimeout(() => {
        blockedUsers.delete(userId);
    }, BLOCK_DURATION);

    console.log(`⛔ User ${userId} blocked`);
}

function checkCommandSpam(userId) {
    const now = Date.now();
    let userData = userCommandHistory.get(userId);

    if (!userData) {
        userData = { timestamps: [now], count: 1 };
        userCommandHistory.set(userId, userData);
        return false;
    }

    userData.timestamps = userData.timestamps.filter(time => now - time < SPAM_TIME_WINDOW);
    userData.timestamps.push(now);
    userData.count = userData.timestamps.length;

    if (userData.count >= SPAM_COMMAND_THRESHOLD) {
        blockUser(userId, `Spamming commands (${userData.count} commands in 10 seconds)`);
        userCommandHistory.delete(userId);
        return true;
    }

    userCommandHistory.set(userId, userData);
    return false;
}

function canReplyToUser1(userId) {
    const lastTime = lastReplyTime.get(userId);
    if (!lastTime) return true;

    const now = Date.now();
    return (now - lastTime) >= REPLY_COOLDOWN;
}

function updateLastReplyTime(userId) {
    lastReplyTime.set(userId, Date.now());
}

async function timeoutUser(member, duration = TIMEOUT_DURATION, reason = 'Tagging user 2 twice') {
    try {
        await member.timeout(duration, reason);
        return true;
    } catch (error) {
        console.error('Error timing out user:', error);
        return false;
    }
}

async function handleUser2Tag(message) {
    if (!isRegularMember(message.member)) {
        return;
    }

    const userId = message.author.id;
    const now = Date.now();

    if (message.member.communicationDisabledUntil && message.member.communicationDisabledUntil > new Date()) {
        return;
    }

    let warningData = user2TagWarnings.get(userId);

    if (!warningData) {
        warningData = { count: 1, lastWarning: now };
        user2TagWarnings.set(userId, warningData);

        try {
            await message.channel.send({
                content: `⚠️ **PERINGATAN!** <@${userId}>\nAnda telah men-tag <@${BOT_CREATOR_ID}>. Jika men-tag lagi, Anda akan di-timeout selama 1 jam!`
            });
        } catch (error) {}
        return;
    }

    if (now - warningData.lastWarning > 3600000) {
        warningData = { count: 1, lastWarning: now };
        user2TagWarnings.set(userId, warningData);

        try {
            await message.channel.send({
                content: `⚠️ **PERINGATAN!** <@${userId}>\nAnda telah men-tag <@${BOT_CREATOR_ID}>. Jika men-tag lagi, Anda akan di-timeout selama 1 jam!`
            });
        } catch (error) {}
        return;
    }

    warningData.count = 2;
    warningData.lastWarning = now;

    try {
        const timeoutSuccess = await timeoutUser(message.member, TIMEOUT_DURATION, `Tagging user ${BOT_CREATOR_ID} twice within 1 hour`);

        if (timeoutSuccess) {
            const timeoutUntil = new Date(now + TIMEOUT_DURATION);
            await message.channel.send({
                content: `⛔ **TIMEOUT!** <@${userId}>\nAnda telah di-timeout selama 1 jam karena men-tag <@${BOT_CREATOR_ID}> dua kali dalam waktu singkat.\nTimeout akan berakhir: <t:${Math.floor(timeoutUntil.getTime() / 1000)}:R>`
            });
        }
        user2TagWarnings.delete(userId);
    } catch (error) {}
}

function isRegularMember(member) {
    if (!member) return false;

    if (member.roles.cache.some(role => ADMIN_COMMAND_ROLES.includes(role.id))) {
        return false;
    }

    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return false;
    }

    if (member.id === member.guild.ownerId) {
        return false;
    }

    return true;
}

async function updateStatusEmbed() {
    try {
        const channel = botClient.channels.cache.get(STATUS_CHANNEL_ID);
        if (!channel) return;

        const creator = await botClient.users.fetch(BOT_CREATOR_ID);

        lastCommandCount = commandCount;

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('status_check_commands')
                    .setLabel('📊 Check Commands')
                    .setStyle(ButtonStyle.Secondary)
            );

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🤖 Michelle Bot Status')
            .setDescription('**Status informasi bot real-time**')
            .addFields(
                { name: '🔄 Status', value: '🟢 **ONLINE**', inline: true },
                { name: '📊 Commands Used', value: `**${lastCommandCount}** commands`, inline: true },
                { name: '⏰ Online Since', value: botStartTimeFormatted, inline: false },
                { name: '⏱️ Uptime', value: formatUptime(), inline: true }
            )
            .setFooter({ 
                text: `Bot by ${creator.tag}`,
                iconURL: creator.displayAvatarURL({ extension: 'png', size: 64 })
            })
            .setTimestamp();

        try {
            const message = await channel.messages.fetch(statusMessageId);
            await message.edit({ 
                embeds: [embed],
                components: [row]
            });
        } catch (error) {
            const message = await channel.send({ 
                embeds: [embed],
                components: [row]
            });
            statusMessageId = message.id;
        }
    } catch (error) {}
}

let GL_LINK = 'https://www.mediafire.com/file/kpwtpyf11hlo5m6/GrowLauncher_v6.1.45.apk/file';

const commands = [
    new SlashCommandBuilder()
        .setName('gl')
        .setDescription('Dapatkan link download GrowLauncher'),

    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Tampilkan semua command yang tersedia untuk user'),

    new SlashCommandBuilder()
        .setName('autoreply1')
        .setDescription('Toggle auto-reply untuk user 914818330022535209')
        .addStringOption(option =>
            option.setName('status')
                .setDescription('ON atau OFF')
                .setRequired(true)
                .addChoices(
                    { name: 'ON', value: 'on' },
                    { name: 'OFF', value: 'off' }
                )),

    new SlashCommandBuilder()
        .setName('autoreply2')
        .setDescription('Toggle auto-reply untuk user 929200608190300212')
        .addStringOption(option =>
            option.setName('status')
                .setDescription('ON atau OFF')
                .setRequired(true)
                .addChoices(
                    { name: 'ON', value: 'on' },
                    { name: 'OFF', value: 'off' }
                )),

    new SlashCommandBuilder()
        .setName('docsgpai')
        .setDescription('Dokumentasi GrowPai Lua'),

    new SlashCommandBuilder()
        .setName('docsbhax')
        .setDescription('Dokumentasi Bothax'),

    new SlashCommandBuilder()
        .setName('docsgenta')
        .setDescription('Dokumentasi Genta Hax'),

    new SlashCommandBuilder()
        .setName('docsgl')
        .setDescription('Dokumentasi GrowLauncher'),

    new SlashCommandBuilder()
        .setName('growpai')
        .setDescription('Download GrowPai'),

    new SlashCommandBuilder()
        .setName('bothax')
        .setDescription('Download Bothax'),

    new SlashCommandBuilder()
        .setName('genta')
        .setDescription('Download Genta Hax'),

    new SlashCommandBuilder()
        .setName('loader')
        .setDescription('Download Loader untuk injector Windows'),

    new SlashCommandBuilder()
        .setName('broadcast')
        .setDescription('Kirim pesan ke channel tertentu (Admin only)')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel tujuan')
                .setRequired(true)
                .addChannelTypes(0)
        )
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Pesan yang akan dikirim')
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option.setName('embed')
                .setDescription('Kirim sebagai embed?')
                .setRequired(false)
        )
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
    try {
        console.log('🔄 Registering commands...');

        const commandNames = commands.map(cmd => cmd.name);
        const uniqueNames = [...new Set(commandNames)];

        if (commandNames.length !== uniqueNames.length) {
            console.error('❌ Ada duplicate command names!');
            return false;
        }

        const data = await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands.map(cmd => cmd.toJSON()) }
        );
        console.log(`✅ Registered ${data.length} commands:`);
        data.forEach(cmd => console.log(`  - /${cmd.name}`));
        return true;
    } catch (error) {
        console.error('❌ Error registering commands:', error.message);
        return false;
    }
}

function isAdmin(member) {
    if (!member) return false;
    const hasAdminRole = member.roles.cache.some(role => 
        ADMIN_COMMAND_ROLES.includes(role.id)
    );
    const hasAdminPerm = member.permissions.has(PermissionsBitField.Flags.Administrator);
    return hasAdminRole || hasAdminPerm || member.id === member.guild.ownerId;
}

function checkChannel(interaction, allowedChannelId, commandName) {
    if (interaction.channel.id !== allowedChannelId) {
        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Wrong Channel!')
            .setDescription(`Command **/${commandName}** can only be used in <#${allowedChannelId}>`)
            .addFields(
                { name: 'Correct Channel', value: `<#${allowedChannelId}>`, inline: true },
                { name: 'Current Channel', value: `<#${interaction.channel.id}>`, inline: true }
            )
            .setFooter({ text: 'Bot by @mi._chel' })
            .setTimestamp();

        interaction.reply({ embeds: [embed], ephemeral: true });
        return false;
    }
    return true;
}

async function createCheckCommandsEmbed(userTag) {
    const embed = new EmbedBuilder()
        .setColor(0x7289DA)
        .setTitle('📚 All Available Commands')
        .setDescription('**Daftar semua command yang tersedia di Michelle Bot:**')
        .addFields(
            { 
                name: '🎮 **Download Commands**', 
                value: [
                    '`/gl` - Download GrowLauncher',
                    '`/growpai` - Download GrowPai',
                    '`/bothax` - Download Bothax',
                    '`/genta` - Download Genta Hax',
                    '`/loader` - Download Loader untuk injector Windows'
                ].join('\n'),
                inline: false
            },
            { 
                name: '📖 **Documentation Commands**', 
                value: [
                    '`/docsgpai` - Dokumentasi GrowPai Lua',
                    '`/docsbhax` - Dokumentasi Bothax',
                    '`/docsgenta` - Dokumentasi Genta Hax',
                    '`/docsgl` - Dokumentasi GrowLauncher'
                ].join('\n'),
                inline: false
            }
        )
        .setFooter(await getFooterWithAvatar(userTag))
        .setTimestamp();

    return embed;
}

// ===== BOT CLIENT EVENTS =====
botClient.once('ready', async () => {
    console.log(`🤖 ${botClient.user.tag} is online!`);
    botStartTime = Date.now();
    botStartTimeFormatted = formatDateWIB();

    await registerCommands();

    botClient.user.setPresence({
        activities: [{ name: '⠀', type: ActivityType.Custom }],
        status: 'dnd'
    });

    setInterval(() => {
        updateStatusEmbed();
        lastStatusUpdate = Date.now();
    }, STATUS_UPDATE_INTERVAL);

    await updateStatusEmbed();
    lastStatusUpdate = Date.now();

    console.log('✅ Bot ready!');
});

// ===== INTERACTION HANDLER =====
botClient.on('interactionCreate', async interaction => {
    // BUTTON HANDLER
    if (interaction.isButton()) {
        const { customId } = interaction;

        if (checkCommandSpam(interaction.user.id)) {
            return interaction.reply({ 
                content: `⛔ Anda diblokir sementara karena spam. Coba lagi dalam ${BLOCK_DURATION/1000} detik.`,
                flags: 64
            });
        }

        if (customId === 'status_check_commands') {
            const embed = await createCheckCommandsEmbed(interaction.user.tag);
            await interaction.reply({ embeds: [embed], flags: 64 });
            return;
        }

        if (customId === 'bothax_android') {
            const embed = new EmbedBuilder()
                .setColor(0x9B59B6)
                .setTitle('📱 Bothax Android')
                .setDescription('Download link for Bothax Android version')
                .addFields(
                    { name: '📥 Download Link', value: '[BINTERNAL v5.42 APK](https://www.mediafire.com/file/mgzdc7byop7xo64/B%2527INTERNAL_v5.42_r2_%2528key_system%2529.dll/file)', inline: false },
                    { name: '🔄 Version', value: '5.42', inline: true },
                    { name: '📱 Platform', value: 'Android', inline: true },
                    { name: '🔑 Key Required', value: 'key: updating', inline: false }
                )
                .setFooter(await getGeneralFooter())
                .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: 64 });
        } 
        else if (customId === 'bothax_windows') {
            const embed = new EmbedBuilder()
                .setColor(0x9B59B6)
                .setTitle('💻 Bothax Windows')
                .setDescription('Download link for Bothax Windows version\n**Don\'t forget to download the Loader!**')
                .addFields(
                    { name: '📥 Download Link', value: '[BINTERNAL v5.42 DLL](https://www.mediafire.com/file/mgzdc7byop7xo64/B_INTERNAL_v5.42_r2_%2528key_system%2529.dll/file)', inline: false },
                    { name: '🔄 Version', value: '5.42', inline: true },
                    { name: '💻 Platform', value: 'Windows', inline: true },
                    { name: '⚠️ Reminder', value: 'You need Loader to use this! Use `/loader`', inline: false },
                    { name: '🔑 Key Required', value: 'key: updating', inline: false }
                )
                .setFooter(await getGeneralFooter())
                .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: 64 });
        }
        else if (customId === 'genta_android') {
            const embed = new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle('📱 Genta Hax Android')
                .setDescription('Download link for Genta Hax Android version')
                .addFields(
                    { name: '📥 Download Link', value: '[GENTAHAX v5.42 APK](https://www.mediafire.com/file/mfz9lbwxwuqypfe/GENTAHAX_v5.42_-_Patch_2.0_UNIVERSAL.apk/file)', inline: false },
                    { name: '🔄 Version', value: '5.42', inline: true },
                    { name: '📱 Platform', value: 'Android', inline: true },
                    { name: '✨ Features', value: 'Patch 2.0 UNIVERSAL', inline: true },
                    { name: '🔑 Key Required', value: 'You need a key to use this! Buy key at <#1468312617071415418>', inline: false }
                )
                .setFooter(await getGeneralFooter())
                .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: 64 });
        }
        else if (customId === 'genta_windows') {
            const embed = new EmbedBuilder()
                .setColor(0xE74C3C)
                .setTitle('💻 Genta Hax Windows')
                .setDescription('Download link for Genta Hax Windows version\n**Don\'t forget to download the Loader!**')
                .addFields(
                    { name: '📥 Download Link', value: '[GENTAHAX v5.42 DLL](https://www.mediafire.com/file/jo1cwehahofsr8a/GENTAHAX_-_GTInternal.dll/file)', inline: false },
                    { name: '🔄 Version', value: '5.42', inline: true },
                    { name: '💻 Platform', value: 'Windows', inline: true },
                    { name: '⚠️ Reminder', value: 'You need Loader to use this! Use `/loader`', inline: false },
                    { name: '🔑 Key Required', value: 'You need a key to use this! Buy key at <#1468312617071415418>', inline: false }
                )
                .setFooter(await getGeneralFooter())
                .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: 64 });
        }
        return;
    }

    // COMMAND HANDLER
    if (!interaction.isCommand()) return;

    const { commandName, options, channel, member, user } = interaction;

    if (!user || !member) return;

    if (isUserBlocked(user.id)) {
        const blockData = blockedUsers.get(user.id);
        const timeLeft = Math.ceil((blockData.blockUntil - Date.now()) / 1000);

        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('⛔ Anda Diblokir Sementara')
            .setDescription(`Anda tidak dapat menggunakan command untuk sementara waktu.`)
            .addFields(
                { name: 'Alasan', value: blockData.reason, inline: false },
                { name: 'Sisa Waktu', value: `${timeLeft} detik`, inline: true },
                { name: 'Diblokir Pada', value: new Date(blockData.blockedAt).toLocaleTimeString('id-ID'), inline: true }
            )
            .setFooter(await getFooterWithAvatar(user.tag))
            .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (checkCommandSpam(user.id)) {
        return interaction.reply({ 
            content: `⛔ Terlalu banyak command dalam waktu singkat. Tunggu ${BLOCK_DURATION/1000} detik.`,
            flags: 64
        });
    }

    commandCount++;

    // ===== HELP COMMAND =====
    if (commandName === 'help') {
        const isUserAdmin = isAdmin(member);
        const embed = await createCheckCommandsEmbed(user.tag);
        await interaction.reply({ embeds: [embed], ephemeral: !isUserAdmin });
    }

    // ===== GL COMMAND =====
    else if (commandName === 'gl') {
        if (!checkChannel(interaction, GL_CHANNEL_ID, 'gl')) return;
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🎮 GrowLauncher 5.39')
            .setDescription('**Latest GrowLauncher download link:**')
            .addFields(
                { name: '📥 Direct Download', value: `[Download Here](${GL_LINK})`, inline: true },
                { name: '🔄 Version', value: '5.39 (can spoof to 5.41)', inline: true }
            )
            .setFooter(await getFooterWithAvatar(user.tag))
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }

    // ===== AUTOREPLY COMMANDS =====
    else if (commandName === 'autoreply1') {
        if (user.id !== SPECIAL_USER_ID) {
            return interaction.reply({ 
                content: '❌ Hanya <@914818330022535209> yang dapat menggunakan command ini!',
                ephemeral: true
            });
        }
        const status = options.getString('status');
        const oldStatus = autoReplyUser1;
        autoReplyUser1 = (status === 'on');
        const embed = new EmbedBuilder()
            .setColor(status === 'on' ? 0x00FF00 : 0xFFFF00)
            .setTitle('⚙️ Auto-Reply User 1')
            .setDescription(`Auto-reply untuk <@${SPECIAL_USER_ID}> telah **${status === 'on' ? 'DIAKTIFKAN' : 'DINONAKTIFKAN'}**`)
            .addFields(
                { name: '👤 Diubah Oleh', value: `<@${user.id}> (${user.tag})`, inline: true },
                { name: '🎯 Target User', value: `<@${SPECIAL_USER_ID}>`, inline: true },
                { name: '🔧 Status', value: status === 'on' ? '🟢 **AKTIF**' : '🟡 **NONAKTIF**', inline: true },
                { name: '📊 Status Sebelumnya', value: oldStatus ? '🟢 AKTIF' : '🟡 NONAKTIF', inline: true }
            )
            .setFooter(await getGeneralFooter())
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'autoreply2') {
        if (user.id !== BOT_CREATOR_ID) {
            return interaction.reply({ 
                content: '❌ Hanya <@929200608190300212> yang dapat menggunakan command ini!',
                ephemeral: true
            });
        }
        const status = options.getString('status');
        const oldStatus = autoReplyUser2;
        autoReplyUser2 = (status === 'on');
        const embed = new EmbedBuilder()
            .setColor(status === 'on' ? 0x00FF00 : 0xFFFF00)
            .setTitle('⚙️ Auto-Reply User 2')
            .setDescription(`Auto-reply untuk <@${BOT_CREATOR_ID}> telah **${status === 'on' ? 'DIAKTIFKAN' : 'DINONAKTIFKAN'}**`)
            .addFields(
                { name: '👤 Diubah Oleh', value: `<@${user.id}> (${user.tag})`, inline: true },
                { name: '🎯 Target User', value: `<@${BOT_CREATOR_ID}>`, inline: true },
                { name: '🔧 Status', value: status === 'on' ? '🟢 **AKTIF**' : '🟡 **NONAKTIF**', inline: true },
                { name: '📊 Status Sebelumnya', value: oldStatus ? '🟢 AKTIF' : '🟡 NONAKTIF', inline: true }
            )
            .setFooter(await getGeneralFooter())
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }

    // ===== DOCUMENTATION COMMANDS =====
    else if (commandName === 'docsgpai') {
        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('📚 GrowPai Lua Documentation')
            .setDescription('Official documentation for GrowPai Lua scripting')
            .addFields(
                { name: '📖 GitHub Repository', value: 'https://github.com/0x0FFFF/luadocs-me/blob/main/LuaDocs.md', inline: false }
            )
            .setFooter(await getFooterWithAvatar(user.tag))
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'docsbhax') {
        const embed = new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle('📚 Bothax Documentation')
            .setDescription('Official documentation for Bothax')
            .addFields(
                { name: '📖 GitHub Repository', value: 'https://github.com/dravenox/bothax', inline: false }
            )
            .setFooter(await getFooterWithAvatar(user.tag))
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'docsgenta') {
        const embed = new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle('📚 Genta Hax Documentation')
            .setDescription('Official documentation for Genta Hax')
            .addFields(
                { name: '📖 GitHub Repository', value: 'https://github.com/GENTA7740/GENTA-HAX-DOCS', inline: false }
            )
            .setFooter(await getFooterWithAvatar(user.tag))
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'docsgl') {
        const embed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle('📚 GrowLauncher Documentation')
            .setDescription('Official documentation for GrowLauncher')
            .addFields(
                { name: '📖 GitHub Repository', value: 'https://github.com/IniEyyy/Growlauncher-Documentation', inline: false }
            )
            .setFooter(await getFooterWithAvatar(user.tag))
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }

    // ===== DOWNLOAD COMMANDS =====
    else if (commandName === 'growpai') {
        const embed = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle('🎮 GrowPai Download')
            .setDescription('Download the latest version of GrowPai')
            .addFields(
                { name: '📥 Direct Download', value: '[Download GrowPai](https://cdn.growpai.site/growpai/Growpai_5.42_02042026.zip)', inline: false },
                { name: '🔄 Version', value: '5.42', inline: true },
                { name: '📅 Updated', value: '02/04/2026', inline: true }
            )
            .setFooter(await getFooterWithAvatar(user.tag))
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'bothax') {
        if (!checkChannel(interaction, GL_CHANNEL_ID, 'bothax')) return;
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('bothax_android')
                    .setLabel('Android APK')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('bothax_windows')
                    .setLabel('Windows DLL')
                    .setStyle(ButtonStyle.Success)
            );
        const embed = new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle('🎮 Bothax Download')
            .setDescription('Choose your platform to download Bothax')
            .addFields(
                { name: '📱 Android', value: 'BINTERNAL v5.42 APK', inline: true },
                { name: '💻 Windows', value: 'BINTERNAL v5.42 DLL', inline: true },
                { name: '🔄 Version', value: '5.42', inline: true },
                { name: '⚠️ Important', value: 'You need a key to use this! Buy key at <#1468312617071415418>', inline: false }
            )
            .setFooter(await getGeneralFooter())
            .setTimestamp();
        await interaction.reply({ embeds: [embed], components: [row] });
    }

    else if (commandName === 'genta') {
        if (!checkChannel(interaction, GL_CHANNEL_ID, 'genta')) return;
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('genta_android')
                    .setLabel('Android APK')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('genta_windows')
                    .setLabel('Windows DLL')
                    .setStyle(ButtonStyle.Success)
            );
        const embed = new EmbedBuilder()
            .setColor(0xE74C3C)
            .setTitle('🎮 Genta Hax Download')
            .setDescription('Choose your platform to download Genta Hax')
            .addFields(
                { name: '📱 Android', value: 'GENTAHAX v5.42 Universal APK', inline: true },
                { name: '💻 Windows', value: 'GENTAHAX v5.42 DLL', inline: true },
                { name: '🔄 Version', value: '5.42', inline: true },
                { name: '⚠️ Important', value: 'You need a key to use this! Buy key at <#1468312617071415418>', inline: false }
            )
            .setFooter(await getGeneralFooter())
            .setTimestamp();
        await interaction.reply({ embeds: [embed], components: [row] });
    }

    else if (commandName === 'loader') {
        if (!checkChannel(interaction, GL_CHANNEL_ID, 'loader')) return;
        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('⚙️ Loader for Windows Injector')
            .setDescription('**IMPORTANT:** You need this loader to use Windows injectors (Bothax/Genta Hax)')
            .addFields(
                { name: '📥 Download Link', value: '[Download Loader v4](https://cdn.discordapp.com/attachments/1076792846780203088/1396047324848853103/Loader_v4.exe?ex=6985a763&is=698455e3&hm=881cecee315865179d66f740695b4ea887acf59eb527f34247a39126f0bcc16f&)', inline: false },
                { name: 'ℹ️ Usage', value: 'Required for Bothax/Genta Hax Windows version', inline: true },
                { name: '🔧 Version', value: 'v4', inline: true },
                { name: '⚠️ Reminder', value: 'You still need a key for Bothax/Genta Hax! Buy key at <#1468312617071415418>', inline: false }
            )
            .setFooter(await getFooterWithAvatar(user.tag))
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
    }

    // ===== BROADCAST COMMAND =====
    else if (commandName === 'broadcast') {
        if (!isAdmin(member)) {
            return interaction.reply({ 
                content: '❌ Hanya admin yang dapat menggunakan command ini!',
                ephemeral: true
            });
        }
        const channel = options.getChannel('channel');
        const messageContent = options.getString('message');
        const useEmbed = options.getBoolean('embed') || false;
        try {
            if (useEmbed) {
                const footerData = await getGeneralFooter();
                const embed = new EmbedBuilder()
                    .setColor(0x3498DB)
                    .setTitle('📢 Broadcast Message')
                    .setDescription(messageContent)
                    .setFooter({ 
                         text: footerData.text || 'Bot by @mi._chel',
                        iconURL: user.displayAvatarURL({ extension: 'png', size: 64 })
                    })
                    .setTimestamp();
                await channel.send({ embeds: [embed] });
            } else {
                await channel.send(messageContent);
            }
            const confirmEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Broadcast Berhasil')
                .setDescription(`Pesan telah dikirim ke ${channel}`)
                .addFields(
                    { name: '👤 Pengirim', value: `${user.tag}`, inline: true },
                    { name: '📝 Metode', value: useEmbed ? 'Embed' : 'Text', inline: true },
                    { name: '📊 Panjang Pesan', value: `${messageContent.length} karakter`, inline: true }
                )
                .setFooter({ text: 'Bot by @mi._chel' })
                .setTimestamp();
            await interaction.reply({ embeds: [confirmEmbed] });
        } catch (error) {
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Broadcast Gagal')
                .setDescription(`Gagal mengirim pesan ke ${channel}`)
                .addFields(
                    { name: 'Error', value: error.message.substring(0, 100), inline: false }
                )
                .setFooter({ text: 'Bot by @mi._chel' })
                .setTimestamp();
            await interaction.reply({ embeds: [errorEmbed], flags: 64 });
        }
    }
});

// ===== MESSAGE HANDLER =====
botClient.on('messageCreate', async message => {
    if (message.author.bot) return;

    // AUTO DELETE DI CHANNEL SCRIPT
    if (message.channel.id === SCRIPT_CHANNEL_ID) {
        if (message.interaction || message.type === 20) return;

        if (message.reference && message.reference.messageId) {
            try {
                const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                if (repliedMessage.interaction) return;
            } catch (error) {}
        }

        try {
            await message.delete();
        } catch (error) {}
        return;
    }

    // AUTO-REPLY SYSTEM
    const isBotMentioned = message.mentions.has(botClient.user.id);
    const isReplyToBot = message.reference && message.reference.messageId;

    if (isBotMentioned || isReplyToBot) {
        if (isReplyToBot) {
            try {
                const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
                if (repliedMessage.author.id !== botClient.user.id) {
                    return;
                }
            } catch (error) {
                return;
            }
        }

        const animeReply = getAnimeAutoReply();
        try {
            await message.reply({
                content: `${animeReply}`,
                allowedMentions: { repliedUser: true }
            });
        } catch (error) {
            await message.channel.send({
                content: `<@${message.author.id}>, ${animeReply}`
            });
        }
        return;
    }

    if (autoReplyUser1 && message.mentions.has(SPECIAL_USER_ID)) {
        if (!isRegularMember(message.member)) return;
        const userId = message.author.id;
        if (canReplyToUser1(userId)) {
            const autoReplyMessage = getUser1AutoReply();
            try {
                await message.reply({
                    content: `${autoReplyMessage}`,
                    allowedMentions: { repliedUser: true }
                });
            } catch (error) {
                await message.channel.send({
                    content: `<@${userId}>, ${autoReplyMessage}`
                });
            }
        }
        return;
    }

    if (autoReplyUser2 && message.mentions.has(BOT_CREATOR_ID)) {
        if (message.reference) return;
        await handleUser2Tag(message);
        return;
    }
});

// ===== MEMBER JOIN HANDLER =====
botClient.on('guildMemberAdd', async (member) => {
    const statusChannel = botClient.channels.cache.get(STATUS_CHANNEL_ID);
    if (!statusChannel) return;
    const message = await statusChannel.send({
        content: `<@${member.id}>`
    });
    setTimeout(() => {
        message.delete().catch(() => {});
    }, 500);
});

// ===== AUTO-LEAVE SERVER =====
const ALLOWED_GUILDS = ['1413397334578171917'];

botClient.on('guildCreate', async (guild) => {
    if (!ALLOWED_GUILDS.includes(guild.id)) {
        guild.leave().catch(() => {});
    }
});

// ===== USER CLIENT EVENTS =====
userClient.once('ready', () => {
    console.log(`👤 User client ${userClient.user.tag} is online!`);
    userClient.user.setPresence({
        status: 'idle',
        activities: []
    });
});

userClient.on('messageCreate', async (message) => {
    if (message.author.bot) return;
});

userClient.on('error', (error) => {
    console.error('❌ User client error:', error);
});

userClient.on('warn', (warning) => {
    console.warn('⚠️ User client warning:', warning);
});

// ===== ERROR HANDLING =====
botClient.on('error', error => {
    console.error('❌ Bot client error:', error);
});

botClient.on('warn', warning => {
    console.warn('⚠️ Bot client warning:', warning);
});

process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down bot...');
    const channel = botClient.channels.cache.get(STATUS_CHANNEL_ID);
    if (channel && statusMessageId) {
        try {
            const creator = await botClient.users.fetch(BOT_CREATOR_ID);
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🤖 Michelle Bot Status')
                .setDescription('**Bot is currently OFFLINE**')
                .addFields(
                    { name: '🔄 Status', value: '🔴 **OFFLINE**', inline: true },
                    { name: '📊 Final Command Count', value: `**${lastCommandCount}** commands`, inline: true },
                    { name: '⏰ Last Online', value: formatDateWIB(), inline: false },
                    { name: '⏱️ Total Uptime', value: formatUptime(), inline: true }
                )
                .setFooter({ 
                    text: `Bot by ${creator.tag} • Last updated`,
                    iconURL: creator.displayAvatarURL({ extension: 'png', size: 64 })
                })
                .setTimestamp();
            const message = await channel.messages.fetch(statusMessageId);
            await message.edit({ 
                embeds: [embed],
                components: []
            });
        } catch (error) {}
    }
    botClient.destroy();
    process.exit(0);
});

// ===== LOGIN =====
console.log('🔐 Connecting to Discord...');

botClient.login(TOKEN).catch(error => {
    console.error('❌ Failed to login bot client:', error);
    process.exit(1);
});
