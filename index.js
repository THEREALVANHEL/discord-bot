// index.js (REPLACE - Added persistent giveaway timer restart on startup)
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
// ... (client.config content remains the same)
// ...
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
  
  // NEW: Load active giveaways from DB on startup
  const Giveaway = require('./models/Giveaway');
  const { endGiveaway } = require('./commands/giveaway');
  
  if (Giveaway) {
    Giveaway.find({ endTime: { $gt: new Date() } }).then(giveaways => { // Only fetch future giveaways
      giveaways.forEach(giveaway => {
        const timeUntil = giveaway.endTime.getTime() - Date.now();
        
        if (timeUntil > 0) {
          // Convert Mongoose document to plain object for use in client map and endGiveaway function
          const giveawayData = giveaway.toObject();
          
          const timeout = setTimeout(async () => {
            // Use the imported endGiveaway function
            await endGiveaway(client, giveawayData);
          }, timeUntil);
          
          client.giveaways.set(giveaway.messageId, timeout);
          console.log(`Rescheduled giveaway: ${giveaway.messageId} for ${timeUntil / 1000} seconds.`);
        } else {
          // Giveaway expired while bot was offline, end it immediately
          Giveaway.deleteOne({ messageId: giveaway.messageId }).catch(console.error);
        }
      });
    }).catch(console.error);
  }

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
