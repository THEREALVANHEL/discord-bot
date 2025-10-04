// index.js (Fixed syntax error in roles object)
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();
client.cooldowns = new Collection();
client.giveaways = new Map();
client.locks = new Map(); // For temporary channel locks

client.config = {
  guildId: process.env.GUILD_ID,
  roles: {
    autoJoin: '1384141744303636610',
    leadMod: '1371147562257748050',
    mod: '1371728518467293236',
    cookiesManager: '1372121024841125888',
    forgottenOne: '1376574861333495910', // Admin
    overseer: '1371004219875917875',     // Admin
    gamelog: '1371003310223654974',       // Fixed: Removed invalid "User  " and made it a string key-value
  },
  levelingRoles: [
    { level: 30, roleId: '1371032270361853962' },
    { level: 60, roleId: '1371032537740214302' },
    { level: 120, roleId: '1371032664026382427' },
    { level: 210, roleId: '1371032830217289748' },
    { level: 300, roleId: '1371032964938600521' },
    { level: 450, roleId: '1371033073038266429' },
  ],
  cookieRoles: [
    { cookies: 100, roleId: '1370998669884788788' },
    { cookies: 500, roleId: '1370999721593671760' },
    { cookies: 1000, roleId: '1371000389444305017' },
    { cookies: 1750, roleId: '1371001322131947591' },
    { cookies: 3000, roleId: '1371001806930579518' },
    { cookies: 5000, roleId: '1371004762761461770' },
  ],
  workProgression: [
    { level: 0, title: 'Intern', xpReward: 10, coinReward: 5 },
    { level: 10, title: 'Junior Developer', xpReward: 15, coinReward: 8 },
    { level: 20, title: 'Software Developer', xpReward: 20, coinReward: 12 },
    { level: 30, title: 'Senior Developer', xpReward: 25, coinReward: 15 },
    { level: 50, title: 'Team Lead', xpReward: 30, coinReward: 20 },
    { level: 100, title: 'Engineering Manager', xpReward: 40, coinReward: 25 },
    { level: 200, title: 'Director', xpReward: 50, coinReward: 30 },
    { level: 300, title: 'VP of Engineering', xpReward: 60, coinReward: 35 },
    { level: 450, title: 'CTO', xpReward: 75, coinReward: 40 },
    { level: 1000, title: 'Tech Legend', xpReward: 100, coinReward: 50 },
  ],
  shopItems: [
    { id: 'xp_boost_1h', name: '1 Hour XP Boost', description: 'Gain 2x XP for 1 hour.', price: 500, type: 'boost' },
    { id: 'cookie_pack_small', name: 'Small Cookie Pack', description: 'Get 100 cookies instantly.', price: 200, type: 'item', cookies: 100 },
    { id: 'rename_ticket', name: 'Nickname Change Ticket', description: 'Change your nickname once.', price: 1000, type: 'utility' },
  ],
};

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
  }
}

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(console.error);

client.login(process.env.DISCORD_TOKEN);
