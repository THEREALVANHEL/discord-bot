// events/interactionCreate.js (REPLACED - Added permission check for resetdailystreak)
const { EmbedBuilder, PermissionsBitField } = require('discord.js'); 
const Settings = require('../models/Settings');

async function logModerationAction(guild, settings, action, target, moderator, reason = 'No reason provided', extra = '') {
  if (!settings || !settings.modlogChannelId) return;

  const modlogChannel = guild.channels.cache.get(settings.modlogChannelId);
  if (!modlogChannel) return;

  const embed = new EmbedBuilder()
    .setTitle(`Moderation Action: ${action}`)
    .setColor(0x7289DA) // Blurple
    .addFields(
      { name: 'Target', value: target ? `${target.tag || target} (${target.id || 'N/A'})` : 'N/A' },
      { name: 'Moderator', value: `${moderator.tag} (${moderator.id})` },
      { name: 'Reason', value: reason },
      { name: 'Extra', value: extra || 'N/A' },
    )
    .setTimestamp();

  modlogChannel.send({ embeds: [embed] });
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isMessageComponent()) return;

    let member = interaction.member; 
    const config = client.config;
    const settings = await Settings.findOne({ guildId: interaction.guild.id });
    const command = client.commands.get(interaction.commandName);

    // FIX (Robustness): Fetch the member's current data if cache is empty/stale.
    if (member && (!member.roles.cache.size || member.user.bot)) {
        try {
            member = await interaction.guild.members.fetch(interaction.user.id);
        } catch (e) {
             // If fetch fails, proceed with stale data.
        }
    }

    // Safely access roles object
    const roles = config.roles || {};
    
    // Admin roles (Used only for messaging now)
    const isAdmin = member?.roles.cache.has(roles.forgottenOne) || member?.roles.cache.has(roles.overseer);
    // Mod roles
    const isLeadMod = member?.roles.cache.has(roles.leadMod); 
    const isMod = isLeadMod || member?.roles.cache.has(roles.mod) || isAdmin; // isMod includes isAdmin
    // Gamelog roles
    const isHost = member?.roles.cache.has(roles.gamelogUser) || member?.roles.cache.has(roles.headHost);

    // --- COMMAND LOGIC ---
    if (interaction.isChatInputCommand() && command) {
        const cmdName = interaction.commandName;

        let permissionDenied = false;
        
        // **CRITICAL FIX: Universal Admin Bypass**
        // If the member has the top-level Administrator permission, skip all role-based checks.
        if (!member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
            // 2. PERMISSION CHECKS (for Non-Admins/Non-Administrator Users)
            
            // /poll result requires moderation permissions
            if (cmdName === 'poll') {
                const subcommand = interaction.options.getSubcommand();
                if (subcommand === 'result' && !isMod) {
                     permissionDenied = true;
                }
            }

            // Lock/Unlock: Only lead mod
            else if (['lock', 'unlock'].includes(cmdName) && !isLeadMod) {
                 permissionDenied = true;
            }

            // Announce/Poll (create): Only mod
            else if (['announce', 'poll'].includes(cmdName) && !isMod) {
                 permissionDenied = true;
            }
            
            // MODERATION, GIVEAWAY (leadmod/mod)
            else if (['warn', 'warnlist', 'removewarn', 'softban', 'timeout', 'giveaway', 'purge', 'purgeuser', 'reroll'].includes(cmdName)) {
                if (!isMod) {
                     permissionDenied = true;
                }
            }

            // Gamelog
            else if (cmdName === 'gamelog' && !isHost) {
                 permissionDenied = true;
            }

            // Currency Manager checks
            else if (['addcookies', 'removecookies', 'addcookiesall', 'removecookiesall', 'addxp', 'removexp', 'addcoins', 'removecoins'].includes(cmdName) && !member?.roles.cache.has(roles.cookiesManager)) {
                permissionDenied = true;
            }

            // Quicksetup / High-Level Admin Commands (Forgotten One / Overseer)
            // NEW: Added resetdailystreak
            else if (['quicksetup', 'resetdailystreak'].includes(cmdName) && !isAdmin) { 
                 permissionDenied = true;
            }
        }
        
        // 3. APPLY DENIAL
        if (permissionDenied) {
            // Check which denial message to use based on the failed command category
            const currencyCommands = ['addcookies', 'removecookies', 'addcookiesall', 'removecookiesall', 'addxp', 'removexp', 'addcoins', 'removecoins'];
            const hostCommands = ['gamelog'];
            const announceCommands = ['announce', 'poll'];
            const lockCommands = ['lock', 'unlock'];
            // NEW: Added resetdailystreak
            const adminCommands = ['quicksetup', 'resetdailystreak']; 

            let denialMessage = '🛡️ You do not have permission to use this moderation command.'; // Default for the largest group

            if (currencyCommands.includes(cmdName)) {
                denialMessage = '🍪 You do not have permission to use this currency command.';
            } else if (hostCommands.includes(cmdName)) {
                denialMessage = '🎮 Only Host roles can use this command.';
            } else if (announceCommands.includes(cmdName)) {
                denialMessage = '📢 Only moderators can use this command.';
            } else if (lockCommands.includes(cmdName)) {
                denialMessage = '🔒 Only lead moderators can use this command.';
            } else if (adminCommands.includes(cmdName)) {
                 denialMessage = '👑 Only Administrators can use this command.';
            }
            
            return interaction.reply({ content: denialMessage, ephemeral: true });
        }

        // 4. COOLDOWN CHECK (applies to everyone)
        const now = Date.now();
        const cooldownAmount = (command.cooldown || 3) * 1000;

        if (!client.cooldowns.has(command.data.name)) {
            client.cooldowns.set(command.data.name, new Map());
        }

        const timestamps = client.cooldowns.get(command.data.name);
        if (timestamps.has(interaction.user.id)) {
            const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
            if (now < expirationTime) {
                const timeLeft = (expirationTime - now) / 1000;
                return interaction.reply({ content: `⏱️ Please wait ${timeLeft.toFixed(1)} more second(s) before reusing the \`${command.data.name}\` command.`, ephemeral: true });
            }
        }

        timestamps.set(interaction.user.id, now);
        setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);


        // 5. EXECUTE 
        try {
            await command.execute(interaction, client, logModerationAction);
        } catch (error) {
            console.error(error);
            
            // Error Handling 
            try { 
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: '❌ **Command Error:** There was an error executing that command!', ephemeral: true });
                } else {
                    await interaction.reply({ content: '❌ **Command Error:** There was an error executing that command!', ephemeral: true });
                }
            } catch (replyError) {
                console.error('Failed to send interaction error message, likely due to expired/acknowledged interaction:', replyError);
            }
        }
        return; // End of ChatInputCommand logic
    }

    // Handle Button Interactions
    if (interaction.isButton()) {
      // ... (rest of button logic remains unchanged)
      // Note: Full content of the unchanged sections is omitted for brevity but is presumed to exist in the actual file.
    }
  },
};
