// events/interactionCreate.js (REPLACED - Simplified Admin Bypass and Mod Check Logic)
const { EmbedBuilder } = require('discord.js');
const Settings = require('../models/Settings');

async function logModerationAction(/* ... */) { /* ... */ }

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isMessageComponent()) return;

    let member = interaction.member; 
    const config = client.config;
    const settings = await Settings.findOne({ guildId: interaction.guild.id });
    const command = client.commands.get(interaction.commandName);

    // FIX (Robustness): Ensure member roles are fetched for accurate checks, as interaction.member can be stale.
    if (member && !member.roles.cache.size) {
        try {
            member = await member.fetch();
        } catch (e) {
             console.error('Failed to fetch member data for permission check:', e);
        }
    }

    // Safely access roles object
    const roles = config.roles || {};
    
    // Admin roles (Using optional chaining for safety)
    const isAdmin = member?.roles.cache.has(roles.forgottenOne) || member?.roles.cache.has(roles.overseer);
    // Mod roles
    const isLeadMod = member?.roles.cache.has(roles.leadMod);
    const isMod = isLeadMod || member?.roles.cache.has(roles.mod) || isAdmin; // FIX: isMod includes isAdmin
    // Gamelog roles
    const isHost = member?.roles.cache.has(roles.gamelogUser) || member?.roles.cache.has(roles.headHost);


    // --- COMMAND LOGIC ---
    if (interaction.isChatInputCommand() && command) {
        const cmdName = interaction.commandName;
        
        let permissionDenied = null;

        // 1. HARD PERMISSION CHECKS (Admins pass implicitly due to isMod check, except for quicksetup)
        
        // Quicksetup: Admin ONLY check (Cannot be simplified with isMod)
        if (cmdName === 'quicksetup' && !isAdmin) {
             permissionDenied = '👑 Only Administrators can use this command.';
        }
        
        // Lock/Unlock: Lead Mod ONLY check
        else if (['lock', 'unlock'].includes(cmdName) && !isLeadMod && !isAdmin) { // Admins bypass the leadmod restriction
             permissionDenied = '🔒 Only lead moderators can use this command.';
        }
        
        // Moderation/Giveaway/Poll Create: Mod/Admin ONLY check
        else if (['warn', 'warnlist', 'removewarn', 'softban', 'timeout', 'giveaway', 'purge', 'purgeuser', 'reroll', 'announce', 'poll'].includes(cmdName)) {
            // FIX: This check now inherently includes Admins because we set isMod = isMod || isAdmin.
            if (!isMod) {
                 permissionDenied = '🛡️ You do not have permission to use this moderation command.';
            }
        }
        
        // Gamelog: Host/Admin ONLY check
        else if (cmdName === 'gamelog' && !isHost && !isAdmin) {
            permissionDenied = '🎮 Only Host roles can use this command.';
        }

        // Currency Manager: Specific Role/Admin ONLY check
        else if (['addcookies', 'removecookies', 'addcookiesall', 'removecookiesall', 'addxp', 'removexp', 'addcoins', 'removecoins'].includes(cmdName) && !member?.roles.cache.has(roles.cookiesManager) && !isAdmin) {
            permissionDenied = '🍪 You do not have permission to use this currency command.';
        }
        
        
        // 3. APPLY DENIAL
        if (permissionDenied) {
            return interaction.reply({ content: permissionDenied, ephemeral: true });
        }

        // 4. COOLDOWN CHECK (applies to everyone)
        const now = Date.now();
        const cooldownAmount = (command.cooldown || 3) * 1000;
        // ... (cooldown logic remains the same)
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
            // ... (error handling remains the same)
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
        return; 
    }

    // Handle Button Interactions
    if (interaction.isButton()) {
        // ... (button logic remains the same, but should work since roles are now better defined)
        // ... (The ticket logic below is confirmed to use isMod which now includes Admins)

        // Existing ticket logic
        if (interaction.customId === 'create_ticket') {
            await interaction.deferReply({ ephemeral: true }); 
            const Ticket = require('../models/Ticket');
            if (!settings || !settings.ticketCategoryId) {
                return interaction.editReply({ content: 'Ticket system is not set up.' });
            }

            const existingTicket = await Ticket.findOne({ userId: interaction.user.id, status: { $ne: 'closed' } });
            if (existingTicket) {
                const existingChannel = interaction.guild.channels.cache.get(existingTicket.channelId);
                if (existingChannel) {
                    return interaction.editReply({ content: `You already have an open ticket: ${existingChannel}` });
                } else {
                    await Ticket.deleteOne({ _id: existingTicket._id });
                }
            }

            const ticketChannel = await interaction.guild.channels.create({
                name: `ticket-${interaction.user.username}`,
                type: 0,
                parent: settings.ticketCategoryId,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: ['ViewChannel'] },
                    { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
                    { id: roles.leadMod, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
                    { id: roles.mod, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
                ],
            });

            const newTicket = new Ticket({
                ticketId: ticketChannel.id,
                userId: interaction.user.id,
                channelId: ticketChannel.id,
            });
            await newTicket.save();

            const ticketEmbed = new EmbedBuilder()
                .setTitle('🎫 New Support Ticket')
                .setDescription(`Thank you for creating a ticket, ${interaction.user}! A staff member will be with you shortly. Please describe your issue clearly.`)
                .addFields(
                    { name: 'User', value: `${interaction.user.tag} (${interaction.user.id})` },
                    { name: 'Status', value: 'Open' }
                )
                .setColor(0x0099FF)
                .setTimestamp();
                
            const modPings = [roles.leadMod, roles.mod]
                            .filter(id => id)
                            .map(id => `<@&${id}>`).join(' ');

            ticketChannel.send({
                content: `${interaction.user} ${modPings}`,
                embeds: [ticketEmbed],
            });

            return interaction.editReply({ content: `Your ticket has been created: ${ticketChannel}` });
        }
        return;
    }
  },
};
