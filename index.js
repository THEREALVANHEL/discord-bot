// index.js (REPLACE - Updated workProgression, added client.polls, cleaned config)
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder } = require('discord.js'); // Added EmbedBuilder for reminder loading logic
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const express = require('express'); // Add this for the dummy HTTP server

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
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember], // Added GuildMember partial for robust fetching
});

client.commands = new Collection();
client.cooldowns = new Collection();
client.giveaways = new Map();
client.locks = new Map();
client.reminders = new Map(); // New map for in-memory reminders
client.polls = new Map(); // NEW map for in-memory poll data

client.config = {
  guildId: process.env.GUILD_ID,
  roles: {
    autoJoin: '1384141744303636610',
    leadMod: '1371147562257748050',
    mod: '1371728518467293236',
    cookiesManager: '1372121024841125888',
    forgottenOne: '1376574861333495910', // Admin
    overseer: '1371004219875917875',     // Admin
    gamelogUser: '1371003310223654974',   // Renamed for clarity
    headHost: '1378338515791904808',      // New Role ID for Gamelog
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
  // UPDATED: New Job Progression Structure with 7 distinct jobs + Tech Legend.
  // Progression is based on successfulWorks, not maxLevel.
  workProgression: [
    // Job Title | Min Level | Min Works for promotion | XP Reward Range | Coin Reward Range | Success Rate (%) | Job ID
    { title: 'Scavenger', minLevel: 0, minWorks: 0, xpReward: [5, 10], coinReward: [10, 20], successRate: 90, id: 'scavenger' },
    { title: 'Miner', minLevel: 5, minWorks: 10, xpReward: [10, 15], coinReward: [25, 40], successRate: 85, id: 'miner' },
    { title: 'Hunter', minLevel: 10, minWorks: 25, xpReward: [15, 25], coinReward: [40, 60], successRate: 80, id: 'hunter' },
    { title: 'Courier', minLevel: 15, minWorks: 50, xpReward: [25, 40], coinReward: [60, 90], successRate: 75, id: 'courier' },
    { title: 'Technician', minLevel: 25, minWorks: 100, xpReward: [40, 60], coinReward: [90, 130], successRate: 65, id: 'technician' },
    { title: 'Engineer', minLevel: 40, minWorks: 200, xpReward: [60, 90], coinReward: [130, 180], successRate: 55, id: 'engineer' },
    { title: 'Data Scientist', minLevel: 60, minWorks: 350, xpReward: [90, 130], coinReward: [180, 250], successRate: 45, id: 'data_scientist' },
    { title: 'Tech Legend', minLevel: 100, minWorks: 550, xpReward: [130, 200], coinReward: [250, 400], successRate: 35, id: 'tech_legend' },
  ],
  shopItems: [
    { id: 'xp_boost_1h', name: '1 Hour XP Boost', description: 'Gain 2x XP for 1 hour.', price: 500, type: 'boost' },
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

  // Load reminders from DB on startup
  const User = require('./models/User');
  User.find({ 'reminders.0': { $exists: true } }).then(users => {
    users.forEach(user => {
      user.reminders.forEach(reminder => {
        const timeUntil = reminder.remindAt.getTime() - Date.now();
        if (timeUntil > 0) {
          const timeout = setTimeout(async () => {
            try {
              // Note: EmbedBuilder is required here, ensuring it is imported at the top now.
              const reminderEmbed = new EmbedBuilder()
                .setTitle('🔔 Personal Reminder!')
                .setDescription(`You asked to be reminded about: **${reminder.message}**`)
                .setColor(0xFF4500)
                .setTimestamp();

              const fetchedUser = await client.users.fetch(user.userId);
              await fetchedUser.send({ embeds: [reminderEmbed] });

              // Remove from DB after sending
              user.reminders = user.reminders.filter(r => r._id.toString() !== reminder._id.toString());
              await user.save();
            } catch (error) {
              console.error(`Could not send loaded reminder to ${user.userId}:`, error);
              // In this case, we don't have the original channel to fall back to.
            }
          }, timeUntil);
          client.reminders.set(reminder._id.toString(), timeout);
        } else {
          // Remove outdated reminder immediately
          user.reminders = user.reminders.filter(r => r._id.toString() !== reminder._id.toString());
          user.save();
        }
      });
    });
  });

}).catch(console.error);

// Dummy HTTP server for Render Web Service (binds to $PORT for health checks)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Discord Bot is running!');
});

app.listen(PORT, () => {
  console.log(`Dummy HTTP server listening on port ${PORT}`);
});

client.login(process.env.DISCORD_TOKEN);
