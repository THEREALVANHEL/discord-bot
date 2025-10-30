// deploy-commands.js (REMOVED ticket)
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log("--- Loading Slash Commands for Deployment ---");
for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  try {
      const command = require(filePath);
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
         console.log(`[DEPLOY] Skipping non-slash command file: ${file}`);
      }
  } catch (error) {
      console.error(`❌ Error loading command file '${file}' for deployment:`, error);
  }
}
console.log("--- Finished Loading Slash Commands ---");


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
