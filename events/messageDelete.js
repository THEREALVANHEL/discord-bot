// events/messageDelete.js (SIMPLIFIED & ELEGANT)
const Settings = require('../models/Settings');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'messageDelete',
  async execute(message, client) {
    if (!message.author || !message.guild) return;

    const settings = await Settings.findOne({ guildId: message.guild.id });
    if (!settings?.autologChannelId) return;

    const logChannel = message.guild.channels.cache.get(settings.autologChannelId);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setAuthor({ 
        name: `${message.author.tag} ${message.author.bot ? '🤖' : ''}`,
        iconURL: message.author.displayAvatarURL() 
      })
      .setDescription(
        `**Message Deleted** in ${message.channel}\n` +
        `${message.content || '*[No text]*'}`.substring(0, 2000)
      )
      .setFooter({ text: `ID: ${message.id}` })
      .setTimestamp();

    if (message.attachments.size > 0) {
      embed.addFields({
        name: '📎 Attachments',
        value: message.attachments.map(a => `[${a.name}](${a.url})`).join('\n').substring(0, 1024)
      });
    }

    await logChannel.send({ embeds: [embed] }).catch(console.error);
  },
};

// ===== events/messageUpdate.js (SIMPLIFIED) =====
const Settings2 = require('../models/Settings');
const { EmbedBuilder: EmbedBuilder2 } = require('discord.js');

module.exports = {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage, client) {
    if (!oldMessage.author || !oldMessage.guild) return;
    if (oldMessage.content === newMessage.content) return;

    const settings = await Settings2.findOne({ guildId: oldMessage.guild.id });
    if (!settings?.autologChannelId) return;

    const logChannel = oldMessage.guild.channels.cache.get(settings.autologChannelId);
    if (!logChannel) return;

    const embed = new EmbedBuilder2()
      .setColor(0xFFA500)
      .setAuthor({ 
        name: `${oldMessage.author.tag} ${oldMessage.author.bot ? '🤖' : ''}`,
        iconURL: oldMessage.author.displayAvatarURL() 
      })
      .setDescription(
        `**Message Edited** in ${oldMessage.channel} • [Jump](${newMessage.url})\n\n` +
        `**Before:** ${(oldMessage.content || '*[No content]*').substring(0, 1000)}\n` +
        `**After:** ${(newMessage.content || '*[No content]*').substring(0, 1000)}`
      )
      .setFooter({ text: `ID: ${oldMessage.id}` })
      .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch(console.error);
  },
};

// ===== events/guildMemberUpdate.js (SIMPLIFIED) =====
const Settings3 = require('../models/Settings');
const { EmbedBuilder: EmbedBuilder3 } = require('discord.js');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember, client) {
    const settings = await Settings3.findOne({ guildId: newMember.guild.id });
    if (!settings?.autologChannelId) return;

    const logChannel = newMember.guild.channels.cache.get(settings.autologChannelId);
    if (!logChannel) return;

    const changes = [];
    
    // Role changes
    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id) && r.id !== newMember.guild.id);
    const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id) && r.id !== newMember.guild.id);

    if (addedRoles.size > 0) {
      changes.push(`**+** ${addedRoles.map(r => r.name).join(', ')}`);
    }
    if (removedRoles.size > 0) {
      changes.push(`**-** ${removedRoles.map(r => r.name).join(', ')}`);
    }

    // Nickname
    if (oldMember.nickname !== newMember.nickname) {
      changes.push(`**Nickname:** ${oldMember.nickname || '*None*'} → ${newMember.nickname || '*None*'}`);
    }

    // Timeout
    if (oldMember.communicationDisabledUntil !== newMember.communicationDisabledUntil) {
      if (newMember.communicationDisabledUntil) {
        changes.push(`**Timeout:** Until <t:${Math.floor(newMember.communicationDisabledUntil.getTime() / 1000)}:R>`);
      } else {
        changes.push(`**Timeout removed**`);
      }
    }

    // Boost
    if (oldMember.premiumSince !== newMember.premiumSince) {
      changes.push(newMember.premiumSince ? `**⭐ Started boosting**` : `**💔 Stopped boosting**`);
    }

    if (changes.length === 0) return;

    const embed = new EmbedBuilder3()
      .setColor(0x0099FF)
      .setAuthor({ 
        name: newMember.user.tag,
        iconURL: newMember.user.displayAvatarURL() 
      })
      .setDescription(`**Member Updated**\n${changes.join('\n')}`)
      .setFooter({ text: `ID: ${newMember.id}` })
      .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch(console.error);
  },
};

// ===== events/voiceStateUpdate.js (SIMPLIFIED) =====
const Settings4 = require('../models/Settings');
const { EmbedBuilder: EmbedBuilder4 } = require('discord.js');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    const settings = await Settings4.findOne({ guildId: newState.guild.id });
    if (!settings?.autologChannelId) return;

    const logChannel = newState.guild.channels.cache.get(settings.autologChannelId);
    if (!logChannel) return;

    const member = newState.member;
    let description = '';
    let color = 0x0099FF;

    // Channel changes
    if (!oldState.channelId && newState.channelId) {
      description = `🔊 **Joined** ${newState.channel}`;
      color = 0x00FF00;
    } else if (oldState.channelId && !newState.channelId) {
      description = `🔇 **Left** ${oldState.channel}`;
      color = 0xFF0000;
    } else if (oldState.channelId !== newState.channelId) {
      description = `🔄 **Moved** from ${oldState.channel} to ${newState.channel}`;
      color = 0xFFA500;
    }
    // State changes
    else if (oldState.serverMute !== newState.serverMute) {
      description = `🎤 **Server ${newState.serverMute ? 'Muted' : 'Unmuted'}** in ${newState.channel}`;
    } else if (oldState.serverDeaf !== newState.serverDeaf) {
      description = `🔇 **Server ${newState.serverDeaf ? 'Deafened' : 'Undeafened'}** in ${newState.channel}`;
    } else if (oldState.selfMute !== newState.selfMute) {
      description = `🎤 **Self ${newState.selfMute ? 'Muted' : 'Unmuted'}** in ${newState.channel}`;
    } else if (oldState.selfDeaf !== newState.selfDeaf) {
      description = `🔇 **Self ${newState.selfDeaf ? 'Deafened' : 'Undeafened'}** in ${newState.channel}`;
    } else if (oldState.streaming !== newState.streaming) {
      description = `📺 **${newState.streaming ? 'Started' : 'Stopped'} streaming** in ${newState.channel}`;
    } else if (oldState.selfVideo !== newState.selfVideo) {
      description = `📹 **${newState.selfVideo ? 'Started' : 'Stopped'} video** in ${newState.channel}`;
    } else {
      return; // No relevant changes
    }

    const embed = new EmbedBuilder4()
      .setColor(color)
      .setAuthor({ 
        name: member.user.tag,
        iconURL: member.user.displayAvatarURL() 
      })
      .setDescription(description)
      .setFooter({ text: `ID: ${member.id}` })
      .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch(console.error);
  },
};

// ===== events/channelUpdate.js (SIMPLIFIED) =====
const Settings5 = require('../models/Settings');
const { EmbedBuilder: EmbedBuilder5 } = require('discord.js');

module.exports = {
  name: 'channelUpdate',
  async execute(oldChannel, newChannel, client) {
    const settings = await Settings5.findOne({ guildId: newChannel.guild.id });
    if (!settings?.autologChannelId) return;

    const logChannel = newChannel.guild.channels.cache.get(settings.autologChannelId);
    if (!logChannel || logChannel.id === newChannel.id) return;

    const changes = [];

    if (oldChannel.name !== newChannel.name) {
      changes.push(`**Name:** ${oldChannel.name} → ${newChannel.name}`);
    }
    if (oldChannel.topic !== newChannel.topic && newChannel.isTextBased()) {
      changes.push(`**Topic:** ${oldChannel.topic || '*None*'} → ${newChannel.topic || '*None*'}`.substring(0, 200));
    }
    if (oldChannel.nsfw !== newChannel.nsfw) {
      changes.push(`**NSFW:** ${newChannel.nsfw ? 'Enabled' : 'Disabled'}`);
    }
    if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser && newChannel.isTextBased()) {
      changes.push(`**Slowmode:** ${oldChannel.rateLimitPerUser}s → ${newChannel.rateLimitPerUser}s`);
    }

    if (changes.length === 0) return;

    const embed = new EmbedBuilder5()
      .setColor(0x0099FF)
      .setDescription(`**Channel Updated** ${newChannel}\n${changes.join('\n')}`)
      .setFooter({ text: `ID: ${newChannel.id}` })
      .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch(console.error);
  },
};
