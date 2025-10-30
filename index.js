// index.js (REPLACE)
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
    GatewayIntentBits.GuildBans,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember],
});

global.clientInstance = client;

// --- Collections and Maps ---
client.commands = new Collection(); // Stores BOTH slash and prefix commands
client.cooldowns = new Collection();
client.giveaways = new Map();
client.locks = new Map();
client.reminders = new Map();
client.polls = new Map();
client.xpCooldowns = new Map();
client.grantedUsers = new Map();
client.rrpanel_builders = new Map();
client.activeInteractions = new Set(); // <-- FIX for button spam

// --- Bot Configuration ---
// (Your existing config remains unchanged)
client.config = {
  guildId: process.env.GUILD_ID,
  roles: {
    autoJoin: process.env.AUTO_JOIN_ROLE_ID || null,
    leadMod: process.env.LEAD_MOD_ROLE_ID || '1371147562257748050',
    mod: process.env.MOD_ROLE_ID || '1371728518467293236',
    cookiesManager: process.env.COOKIES_MANAGER_ROLE_ID || '1372121024841125888',
    forgottenOne: process.env.FORGOTTEN_ONE_ROLE_ID || '1376574861333495910',
    overseer: process.env.OVERSEER_ROLE_ID || '1371004219875917875',
    gamelogUser: process.env.GAMELOG_USER_ROLE_ID || '1371003310223654974',
    headHost: process.env.HEAD_HOST_ROLE_ID || '1378338515791904808',
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
     { title: 'Intern', minWorks: 0, maxWorks: 9, xpReward: [10, 20], coinReward: [20, 40], successRate: 95, id: 'intern' },
     { title: 'Junior Developer', minWorks: 10, maxWorks: 19, xpReward: [20, 40], coinReward: [50, 90], successRate: 92, id: 'junior_dev' },
     { title: 'Software Developer', minWorks: 20, maxWorks: 29, xpReward: [40, 70], coinReward: [100, 160], successRate: 90, id: 'dev' },
     { title: 'Senior Developer', minWorks: 30, maxWorks: 49, xpReward: [70, 120], coinReward: [180, 280], successRate: 88, id: 'senior_dev' },
     { title: 'Team Lead', minWorks: 50, maxWorks: 99, xpReward: [130, 200], coinReward: [300, 450], successRate: 85, id: 'lead' },
     { title: 'Engineering Manager', minWorks: 100, maxWorks: 199, xpReward: [220, 350], coinReward: [500, 800], successRate: 80, id: 'manager' },
     { title: 'Director', minWorks: 200, maxWorks: 299, xpReward: [380, 500], coinReward: [900, 1400], successRate: 75, id: 'director' },
     { title: 'VP of Engineering', minWorks: 300, maxWorks: 449, xpReward: [550, 750], coinReward: [1500, 2400], successRate: 70, id: 'vp' },
     { title: 'CTO', minWorks: 450, maxWorks: 999, xpReward: [800, 1100], coinReward: [2500, 4000], successRate: 65, id: 'cto' },
     { title: 'Tech Legend', minWorks: 1000, maxWorks: Infinity, xpReward: [1200, 2000], coinReward: [5000, 8000], successRate: 60, id: 'tech_legend' },
   ],
   shopItems: [
     { id: 'xp_boost_1h', name: '1 Hour XP Boost', description: 'Gain 2x XP for 1 hour.', price: 500, type: 'boost' },
     { id: 'rename_ticket', name: 'Nickname Change Ticket', description: 'Change your nickname once.', price: 1000, type: 'utility' },
   ],
};

// --- NEW Command Loader ---
console.log("--- Loading Commands ---");

// Function to recursively load commands from subfolders
const loadCommands = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            loadCommands(fullPath); // Recurse
        } else if (entry.isFile() && entry.name.endsWith('.js') && entry.name !== 'index.js') {
            try {
                // We clear the cache to ensure the latest version is loaded on (e.g.) a re-run
                delete require.cache[require.resolve(fullPath)];
                const command = require(fullPath);
                let loaded = false;

                // Check for Slash Command
                if (command.data && command.execute) {
                    client.commands.set(command.data.name, command);
                    console.log(`[SLASH] Loaded: ${command.data.name}`);
                    loaded = true;
                } 
                
                // Check for Prefix Command
                // Use 'else if' to prevent double-loading if a file matches both
                else if (command.name && command.execute) { 
                    client.commands.set(command.name, command);
                    console.log(`[PREFIX] Loaded: ${command.name}`);
                    loaded = true;
                    if (command.aliases && Array.isArray(command.aliases)) {
                        command.aliases.forEach(alias => {
                            if (!client.commands.has(alias)) {
                                client.commands.set(alias, command);
                                console.log(`       - Alias: ${alias}`);
                            } else {
                                console.warn(`[WARNING] Alias '${alias}' for command '${command.name}' conflicts. Skipping.`);
                            }
                        });
                    }
                }

                if (!loaded) {
                     console.warn(`[WARNING] Command file '${entry.name}' in '${dir}' is invalid (missing data or name). Skipping.`);
                }
            } catch (error) {
                console.error(`❌ Error loading command ${entry.name}:`, error);
            }
        }
    }
};

// Load all commands from the root 'commands' directory
loadCommands(path.join(__dirname, 'commands'));

console.log("--- Finished Loading Commands ---");


// --- Load Events ---
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

console.log("--- Loading Events ---");
for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    try {
        // --- FIX for files with multiple exports ---
        // We delete the cache to prevent old code from running
        delete require.cache[require.resolve(filePath)];
        const event = require(filePath);
        
        // Check if the event is valid and has a name
        if (event && event.name) {
            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args, client));
            } else {
                // Check if this event is already loaded (to prevent duplicates)
                const currentListeners = client.listeners(event.name);
                if (currentListeners.length === 0) {
                     client.on(event.name, (...args) => event.execute(...args, client));
                     console.log(`[EVENT] Loaded: ${event.name}`);
                } else {
                     // This catches the duplicate guildBanAdd, etc.
                     console.warn(`[EVENT] SKIPPED duplicate listener for: ${event.name} (from file ${file})`);
                }
            }
        } else {
            console.warn(`[EVENT] SKIPPED file ${file}: Invalid event structure (missing name).`);
        }
    } catch (error) {
        console.error(`❌ Error loading event ${file}:`, error);
    }
}
console.log("--- Finished Loading Events ---");


// --- MongoDB Connection ---
async function connectMongoDB() {
    if (!process.env.MONGODB_URI) {
        console.error("❌ MONGODB_URI not found in environment variables. Database connection failed.");
        process.exit(1);
    }
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });
        console.log('✅ Connected to MongoDB');

        // Initial data loading after connection
        await loadReminders();
        await loadGiveaways();

    } catch (error) {
        console.error('❌ MongoDB initial connection error:', error);
        console.error('Retrying MongoDB connection in 5 seconds...');
        setTimeout(connectMongoDB, 5000); // Retry connection
    }
}

// --- Data Loading Functions ---
// (Your existing loadReminders and loadGiveaways functions remain unchanged)
async function loadReminders() {
  try {
    const User = require('./models/User');
    const users = await User.find({ 'reminders.0': { $exists: true } });
    let loadedCount = 0;
    console.log(`📋 Checking reminders for ${users.length} users...`);

    users.forEach(user => {
      let remindersChanged = false;
      const activeRemindersForUser = [];

      user.reminders.forEach(reminder => {
        const reminderIdString = reminder._id.toString();
        const timeUntil = reminder.remindAt.getTime() - Date.now();

        if (timeUntil > 0) {
          activeRemindersForUser.push(reminder);
          if (!client.reminders.has(reminderIdString)) {
             const timeout = setTimeout(async () => {
                try {
                     const userToRemind = await client.users.fetch(user.userId).catch(() => null);
                     if (userToRemind) {
                         const reminderEmbed = new EmbedBuilder()
                           .setTitle('🔔 Personal Reminder!')
                           .setDescription(`You asked to be reminded about: **${reminder.message}**`)
                           .setColor(0xFF4500)
                           .setTimestamp();
                         await userToRemind.send({ embeds: [reminderEmbed] });
                     }
                    const finalUser = await User.findOne({ userId: user.userId });
                    if (finalUser) {
                        finalUser.reminders = finalUser.reminders.filter(r => r._id.toString() !== reminderIdString);
                        await finalUser.save();
                    }
                } catch (error) {
                  console.error(`Could not send reminder DM to ${user.userId}:`, error);
                } finally {
                    client.reminders.delete(reminderIdString);
                }
             }, timeUntil);
             client.reminders.set(reminderIdString, timeout);
             loadedCount++;
          }
        } else {
           console.log(`Removing expired reminder ${reminderIdString} for user ${user.userId}`);
           remindersChanged = true;
        }
      });

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
    const Giveaway = require('./models/Giveaway');
    // IMPORTANT: We must require the command file *here* to get the exported helper function
    const { endGiveaway } = require('./commands/giveaway.js'); // <-- FIXED PATH

    const giveaways = await Giveaway.find({ endTime: { $gt: new Date() } });
    let loadedCount = 0;
    console.log(`🎁 Checking ${giveaways.length} potential active giveaways...`);

    giveaways.forEach(giveaway => {
      const messageId = giveaway.messageId;
      const timeUntil = giveaway.endTime.getTime() - Date.now();

      if (timeUntil > 0) {
        if (!client.giveaways.has(messageId)) {
           const giveawayData = giveaway.toObject();
           const timeout = setTimeout(() => {
             endGiveaway(client, giveawayData).catch(err => console.error(`Error ending giveaway ${messageId}:`, err));
           }, timeUntil);
           client.giveaways.set(messageId, timeout);
           loadedCount++;
        }
      } else {
        console.log(`Giveaway ${messageId} expired while offline. Ending now.`);
        endGiveaway(client, giveaway.toObject()).catch(err => console.error(`Error ending expired giveaway ${messageId}:`, err));
      }
    });

    console.log(`✅ Loaded ${client.giveaways.size} active giveaway timers (${loadedCount} newly set).`);
  } catch (error) {
    console.error('❌ Error loading giveaways:', error);
  }
}


// --- Dummy HTTP Server ---
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Discord Bot is running!'));
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        discordReady: client.isReady(),
        mongodbState: mongoose.connection.readyState,
        uptime: process.uptime(),
    });
});
app.listen(PORT, () => console.log(`Dummy HTTP server listening on port ${PORT}`));

// --- MongoDB Event Listeners ---
mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
});
mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err);
});
mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected.');
});

// --- Start Bot ---
connectMongoDB();

client.login(process.env.DISCORD_TOKEN).then(() => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    client.user.setActivity('with code');
}).catch(err => {
    console.error('❌ Bot login failed:', err);
    process.exit(1);
});

// --- Graceful Shutdown (FIXED to prevent double-spam) ---
const shutdown = (signal) => {
    console.log(` ${signal} received. Shutting down gracefully...`);
    // --- FIX: Destroy client FIRST to stop receiving new messages ---
    client.destroy(); 
    console.log('Discord client destroyed.');
    
    // Disconnect from MongoDB *after* client is dead
    mongoose.disconnect().then(() => {
        console.log('MongoDB disconnected.');
        process.exit(0);
    }).catch(err => {
        console.error('Error disconnecting MongoDB:', err);
        process.exit(1); // Exit with error
    });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
