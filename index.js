const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ]
});

// ===== KONFIGURASI =====
const TOKEN = process.env.DISCORD_TOKEN;
const PORT = process.env.PORT || 3000;
const CLIENT_ID = '1468634707658019072';

// Channel IDs
const GL_CHANNEL_ID = '1427420155738062922';  // Channel khusus GL
const COMMAND_CHANNEL_ID = '1421007323475738738'; // Channel untuk command /gl
const STICKY_CHANNEL_ID = '1413982358142718122';

// Admin Role IDs
const ADMIN_ROLES = [
    '1421010720304402443', // Role admin 1
    '1424421572520706169'  // Role admin 2
];

// Variabel untuk sticky note
let stickyMessageId = null;
let isUpdatingSticky = false; // Flag untuk mencegah infinite loop
let stickyUpdateTimeout = null; // Untuk debounce
let isBotDeletingSticky = false; // Flag untuk track jika bot yang menghapus

// Default GL Link (bisa diubah via command)
let GL_LINK = 'https://cdn.discordapp.com/attachments/901662125091606598/1451194928775303218/GrowLauncher_v6.1.45.apk?ex=69849218&is=69834098&hm=269c887a008fb523981bab81e3c8afaedb25d3d0f6ec01fa1c0dc45af581d6a8&';

// ===== FITUR ANTI TAG =====
let antiTagEnabled = false; // Fitur anti-tag default mati
const tagWarnings = new Map(); // { userId: { count: number, lastWarning: Date } }
const MAX_WARNINGS = 3; // Maksimal peringatan sebelum mute
const MUTE_DURATION = 10; // Durasi mute dalam detik
// =======================

// Slash Commands Definitions
const commands = [
    // User Commands
    new SlashCommandBuilder()
        .setName('gl')
        .setDescription('Dapatkan link download GrowLauncher'),
    
    // Admin Commands (hanya setlink dan toggle anti-tag)
    new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Command untuk admin')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setlink')
                .setDescription('Set link GrowLauncher baru')
                .addStringOption(option =>
                    option.setName('link')
                        .setDescription('Link baru untuk GrowLauncher')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('antitag')
                .setDescription('Toggle fitur anti-tag admin')
                .addStringOption(option =>
                    option.setName('status')
                        .setDescription('ON atau OFF')
                        .setRequired(true)
                        .addChoices(
                            { name: 'ON', value: 'on' },
                            { name: 'OFF', value: 'off' }
                        ))),
    
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Tampilkan semua command yang tersedia')
];

// Register Slash Commands
const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
    try {
        console.log('🔄 Mendaftarkan slash commands...');
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands.map(cmd => cmd.toJSON()) }
        );
        console.log('✅ Slash commands terdaftar!');
    } catch (error) {
        console.error('❌ Gagal mendaftarkan commands:', error);
    }
}

// Helper: Cek apakah user adalah admin
function isAdmin(member) {
    if (!member) return false;
    
    // Cek jika user punya role admin
    const hasAdminRole = member.roles.cache.some(role => 
        ADMIN_ROLES.includes(role.id)
    );
    
    // Cek jika user adalah server owner atau administrator
    const hasAdminPerm = member.permissions.has(PermissionsBitField.Flags.Administrator);
    
    return hasAdminRole || hasAdminPerm || member.id === member.guild.ownerId;
}

// Helper: Cek apakah user memiliki role admin
function hasAdminRole(user) {
    return ADMIN_ROLES.some(roleId => user.roles.cache.has(roleId));
}

// Helper: Mute member
async function muteMember(member, durationSeconds) {
    try {
        await member.timeout(durationSeconds * 1000, 'Terlalu banyak tag admin');
        console.log(`🔇 Muted ${member.user.tag} for ${durationSeconds} seconds`);
    } catch (error) {
        console.error('Gagal mute member:', error);
    }
}

// ===== FUNGSI STICKY NOTE =====
async function postStickyMessage() {
    // Jika sedang proses update, skip
    if (isUpdatingSticky) {
        console.log('📌 Skipping sticky update - already in progress');
        return false;
    }
    
    isUpdatingSticky = true;
    isBotDeletingSticky = true; // Tandai bahwa bot akan menghapus
    
    try {
        const channel = client.channels.cache.get(STICKY_CHANNEL_ID);
        if (!channel) {
            console.log('❌ Sticky channel not found');
            isUpdatingSticky = false;
            isBotDeletingSticky = false;
            return false;
        }
        
        // Hapus message lama jika ada
        if (stickyMessageId) {
            try {
                const oldMessage = await channel.messages.fetch(stickyMessageId);
                // Cek apakah oldMessage adalah milik bot kita
                if (oldMessage.author.id === client.user.id) {
                    await oldMessage.delete();
                    console.log(`📌 Deleted old sticky message (ID: ${stickyMessageId})`);
                } else {
                    console.log(`📌 Old message is not from bot, skipping delete`);
                }
            } catch (error) {
                // Message mungkin sudah dihapus
                if (error.code === 10008) { // Unknown Message
                    console.log('📌 Old sticky message already deleted');
                } else {
                    console.log(`📌 Error deleting old sticky: ${error.message}`);
                }
            }
        }
        
        // Kirim message baru
        const stickyContent = "📌 **Sticky Note**\nGrowlauncher at <#1427420155738062922> and type `/gl`";
        const message = await channel.send(stickyContent);
        stickyMessageId = message.id;
        
        console.log(`📌 New sticky note posted in #${channel.name} (ID: ${message.id})`);
        return true;
        
    } catch (error) {
        console.error('❌ Error posting sticky:', error.message);
        return false;
    } finally {
        // Reset flag setelah selesai
        setTimeout(() => {
            isUpdatingSticky = false;
            isBotDeletingSticky = false;
        }, 1000);
    }
}
// =============================

// Bot Ready
client.once('ready', async () => {
    console.log('='.repeat(50));
    console.log(`🤖 ${client.user.tag} sudah online!`);
    console.log(`📌 Bot ID: ${client.user.id}`);
    console.log(`🎯 GL Channel: ${GL_CHANNEL_ID}`);
    console.log(`🎯 Command Channel: ${COMMAND_CHANNEL_ID}`);
    console.log(`📌 Sticky Channel: ${STICKY_CHANNEL_ID}`);
    console.log(`👑 Admin Roles: ${ADMIN_ROLES.join(', ')}`);
    console.log(`🛡️ Anti-Tag Feature: ${antiTagEnabled ? 'ON' : 'OFF'}`);
    console.log('='.repeat(50));
    
    // Cek apakah semua channel ada
    const glChannel = client.channels.cache.get(GL_CHANNEL_ID);
    const stickyChannel = client.channels.cache.get(STICKY_CHANNEL_ID);
    
    if (!glChannel) console.log('⚠️  GL Channel not found!');
    if (!stickyChannel) console.log('⚠️  Sticky Channel not found!');
    
    await registerCommands();
    
    // Set status
    client.user.setPresence({
        activities: [{ name: 'Helper Server ZaXploit', type: 0 }],
        status: 'Do Not Disturb'
    });
    
    // Post sticky note setelah bot ready (tunggu 3 detik)
    setTimeout(() => {
        if (stickyChannel) {
            postStickyMessage();
        } else {
            console.log('❌ Cannot post sticky note - channel not found');
        }
    }, 3000);
});

// Handle Slash Commands
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    
    const { commandName, options, channel, member } = interaction;
    
    // Log command usage
    console.log(`[${new Date().toLocaleTimeString()}] ${interaction.user.tag} used /${commandName} in #${channel.name}`);
    
    // ===== COMMAND: /gl =====
    if (commandName === 'gl') {
        // Cek apakah di channel yang benar
        if (channel.id !== GL_CHANNEL_ID) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Channel Salah!')
                .setDescription(`Command **/gl** hanya bisa digunakan di <#${GL_CHANNEL_ID}>`)
                .addFields(
                    { name: 'Channel yang Benar', value: `<#${GL_CHANNEL_ID}>`, inline: true },
                    { name: 'Channel Sekarang', value: `<#${channel.id}>`, inline: true }
                )
                .setFooter({ text: 'Pindah ke channel yang benar untuk menggunakan command ini' })
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        // Kirim embed dengan link
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🎮 GrowLauncher v6.1.45')
            .setDescription('**Link download GrowLauncher terbaru:**')
            .addFields(
                { name: '📥 Direct Download', value: `[Download Disini](${GL_LINK})`, inline: true },
                { name: '📁 File Size', value: '~150 MB', inline: true },
                { name: '🔄 Version', value: 'v6.1.45', inline: true },
                { name: '⚠️ Important', value: 'Matikan antivirus sebelum install!', inline: false }
            )
            .setImage('https://cdn.discordapp.com/attachments/901662125091606598/1451194928775303218/GrowLauncher_v6.1.45.apk?ex=69849218&is=69834098&hm=269c887a008fb523981bab81e3c8afaedb25d3d0f6ec01fa1c0dc45af581d6a8&')
            .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    }
    
    // ===== COMMAND: /admin ===== (Hanya untuk admin)
    else if (commandName === 'admin') {
        // Cek apakah user adalah admin
        if (!isAdmin(member)) {
            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Akses Ditolak!')
                .setDescription('Anda tidak memiliki permission untuk menggunakan command admin.')
                .addFields(
                    { name: 'Required Roles', value: ADMIN_ROLES.map(id => `<@&${id}>`).join(', ') },
                    { name: 'Your Roles', value: member.roles.cache.map(r => r.name).join(', ') || 'None' }
                )
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
        const subcommand = options.getSubcommand();
        
        // Subcommand: setlink
        if (subcommand === 'setlink') {
            const newLink = options.getString('link');
            
            // Validasi link
            if (!newLink.startsWith('http')) {
                return interaction.reply({ 
                    content: '❌ Link harus dimulai dengan http:// atau https://', 
                    ephemeral: true 
                });
            }
            
            // Simpan link lama untuk log
            const oldLink = GL_LINK;
            GL_LINK = newLink;
            
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Link Diperbarui!')
                .setDescription('Link GrowLauncher berhasil diupdate.')
                .addFields(
                    { name: 'Link Lama', value: `[Klik disini](${oldLink})`, inline: false },
                    { name: 'Link Baru', value: `[Klik disini](${newLink})`, inline: false },
                    { name: 'Updated By', value: interaction.user.tag, inline: true },
                    { name: 'Time', value: new Date().toLocaleString(), inline: true }
                )
                .setFooter({ text: 'Link akan otomatis digunakan untuk command /gl' })
                .setTimestamp();
            
            await interaction.reply({ embeds: [embed], ephemeral: true });
            
            // Log ke console
            console.log(`🔗 Link updated by ${interaction.user.tag}`);
            console.log(`Old: ${oldLink.substring(0, 50)}...`);
            console.log(`New: ${newLink.substring(0, 50)}...`);
        }
        
        // Subcommand: antitag
        else if (subcommand === 'antitag') {
            const status = options.getString('status');
            
            if (status === 'on') {
                antiTagEnabled = true;
                // Clear existing warnings saat fitur diaktifkan
                tagWarnings.clear();
                
                const embed = new EmbedBuilder()
                    .setColor(0x00FF00)
                    .setTitle('✅ Fitur Anti-Tag Diaktifkan!')
                    .setDescription('Fitur anti-tag admin sekarang AKTIF.')
                    .addFields(
                        { name: 'Status', value: '🟢 **ON**', inline: true },
                        { name: 'Max Warnings', value: `${MAX_WARNINGS}x`, inline: true },
                        { name: 'Mute Duration', value: `${MUTE_DURATION} detik`, inline: true },
                        { name: 'Dibuat oleh', value: interaction.user.tag, inline: false }
                    )
                    .setFooter({ text: 'Member yang tag admin akan mendapat peringatan' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
                console.log(`🛡️ Anti-tag feature ENABLED by ${interaction.user.tag}`);
                
                // Kirim pesan status ke COMMAND_CHANNEL_ID
                try {
                    const commandChannel = client.channels.cache.get(COMMAND_CHANNEL_ID);
                    if (commandChannel) {
                        await commandChannel.send({
                            content: `🛡️ **Status Anti-Tag:** **AKTIF**\nFitur anti-tag admin telah diaktifkan oleh @${interaction.user.tag}`
                        });
                    }
                } catch (error) {
                    console.error('Gagal kirim status anti-tag:', error);
                }
                
            } else {
                antiTagEnabled = false;
                // Clear warnings saat fitur dimatikan
                tagWarnings.clear();
                
                const embed = new EmbedBuilder()
                    .setColor(0xFFA500)
                    .setTitle('⏸️ Fitur Anti-Tag Dimatikan!')
                    .setDescription('Fitur anti-tag admin sekarang NON-AKTIF.')
                    .addFields(
                        { name: 'Status', value: '🔴 **OFF**', inline: true },
                        { name: 'Warning Data', value: 'Semua data peringatan telah direset', inline: true },
                        { name: 'Dibuat oleh', value: interaction.user.tag, inline: false }
                    )
                    .setFooter({ text: 'Tag admin tidak akan mendapat peringatan' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [embed], ephemeral: true });
                console.log(`🛡️ Anti-tag feature DISABLED by ${interaction.user.tag}`);
                
                // Kirim pesan status ke COMMAND_CHANNEL_ID
                try {
                    const commandChannel = client.channels.cache.get(COMMAND_CHANNEL_ID);
                    if (commandChannel) {
                        await commandChannel.send({
                            content: `🛡️ **Status Anti-Tag:** **NON-AKTIF**\nFitur anti-tag admin telah dimatikan oleh ${interaction.user.tag}`
                        });
                    }
                } catch (error) {
                    console.error('Gagal kirim status anti-tag:', error);
                }
            }
        }
    }
    
    // ===== COMMAND: /help =====
    else if (commandName === 'help') {
        const embed = new EmbedBuilder()
            .setColor(0x7289DA)
            .setTitle('🆘 Bantuan - GrowLauncher Bot')
            .setDescription('**Daftar command yang tersedia:**')
            .addFields(
                { 
                    name: '🎮 **User Commands**', 
                    value: '```\n/gl - Dapatkan link download GrowLauncher\n/help - Tampilkan bantuan ini\n```' 
                },
                { 
                    name: '👑 **Admin Commands**', 
                    value: '```\n/admin setlink [link] - Update link GL\n/admin antitag [on/off] - Toggle anti-tag feature\n```' 
                }
            )
            .addFields(
                { 
                    name: '📌 **Channel Rules**', 
                    value: `• **/gl** hanya di <#${GL_CHANNEL_ID}>\n• Jangan share link di channel lain` 
                }
            )
            .setFooter({ text: `Bot ini dibuat oleh user @mi._chel  • ${client.user.tag}` })
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
});

// ===== FITUR ANTI TAG ADMIN =====
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    
    // ===== STICKY NOTE LOGIC =====
    // Jika ada pesan baru di channel sticky, update sticky note
    if (message.channel.id === STICKY_CHANNEL_ID) {
        // Skip jika pesan adalah slash command
        if (message.content.startsWith('/')) return;
        
        console.log(`📌 New message from ${message.author.tag} in sticky channel`);
        
        // Gunakan debounce untuk mencegah spam update
        if (stickyUpdateTimeout) {
            clearTimeout(stickyUpdateTimeout);
        }
        
        // Delay 2 detik sebelum update (memberi waktu jika ada multiple messages)
        stickyUpdateTimeout = setTimeout(async () => {
            try {
                console.log(`📌 Updating sticky note...`);
                await postStickyMessage();
            } catch (error) {
                console.error('Error updating sticky note:', error);
            }
            stickyUpdateTimeout = null;
        }, 2000); // Delay 2 detik
        
        // STOP di sini - jangan lanjut ke anti-tag logic untuk pesan di sticky channel
        return;
    }
    
    // ===== ANTI TAG LOGIC =====
    // Skip jika fitur anti-tag tidak aktif
    if (!antiTagEnabled) return;
    
    // Skip jika pengirim adalah admin
    if (isAdmin(message.member)) return;
    
    // Cek apakah pesan mengandung tag/mention
    if (message.mentions.users.size > 0) {
        // Cek apakah ada admin yang di-tag
        const mentionedAdmins = message.mentions.members.filter(member => 
            hasAdminRole(member)
        );
        
        if (mentionedAdmins.size > 0) {
            const userId = message.author.id;
            const now = Date.now();
            const FIVE_MINUTES = 5 * 60 * 1000; // 5 menit dalam milidetik
            
            // Dapatkan atau buat data warning untuk user
            let userWarnings = tagWarnings.get(userId);
            if (!userWarnings) {
                userWarnings = { count: 0, lastWarning: 0 };
                tagWarnings.set(userId, userWarnings);
            }
            
            // Reset count jika lebih dari 5 menit dari warning terakhir
            if (now - userWarnings.lastWarning > FIVE_MINUTES) {
                userWarnings.count = 0;
            }
            
            // Tambah warning count
            userWarnings.count++;
            userWarnings.lastWarning = now;
            
            console.log(`⚠️ ${message.author.tag} tagged admin. Warning: ${userWarnings.count}/${MAX_WARNINGS}`);
            
            // Kirim peringatan
            const warningEmbed = new EmbedBuilder()
                .setColor(userWarnings.count >= MAX_WARNINGS ? 0xFF0000 : 0xFFA500)
                .setTitle('⚠️ Jangan Tag Admin!')
                .setDescription(`<@${userId}> jangan tag admin, sabar!`)
                .addFields(
                    { name: 'Peringatan', value: `${userWarnings.count}/${MAX_WARNINGS}`, inline: true },
                    { name: 'Aksi', value: userWarnings.count >= MAX_WARNINGS ? '⏳ MUTE 10 detik' : '⚠️ Warning', inline: true }
                )
                .setFooter({ text: `Fitur anti-tag ${antiTagEnabled ? 'AKTIF' : 'NON-AKTIF'}` })
                .setTimestamp();
            
            // Kirim warning (TIDAK hapus pesan asli)
            try {
                await message.channel.send({ 
                    content: `<@${userId}>`, 
                    embeds: [warningEmbed] 
                });
                
            } catch (error) {
                console.error('Error handling tag warning:', error);
            }
            
            // Jika sudah mencapai batas maksimal, mute user
            if (userWarnings.count >= MAX_WARNINGS) {
                // Reset count untuk user ini
                tagWarnings.delete(userId);
                
                // Mute user
                await muteMember(message.member, MUTE_DURATION);
                
                // Kirim notifikasi mute
                const muteEmbed = new EmbedBuilder()
                    .setColor(0xFF0000)
                    .setTitle('🔇 User Di-Mute!')
                    .setDescription(`<@${userId}> telah di-mute selama ${MUTE_DURATION} detik`)
                    .addFields(
                        { name: 'Alasan', value: 'Terlalu banyak tag admin', inline: true },
                        { name: 'Durasi', value: `${MUTE_DURATION} detik`, inline: true },
                        { name: 'Peringatan', value: `Sudah ${MAX_WARNINGS}x peringatan`, inline: true }
                    )
                    .setTimestamp();
                
                await message.channel.send({ embeds: [muteEmbed] });
                
                console.log(`🔇 Muted ${message.author.tag} for ${MUTE_DURATION} seconds`);
            }
        }
    }
});

// ===== HANDLER STICKY NOTE JIKA DIHAPUS =====
client.on('messageDelete', async (message) => {
    // Cek jika pesan yang dihapus adalah sticky note
    if (message.channel.id === STICKY_CHANNEL_ID && message.id === stickyMessageId) {
        // Skip jika bot yang menghapus (saat update)
        if (isBotDeletingSticky) {
            console.log('📌 Sticky note deleted by bot (during update), skipping repost');
            return;
        }
        
        console.log('📌 Sticky note was deleted by user, waiting 5 seconds...');
        
        // Clear existing timeout jika ada
        if (stickyUpdateTimeout) {
            clearTimeout(stickyUpdateTimeout);
        }
        
        // Delay 5 detik sebelum repost
        stickyUpdateTimeout = setTimeout(() => {
            console.log('📌 Reposting sticky note after user deletion...');
            postStickyMessage();
            stickyUpdateTimeout = null;
        }, 5000);
    }
});

// Error handling
client.on('error', error => console.error('Client error:', error));
client.on('warn', warning => console.warn('Client warning:', warning));

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🔄 Shutting down bot...');
    console.log(`Status anti-tag: ${antiTagEnabled ? 'ON' : 'OFF'}`);
    console.log(`Total warnings tracked: ${tagWarnings.size}`);
    console.log(`Sticky message ID: ${stickyMessageId}`);
    client.destroy();
    process.exit(0);
});

// Login
console.log('🔐 Connecting to Discord...');
client.login(TOKEN).catch(error => {
    console.error('❌ Login failed:', error.message);
    process.exit(1);
});

// Listen to PORT for Heroku
client.once('ready', () => {
    if (PORT) {
        const http = require('http');
        const server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Bot is running!');
        });
        server.listen(PORT, () => {
            console.log(`🌐 HTTP server listening on port ${PORT}`);
        });
    }
});