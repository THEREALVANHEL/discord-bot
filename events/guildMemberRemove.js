// events/guildMemberRemove.js (REPLACE - Updated GIF and Modlog)
const Settings = require('../models/Settings');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member, client) {
    try {
      const settings = await Settings.findOne({ guildId: member.guild.id });

      // Leave message in channel (Premium)
      if (settings && settings.leaveChannelId) {
        const channel = member.guild.channels.cache.get(settings.leaveChannelId);
        if (channel) {
          const leaveEmbed = new EmbedBuilder()
            .setTitle('🚪 Member Left the Server')
            .setDescription(`**${member.user.tag}** has departed. We now have **${member.guild.memberCount}** members remaining.`)
            .addFields(
              // --- Shows when they joined ---
              { name: 'Joined Server', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'Unknown', inline: false },
              { name: 'Goodbye!', value: 'We hope to see you again soon.', inline: true }
            )
            .setColor(0xFF0000) // Red
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 1024 }))
             // --- Timestamped with LEAVE date ---
            .setTimestamp()
            // --- YOUR REQUESTED GIF ---
            .setImage('https://tenor.com/view/perdemo-gif-26062590.gif'); 

          channel.send({
            embeds: [leaveEmbed],
          });
        }
      }

      // --- LOGGING: Send log to modlog channel ---
      if (settings && settings.modlogChannelId) {
        const modlogChannel = member.guild.channels.cache.get(settings.modlogChannelId);
        if (modlogChannel) {
            const logEmbed = new EmbedBuilder()
                .setTitle('📤 Member Left')
                .setColor(0xFF0000)
                .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
                .addFields(
                    { name: 'User', value: `${member.user} (${member.user.id})`, inline: false },
                    { name: 'Joined', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown', inline: true },
                    { name: 'Total Members', value: `${member.guild.memberCount}`, inline: true }
                )
                .setTimestamp(); // This timestamp is the leave time
            await modlogChannel.send({ embeds: [logEmbed] }).catch(console.error);
        }
      }
      // --- END LOGGING ---

      // --- YOUR REQUESTED "BYE" DM (with re-invite) ---
      try {
        // Find a channel to create an invite
        const channelToInvite = member.guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(member.guild.roles.everyone).has(PermissionsBitField.Flags.ViewChannel));
        let inviteUrl = 'Ask a staff member for a new link if you wish to return.';
        
        if (channelToInvite) {
            const invite = await channelToInvite.createInvite({
                maxAge: 0, // permanent
                maxUses: 0, // unlimited
            }).catch(() => null); 
            if (invite) inviteUrl = invite.url;
        }

        const dmEmbed = new EmbedBuilder()
          .setTitle(`💔 Missing You in ${member.guild.name}`)
          .setDescription("We noticed you left our server. We're sorry to see you go! If you ever change your mind, we'd love to have you back.")
          .addFields({ name: 'Rejoin Link', value: inviteUrl })
          .setColor(0xFFA500) // Orange
          .setTimestamp();

        await member.send({ embeds: [dmEmbed] });
      } catch (dmError) {
        console.log(`Could not DM ${member.user.tag} with re-invite: ${dmError.message}`);
      }
      // --- END DM ---

    } catch (error) {
      console.error('Error in guildMemberRemove event:', error);
    }
  },
};
