// events/guildMemberRemove.js (REPLACE - Premium leave + DM to rejoin, Fixed timestamp format, Consolidated Joined Date)
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
              { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`, inline: false }, // Explicitly show time of joining
              { name: 'Goodbye!', value: 'We hope to see you again soon.', inline: true }
            )
            .setColor(0xFF0000) // Red
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 1024 }))
            .setTimestamp()
            .setImage('https://tenor.com/view/flcl-mamimi-aaahhh-wtf-shocked-gif-24981847.gif'); // GIF EMBEDDED

          channel.send({
            embeds: [leaveEmbed],
            // Removed files: ['...gif'],
          });
        }
      }

      // Send DM to user with a re-invite link (DM to rejoin)
      try {
        const invite = await member.guild.channels.cache.first().createInvite({
            maxAge: 0, // permanent
            maxUses: 0, // unlimited
        }).catch(() => null); // Bot must have CREATE_INSTANT_INVITE permission

        const dmEmbed = new EmbedBuilder()
          .setTitle(`💔 Missing You in ${member.guild.name}`)
          .setDescription("We noticed you left our server. We're sorry to see you go and would love to have you back! Click the link below to rejoin:")
          .addFields({ name: 'Rejoin Link', value: invite ? invite.url : 'Could not generate an invite link. Ask a staff member.' })
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
