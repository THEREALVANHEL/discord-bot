// events/guildMemberRemove.js (REPLACE - Added Modlog logging)
const Settings = require('../models/Settings');
const { EmbedBuilder } = require('discord.js');

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
              { name: 'Joined Server', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>` : 'Unknown', inline: false },
              { name: 'Goodbye!', value: 'We hope to see you again soon.', inline: true }
            )
            .setColor(0xFF0000) // Red
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 1024 }))
            .setTimestamp()
            .setImage('https://tenor.com/view/flcl-mamimi-aaahhh-wtf-shocked-gif-24981847.gif'); 

          channel.send({
            embeds: [leaveEmbed],
          });
        }
      }

      // --- LOGGING FIX: Send log to modlog channel ---
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
                .setTimestamp();
            await modlogChannel.send({ embeds: [logEmbed] }).catch(console.error);
        }
      }
      // --- END LOGGING FIX ---

      // Send DM to user with a re-invite link (DM to rejoin)
      try {
        // Find a channel to create an invite
        const channelToInvite = member.guild.channels.cache.find(c => c.type === 0 && c.permissionsFor(member.guild.roles.everyone).has(PermissionsBitField.Flags.ViewChannel));
        let inviteUrl = 'Could not generate an invite link. Ask a staff member.';
        
        if (channelToInvite) {
            const invite = await channelToInvite.createInvite({
                maxAge: 0, // permanent
                maxUses: 0, // unlimited
            }).catch(() => null); // Bot must have CREATE_INSTANT_INVITE permission
            if (invite) inviteUrl = invite.url;
        }

        const dmEmbed = new EmbedBuilder()
          .setTitle(`💔 Missing You in ${member.guild.name}`)
          .setDescription("We noticed you left our server. We're sorry to see you go and would love to have you back! Click the link below to rejoin:")
          .addFields({ name: 'Rejoin Link', value: inviteUrl })
          .setColor(0xFFA500) // Orange
          .setTimestamp();

        await member.send({ embeds: [dmEmbed] });
      } catch (dmError) {
        console.log(`Could not DM ${member.user.tag} with re-invite: ${dmError.message}`);
      }

    } catch (error) {
      console.error('Error in guildMemberRemove event:', error);
    }
  },
};
