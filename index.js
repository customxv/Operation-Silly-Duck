require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

// Initialize client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
  ],
});

// Constants
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;

const LEAGUE_IDS = { pl: 39, laliga: 140, ucl: 2, bundesliga: 78, seriea: 135, ligue1: 61 };
const LEAGUE_NAMES = { pl: 'Premier League', laliga: 'La Liga', ucl: 'Champions League', bundesliga: 'Bundesliga', seriea: 'Serie A', ligue1: 'Ligue 1' };

const triviaQuestions = [
  { question: "Which country has won the most FIFA World Cups?", answer: "brazil", display: "Brazil" },
  { question: "Who is the all-time top scorer in World Cup history?", answer: "miroslav klose", display: "Miroslav Klose" },
  { question: "Which club has won the most UEFA Champions League titles?", answer: "real madrid", display: "Real Madrid" },
  { question: "Which player has won the most Ballon d'Or awards?", answer: "messi", display: "Lionel Messi" },
  { question: "Which country hosted the first ever FIFA World Cup?", answer: "uruguay", display: "Uruguay" },
  { question: "Who scored the 'Hand of God' goal?", answer: "maradona", display: "Diego Maradona" },
  { question: "Which country won the 2022 FIFA World Cup?", answer: "argentina", display: "Argentina" },
  { question: "Which club did Cristiano Ronaldo start his career at?", answer: "sporting cp", display: "Sporting CP" },
  { question: "Which nation won Euro 2020 (played in 2021)?", answer: "italy", display: "Italy" },
  { question: "Who is known as 'The Special One'?", answer: "jose mourinho", display: "José Mourinho" },
  { question: "Which Premier League club has the most top-flight titles?", answer: "manchester united", display: "Manchester United" },
  { question: "Which African nation reached the semi-finals of the 2022 World Cup?", answer: "morocco", display: "Morocco" },
  { question: "Who won the 2024 UEFA Champions League?", answer: "real madrid", display: "Real Madrid" },
  { question: "What colour card results in a player being sent off?", answer: "red", display: "Red card" },
  { question: "How many players are on the pitch per team in football?", answer: "11", display: "11" }
];

// In-memory storage
let xpData = {};
let warnings = {};
let config = {
  logsChannel: null,
  welcomeChannel: null,
  levelChannel: null,
  xpBlacklist: new Set(),
  xpWhitelist: new Set(),
};
let xpCooldowns = new Map();
let activeTrivia = new Map();

// Utility functions
function hasMod(member) {
  return member.roles.cache.some(r => r.name === 'Match Officials' || r.name === 'VAR Officials') || member.permissions.has(PermissionFlagsBits.Administrator);
}

function ms(time) {
  const regex = /(\d+)([smhd])/;
  const match = time.match(regex);
  if (!match) return 0;
  const value = parseInt(match[1]);
  const unit = match[2];
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 0;
  }
}

async function fetchFootball(endpoint) {
  const res = await fetch(`https://v3.football.api-sports.io/${endpoint}`, {
    headers: { 'x-apisports-key': FOOTBALL_API_KEY }
  });
  return res.json();
}

async function logCommand(user, role, command, channel, timestamp, result) {
  const logsChannel = client.channels.cache.get(config.logsChannel) || client.channels.cache.find(ch => ch.name === 'bot-logs');
  if (!logsChannel) return;

  const embed = new EmbedBuilder()
    .setTitle('Command Log')
    .addFields(
      { name: 'User', value: user.tag, inline: true },
      { name: 'Role', value: role, inline: true },
      { name: 'Command', value: `/${command}`, inline: true },
      { name: 'Channel', value: channel.name, inline: true },
      { name: 'Timestamp', value: timestamp, inline: true },
      { name: 'Result', value: result, inline: false }
    )
    .setColor(0x00ff00);

  await logsChannel.send({ embeds: [embed] });
}

// Command definitions
const commands = [
  // Moderation commands
  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete a number of messages')
    .addIntegerOption(option => option.setName('number').setDescription('Number of messages to delete').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set slowmode in the channel')
    .addIntegerOption(option => option.setName('seconds').setDescription('Slowmode duration in seconds').setRequired(true).setMinValue(0).setMaxValue(21600)),
  new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock the channel'),
  new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock the channel'),
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute a user')
    .addUserOption(option => option.setName('user').setDescription('User to mute').setRequired(true))
    .addStringOption(option => option.setName('time').setDescription('Duration (e.g., 10m)').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for mute').setRequired(true)),
  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Unmute a user')
    .addUserOption(option => option.setName('user').setDescription('User to unmute').setRequired(true)),
  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a user')
    .addUserOption(option => option.setName('user').setDescription('User to timeout').setRequired(true))
    .addStringOption(option => option.setName('time').setDescription('Duration (e.g., 10m)').setRequired(true)),
  new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove timeout from a user')
    .addUserOption(option => option.setName('user').setDescription('User to untimeout').setRequired(true)),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user')
    .addUserOption(option => option.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for kick').setRequired(true)),
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user')
    .addUserOption(option => option.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for ban').setRequired(true)),
  new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user')
    .addStringOption(option => option.setName('user').setDescription('User ID to unban').setRequired(true)),
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .addUserOption(option => option.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for warning').setRequired(true)),
  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View warnings for a user')
    .addUserOption(option => option.setName('user').setDescription('User to check').setRequired(true)),
  new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription('Clear warnings for a user')
    .addUserOption(option => option.setName('user').setDescription('User to clear warnings for').setRequired(true)),
  new SlashCommandBuilder()
    .setName('clearreactions')
    .setDescription('Clear reactions from the last message'),

  // Admin/Config commands
  new SlashCommandBuilder()
    .setName('setlogs')
    .setDescription('Set the logs channel')
    .addChannelOption(option => option.setName('channel').setDescription('Channel for logs').setRequired(true)),
  new SlashCommandBuilder()
    .setName('setwelcome')
    .setDescription('Set the welcome channel')
    .addChannelOption(option => option.setName('channel').setDescription('Channel for welcomes').setRequired(true)),
  new SlashCommandBuilder()
    .setName('setlevelchannel')
    .setDescription('Set the level up channel')
    .addChannelOption(option => option.setName('channel').setDescription('Channel for level ups').setRequired(true)),
  new SlashCommandBuilder()
    .setName('setxp')
    .setDescription('Set XP for a user')
    .addUserOption(option => option.setName('user').setDescription('User to set XP for').setRequired(true))
    .addIntegerOption(option => option.setName('amount').setDescription('XP amount').setRequired(true)),
  new SlashCommandBuilder()
    .setName('resetxp')
    .setDescription('Reset XP for a user')
    .addUserOption(option => option.setName('user').setDescription('User to reset XP for').setRequired(true)),
  new SlashCommandBuilder()
    .setName('blacklistxp')
    .setDescription('Blacklist a channel from XP')
    .addChannelOption(option => option.setName('channel').setDescription('Channel to blacklist').setRequired(true)),
  new SlashCommandBuilder()
    .setName('whitelistxp')
    .setDescription('Whitelist a channel for XP')
    .addChannelOption(option => option.setName('channel').setDescription('Channel to whitelist').setRequired(true)),
  new SlashCommandBuilder()
    .setName('forcerole')
    .setDescription('Force assign a role to a user')
    .addUserOption(option => option.setName('user').setDescription('User to assign role').setRequired(true))
    .addRoleOption(option => option.setName('role').setDescription('Role to assign').setRequired(true)),

  // User commands
  new SlashCommandBuilder()
    .setName('level')
    .setDescription('Check your level'),
  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Check your rank'),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View XP leaderboard'),
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Ping the bot'),
  new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Get server information'),
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Get user information')
    .addUserOption(option => option.setName('user').setDescription('User to get info for').setRequired(true)),

  // Football commands
  new SlashCommandBuilder()
    .setName('scores')
    .setDescription('Get live/recent football scores')
    .addStringOption(o => o.setName('league').setDescription('League').setRequired(true)
        .addChoices(
            { name: 'Premier League', value: 'pl' },
            { name: 'La Liga', value: 'laliga' },
            { name: 'Champions League', value: 'ucl' },
            { name: 'Bundesliga', value: 'bundesliga' },
            { name: 'Serie A', value: 'seriea' },
            { name: 'Ligue 1', value: 'ligue1' }
        )),
  new SlashCommandBuilder()
    .setName('standings')
    .setDescription('Get league standings')
    .addStringOption(o => o.setName('league').setDescription('League').setRequired(true)
        .addChoices(
            { name: 'Premier League', value: 'pl' },
            { name: 'La Liga', value: 'laliga' },
            { name: 'Bundesliga', value: 'bundesliga' },
            { name: 'Serie A', value: 'seriea' },
            { name: 'Ligue 1', value: 'ligue1' }
        )),
  new SlashCommandBuilder()
    .setName('player')
    .setDescription("Look up a player's stats")
    .addStringOption(o => o.setName('name').setDescription('Player name').setRequired(true)),
  new SlashCommandBuilder()
    .setName('trivia')
    .setDescription('Start a football trivia question'),
  new SlashCommandBuilder()
    .setName('answer')
    .setDescription('Answer the active trivia question')
    .addStringOption(o => o.setName('answer').setDescription('Your answer').setRequired(true)),
];

// Register commands
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  await client.application.commands.set(commands, GUILD_ID);
  console.log('Commands registered!');
});

// Handle interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName, user, member, guild, channel } = interaction;
  const timestamp = new Date().toISOString();

  // Determine user role
  let userRole = 'User';
  if (member.roles.cache.some(role => role.name === 'VAR Officials')) {
    userRole = 'VAR Official';
  } else if (member.roles.cache.some(role => role.name === 'Match Officials')) {
    userRole = 'Match Official';
  }

  // Permission checks
  const isModerator = userRole === 'Match Official' || userRole === 'VAR Official';
  const isAdmin = userRole === 'VAR Official';

  let hasPermission = false;
  let result = 'Failed: Insufficient permissions';

  if (['purge', 'slowmode', 'lock', 'unlock', 'mute', 'unmute', 'timeout', 'untimeout', 'kick', 'ban', 'unban', 'warn', 'warnings', 'clearwarnings', 'clearreactions'].includes(commandName)) {
    hasPermission = isModerator;
  } else if (['setlogs', 'setwelcome', 'setlevelchannel', 'setxp', 'resetxp', 'blacklistxp', 'whitelistxp', 'forcerole'].includes(commandName)) {
    hasPermission = isAdmin;
  } else {
    hasPermission = true; // User commands
  }

  if (!hasPermission) {
    await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    logCommand(user, userRole, commandName, channel, timestamp, result);
    return;
  }

  // Execute command
  try {
    await interaction.deferReply({ ephemeral: true });

    switch (commandName) {
      case 'purge':
        const number = interaction.options.getInteger('number');
        await channel.bulkDelete(number);
        result = `Purged ${number} messages`;
        break;
      case 'slowmode':
        const seconds = interaction.options.getInteger('seconds');
        await channel.setRateLimitPerUser(seconds);
        result = `Slowmode set to ${seconds} seconds`;
        break;
      case 'lock':
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
        result = 'Channel locked';
        break;
      case 'unlock':
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
        result = 'Channel unlocked';
        break;
      case 'mute':
        const muteUser = interaction.options.getMember('user');
        const muteTime = interaction.options.getString('time');
        const muteReason = interaction.options.getString('reason');
        const muteDuration = ms(muteTime);
        await muteUser.timeout(muteDuration, muteReason);
        result = `Muted ${muteUser.user.tag} for ${muteTime}`;
        break;
      case 'unmute':
        const unmuteUser = interaction.options.getMember('user');
        await unmuteUser.timeout(null);
        result = `Unmuted ${unmuteUser.user.tag}`;
        break;
      case 'timeout':
        const timeoutUser = interaction.options.getMember('user');
        const timeoutTime = interaction.options.getString('time');
        const timeoutDuration = ms(timeoutTime);
        await timeoutUser.timeout(timeoutDuration);
        result = `Timed out ${timeoutUser.user.tag} for ${timeoutTime}`;
        break;
      case 'untimeout':
        const untimeoutUser = interaction.options.getMember('user');
        await untimeoutUser.timeout(null);
        result = `Removed timeout from ${untimeoutUser.user.tag}`;
        break;
      case 'kick':
        const kickUser = interaction.options.getMember('user');
        const kickReason = interaction.options.getString('reason');
        await kickUser.kick(kickReason);
        result = `Kicked ${kickUser.user.tag}`;
        break;
      case 'ban':
        const banUser = interaction.options.getMember('user');
        const banReason = interaction.options.getString('reason');
        await banUser.ban({ reason: banReason });
        result = `Banned ${banUser.user.tag}`;
        break;
      case 'unban':
        const unbanUserId = interaction.options.getString('user');
        await guild.members.unban(unbanUserId);
        result = `Unbanned user ID ${unbanUserId}`;
        break;
      case 'warn':
        const warnUser = interaction.options.getMember('user');
        const warnReason = interaction.options.getString('reason');
        if (!warnings[warnUser.id]) warnings[warnUser.id] = [];
        warnings[warnUser.id].push({ reason: warnReason, timestamp: new Date() });
        result = `Warned ${warnUser.user.tag}`;
        break;
      case 'warnings':
        const warningsUser = interaction.options.getUser('user');
        const userWarnings = warnings[warningsUser.id] || [];
        result = userWarnings.length ? userWarnings.map(w => `${w.timestamp}: ${w.reason}`).join('\n') : 'No warnings';
        break;
      case 'clearwarnings':
        const clearUser = interaction.options.getUser('user');
        warnings[clearUser.id] = [];
        result = `Cleared warnings for ${clearUser.tag}`;
        break;
      case 'clearreactions':
        const lastMessage = await channel.messages.fetch({ limit: 1 });
        if (lastMessage.size > 0) {
          await lastMessage.first().reactions.removeAll();
          result = 'Cleared reactions from last message';
        } else {
          result = 'No messages in channel';
        }
        break;
      case 'setlogs':
        const logsChannel = interaction.options.getChannel('channel');
        config.logsChannel = logsChannel.id;
        result = `Logs channel set to ${logsChannel.name}`;
        break;
      case 'setwelcome':
        const welcomeChannel = interaction.options.getChannel('channel');
        config.welcomeChannel = welcomeChannel.id;
        result = `Welcome channel set to ${welcomeChannel.name}`;
        break;
      case 'setlevelchannel':
        const levelChannel = interaction.options.getChannel('channel');
        config.levelChannel = levelChannel.id;
        result = `Level channel set to ${levelChannel.name}`;
        break;
      case 'setxp':
        const setXpUser = interaction.options.getUser('user');
        const xpAmount = interaction.options.getInteger('amount');
        xpData[setXpUser.id] = xpAmount;
        result = `Set XP for ${setXpUser.tag} to ${xpAmount}`;
        break;
      case 'resetxp':
        const resetXpUser = interaction.options.getUser('user');
        xpData[resetXpUser.id] = 0;
        result = `Reset XP for ${resetXpUser.tag}`;
        break;
      case 'blacklistxp':
        const blacklistChannel = interaction.options.getChannel('channel');
        config.xpBlacklist.add(blacklistChannel.id);
        result = `Blacklisted ${blacklistChannel.name} from XP`;
        break;
      case 'whitelistxp':
        const whitelistChannel = interaction.options.getChannel('channel');
        config.xpWhitelist.add(whitelistChannel.id);
        result = `Whitelisted ${whitelistChannel.name} for XP`;
        break;
      case 'forcerole':
        const forceUser = interaction.options.getMember('user');
        const forceRole = interaction.options.getRole('role');
        await forceUser.roles.add(forceRole);
        result = `Added ${forceRole.name} to ${forceUser.user.tag}`;
        break;
      case 'level':
        const userXp = xpData[user.id] || 0;
        const level = Math.floor(userXp / 100);
        result = `Your level is ${level} (${userXp} XP)`;
        break;
      case 'rank':
        const sorted = Object.entries(xpData).sort((a, b) => b[1] - a[1]);
        const rank = sorted.findIndex(([id]) => id === user.id) + 1;
        result = `Your rank is ${rank}`;
        break;
      case 'leaderboard':
        const top10 = sorted.slice(0, 10).map(([id, xp], i) => `${i + 1}. <@${id}> - ${xp} XP`).join('\n');
        result = top10 || 'No XP data';
        break;
      case 'ping':
        result = 'Pong!';
        break;
      case 'serverinfo':
        result = `Server: ${guild.name}, Members: ${guild.memberCount}`;
        break;
      case 'userinfo':
        const infoUser = interaction.options.getUser('user');
        result = `User: ${infoUser.tag}, ID: ${infoUser.id}`;
        break;
      case 'scores':
        await interaction.deferReply();
        const league = interaction.options.getString('league');
        try {
          const data = await fetchFootball(`fixtures?league=${LEAGUE_IDS[league]}&last=5`);
          if (!data.response?.length) {
            result = 'No recent fixtures found.';
          } else {
            const embed = new EmbedBuilder().setColor('#1abc9c').setTitle(`⚽ ${LEAGUE_NAMES[league]} — Recent Scores`).setTimestamp();
            data.response.slice(0, 8).forEach(f => {
              const elapsed = f.fixture.status.elapsed ? `${f.fixture.status.elapsed}'` : f.fixture.status.short;
              embed.addFields({ name: `${f.teams.home.name} vs ${f.teams.away.name}`, value: `**${f.goals.home ?? '-'} - ${f.goals.away ?? '-'}** (${elapsed})`, inline: true });
            });
            await interaction.editReply({ embeds: [embed] });
            return;
          }
        } catch {
          result = '❌ Failed to fetch scores. Check FOOTBALL_API_KEY in .env';
        }
        break;
      case 'standings':
        await interaction.deferReply();
        const leagueStand = interaction.options.getString('league');
        try {
          const data = await fetchFootball(`standings?league=${LEAGUE_IDS[leagueStand]}&season=${new Date().getFullYear()}`);
          const table = data.response?.[0]?.league?.standings?.[0];
          if (!table) {
            result = '❌ Could not fetch standings.';
          } else {
            const rows = table.slice(0, 10).map(t =>
              `\`${String(t.rank).padStart(2)}.\` **${t.team.name}** — ${t.points}pts (${t.all.win}W ${t.all.draw}D ${t.all.lose}L)`
            ).join('\n');
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor('#f39c12').setTitle(`🏆 ${LEAGUE_NAMES[leagueStand]} — Top 10`).setDescription(rows).setTimestamp()] });
            return;
          }
        } catch {
          result = '❌ Failed to fetch standings. Check FOOTBALL_API_KEY in .env';
        }
        break;
      case 'player':
        await interaction.deferReply();
        const name = interaction.options.getString('name');
        try {
          const data = await fetchFootball(`players?search=${encodeURIComponent(name)}&season=${new Date().getFullYear()}`);
          const player = data.response?.[0];
          if (!player) {
            result = `❌ No player found for **${name}**.`;
          } else {
            const p = player.player, stats = player.statistics?.[0];
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor('#3498db').setTitle(`👤 ${p.firstname} ${p.lastname}`)
              .setThumbnail(p.photo)
              .addFields(
                { name: 'Age', value: `${p.age}`, inline: true },
                { name: 'Nationality', value: p.nationality || 'N/A', inline: true },
                { name: 'Club', value: stats?.team?.name || 'N/A', inline: true },
                { name: 'Position', value: stats?.games?.position || 'N/A', inline: true },
                { name: 'Appearances', value: `${stats?.games?.appearences ?? 0}`, inline: true },
                { name: 'Goals', value: `${stats?.goals?.total ?? 0}`, inline: true },
                { name: 'Assists', value: `${stats?.goals?.assists ?? 0}`, inline: true },
                { name: 'Yellow Cards', value: `${stats?.cards?.yellow ?? 0}`, inline: true },
                { name: 'Red Cards', value: `${stats?.cards?.red ?? 0}`, inline: true }
              ).setTimestamp()] });
            return;
          }
        } catch {
          result = '❌ Failed to fetch player. Check FOOTBALL_API_KEY in .env';
        }
        break;
      case 'trivia':
        if (activeTrivia.has(channel.id)) {
          result = '❌ There is already an active trivia question here!';
        } else {
          const q = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
          const timeout = setTimeout(() => {
            activeTrivia.delete(channel.id);
            channel.send({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('⏰ Time\'s Up!').setDescription(`Nobody got it! The answer was **${q.display}**`)] });
          }, 30000);
          activeTrivia.set(channel.id, { ...q, timeout });
          await interaction.reply({ embeds: [new EmbedBuilder().setColor('#9b59b6').setTitle('🧠 Football Trivia!')
            .setDescription(q.question).setFooter({ text: 'Answer in chat or use /answer — You have 30 seconds!' }).setTimestamp()] });
          return;
        }
        break;
      case 'answer':
        const trivia = activeTrivia.get(channel.id);
        if (!trivia) {
          result = '❌ No active trivia! Use /trivia to start one.';
        } else {
          const userAnswer = interaction.options.getString('answer').toLowerCase().trim();
          if (userAnswer.includes(trivia.answer) || trivia.answer.includes(userAnswer)) {
            clearTimeout(trivia.timeout);
            activeTrivia.delete(channel.id);
            await interaction.reply({ embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('✅ Correct!')
              .setDescription(`**${interaction.user.username}** got it! The answer was **${trivia.display}** 🏆`)] });
            return;
          } else {
            result = '❌ Wrong answer, keep trying!';
          }
        }
        break;
    }

    await interaction.editReply({ content: result });
  } catch (error) {
    console.error(error);
    result = `Error: ${error.message}`;
    await interaction.editReply({ content: 'An error occurred.' });
  }

  logCommand(user, userRole, commandName, channel, timestamp, result);
});

// XP system and trivia answers
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;
  const channelId = message.channel.id;
  const guild = message.guild;

  // Check for trivia answer
  const trivia = activeTrivia.get(channelId);
  if (trivia) {
    const userAnswer = message.content.toLowerCase().trim();
    if (userAnswer.includes(trivia.answer) || trivia.answer.includes(userAnswer)) {
      clearTimeout(trivia.timeout);
      activeTrivia.delete(channelId);
      await message.reply({ embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('✅ Correct!')
        .setDescription(`**${message.author.username}** got it! The answer was **${trivia.display}** 🏆`)] });
      return;
    }
  }

  // Check XP channel restrictions
  if (config.xpWhitelist.size > 0) {
    if (!config.xpWhitelist.has(channelId)) return;
  } else if (config.xpBlacklist.has(channelId)) {
    return;
  }

  // Check cooldown (1 minute)
  const now = Date.now();
  const lastXpTime = xpCooldowns.get(userId);
  if (lastXpTime && now - lastXpTime < 60000) return;

  // Award XP (1-5 random)
  const xpGain = Math.floor(Math.random() * 5) + 1;
  const oldXp = xpData[userId] || 0;
  const newXp = oldXp + xpGain;
  xpData[userId] = newXp;

  // Update cooldown
  xpCooldowns.set(userId, now);

  // Check for level up
  const oldLevel = Math.floor(oldXp / 100);
  const newLevel = Math.floor(newXp / 100);

  if (newLevel > oldLevel && config.levelChannel) {
    const levelChannel = guild.channels.cache.get(config.levelChannel);
    if (levelChannel) {
      await levelChannel.send(`🎉 Congratulations <@${userId}>! You leveled up to level ${newLevel}!`);
    }
  }
});

// Login
client.login(DISCORD_TOKEN);
