// index.js (Full Update - Prefix commands, Grant/Ungrant, Lock/Unlock)
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const express = require('express');

// --- Discord Client Setup ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Required for prefix commands
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildBans, // Ensure this is present
    GatewayIntentBits.GuildModeration, // For timeouts etc.
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember],
});

global.clientInstance = client; // Make client accessible globally if needed by older utils

// --- Collections and Maps ---
client.commands = new Collection(); // Stores both slash and prefix commands
client.cooldowns = new Collection(); // For command cooldowns
client.giveaways = new Map();      // messageId -> giveaway data or timeout
client.locks = new Map();          // channelId -> { endTime, reason, timeoutId, moderatorId }
client.reminders = new Map();      // reminderId (from DB) -> timeoutId
client.polls = new Map();          // messageId -> poll data
client.xpCooldowns = new Map();    // userId -> timestamp
client.grantedUsers = new Map();   // userId -> { roleId: string, timeoutId: NodeJS.Timeout } (for grant/ungrant)

// --- Bot Configuration ---
// Make sure role IDs are correct for YOUR server
client.config = {
  guildId: process.env.GUILD_ID,
  roles: {
    autoJoin: process.env.AUTO_JOIN_ROLE_ID || null, // Example: '1384141744303636610'
    leadMod: process.env.LEAD_MOD_ROLE_ID || '1371147562257748050',
    mod: process.env.MOD_ROLE_ID || '1371728518467293236',
    cookiesManager: process.env.COOKIES_MANAGER_ROLE_ID || '1372121024841125888',
    forgottenOne: process.env.FORGOTTEN_ONE_ROLE_ID || '1376574861333495910',
    overseer: process.env.OVERSEER_ROLE_ID || '1371004219875917875',
    gamelogUser: process.env.GAMELOG_USER_ROLE_ID || '1371003310223654974',
    headHost: process.env.HEAD_HOST_ROLE_ID || '1378338515791904808',
    // tempModRole: process.env.TEMP_MOD_ROLE_ID || '1433118039275999232' // ID already hardcoded in grant/ungrant
  },
  // Keep your levelingRoles, cookieRoles, workProgression, shopItems configurations here
   levelingRoles: [
     { level: 30, roleId: '1371032270361853962' },
     { level: 60, roleId: '1371032537740214302' },
     // ... add others
   ],
   cookieRoles: [
     { cookies: 100, roleId: '1370998669884788788' },
     { cookies: 500, roleId: '1370999721593671760' },
     // ... add others
   ],
   workProgression: [
     { title: 'Intern', minWorks: 0, worksToNextMajor: 50, xpReward: [10, 20], coinReward: [20, 40], successRate: 95, id: 'intern' },
     { title: 'Junior Developer', minWorks: 50, worksToNextMajor: 100, xpReward: [20, 40], coinReward: [50, 90], successRate: 90, id: 'junior_dev' },
     // ... add others up to Tech Legend
      { title: 'Tech Legend', minWorks: 5000, worksToNextMajor: Infinity, xpReward: [700, 1200], coinReward: [3500, 6000], successRate: 50, id: 'tech_legend' },
   ],
   shopItems: [
     { id: 'xp_boost_1h', name: '1 Hour XP Boost', description: 'Gain 2x XP for 1 hour.', price: 500, type: 'boost' },
     { id: 'rename_ticket', name: 'Nickname Change Ticket', description: 'Change your nickname once.', price: 1000, type: 'utility' },
     // ... add others
   ],
};

// --- Load Commands ---
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log("--- Loading Commands ---");
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
        const command = require(filePath);

        // Slash command check
        if (command.data && typeof command.data.toJSON === 'function' && command.execute) {
            client.commands.set(command.data.name, command);
            console.log(`[SLASH] Loaded: ${command.data.name}`);
        }
        // Prefix command check (must have name and execute, NO data)
        else if (command.name && command.execute && !command.data) {
             client.commands.set(command.name, command);
             console.log(`[PREFIX] Loaded: ${command.name}`);
             if (command.aliases && Array.isArray(command.aliases)) {
                 command.aliases.forEach(alias => {
                     // Be careful not to overwrite existing commands/aliases
                     if (!client.commands.has(alias)) {
                        client.commands.set(alias, command);
                        console.log(`       - Alias: ${alias}`);
                     } else {
                        console.warn(`[WARNING] Alias '${alias}' for command '${command.name}' conflicts with existing command/alias. Skipping alias.`);
                     }
                 });
             }
        } else {
             console.warn(`[WARNING] Command file '${file}' is invalid (missing properties). Skipping.`);
        }
    } catch (error) {
        console.error(`❌ Error loading command ${file}:`, error);
    }
}
console.log("--- Finished Loading Commands ---");


// --- Load Events ---
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

console.log("--- Loading Events ---");
for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    try {
        const event = require(filePath);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
        console.log(`[EVENT] Loaded: ${event.name}`);
    } catch (error) {
        console.error(`❌ Error loading event ${file}:`, error);
    }
}
console.log("--- Finished Loading Events ---");


// --- MongoDB Connection ---
async function connectMongoDB() {
    if (!process.env.MONGODB_URI) {
        console.error("❌ MONGODB_URI not found in environment variables. Database connection failed.");
        process.exit(1); // Exit if DB connection is critical
    }
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 10000, // Increased timeout
            socketTimeoutMS: 45000,
        });
        console.log('✅ Connected to MongoDB');

        // Initial data loading after connection
        await loadReminders();
        await loadGiveaways();
        // Add loading for active grants if you implement persistence

    } catch (error) {
        console.error('❌ MongoDB initial connection error:', error);
        console.error('Retrying MongoDB connection in 5 seconds...');
        setTimeout(connectMongoDB, 5000); // Retry connection
    }
}

// --- Data Loading Functions --- (Keep your existing loadReminders and loadGiveaways)
async function loadReminders() {
  try {
    const User = require('./models/User'); // Ensure model is loaded
    const users = await User.find({ 'reminders.0': { $exists: true } });
    let loadedCount = 0;
    console.log(`📋 Checking reminders for ${users.length} users...`);

    users.forEach(user => {
      let remindersChanged = false;
      const activeRemindersForUser = []; // Keep track of which reminders remain

      user.reminders.forEach(reminder => {
        const reminderIdString = reminder._id.toString();
        const timeUntil = reminder.remindAt.getTime() - Date.now();

        if (timeUntil > 0) {
          activeRemindersForUser.push(reminder); // Keep this reminder
          // Avoid setting duplicate timeouts if already loaded
          if (!client.reminders.has(reminderIdString)) {
             const timeout = setTimeout(async () => {
                try {
                    // Reminder logic (DM user, maybe fallback to channel)
                     const userToRemind = await client.users.fetch(user.userId).catch(() => null);
                     if (userToRemind) {
                         const reminderEmbed = new EmbedBuilder()
                           .setTitle('🔔 Personal Reminder!')
                           .setDescription(`You asked to be reminded about: **${reminder.message}**`)
                           .setColor(0xFF4500)
                           .setTimestamp();
                         await userToRemind.send({ embeds: [reminderEmbed] });
                     } else {
                         console.warn(`Could not find user ${user.userId} to send reminder.`);
                     }

                    // Remove from database after sending/attempting
                    const finalUser = await User.findOne({ userId: user.userId });
                    if (finalUser) {
                        finalUser.reminders = finalUser.reminders.filter(r => r._id.toString() !== reminderIdString);
                        await finalUser.save();
                    }
                } catch (error) {
                  console.error(`Could not send reminder DM to ${user.userId}:`, error);
                  // Optionally try sending to original channel as fallback
                } finally {
                    client.reminders.delete(reminderIdString); // Remove from map
                }
             }, timeUntil);
             client.reminders.set(reminderIdString, timeout);
             loadedCount++;
          }
        } else {
           // Reminder expired while bot was offline
           console.log(`Removing expired reminder ${reminderIdString} for user ${user.userId}`);
           remindersChanged = true; // Mark that we need to save changes for this user
        }
      });

      // If any reminders expired, update the user document
      if (remindersChanged) {
          user.reminders = activeRemindersForUser;
          user.save().catch(err => console.error(`Error saving user ${user.userId} after removing expired reminders:`, err));
      }
    });

    console.log(`✅ Loaded ${client.reminders.size} active reminders (${loadedCount} newly set).`);
  } catch (error) {
    console.error('❌ Error loading reminders:', error);
  }
}

async function loadGiveaways() {
  try {
    const Giveaway = require('./models/Giveaway'); // Ensure model is loaded
    const { endGiveaway } = require('./commands/giveaway'); // Ensure path is correct

    const giveaways = await Giveaway.find({ endTime: { $gt: new Date() } });
    let loadedCount = 0;
    console.log(`🎁 Checking ${giveaways.length} potential active giveaways...`);

    giveaways.forEach(giveaway => {
      const messageId = giveaway.messageId;
      const timeUntil = giveaway.endTime.getTime() - Date.now();

      if (timeUntil > 0) {
        // Avoid setting duplicate timeouts
        if (!client.giveaways.has(messageId)) {
           const giveawayData = giveaway.toObject(); // Use plain object for timeout

           const timeout = setTimeout(() => {
             // Pass client and giveawayData to endGiveaway
             endGiveaway(client, giveawayData).catch(err => console.error(`Error ending giveaway ${messageId}:`, err));
           }, timeUntil);

           client.giveaways.set(messageId, timeout); // Store the timeout ID
           loadedCount++;
        }
      } else {
        // Giveaway ended while bot was offline - trigger end logic immediately
        console.log(`Giveaway ${messageId} expired while offline. Ending now.`);
        // Pass client and a plain object version of giveaway data
        endGiveaway(client, giveaway.toObject()).catch(err => console.error(`Error ending expired giveaway ${messageId}:`, err));
         // No need to set a timeout, endGiveaway handles DB deletion
      }
    });

    console.log(`✅ Loaded ${client.giveaways.size} active giveaway timers (${loadedCount} newly set).`);
  } catch (error) {
    console.error('❌ Error loading giveaways:', error);
  }
}


// --- Dummy HTTP Server (for hosting platforms) ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Discord Bot is running!'));
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        discordReady: client.isReady(),
        mongodbState: mongoose.connection.readyState, // 0: disconnected, 1: connected, 2: connecting, 3: disconnecting
        uptime: process.uptime(),
    });
});
app.listen(PORT, () => console.log(`Dummy HTTP server listening on port ${PORT}`));

// --- MongoDB Event Listeners ---
mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
    // Add reconnect logic if needed, but mongoose might handle basic retries
    // setTimeout(connectMongoDB, 5000); // Example manual retry
});
mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err);
});
mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected.');
});

// --- Start Bot ---
connectMongoDB(); // Connect to DB first

client.login(process.env.DISCORD_TOKEN).then(() => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    client.user.setActivity('with code'); // Set a status
}).catch(err => {
    console.error('❌ Bot login failed:', err);
    process.exit(1); // Exit if login fails
});

// --- Graceful Shutdown (Optional but Recommended) ---
process.on('SIGINT', async () => {
    console.log('SIGINT received. Shutting down gracefully...');
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
    client.destroy();
    console.log('Discord client destroyed.');
    process.exit(0);
});
process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
    client.destroy();
    console.log('Discord client destroyed.');
    process.exit(0);
});
