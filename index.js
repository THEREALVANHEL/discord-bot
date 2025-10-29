// index.js (FIXED - MongoDB Connection)
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder } = require('discord.js'); 
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const express = require('express');

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
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember],
});

global.clientInstance = client;

client.commands = new Collection();
client.cooldowns = new Collection();
client.giveaways = new Map();
client.locks = new Map();
client.reminders = new Map();
client.polls = new Map();
client.xpCooldowns = new Map();

client.config = {
  guildId: process.env.GUILD_ID,
  roles: {
    autoJoin: '1384141744303636610',
    leadMod: '1371147562257748050',
    mod: '1371728518467293236',
    cookiesManager: '1372121024841125888',
    forgottenOne: '1376574861333495910',
    overseer: '1371004219875917875',
    gamelogUser: '1371003310223654974',
    headHost: '1378338515791904808',
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
    { title: 'Intern', minWorks: 0, worksToNextMajor: 50, xpReward: [10, 20], coinReward: [20, 40], successRate: 95, id: 'intern' },
    { title: 'Junior Developer', minWorks: 50, worksToNextMajor: 100, xpReward: [20, 40], coinReward: [50, 90], successRate: 90, id: 'junior_dev' },
    { title: 'Software Developer', minWorks: 150, worksToNextMajor: 150, xpReward: [40, 70], coinReward: [100, 160], successRate: 85, id: 'software_dev' },
    { title: 'Senior Developer', minWorks: 300, worksToNextMajor: 200, xpReward: [70, 110], coinReward: [180, 250], successRate: 80, id: 'senior_dev' },
    { title: 'Team Lead', minWorks: 500, worksToNextMajor: 300, xpReward: [110, 160], coinReward: [280, 400], successRate: 75, id: 'team_lead' },
    { title: 'Engineering Manager', minWorks: 800, worksToNextMajor: 500, xpReward: [160, 230], coinReward: [450, 650], successRate: 70, id: 'eng_manager' },
    { title: 'Director', minWorks: 1300, worksToNextMajor: 700, xpReward: [230, 320], coinReward: [700, 1000], successRate: 65, id: 'director' },
    { title: 'VP of Engineering', minWorks: 2000, worksToNextMajor: 1000, xpReward: [320, 450], coinReward: [1200, 1800], successRate: 60, id: 'vp_eng' },
    { title: 'CTO', minWorks: 3000, worksToNextMajor: 2000, xpReward: [450, 650], coinReward: [2000, 3000], successRate: 55, id: 'cto' },
    { title: 'Tech Legend', minWorks: 5000, worksToNextMajor: Infinity, xpReward: [700, 1200], coinReward: [3500, 6000], successRate: 50, id: 'tech_legend' },
  ],
  shopItems: [
    { id: 'xp_boost_1h', name: '1 Hour XP Boost', description: 'Gain 2x XP for 1 hour.', price: 500, type: 'boost' },
    { id: 'rename_ticket', name: 'Nickname Change Ticket', description: 'Change your nickname once.', price: 1000, type: 'utility' },
  ],
};

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  try {
    const command = require(path.join(commandsPath, file));
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
    }
  } catch (error) {
    console.error(`Error loading command ${file}:`, error);
  }
}

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
  try {
    const event = require(path.join(eventsPath, file));
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  } catch (error) {
    console.error(`Error loading event ${file}:`, error);
  }
}

// MongoDB Connection with better error handling
async function connectMongoDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    
    console.log('✅ Connected to MongoDB');
    
    // Test the connection
    const User = require('./models/User');
    const testUser = await User.findOne().limit(1);
    console.log('✅ MongoDB connection verified:', testUser ? 'Data found' : 'No data yet');
    
    // Load reminders
    await loadReminders();
    
    // Load giveaways
    await loadGiveaways();
    
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    console.error('Retrying in 5 seconds...');
    setTimeout(connectMongoDB, 5000);
  }
}

// Load reminders from database
async function loadReminders() {
  try {
    const User = require('./models/User');
    const users = await User.find({ 'reminders.0': { $exists: true } });
    
    console.log(`📋 Loading ${users.length} users with reminders`);
    
    users.forEach(user => {
      user.reminders.forEach(reminder => {
        const timeUntil = reminder.remindAt.getTime() - Date.now();
        
        if (timeUntil > 0) {
          const timeout = setTimeout(async () => {
            try {
              const reminderEmbed = new EmbedBuilder()
                .setTitle('🔔 Personal Reminder!')
                .setDescription(`You asked to be reminded about: **${reminder.message}**`)
                .setColor(0xFF4500)
                .setTimestamp();

              const fetchedUser = await client.users.fetch(user.userId);
              await fetchedUser.send({ embeds: [reminderEmbed] });

              // Remove from database
              user.reminders = user.reminders.filter(r => r._id.toString() !== reminder._id.toString());
              await user.save();
              
              client.reminders.delete(reminder._id.toString());
            } catch (error) {
              console.error(`Could not send reminder to ${user.userId}:`, error);
            }
          }, timeUntil);
          
          client.reminders.set(reminder._id.toString(), timeout);
        } else {
          // Remove expired reminder
          user.reminders = user.reminders.filter(r => r._id.toString() !== reminder._id.toString());
          user.save();
        }
      });
    });
    
    console.log(`✅ Loaded ${client.reminders.size} active reminders`);
  } catch (error) {
    console.error('Error loading reminders:', error);
  }
}

// Load giveaways from database
async function loadGiveaways() {
  try {
    const Giveaway = require('./models/Giveaway');
    const { endGiveaway } = require('./commands/giveaway');
    
    const giveaways = await Giveaway.find({ endTime: { $gt: new Date() } });
    
    console.log(`🎁 Loading ${giveaways.length} active giveaways`);
    
    giveaways.forEach(giveaway => {
      const timeUntil = giveaway.endTime.getTime() - Date.now();
      
      if (timeUntil > 0) {
        const giveawayData = giveaway.toObject();
        
        const timeout = setTimeout(async () => {
          await endGiveaway(client, giveawayData);
        }, timeUntil);
        
        client.giveaways.set(giveaway.messageId, timeout);
      } else {
        Giveaway.deleteOne({ messageId: giveaway.messageId }).catch(console.error);
      }
    });
    
    console.log(`✅ Loaded ${client.giveaways.size} active giveaways`);
  } catch (error) {
    console.error('Error loading giveaways:', error);
  }
}

// Dummy HTTP server for hosting platforms
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('Discord Bot is running!');
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime(),
  });
});

app.listen(PORT, () => {
  console.log(`Dummy HTTP server listening on port ${PORT}`);
});

// Connect to MongoDB
connectMongoDB();

// Login to Discord
client.login(process.env.DISCORD_TOKEN).then(() => {
  console.log('✅ Bot logged in successfully');
}).catch(err => {
  console.error('❌ Bot login failed:', err);
});

// Handle MongoDB disconnection
mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected, attempting to reconnect...');
  connectMongoDB();
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB error:', err);
});
