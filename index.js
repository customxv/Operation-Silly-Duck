const http = require('http');
http.createServer((req, res) => res.end('Bot is running!')).listen(process.env.PORT || 8080);
require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = '1449775322580123648';
const GUILD_ID = '1449765717942472868';

let startTime = Date.now();
const warnings = new Map(); // In-memory storage for warnings
const moderationLogs = []; // Store all moderation actions
const userProfiles = new Map(); // User profiles with XP, level, stats
const userTeams = new Map(); // Team storage
const dailyChallengeLog = new Map(); // Track daily challenge completion
const achievements = new Map(); // User achievements
const helpCommandUsed = new Set(); // Track which guilds have used help command
const appeals = new Map(); // User appeals for bans
const guildMemberCounts = new Map(); // Track member milestones
const raidMode = new Set(); // Guilds in raid mode
const bannedContent = [
  // Racial slurs and hate speech (filtered list)
  /n[i1]gg[a3]r|n[i1]gg[a3]h|n[i1]gg3r/gi,
  /f[a4]gg[o0]t|f[a4]gg1t/gi,
  /wh[i1]tey|cracker|honk[e3]y/gi,
  /sand n|towel head|camel jockey/gi,
  // NSFW keywords
  /\bp[o0rn]|xxx|sex tape|nudes|horny|onlyfans/gi,
  /b[o0]obs|ass|tits|c[o0]ck|pussy/gi
];

// Default user profile structure
function createUserProfile(userId) {
  return {
    userId: userId,
    xp: 0,
    level: 1,
    goals: 0,
    matches: 0,
    assists: 0,
    achievements: [],
    team: null,
    favoriteTeam: null,
    position: 'Midfielder',
    bio: 'Football Nation Member',
    joinedDate: new Date()
  };
}

// Function to get or create user profile
function getUserProfile(userId) {
  if (!userProfiles.has(userId)) {
    userProfiles.set(userId, createUserProfile(userId));
  }
  return userProfiles.get(userId);
}

// XP and leveling system
function addXP(userId, amount) {
  const profile = getUserProfile(userId);
  profile.xp += amount;
  const xpPerLevel = 1000;
  profile.level = Math.floor(profile.xp / xpPerLevel) + 1;
  return profile.level;
}

// Function to get bot-logs channel
async function getBotLogsChannel(guild) {
  return guild.channels.cache.find(channel => channel.name === 'bot-logs');
}

// Function to log moderation action
function logModerationAction(action) {
  moderationLogs.push({
    ...action,
    timestamp: new Date()
  });
}

// Function to send DM to user
async function sendModerationDM(user, title, reason, duration = null) {
  try {
    const dmEmbed = new EmbedBuilder()
      .setTitle(title)
      .addFields(
        { name: 'Reason', value: reason || 'No reason provided', inline: false }
      );
    if (duration) {
      dmEmbed.addFields({ name: 'Duration', value: duration, inline: false });
    }
    dmEmbed.setColor(0xff0000);
    await user.send({ embeds: [dmEmbed] });
  } catch (error) {
    console.log(`Could not DM ${user.tag}: ${error.message}`);
  }
}

const commands = [
  // Moderation Commands
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Remove a user from the server.')
    .addUserOption(option => option.setName('user').setDescription('The user to kick').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for kicking').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user permanently.')
    .addUserOption(option => option.setName('user').setDescription('The user to ban').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for banning').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Temporarily mute a user.')
    .addUserOption(option => option.setName('user').setDescription('The user to mute').setRequired(true))
    .addIntegerOption(option => option.setName('time').setDescription('Mute duration in minutes').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove mute role from a user.')
    .addUserOption(option => option.setName('user').setDescription('The user to unmute').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Record a warning for a user.')
    .addUserOption(option => option.setName('user').setDescription('The user to warn').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for warning').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Check the number of warnings a user has.')
    .addUserOption(option => option.setName('user').setDescription('The user to check').setRequired(true)),

  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete the last X messages in a channel.')
    .addIntegerOption(option => option.setName('amount').setDescription('Number of messages to delete').setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('nick')
    .setDescription('Change a member's nickname.')
    .addUserOption(option => option.setName('user').setDescription('The user to nickname').setRequired(true))
    .addStringOption(option => option.setName('nickname').setDescription('New nickname').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

  new SlashCommandBuilder()
    .setName('roleadd')
    .setDescription('Assign a role to a member.')
    .addUserOption(option => option.setName('user').setDescription('The user to assign role').setRequired(true))
    .addRoleOption(option => option.setName('role').setDescription('The role to assign').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('roleremove')
    .setDescription('Remove a role from a member.')
    .addUserOption(option => option.setName('user').setDescription('The user to remove role from').setRequired(true))
    .addRoleOption(option => option.setName('role').setDescription('The role to remove').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock a channel (no sending messages).')
    .addChannelOption(option => option.setName('channel').setDescription('The channel to lock').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock a previously locked channel.')
    .addChannelOption(option => option.setName('channel').setDescription('The channel to unlock').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set slowmode duration in a channel.')
    .addChannelOption(option => option.setName('channel').setDescription('The channel to set slowmode').setRequired(true))
    .addIntegerOption(option => option.setName('time').setDescription('Slowmode time in seconds').setRequired(true).setMinValue(0).setMaxValue(21600))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Send an announcement message to a channel.')
    .addChannelOption(option => option.setName('channel').setDescription('The channel to announce in').setRequired(true))
    .addStringOption(option => option.setName('message').setDescription('The announcement message').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // Utility Commands
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Show bot latency.'),

  new SlashCommandBuilder()
    .setName('uptime')
    .setDescription('Show bot uptime.'),

  new SlashCommandBuilder()
    .setName('botinfo')
    .setDescription('Show bot version, total commands, uptime.'),

  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Show server stats: members, roles, channels.'),

  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Display information about a user.')
    .addUserOption(option => option.setName('user').setDescription('The user to get info about').setRequired(false)),

  new SlashCommandBuilder()
    .setName('roles')
    .setDescription('List the roles of a user.')
    .addUserOption(option => option.setName('user').setDescription('The user to list roles for').setRequired(false)),

  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Show a user's avatar.')
    .addUserOption(option => option.setName('user').setDescription('The user to show avatar for').setRequired(false)),

  new SlashCommandBuilder()
    .setName('channelinfo')
    .setDescription('Show channel information.')
    .addChannelOption(option => option.setName('channel').setDescription('The channel to get info about').setRequired(false)),

  new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Return a link to invite the bot.'),

  new SlashCommandBuilder()
    .setName('randommember')
    .setDescription('Pick a random member from the server.'),

  new SlashCommandBuilder()
    .setName('countroles')
    .setDescription('Count members per role.'),

  new SlashCommandBuilder()
    .setName('vote')
    .setDescription('Create a simple reaction-based poll.')
    .addStringOption(option => option.setName('question').setDescription('The poll question').setRequired(true))
    .addStringOption(option => option.setName('options').setDescription('Poll options separated by commas').setRequired(true)),

  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Bot repeats a message in a channel.')
    .addStringOption(option => option.setName('message').setDescription('The message to repeat').setRequired(true)),

  new SlashCommandBuilder()
    .setName('serverbanner')
    .setDescription('Show the server banner if available.'),

  new SlashCommandBuilder()
    .setName('tempban')
    .setDescription('Temporarily ban a user.')
    .addUserOption(option => option.setName('user').setDescription('The user to ban').setRequired(true))
    .addIntegerOption(option => option.setName('hours').setDescription('Ban duration in hours').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for ban').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription('Clear all warnings for a user.')
    .addUserOption(option => option.setName('user').setDescription('The user to clear warnings for').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName('report')
    .setDescription('Report a user to moderators.')
    .addUserOption(option => option.setName('user').setDescription('The user to report').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for report').setRequired(true)),

  new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('Get a football trivia question.'),

  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user from the server.')
    .addUserOption(option => option.setName('user').setDescription('The user to unban').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for unbanning').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder()
    .setName('logs')
    .setDescription('View moderation logs.')
    .addIntegerOption(option => option.setName('limit').setDescription('Number of logs to show (default 10)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('team-info')
    .setDescription('Get information about a random football team.'),

  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your football profile.')
    .addUserOption(option => option.setName('user').setDescription('User to view profile (default: yourself)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View top players by XP/level.'),

  new SlashCommandBuilder()
    .setName('team')
    .setDescription('Create or join a football team.')
    .addStringOption(option => option.setName('action').setDescription('create or join').setRequired(true).addChoices({ name: 'create', value: 'create' }, { name: 'join', value: 'join' }))
    .addStringOption(option => option.setName('teamname').setDescription('Team name to create/join').setRequired(true)),

  new SlashCommandBuilder()
    .setName('team-members')
    .setDescription('List your team members.'),

  new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('View your achievements and badges.')
    .addUserOption(option => option.setName('user').setDescription('User to view achievements (default: yourself)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('View your rank and standing.'),

  new SlashCommandBuilder()
    .setName('favorite')
    .setDescription('Set your favorite team.')
    .addStringOption(option => option.setName('team').setDescription('Team name').setRequired(true)),

  new SlashCommandBuilder()
    .setName('dailychallenge')
    .setDescription('Complete today\'s football challenge.'),

  new SlashCommandBuilder()
    .setName('tournament')
    .setDescription('View or create a football tournament.'),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Display all available bot commands (one-time use per server).'),

  new SlashCommandBuilder()
    .setName('raidmode')
    .setDescription('Toggle raid mode - locks all channels (Admin only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Kick user and delete their last 7 days of messages.')
    .addUserOption(option => option.setName('user').setDescription('The user to softban').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for softban').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  new SlashCommandBuilder()
    .setName('infractions')
    .setDescription('View all infractions (warnings, mutes, kicks, bans) on a user.')
    .addUserOption(option => option.setName('user').setDescription('The user to check').setRequired(true)),

  new SlashCommandBuilder()
    .setName('appeal')
    .setDescription('Appeal your ban (mods will review).'),

  new SlashCommandBuilder()
    .setName('goal')
    .setDescription('Submit a goal/assist record.')
    .addIntegerOption(option => option.setName('goals').setDescription('Number of goals scored').setRequired(true))
    .addIntegerOption(option => option.setName('assists').setDescription('Number of assists').setRequired(true))
    .addStringOption(option => option.setName('team').setDescription('Team name').setRequired(true))
    .addStringOption(option => option.setName('opponent').setDescription('Opponent team').setRequired(true)),
];

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands.map(cmd => cmd.toJSON()) },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
});

// Message content filter
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  
  let foundBanned = false;
  let bannedType = '';
  
  for (const regex of bannedContent) {
    if (regex.test(message.content)) {
      foundBanned = true;
      bannedType = message.content.match(/nig|fagg|sand|porn|xxx|nud|horny/) ? 'Hate Speech/Slur' : 'NSFW Content';
      break;
    }
  }
  
  if (foundBanned) {
    try {
      await message.delete();
      const modsChannel = message.guild.channels.cache.find(c => c.name === 'bot-logs');
      if (modsChannel) {
        const reportEmbed = new EmbedBuilder()
          .setTitle('⚠️ Content Filter Alert')
          .addFields(
            { name: 'Type', value: bannedType, inline: true },
            { name: 'User', value: message.author.tag, inline: true },
            { name: 'Channel', value: message.channel.name, inline: true },
            { name: 'Message', value: message.content.substring(0, 100), inline: false }
          )
          .setColor(0xff0000);
        await modsChannel.send({ embeds: [reportEmbed] });
      }
    } catch (err) {
      console.error(`Could not delete message: ${err}`);
    }
  }

  // Auto-delete non-command messages in match-stats channel
  if (message.channel.name === 'match-stats' && !message.content.startsWith('/')) {
    try {
      await message.delete();
    } catch (err) {
      console.error(`Could not delete message from match-stats: ${err}`);
    }
  }
});

// Member milestone tracking
client.on('guildMemberAdd', async member => {
  const guild = member.guild;
  const memberCount = guild.memberCount;
  
  if (memberCount % 50 === 0 || memberCount % 100 === 0) {
    const announceChannel = guild.channels.cache.find(c => c.name === 'announcements' || c.name === 'general');
    if (announceChannel && announceChannel.isTextBased()) {
      const milestoneEmbed = new EmbedBuilder()
        .setTitle('🎉 Milestone Reached!')
        .setDescription(`Welcome to our ${memberCount}th member!`)
        .setColor(0x00ff00);
      await announceChannel.send({ embeds: [milestoneEmbed] });
    }
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  const member = interaction.member;
  const guild = interaction.guild;

  // Check for Referee role for moderation commands
  const moderationCommands = ['kick', 'ban', 'mute', 'unmute', 'warn', 'warnings', 'purge', 'nick', 'roleadd', 'roleremove', 'lock', 'unlock', 'slowmode', 'announce', 'tempban', 'clearwarnings', 'unban', 'logs'];
  if (moderationCommands.includes(commandName)) {
    const refereeRole = guild.roles.cache.find(role => role.name === 'Referee');
    if (!refereeRole || !member.roles.cache.has(refereeRole.id)) {
      return interaction.reply({ content: 'You do not have the Referee role to use this command.', ephemeral: true });
    }
    // Additional validation: ensure executor is not trying to action on higher roles
    if (['kick', 'ban', 'mute', 'unmute', 'tempban', 'unban'].includes(commandName)) {
      const targetUser = interaction.options.getUser('user');
      const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
      if (targetMember && targetMember.roles.highest.position >= member.roles.highest.position) {
        return interaction.reply({ content: 'You cannot perform actions on users with equal or higher roles.', ephemeral: true });
      }
    }
  }

  try {
    switch (commandName) {
      case 'kick':
        const kickUser = interaction.options.getUser('user');
        const kickReason = interaction.options.getString('reason') || 'No reason provided';
        const kickMember = await guild.members.fetch(kickUser.id);
        await kickMember.kick(kickReason);
        await sendModerationDM(kickUser, 'You have been kicked', kickReason);
        logModerationAction({ action: 'kick', executor: interaction.user.tag, target: kickUser.tag, reason: kickReason });
        await interaction.reply({ content: `Kicked ${kickUser.tag} for: ${kickReason}`, ephemeral: true });
        const botLogsChannel = await getBotLogsChannel(guild);
        if (botLogsChannel) {
          await botLogsChannel.send(`**Kick Command Used**\nUser: ${interaction.user.tag}\nTarget: ${kickUser.tag}\nReason: ${kickReason}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'ban':
        const banUser = interaction.options.getUser('user');
        const banReason = interaction.options.getString('reason') || 'No reason provided';
        await guild.members.ban(banUser, { reason: banReason });
        await sendModerationDM(banUser, 'You have been banned', banReason);
        logModerationAction({ action: 'ban', executor: interaction.user.tag, target: banUser.tag, reason: banReason });
        await interaction.reply({ content: `Banned ${banUser.tag} for: ${banReason}`, ephemeral: true });
        const botLogsChannelBan = await getBotLogsChannel(guild);
        if (botLogsChannelBan) {
          await botLogsChannelBan.send(`**Ban Command Used**\nUser: ${interaction.user.tag}\nTarget: ${banUser.tag}\nReason: ${banReason}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'mute':
        const muteUser = interaction.options.getUser('user');
        const muteTime = interaction.options.getInteger('time');
        const muteMember = await guild.members.fetch(muteUser.id);
        const muteRole = guild.roles.cache.find(role => role.name === 'Muted');
        if (!muteRole) return interaction.reply('Muted role not found. Please create a role named "Muted".');
        await muteMember.roles.add(muteRole);
        await sendModerationDM(muteUser, 'You have been muted', 'Check channel for reason', `${muteTime} minutes`);
        logModerationAction({ action: 'mute', executor: interaction.user.tag, target: muteUser.tag, duration: `${muteTime} minutes` });
        setTimeout(async () => {
          await muteMember.roles.remove(muteRole);
        }, muteTime * 60000);
        await interaction.reply({ content: `Muted ${muteUser.tag} for ${muteTime} minutes.`, ephemeral: true });
        const botLogsChannelMute = await getBotLogsChannel(guild);
        if (botLogsChannelMute) {
          await botLogsChannelMute.send(`**Mute Command Used**\nUser: ${interaction.user.tag}\nTarget: ${muteUser.tag}\nDuration: ${muteTime} minutes\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'unmute':
        const unmuteUser = interaction.options.getUser('user');
        const unmuteMember = await guild.members.fetch(unmuteUser.id);
        const unmuteRole = guild.roles.cache.find(role => role.name === 'Muted');
        if (!unmuteRole) return interaction.reply('Muted role not found.');
        await unmuteMember.roles.remove(unmuteRole);
        await interaction.reply({ content: `Unmuted ${unmuteUser.tag}.`, ephemeral: true });
        const botLogsChannelUnmute = await getBotLogsChannel(guild);
        if (botLogsChannelUnmute) {
          await botLogsChannelUnmute.send(`**Unmute Command Used**\nUser: ${interaction.user.tag}\nTarget: ${unmuteUser.tag}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'warn':
        const warnUser = interaction.options.getUser('user');
        const warnReason = interaction.options.getString('reason') || 'No reason provided';
        const userWarnings = warnings.get(warnUser.id) || [];
        userWarnings.push({ reason: warnReason, date: new Date() });
        warnings.set(warnUser.id, userWarnings);
        const warnCount = userWarnings.length;
        
        await sendModerationDM(warnUser, 'You have been warned', warnReason);
        logModerationAction({ action: 'warn', executor: interaction.user.tag, target: warnUser.tag, reason: warnReason, warningCount: warnCount });
        
        let autoAction = '';
        // Auto-actions for warn limits
        if (warnCount === 3) {
          try {
            const warnMember = await guild.members.fetch(warnUser.id);
            await warnMember.kick('Auto-kicked: 3 warnings reached');
            autoAction = '\n⚠️ **Auto-Action: User kicked (3 warnings)**';
            logModerationAction({ action: 'kick', executor: 'Auto-System', target: warnUser.tag, reason: '3 warnings auto-kick' });
          } catch (err) {
            autoAction = '\n❌ Could not auto-kick user';
          }
        } else if (warnCount === 5) {
          try {
            await guild.members.ban(warnUser, { reason: 'Auto-banned: 5 warnings reached' });
            autoAction = '\n⚠️ **Auto-Action: User banned (5 warnings)**';
            logModerationAction({ action: 'ban', executor: 'Auto-System', target: warnUser.tag, reason: '5 warnings auto-ban' });
          } catch (err) {
            autoAction = '\n❌ Could not auto-ban user';
          }
        }
        
        await interaction.reply({ content: `Warned ${warnUser.tag} for: ${warnReason} (Total warnings: ${warnCount})${autoAction}`, ephemeral: true });
        const botLogsChannelWarn = await getBotLogsChannel(guild);
        if (botLogsChannelWarn) {
          await botLogsChannelWarn.send(`**Warn Command Used**\nUser: ${interaction.user.tag}\nTarget: ${warnUser.tag}\nReason: ${warnReason}\nTotal Warnings: ${warnCount}${autoAction}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'warnings':
        const warningsUser = interaction.options.getUser('user');
        const userWarns = warnings.get(warningsUser.id) || [];
        const embed = new EmbedBuilder()
          .setTitle(`Warnings for ${warningsUser.tag}`)
          .setDescription(userWarns.length ? userWarns.map((w, i) => `${i+1}. ${w.reason} (${w.date.toDateString()})`).join('\n') : 'No warnings.')
          .setColor(0xff0000);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        const botLogsChannelWarnings = await getBotLogsChannel(guild);
        if (botLogsChannelWarnings) {
          await botLogsChannelWarnings.send(`**Warnings Command Used**\nUser: ${interaction.user.tag}\nTarget: ${warningsUser.tag}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'purge':
        const amount = interaction.options.getInteger('amount');
        await interaction.channel.bulkDelete(amount);
        await interaction.reply({ content: `Deleted ${amount} messages.`, ephemeral: true });
        const botLogsChannelPurge = await getBotLogsChannel(guild);
        if (botLogsChannelPurge) {
          await botLogsChannelPurge.send(`**Purge Command Used**\nUser: ${interaction.user.tag}\nChannel: ${interaction.channel.name}\nAmount: ${amount}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'nick':
        const nickUser = interaction.options.getUser('user');
        const nickname = interaction.options.getString('nickname');
        const nickMember = await guild.members.fetch(nickUser.id);
        await nickMember.setNickname(nickname);
        await interaction.reply({ content: `Changed ${nickUser.tag}'s nickname to ${nickname}.`, ephemeral: true });
        const botLogsChannelNick = await getBotLogsChannel(guild);
        if (botLogsChannelNick) {
          await botLogsChannelNick.send(`**Nick Command Used**\nUser: ${interaction.user.tag}\nTarget: ${nickUser.tag}\nNew Nickname: ${nickname}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'roleadd':
        const roleAddUser = interaction.options.getUser('user');
        const roleAdd = interaction.options.getRole('role');
        const roleAddMember = await guild.members.fetch(roleAddUser.id);
        await roleAddMember.roles.add(roleAdd);
        await interaction.reply({ content: `Added role ${roleAdd.name} to ${roleAddUser.tag}.`, ephemeral: true });
        const botLogsChannelRoleAdd = await getBotLogsChannel(guild);
        if (botLogsChannelRoleAdd) {
          await botLogsChannelRoleAdd.send(`**Roleadd Command Used**\nUser: ${interaction.user.tag}\nTarget: ${roleAddUser.tag}\nRole: ${roleAdd.name}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'roleremove':
        const roleRemoveUser = interaction.options.getUser('user');
        const roleRemove = interaction.options.getRole('role');
        const roleRemoveMember = await guild.members.fetch(roleRemoveUser.id);
        await roleRemoveMember.roles.remove(roleRemove);
        await interaction.reply({ content: `Removed role ${roleRemove.name} from ${roleRemoveUser.tag}.`, ephemeral: true });
        const botLogsChannelRoleRemove = await getBotLogsChannel(guild);
        if (botLogsChannelRoleRemove) {
          await botLogsChannelRoleRemove.send(`**Roleremove Command Used**\nUser: ${interaction.user.tag}\nTarget: ${roleRemoveUser.tag}\nRole: ${roleRemove.name}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'lock':
        const lockChannel = interaction.options.getChannel('channel');
        await lockChannel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
        await interaction.reply({ content: `Locked ${lockChannel.name}.`, ephemeral: true });
        const botLogsChannelLock = await getBotLogsChannel(guild);
        if (botLogsChannelLock) {
          await botLogsChannelLock.send(`**Lock Command Used**\nUser: ${interaction.user.tag}\nChannel: ${lockChannel.name}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'unlock':
        const unlockChannel = interaction.options.getChannel('channel');
        await unlockChannel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
        await interaction.reply({ content: `Unlocked ${unlockChannel.name}.`, ephemeral: true });
        const botLogsChannelUnlock = await getBotLogsChannel(guild);
        if (botLogsChannelUnlock) {
          await botLogsChannelUnlock.send(`**Unlock Command Used**\nUser: ${interaction.user.tag}\nChannel: ${unlockChannel.name}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'slowmode':
        const slowChannel = interaction.options.getChannel('channel');
        const slowTime = interaction.options.getInteger('time');
        await slowChannel.setRateLimitPerUser(slowTime);
        await interaction.reply({ content: `Set slowmode in ${slowChannel.name} to ${slowTime} seconds.`, ephemeral: true });
        const botLogsChannelSlowmode = await getBotLogsChannel(guild);
        if (botLogsChannelSlowmode) {
          await botLogsChannelSlowmode.send(`**Slowmode Command Used**\nUser: ${interaction.user.tag}\nChannel: ${slowChannel.name}\nTime: ${slowTime} seconds\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'announce':
        const announceChannel = interaction.options.getChannel('channel');
        const announceMessage = interaction.options.getString('message');
        await announceChannel.send(announceMessage);
        await interaction.reply({ content: 'Announcement sent.', ephemeral: true });
        const botLogsChannelAnnounce = await getBotLogsChannel(guild);
        if (botLogsChannelAnnounce) {
          await botLogsChannelAnnounce.send(`**Announce Command Used**\nUser: ${interaction.user.tag}\nChannel: ${announceChannel.name}\nMessage: ${announceMessage}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'ping':
        const ping = Date.now() - interaction.createdTimestamp;
        await interaction.reply({ content: `Pong! Latency: ${ping}ms`, ephemeral: true });
        const botLogsChannelPing = await getBotLogsChannel(guild);
        if (botLogsChannelPing) {
          await botLogsChannelPing.send(`**Ping Command Used**\nUser: ${interaction.user.tag}\nLatency: ${ping}ms\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'uptime':
        const uptime = Date.now() - startTime;
        const uptimeString = `${Math.floor(uptime / 86400000)}d ${Math.floor(uptime / 3600000) % 24}h ${Math.floor(uptime / 60000) % 60}m ${Math.floor(uptime / 1000) % 60}s`;
        await interaction.reply({ content: `Uptime: ${uptimeString}`, ephemeral: true });
        const botLogsChannelUptime = await getBotLogsChannel(guild);
        if (botLogsChannelUptime) {
          await botLogsChannelUptime.send(`**Uptime Command Used**\nUser: ${interaction.user.tag}\nUptime: ${uptimeString}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'botinfo':
        const botEmbed = new EmbedBuilder()
          .setTitle('Bot Info')
          .addFields(
            { name: 'Version', value: '1.0.0', inline: true },
            { name: 'Total Commands', value: commands.length.toString(), inline: true },
            { name: 'Uptime', value: `${Math.floor((Date.now() - startTime) / 1000)}s`, inline: true }
          )
          .setColor(0x00ff00);
        await interaction.reply({ embeds: [botEmbed], ephemeral: true });
        const botLogsChannelBotinfo = await getBotLogsChannel(guild);
        if (botLogsChannelBotinfo) {
          await botLogsChannelBotinfo.send(`**Botinfo Command Used**\nUser: ${interaction.user.tag}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'serverinfo':
        const serverEmbed = new EmbedBuilder()
          .setTitle(guild.name)
          .addFields(
            { name: 'Members', value: guild.memberCount.toString(), inline: true },
            { name: 'Roles', value: guild.roles.cache.size.toString(), inline: true },
            { name: 'Channels', value: guild.channels.cache.size.toString(), inline: true }
          )
          .setColor(0x0000ff);
        await interaction.reply({ embeds: [serverEmbed], ephemeral: true });
        const botLogsChannelServerinfo = await getBotLogsChannel(guild);
        if (botLogsChannelServerinfo) {
          await botLogsChannelServerinfo.send(`**Serverinfo Command Used**\nUser: ${interaction.user.tag}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'userinfo':
        const userInfoUser = interaction.options.getUser('user') || interaction.user;
        const userInfoMember = await guild.members.fetch(userInfoUser.id);
        const userEmbed = new EmbedBuilder()
          .setTitle(userInfoUser.tag)
          .addFields(
            { name: 'ID', value: userInfoUser.id, inline: true },
            { name: 'Joined', value: userInfoMember.joinedAt.toDateString(), inline: true },
            { name: 'Roles', value: userInfoMember.roles.cache.map(r => r.name).join(', ') || 'None', inline: false }
          )
          .setThumbnail(userInfoUser.displayAvatarURL())
          .setColor(0xffff00);
        await interaction.reply({ embeds: [userEmbed], ephemeral: true });
        const botLogsChannelUserinfo = await getBotLogsChannel(guild);
        if (botLogsChannelUserinfo) {
          await botLogsChannelUserinfo.send(`**Userinfo Command Used**\nUser: ${interaction.user.tag}\nTarget: ${userInfoUser.tag}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'roles':
        const rolesUser = interaction.options.getUser('user') || interaction.user;
        const rolesMember = await guild.members.fetch(rolesUser.id);
        const rolesList = rolesMember.roles.cache.map(r => r.name).join(', ') || 'None';
        await interaction.reply({ content: `${rolesUser.tag}'s roles: ${rolesList}`, ephemeral: true });
        const botLogsChannelRoles = await getBotLogsChannel(guild);
        if (botLogsChannelRoles) {
          await botLogsChannelRoles.send(`**Roles Command Used**\nUser: ${interaction.user.tag}\nTarget: ${rolesUser.tag}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'avatar':
        const avatarUser = interaction.options.getUser('user') || interaction.user;
        const avatarEmbed = new EmbedBuilder()
          .setTitle(`${avatarUser.tag}'s Avatar`)
          .setImage(avatarUser.displayAvatarURL({ size: 1024 }))
          .setColor(0xff00ff);
        await interaction.reply({ embeds: [avatarEmbed], ephemeral: true });
        const botLogsChannelAvatar = await getBotLogsChannel(guild);
        if (botLogsChannelAvatar) {
          await botLogsChannelAvatar.send(`**Avatar Command Used**\nUser: ${interaction.user.tag}\nTarget: ${avatarUser.tag}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'channelinfo':
        const channelInfoChannel = interaction.options.getChannel('channel') || interaction.channel;
        const channelEmbed = new EmbedBuilder()
          .setTitle(channelInfoChannel.name)
          .addFields(
            { name: 'ID', value: channelInfoChannel.id, inline: true },
            { name: 'Type', value: channelInfoChannel.type, inline: true },
            { name: 'Created', value: channelInfoChannel.createdAt.toDateString(), inline: true }
          )
          .setColor(0x00ffff);
        await interaction.reply({ embeds: [channelEmbed], ephemeral: true });
        const botLogsChannelChannelinfo = await getBotLogsChannel(guild);
        if (botLogsChannelChannelinfo) {
          await botLogsChannelChannelinfo.send(`**Channelinfo Command Used**\nUser: ${interaction.user.tag}\nChannel: ${channelInfoChannel.name}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'invite':
        const inviteLink = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands`;
        await interaction.reply({ content: `Invite link: ${inviteLink}`, ephemeral: true });
        const botLogsChannelInvite = await getBotLogsChannel(guild);
        if (botLogsChannelInvite) {
          await botLogsChannelInvite.send(`**Invite Command Used**\nUser: ${interaction.user.tag}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'randommember':
        const members = await guild.members.fetch();
        const randomMember = members.random();
        await interaction.reply({ content: `Random member: ${randomMember.user.tag}`, ephemeral: true });
        const botLogsChannelRandommember = await getBotLogsChannel(guild);
        if (botLogsChannelRandommember) {
          await botLogsChannelRandommember.send(`**Randommember Command Used**\nUser: ${interaction.user.tag}\nSelected: ${randomMember.user.tag}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'countroles':
        const roleCounts = guild.roles.cache.map(role => `${role.name}: ${role.members.size}`);
        await interaction.reply({ content: `Role counts:\n${roleCounts.join('\n')}`, ephemeral: true });
        const botLogsChannelCountroles = await getBotLogsChannel(guild);
        if (botLogsChannelCountroles) {
          await botLogsChannelCountroles.send(`**Countroles Command Used**\nUser: ${interaction.user.tag}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'vote':
        const question = interaction.options.getString('question');
        const options = interaction.options.getString('options').split(',');
        const voteEmbed = new EmbedBuilder()
          .setTitle(question)
          .setDescription(options.map((opt, i) => `${i+1}. ${opt.trim()}`).join('\n'))
          .setColor(0x00ff00);
        const row = new ActionRowBuilder()
          .addComponents(
            options.slice(0, 5).map((_, i) => new ButtonBuilder()
              .setCustomId(`vote_${i}`)
              .setLabel(`${i+1}`)
              .setStyle(ButtonStyle.Primary)
            )
          );
        await interaction.reply({ embeds: [voteEmbed], components: [row], ephemeral: true });
        const botLogsChannelVote = await getBotLogsChannel(guild);
        if (botLogsChannelVote) {
          await botLogsChannelVote.send(`**Vote Command Used**\nUser: ${interaction.user.tag}\nQuestion: ${question}\nOptions: ${options.join(', ')}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'say':
        const sayMessage = interaction.options.getString('message');
        await interaction.reply({ content: sayMessage, ephemeral: true });
        const botLogsChannelSay = await getBotLogsChannel(guild);
        if (botLogsChannelSay) {
          await botLogsChannelSay.send(`**Say Command Used**\nUser: ${interaction.user.tag}\nMessage: ${sayMessage}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'serverbanner':
        const bannerURL = guild.bannerURL();
        if (bannerURL) {
          const bannerEmbed = new EmbedBuilder()
            .setTitle('Server Banner')
            .setImage(bannerURL)
            .setColor(0xffa500);
          await interaction.reply({ embeds: [bannerEmbed], ephemeral: true });
        } else {
          await interaction.reply({ content: 'No server banner set.', ephemeral: true });
        }
        const botLogsChannelServerbanner = await getBotLogsChannel(guild);
        if (botLogsChannelServerbanner) {
          await botLogsChannelServerbanner.send(`**Serverbanner Command Used**\nUser: ${interaction.user.tag}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'tempban':
        const tempbanUser = interaction.options.getUser('user');
        const tempbanHours = interaction.options.getInteger('hours');
        const tempbanReason = interaction.options.getString('reason') || 'No reason provided';
        await guild.members.ban(tempbanUser, { reason: tempbanReason });
        await sendModerationDM(tempbanUser, 'You have been temporarily banned', tempbanReason, `${tempbanHours} hours`);
        logModerationAction({ action: 'tempban', executor: interaction.user.tag, target: tempbanUser.tag, duration: `${tempbanHours} hours`, reason: tempbanReason });
        await interaction.reply({ content: `Temporarily banned ${tempbanUser.tag} for ${tempbanHours} hours. Reason: ${tempbanReason}`, ephemeral: true });
        const botLogsChannelTempban = await getBotLogsChannel(guild);
        if (botLogsChannelTempban) {
          await botLogsChannelTempban.send(`**Tempban Command Used**\nUser: ${interaction.user.tag}\nTarget: ${tempbanUser.tag}\nDuration: ${tempbanHours} hours\nReason: ${tempbanReason}\nTimestamp: ${new Date().toISOString()}`);
        }
        setTimeout(async () => {
          try {
            await guild.bans.remove(tempbanUser.id, 'Temporary ban expired');
          } catch (err) {
            console.error(`Failed to unban ${tempbanUser.tag}: ${err}`);
          }
        }, tempbanHours * 3600000);
        break;

      case 'clearwarnings':
        const clearUser = interaction.options.getUser('user');
        const clearedCount = warnings.get(clearUser.id)?.length || 0;
        warnings.delete(clearUser.id);
        logModerationAction({ action: 'clearwarnings', executor: interaction.user.tag, target: clearUser.tag, clearedCount: clearedCount });
        await interaction.reply({ content: `Cleared all ${clearedCount} warnings for ${clearUser.tag}.`, ephemeral: true });
        const botLogsChannelClearwarnings = await getBotLogsChannel(guild);
        if (botLogsChannelClearwarnings) {
          await botLogsChannelClearwarnings.send(`**Clearwarnings Command Used**\nUser: ${interaction.user.tag}\nTarget: ${clearUser.tag}\nCleared Warnings: ${clearedCount}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'report':
        const reportUser = interaction.options.getUser('user');
        const reportReason = interaction.options.getString('reason');
        const botReportsChannel = guild.channels.cache.find(channel => channel.name === 'bot-reports');
        if (!botReportsChannel) {
          return interaction.reply({ content: 'bot-reports channel not found. Please create a channel named "bot-reports".', ephemeral: true });
        }
        const reportEmbed = new EmbedBuilder()
          .setTitle('User Report')
          .addFields(
            { name: 'Reporter', value: interaction.user.tag, inline: true },
            { name: 'Reported User', value: reportUser.tag, inline: true },
            { name: 'Reason', value: reportReason, inline: false },
            { name: 'Timestamp', value: new Date().toISOString(), inline: false }
          )
          .setColor(0xff0000);
        await botReportsChannel.send({ embeds: [reportEmbed] });
        await interaction.reply({ content: 'Your report has been submitted to the moderators.', ephemeral: true });
        break;

      case 'trivia':
        const triviaQuestions = [
          { question: 'Which country has won the most FIFA World Cups?', answer: 'Brazil' },
          { question: 'Who is the all-time top scorer in World Cup history?', answer: 'Miroslav Klose' },
          { question: 'Which club has won the most UEFA Champions League titles?', answer: 'Real Madrid' },
          { question: 'Which player has won the most Ballon d\'Or awards?', answer: 'Lionel Messi' },
          { question: 'Which country hosted the first ever FIFA World Cup?', answer: 'Uruguay' },
          { question: 'Who scored the "Hand of God" goal?', answer: 'Diego Maradona' },
          { question: 'Which country won the 2022 FIFA World Cup?', answer: 'Argentina' },
          { question: 'Which club did Cristiano Ronaldo start his career at?', answer: 'Sporting CP' },
          { question: 'Which nation won Euro 2020?', answer: 'Italy' },
          { question: 'Who is known as "The Special One"?', answer: 'José Mourinho' },
          { question: 'Which Premier League club has the most top-flight titles?', answer: 'Manchester United' },
          { question: 'Who won the 2023 UEFA Champions League?', answer: 'Real Madrid' },
          { question: 'What colour card results in a player being sent off?', answer: 'Red' },
          { question: 'How many players are on the pitch per team in football?', answer: '11' },
          { question: 'Which player has won the most FIFA World Player of the Year awards?', answer: 'Cristiano Ronaldo' }
        ];
        const randomTrivia = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
        const triviaEmbed = new EmbedBuilder()
          .setTitle('⚽ Football Trivia Question')
          .setDescription(randomTrivia.question)
          .setColor(0x00ff00);
        await interaction.reply({ embeds: [triviaEmbed] });
        break;

      case 'unban':
        const unbanUser = interaction.options.getUser('user');
        const unbanReason = interaction.options.getString('reason') || 'No reason provided';
        await guild.bans.remove(unbanUser.id, unbanReason);
        logModerationAction({ action: 'unban', executor: interaction.user.tag, target: unbanUser.tag, reason: unbanReason });
        await interaction.reply({ content: `Unbanned ${unbanUser.tag}. Reason: ${unbanReason}`, ephemeral: true });
        const botLogsChannelUnban = await getBotLogsChannel(guild);
        if (botLogsChannelUnban) {
          await botLogsChannelUnban.send(`**Unban Command Used**\nUser: ${interaction.user.tag}\nTarget: ${unbanUser.tag}\nReason: ${unbanReason}\nTimestamp: ${new Date().toISOString()}`);
        }
        break;

      case 'logs':
        const logLimit = interaction.options.getInteger('limit') || 10;
        const recentLogs = moderationLogs.slice(-logLimit);
        if (recentLogs.length === 0) {
          return interaction.reply({ content: 'No moderation logs found.', ephemeral: true });
        }
        const logsEmbed = new EmbedBuilder()
          .setTitle(`Last ${recentLogs.length} Moderation Actions`)
          .setColor(0x0000ff);
        recentLogs.forEach((log, index) => {
          const logText = `**${log.action.toUpperCase()}** by ${log.executor} on ${log.target}${log.reason ? ` - Reason: ${log.reason}` : ''}${log.duration ? ` - Duration: ${log.duration}` : ''}${log.warningCount ? ` - Warnings: ${log.warningCount}` : ''}${log.clearedCount !== undefined ? ` - Cleared: ${log.clearedCount}` : ''}`;
          logsEmbed.addFields({ name: `#${recentLogs.length - index}`, value: logText, inline: false });
        });
        await interaction.reply({ embeds: [logsEmbed], ephemeral: true });
        break;

      case 'team-info':
        const teams = [
          { name: 'Manchester United', country: 'England', founded: '1878', trophies: '66', famous: '13 Premier League titles, 3 Champions Leagues' },
          { name: 'Real Madrid', country: 'Spain', founded: '1902', trophies: '92', famous: '15 Champions League titles, 35 La Liga titles' },
          { name: 'Barcelona', country: 'Spain', founded: '1899', trophies: '79', famous: 'Messi era dominance, 5 Champions Leagues' },
          { name: 'Liverpool FC', country: 'England', founded: '1892', trophies: '66', famous: '6 Champions League titles, Iconic club' },
          { name: 'Bayern Munich', country: 'Germany', founded: '1900', trophies: '73', famous: '6 Champions League titles, Bundesliga dominance' },
          { name: 'AC Milan', country: 'Italy', founded: '1899', trophies: '49', famous: '7 Champions League titles, Italian legends' },
          { name: 'Inter Milan', country: 'Italy', founded: '1908', trophies: '48', famous: '3 Champions League titles, Rich history' },
          { name: 'Arsenal', country: 'England', founded: '1886', trophies: '48', famous: '13 Premier League titles, Invincibles era' },
          { name: 'Chelsea', country: 'England', founded: '1905', trophies: '42', famous: '5 Champions League titles, Modern era dominance' },
          { name: 'Paris Saint-Germain', country: 'France', founded: '1970', trophies: '27', famous: 'Messi & Neymar era, Ligue 1 dominance' }
        ];
        const randomTeam = teams[Math.floor(Math.random() * teams.length)];
        const teamEmbed = new EmbedBuilder()
          .setTitle(`⚽ ${randomTeam.name}`)
          .addFields(
            { name: 'Country', value: randomTeam.country, inline: true },
            { name: 'Founded', value: randomTeam.founded, inline: true },
            { name: 'Major Trophies', value: randomTeam.trophies, inline: true },
            { name: 'Famous For', value: randomTeam.famous, inline: false }
          )
          .setColor(0xff6600);
        await interaction.reply({ embeds: [teamEmbed] });
        break;

      case 'profile':
        const profileUser = interaction.options.getUser('user') || interaction.user;
        const profile = getUserProfile(profileUser.id);
        const profileEmbed = new EmbedBuilder()
          .setTitle(`⚽ ${profileUser.tag}'s Football Profile`)
          .setThumbnail(profileUser.displayAvatarURL())
          .addFields(
            { name: 'Level', value: profile.level.toString(), inline: true },
            { name: 'XP', value: `${profile.xp} / ${profile.level * 1000}`, inline: true },
            { name: 'Matches Played', value: profile.matches.toString(), inline: true },
            { name: 'Goals', value: profile.goals.toString(), inline: true },
            { name: 'Assists', value: profile.assists.toString(), inline: true },
            { name: 'Position', value: profile.position, inline: true },
            { name: 'Team', value: profile.team || 'None', inline: true },
            { name: 'Favorite Team', value: profile.favoriteTeam || 'Not set', inline: true },
            { name: 'Bio', value: profile.bio, inline: false },
            { name: 'Member Since', value: profile.joinedDate.toDateString(), inline: false }
          )
          .setColor(0x00ff00);
        await interaction.reply({ embeds: [profileEmbed] });
        break;

      case 'leaderboard':
        const sortedUsers = Array.from(userProfiles.values()).sort((a, b) => b.xp - a.xp).slice(0, 10);
        const leaderboardEmbed = new EmbedBuilder()
          .setTitle('🏆 Football Leaderboard')
          .setColor(0xffd700);
        sortedUsers.forEach((user, index) => {
          leaderboardEmbed.addFields({
            name: `#${index + 1} - Level ${user.level}`,
            value: `<@${user.userId}> | ${user.xp} XP | ${user.goals} Goals | ${user.assists} Assists`,
            inline: false
          });
        });
        await interaction.reply({ embeds: [leaderboardEmbed] });
        break;

      case 'team':
        const teamAction = interaction.options.getString('action');
        const teamName = interaction.options.getString('teamname');
        const userProfile = getUserProfile(interaction.user.id);
        
        if (teamAction === 'create') {
          if (userTeams.has(teamName)) {
            return interaction.reply({ content: `Team **${teamName}** already exists!`, ephemeral: true });
          }
          try {
            // Create role for team first
            const teamRole = await guild.roles.create({
              name: teamName,
              color: '#0066CC',
              reason: `Auto-created role for team: ${teamName}`
            });
            
            console.log(`Created role: ${teamRole.name} with ID: ${teamRole.id}`);
            
            const teamsCategory = guild.channels.cache.find(c => c.name === 'teams' && c.isCategory());
            
            // Create channel with proper permissions
            const newChannel = await guild.channels.create({
              name: teamName.toLowerCase().replace(/\s+/g, '-'),
              type: 0, // Text channel
              parent: teamsCategory?.id,
              topic: `${teamName} Football Team`
            });
            
            // Set permissions: deny everyone, allow role
            await newChannel.permissionOverwrites.set([
              {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel]
              },
              {
                id: teamRole.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
              }
            ]);
            
            console.log(`Set permissions for channel ${newChannel.name}`);
            
            // Assign role to captain
            await interaction.member.roles.add(teamRole);
            
            userTeams.set(teamName, { name: teamName, captain: interaction.user.id, members: [interaction.user.id], channelId: newChannel.id, roleId: teamRole.id });
            userProfile.team = teamName;
            await interaction.reply({ content: `✅ Created team **${teamName}**!\n🔐 Private channel: ${newChannel}\n👥 Role: <@&${teamRole.id}>`, ephemeral: true });
          } catch (error) {
            console.error(`Error creating team: ${error}`);
            await interaction.reply({ content: `❌ Failed to create team: ${error.message}`, ephemeral: true });
          }
        } else if (teamAction === 'join') {
          if (!userTeams.has(teamName)) {
            return interaction.reply({ content: `Team **${teamName}** not found!`, ephemeral: true });
          }
          const team = userTeams.get(teamName);
          if (team.members.includes(interaction.user.id)) {
            return interaction.reply({ content: `You're already in team **${teamName}**!`, ephemeral: true });
          }
          
          try {
            // Assign role to member
            if (team.roleId) {
              const role = guild.roles.cache.get(team.roleId);
              if (role) {
                await interaction.member.roles.add(role);
              } else {
                return interaction.reply({ content: `❌ Team role not found. Contact a mod.`, ephemeral: true });
              }
            }
            team.members.push(interaction.user.id);
            userProfile.team = teamName;
            const teamMsg = team.channelId ? ` Access team channel <#${team.channelId}>!` : '';
            await interaction.reply({ content: `✅ Joined team **${teamName}**!${teamMsg}`, ephemeral: true });
          } catch (error) {
            console.error(`Error joining team: ${error}`);
            await interaction.reply({ content: `❌ Failed to join team: ${error.message}`, ephemeral: true });
          }
        }
        break;

      case 'team-members':
        const userTeamName = getUserProfile(interaction.user.id).team;
        if (!userTeamName) {
          return interaction.reply({ content: 'You are not in a team!', ephemeral: true });
        }
        const teamData = userTeams.get(userTeamName);
        const teamListEmbed = new EmbedBuilder()
          .setTitle(`👥 ${userTeamName} Members`)
          .setDescription(teamData.members.map((id, i) => `${i + 1}. <@${id}>`).join('\n'))
          .setFooter({ text: `Captain: <@${teamData.captain}>` })
          .setColor(0x0000ff);
        await interaction.reply({ embeds: [teamListEmbed] });
        break;

      case 'achievements':
        const achieveUser = interaction.options.getUser('user') || interaction.user;
        const achieveProfile = getUserProfile(achieveUser.id);
        const achieveList = [
          { name: '⚽ First Goal', condition: achieveProfile.goals >= 1 },
          { name: '🎯 Striker', condition: achieveProfile.matches >= 5 },
          { name: '⭐ Star Player', condition: achieveProfile.level >= 5 },
          { name: '👑 MVP', condition: achieveProfile.goals >= 20 },
          { name: '🚀 Prolific', condition: achieveProfile.matches >= 50 },
          { name: '🎖️ Legend', condition: achieveProfile.matches >= 100 }
        ];
        const unlockedAchievements = achieveList.filter(a => a.condition);
        const achievementsEmbed = new EmbedBuilder()
          .setTitle(`🏆 ${achieveUser.tag}'s Achievements`)
          .setDescription(unlockedAchievements.length > 0 ? unlockedAchievements.map(a => a.name).join('\n') : 'No achievements yet!')
          .setFooter({ text: `${unlockedAchievements.length}/${achieveList.length} unlocked` })
          .setColor(0xffa500);
        await interaction.reply({ embeds: [achievementsEmbed] });
        break;

      case 'ranking':
        const rankProfile = getUserProfile(interaction.user.id);
        const userRank = Array.from(userProfiles.values()).filter(u => u.xp > rankProfile.xp).length + 1;
        const totalUsers = userProfiles.size;
        const rankEmbed = new EmbedBuilder()
          .setTitle("🎯 Your Ranking")
          .addFields(
            { name: 'Rank', value: `#${userRank} of ${totalUsers}`, inline: true },
            { name: 'Level', value: rankProfile.level.toString(), inline: true },
            { name: 'Total XP', value: rankProfile.xp.toString(), inline: true },
            { name: 'Progress to Next Level', value: `${rankProfile.xp % 1000}/1000 XP`, inline: true }
          )
          .setColor(0x9370db);
        await interaction.reply({ embeds: [rankEmbed] });
        break;

      case 'favorite':
        const favTeam = interaction.options.getString('team');
        const favProfile = getUserProfile(interaction.user.id);
        favProfile.favoriteTeam = favTeam;
        await interaction.reply({ content: `✅ Set your favorite team to **${favTeam}**!`, ephemeral: true });
        break;

      case 'dailychallenge':
        const today = new Date().toDateString();
        const challengeKey = `${interaction.user.id}-${today}`;
        
        if (dailyChallengeLog.has(challengeKey)) {
          return interaction.reply({ content: 'You already completed today\'s challenge! Come back tomorrow.', ephemeral: true });
        }
        
        const xpReward = 100;
        addXP(interaction.user.id, xpReward);
        dailyChallengeLog.set(challengeKey, true);
        const challengeProfile = getUserProfile(interaction.user.id);
        challengeProfile.matches += 1;
        
        const challengeEmbed = new EmbedBuilder()
          .setTitle('⚽ Daily Challenge Complete!')
          .addFields(
            { name: 'XP Earned', value: `+${xpReward} XP`, inline: true },
            { name: 'New Level', value: challengeProfile.level.toString(), inline: true },
            { name: 'Total XP', value: challengeProfile.xp.toString(), inline: true }
          )
          .setColor(0x00ff00);
        await interaction.reply({ embeds: [challengeEmbed] });
        break;

      case 'tournament':
        const tournamentChannel = guild.channels.cache.find(channel => channel.name === 'tournament');
        if (!tournamentChannel) {
          return interaction.reply({ content: 'Tournament channel not found!', ephemeral: true });
        }
        const tournamentEmbed = new EmbedBuilder()
          .setTitle('🏆 Football Tournament')
          .setDescription('Use the tournament channel to organize and track ongoing tournaments!')
          .addFields(
            { name: 'Status', value: 'Awaiting participants', inline: true },
            { name: 'Channel', value: tournamentChannel.toString(), inline: true }
          )
          .setColor(0xff6600);
        await interaction.reply({ embeds: [tournamentEmbed] });
        break;

      case 'help':
        if (helpCommandUsed.has(guild.id)) {
          return interaction.reply({ content: 'This command has already been used in this server! The help message is pinned above.', ephemeral: true });
        }
        
        helpCommandUsed.add(guild.id);
        
        const helpEmbed = new EmbedBuilder()
          .setTitle('⚽ Football Nation Bot - Commands List')
          .setDescription('Complete list of all available commands')
          .addFields(
            { name: '👤 PROFILE & COMMUNITY', value: '`/profile` - View football profile\n`/leaderboard` - Top players by XP\n`/ranking` - Your rank & standing\n`/achievements` - View badges earned\n`/favorite` - Set favorite team', inline: false },
            { name: '👥 TEAM SYSTEM', value: '`/team` - Create or join a football team\n`/team-members` - List team members', inline: false },
            { name: '🎮 FUN & CHALLENGES', value: '`/dailychallenge` - Daily XP reward\n`/trivia` - Football trivia question\n`/team-info` - Random team info\n`/tournament` - Football tournament info', inline: false },
            { name: '🛡️ MODERATION (Referee role)', value: '`/kick` - Remove user\n`/ban` - Ban user\n`/unban` - Unban user\n`/tempban` - Temp ban (hours)\n`/mute` - Timeout user\n`/unmute` - Remove timeout\n`/warn` - Warn user\n`/warnings` - Check warnings\n`/clearwarnings` - Clear all warnings\n`/purge` - Delete messages\n`/nick` - Change nickname\n`/roleadd` - Add role\n`/roleremove` - Remove role\n`/lock` - Lock channel\n`/unlock` - Unlock channel\n`/slowmode` - Set slowmode\n`/announce` - Send announcement\n`/logs` - View moderation logs\n`/report` - Report a user (everyone)', inline: false },
            { name: '📊 INFO COMMANDS', value: '`/ping` - Bot latency\n`/uptime` - Bot uptime\n`/botinfo` - Bot statistics\n`/serverinfo` - Server info\n`/userinfo` - User details\n`/roles` - List user roles\n`/avatar` - Show user avatar\n`/channelinfo` - Channel details\n`/invite` - Bot invite link\n`/randommember` - Random member\n`/countroles` - Role counts\n`/vote` - Create poll\n`/say` - Bot repeats message\n`/serverbanner` - Server banner', inline: false }
          )
          .setFooter({ text: 'React ⚽ if this helps! | This command can only be used once per server.' })
          .setColor(0xff6600);
        
        const msg = await interaction.reply({ embeds: [helpEmbed] });
        await msg.pin();
        break;

      case 'raidmode':
        // Check for Admin role for raid mode
        if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: 'Only Server Admin can activate raid mode!', ephemeral: true });
        }
        
        const isRaidMode = raidMode.has(guild.id);
        if (isRaidMode) {
          raidMode.delete(guild.id);
          // Unlock all channels
          const channels = guild.channels.cache.filter(ch => ch.isTextBased());
          for (const [, channel] of channels) {
            try {
              await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
            } catch (err) {
              console.error(`Could not unlock ${channel.name}`);
            }
          }
          await interaction.reply({ content: '🟢 **Raid mode DISABLED** - All channels unlocked.', ephemeral: false });
          logModerationAction({ action: 'raidmode-disable', executor: interaction.user.tag, target: 'Guild', reason: 'Raid mode disabled' });
        } else {
          raidMode.add(guild.id);
          // Lock all channels
          const channels = guild.channels.cache.filter(ch => ch.isTextBased());
          for (const [, channel] of channels) {
            try {
              await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
            } catch (err) {
              console.error(`Could not lock ${channel.name}`);
            }
          }
          await interaction.reply({ content: '🔴 **RAID MODE ACTIVATED** - All channels locked. Use `/raidmode` to disable.', ephemeral: false });
          logModerationAction({ action: 'raidmode-enable', executor: interaction.user.tag, target: 'Guild', reason: 'Raid mode activated' });
        }
        break;

      case 'softban':
        const softbanUser = interaction.options.getUser('user');
        const softbanReason = interaction.options.getString('reason') || 'No reason provided';
        try {
          const softbanMember = await guild.members.fetch(softbanUser.id);
          // Delete 7 days of messages
          const messages = await interaction.channel.messages.fetch({ limit: 100 });
          const userMessages = messages.filter(m => m.author.id === softbanUser.id && (Date.now() - m.createdTimestamp) < 7 * 24 * 60 * 60 * 1000);
          for (const [, msg] of userMessages) {
            try {
              await msg.delete();
            } catch (err) {
              console.error(`Could not delete message: ${err}`);
            }
          }
          // Kick user
          await softbanMember.kick(softbanReason);
          await sendModerationDM(softbanUser, 'You have been softbanned', softbanReason);
          logModerationAction({ action: 'softban', executor: interaction.user.tag, target: softbanUser.tag, reason: softbanReason });
          await interaction.reply({ content: `✅ Softbanned ${softbanUser.tag} and deleted last 7 days of messages. Reason: ${softbanReason}`, ephemeral: true });
        } catch (err) {
          await interaction.reply({ content: `❌ Failed to softban user: ${err.message}`, ephemeral: true });
        }
        break;

      case 'infractions':
        const infractionUser = interaction.options.getUser('user');
        const userInfractions = moderationLogs.filter(log => log.target === infractionUser.tag);
        
        if (userInfractions.length === 0) {
          return interaction.reply({ content: `No infractions found for ${infractionUser.tag}.`, ephemeral: true });
        }
        
        const infractionEmbed = new EmbedBuilder()
          .setTitle(`📋 Infractions for ${infractionUser.tag}`)
          .setColor(0xff0000);
        
        userInfractions.forEach((infr, index) => {
          const infrText = `**${infr.action.toUpperCase()}** by ${infr.executor}\nReason: ${infr.reason || 'N/A'}\nDate: ${infr.timestamp.toDateString()}`;
          infractionEmbed.addFields({ name: `#${index + 1}`, value: infrText, inline: false });
        });
        
        infractionEmbed.setFooter({ text: `Total infractions: ${userInfractions.length}` });
        await interaction.reply({ embeds: [infractionEmbed], ephemeral: true });
        break;

      case 'appeal':
        const banStatus = await guild.bans.fetch(interaction.user.id).catch(() => null);
        if (!banStatus) {
          return interaction.reply({ content: 'You are not banned from this server.', ephemeral: true });
        }
        
        if (appeals.has(interaction.user.id)) {
          return interaction.reply({ content: 'You already have a pending appeal. Wait for mod response.', ephemeral: true });
        }
        
        appeals.set(interaction.user.id, { user: interaction.user.tag, userId: interaction.user.id, date: new Date(), status: 'pending' });
        
        const modsChannel = guild.channels.cache.find(c => c.name === 'bot-logs');
        if (modsChannel) {
          const appealEmbed = new EmbedBuilder()
            .setTitle('🔔 Ban Appeal Submitted')
            .addFields(
              { name: 'User', value: interaction.user.tag, inline: true },
              { name: 'Date', value: new Date().toDateString(), inline: true }
            )
            .setColor(0xffaa00);
          await modsChannel.send({ embeds: [appealEmbed] });
        }
        
        await interaction.reply({ content: '✅ Appeal submitted! Moderators will review it.', ephemeral: true });
        break;

      case 'goal':
        const goals = interaction.options.getInteger('goals');
        const assists = interaction.options.getInteger('assists');
        const teamGoal = interaction.options.getString('team');
        const opponent = interaction.options.getString('opponent');
        
        const matchStatsChannel = guild.channels.cache.find(c => c.name === 'match-stats');
        if (!matchStatsChannel) {
          return interaction.reply({ content: 'No #match-stats channel found on this server.', ephemeral: true });
        }
        
        const goalEmbed = new EmbedBuilder()
          .setTitle('⚽ New Match Stats Submitted')
          .addFields(
            { name: 'Player', value: interaction.user.username, inline: true },
            { name: 'Goals', value: goals.toString(), inline: true },
            { name: 'Assists', value: assists.toString(), inline: true },
            { name: 'Team', value: teamGoal, inline: true },
            { name: 'Opponent', value: opponent, inline: true }
          )
          .setColor(0x00ff00)
          .setThumbnail(interaction.user.avatarURL());
        
        await matchStatsChannel.send({ embeds: [goalEmbed] });
        
        // Update user profile
        const goalProfile = getUserProfile(interaction.user.id);
        goalProfile.goals += goals;
        goalProfile.assists += assists;
        goalProfile.matches += 1;
        addXP(interaction.user.id, goals * 50 + assists * 25);
        
        await interaction.reply({ content: `✅ Match stats submitted! **${goals}** goals and **${assists}** assists recorded!`, ephemeral: true });
        break;

      default:
        await interaction.reply({ content: 'Unknown command.', ephemeral: true });
    }
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: 'There was an error executing this command.', ephemeral: true });
  }
});

client.on('messageCreate', message => {
    if (message.channel.name === 'partners' && !message.author.bot) {
        message.delete();
    }
});

client.on('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    client.user.setActivity('⚽ Football matches', { type: 1 });
});

client.login(TOKEN);
