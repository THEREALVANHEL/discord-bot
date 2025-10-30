// deploy-commands.js (REMOVED ticket, ADDED recursive loading)
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

console.log("--- Loading Slash Commands for Deployment ---");

// NEW: Recursive function
const loadSlashCommands = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            loadSlashCommands(fullPath); // Recurse
        } else if (entry.isFile() && entry.name.endsWith('.js') && entry.name !== 'index.js') {
            try {
                const command = require(fullPath);
                // Only include commands that have the 'data' property (Slash Commands)
                if (command.data && typeof command.data.toJSON === 'function') {
                    
                    // --- REMOVAL START ---
                    // Skip the ticket command (now prefix only for setup)
                    if (command.data.name === 'ticket') {
                        console.log(`[DEPLOY] Skipping registration for: ${command.data.name} (Now Prefix)`);
                        continue; // Go to the next file
                    }
                    // --- REMOVAL END ---

                    console.log(`[DEPLOY] Adding command: ${command.data.name}`);
                    commands.push(command.data.toJSON());
                } else {
                   console.log(`[DEPLOY] Skipping non-slash command file: ${entry.name}`);
                }
            } catch (error) {
                console.error(`❌ Error loading command file '${entry.name}' for deployment:`, error);
            }
        }
    }
};

// Start loading from the root commands directory
loadSlashCommands(commandsPath);

console.log("--- Finished Loading Commands ---");


const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    // Deploy to specific guild
    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error("❌ Failed to deploy commands:", error);
  }
})();
