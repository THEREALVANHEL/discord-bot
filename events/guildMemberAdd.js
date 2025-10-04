// events/guildMemberAdd.js (REPLACE - Premium welcome)
const Settings = require('../models/Settings');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client) {
    try {
      // Auto assign join role
      const autoJoinRoleId = client.config.roles.autoJoin;
      if (autoJoinRoleId && !member.roles.cache.has(autoJoinRoleId)) {
        await member.roles.add(autoJoinRoleId).catch(console.error);
      }

      const settings = await Settings.findOne({ guildId: member.guild.id });

      // Welcome message in channel (Premium)
      if (settings && settings.welcomeChannelId) {
        const channel = member.guild.channels.cache.get(settings.welcomeChannelId);
        if (channel) {
          const welcomeEmbed = new EmbedBuilder()
            .setTitle('👋 A New Challenger Appears!')
            .setDescription(`**${member.user.tag}** has joined the ranks of **${member.guild.name}**! We are now **${member.guild.memberCount}** strong.`)
            .addFields(
              { name: 'Account Age', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
              { name: 'Welcome!', value: `Read the rules and enjoy your stay, ${member}!`, inline: true }
            )
            .setColor(0x00FF00) // Green
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 1024 }))
            .setTimestamp();

          channel.send({
            content: `Welcome, ${member}!`,
            embeds: [welcomeEmbed],
            files: ['https://tenor.com/view/catdance-gangnam-style-cute-cat-gif-11020797830010762324.gif'],
          });
        }
      }

      // Send Premium DM to user
      try {
        const dmEmbed = new EmbedBuilder()
          .setTitle(`Welcome to ${member.guild.name}!`)
          .setDescription("We're thrilled to have you! Please check out the rules channel and get comfortable. Let us know if you have any questions.")
          .setColor(0x7289DA) // Blurple
          .setTimestamp();
        await member.send({ embeds: [dmEmbed] });
      } catch {}

    } catch (error) {
      console.error('Error in guildMemberAdd event:', error);
    }
  },
};
