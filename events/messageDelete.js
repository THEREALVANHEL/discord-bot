// events/messageDelete.js (ENHANCED - Comprehensive Logging)
const Settings = require('../models/Settings');
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'messageDelete',
  async execute(message, client) {
    if (!message.author) return;
    if (!message.guild) return;

    const settings = await Settings.findOne({ guildId: message.guild.id });
    if (!settings || !settings.autologChannelId) return;

    const logChannel = message.guild.channels.cache.get(settings.autologChannelId);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
      .setTitle('🗑️ Message Deleted')
      .setColor(0xFF0000)
      .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
      .addFields(
        { name: 'User', value: `${message.author} ${message.author.bot ? '🤖 [BOT]' : ''}`, inline: true },
        { name: 'Channel', value: `${message.channel}`, inline: true },
        { name: 'Message ID', value: `\`${message.id}\``, inline: true },
        { name: 'Content', value: (message.content || '*[No text content]*').substring(0, 1024), inline: false }
      )
      .setTimestamp()
      .setFooter({ text: `User ID: ${message.author.id}` });

    // Log attachments if any
    if (message.attachments.size > 0) {
      embed.addFields({
        name: '📎 Attachments',
        value: message.attachments.map(a => `[${a.name}](${a.url})`).join('\n').substring(0, 1024)
      });
    }

    // Log embeds if any
    if (message.embeds.length > 0) {
      embed.addFields({
        name: '📰 Embeds',
        value: `${message.embeds.length} embed(s) were in this message`
      });
    }

    // Log stickers if any
    if (message.stickers.size > 0) {
      embed.addFields({
        name: '🎨 Stickers',
        value: message.stickers.map(s => s.name).join(', ')
      });
    }

    await logChannel.send({ embeds: [embed] }).catch(console.error);
  },
};

// ===== events/messageUpdate.js (ENHANCED) =====
// Save this as a separate file: events/messageUpdate.js
const Settings2 = require('../models/Settings');
const { EmbedBuilder: EmbedBuilder2 } = require('discord.js');

module.exports = {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage, client) {
    if (!oldMessage.author) return;
    if (!oldMessage.guild) return;
    if (oldMessage.content === newMessage.content) return;

    const settings = await Settings2.findOne({ guildId: oldMessage.guild.id });
    if (!settings || !settings.autologChannelId) return;

    const logChannel = oldMessage.guild.channels.cache.get(settings.autologChannelId);
    if (!logChannel) return;

    const embed = new EmbedBuilder2()
      .setTitle('✏️ Message Edited')
      .setColor(0xFFA500)
      .setAuthor({ name: oldMessage.author.tag, iconURL: oldMessage.author.displayAvatarURL() })
      .addFields(
        { name: 'User', value: `${oldMessage.author} ${oldMessage.author.bot ? '🤖 [BOT]' : ''}`, inline: true },
        { name: 'Channel', value: `${oldMessage.channel}`, inline: true },
        { name: 'Message', value: `[Jump to Message](${newMessage.url})`, inline: true },
        { name: '📝 Before', value: (oldMessage.content || '*[No content]*').substring(0, 1024), inline: false },
        { name: '📝 After', value: (newMessage.content || '*[No content]*').substring(0, 1024), inline: false }
      )
      .setTimestamp()
      .setFooter({ text: `Message ID: ${oldMessage.id}` });

    await logChannel.send({ embeds: [embed] }).catch(console.error);
  },
};

// ===== events/guildMemberUpdate.js (ENHANCED) =====
// This file already exists, but here's an enhanced version
const Settings3 = require('../models/Settings');
const { EmbedBuilder: EmbedBuilder3 } = require('discord.js');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember, client) {
    const settings = await Settings3.findOne({ guildId: newMember.guild.id });
    if (!settings || !settings.autologChannelId) return;

    const logChannel = newMember.guild.channels.cache.get(settings.autologChannelId);
    if (!logChannel) return;

    const changes = [];
    
    // Role changes
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;
    const addedRoles = newRoles.filter(role => !oldRoles.has(role.id) && role.id !== newMember.guild.id);
    const removedRoles = oldRoles.filter(role => !newRoles.has(role.id) && role.id !== newMember.guild.id);

    if (addedRoles.size > 0) {
      changes.push({
        name: '➕ Roles Added',
        value: addedRoles.map(r => `${r}`).join(', ').substring(0, 1024)
      });
    }

    if (removedRoles.size > 0) {
      changes.push({
        name: '➖ Roles Removed',
        value: removedRoles.map(r => `${r}`).join(', ').substring(0, 1024)
      });
    }

    // Nickname changes
    if (oldMember.nickname !== newMember.nickname) {
      changes.push({
        name: '📝 Nickname Changed',
        value: `**Before:** ${oldMember.nickname || '*None*'}\n**After:** ${newMember.nickname || '*None*'}`
      });
    }

    // Avatar changes (server avatar)
    if (oldMember.avatar !== newMember.avatar) {
      changes.push({
        name: '🖼️ Server Avatar Changed',
        value: 'Server-specific avatar was updated'
      });
    }

    // Timeout changes
    if (oldMember.communicationDisabledUntil !== newMember.communicationDisabledUntil) {
      const timeoutEnd = newMember.communicationDisabledUntil;
      if (timeoutEnd) {
        changes.push({
          name: '⏰ Timeout Applied',
          value: `Until: <t:${Math.floor(timeoutEnd.getTime() / 1000)}:F>`
        });
      } else {
        changes.push({
          name: '✅ Timeout Removed',
          value: 'User can now send messages'
        });
      }
    }

    // Boost status
    if (oldMember.premiumSince !== newMember.premiumSince) {
      if (newMember.premiumSince) {
        changes.push({
          name: '⭐ Server Boost Started',
          value: `Boosting since: <t:${Math.floor(newMember.premiumSince.getTime() / 1000)}:R>`
        });
      } else {
        changes.push({
          name: '💔 Server Boost Ended',
          value: 'No longer boosting this server'
        });
      }
    }

    // Pending status (member screening)
    if (oldMember.pending !== newMember.pending) {
      if (!newMember.pending) {
        changes.push({
          name: '✅ Passed Member Screening',
          value: 'User completed verification'
        });
      }
    }

    // Send log only if there are changes
    if (changes.length === 0) return;

    const embed = new EmbedBuilder3()
      .setTitle('👤 Member Updated')
      .setColor(0x0099FF)
      .setAuthor({ name: newMember.user.tag, iconURL: newMember.user.displayAvatarURL() })
      .addFields(
        { name: 'Member', value: `${newMember}`, inline: true },
        { name: 'User ID', value: `\`${newMember.id}\``, inline: true },
        ...changes
      )
      .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch(console.error);
  },
};

// ===== NEW: events/voiceStateUpdate.js =====
// Create this new file for voice channel logging
const Settings4 = require('../models/Settings');
const { EmbedBuilder: EmbedBuilder4 } = require('discord.js');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState, client) {
    const settings = await Settings4.findOne({ guildId: newState.guild.id });
    if (!settings || !settings.autologChannelId) return;

    const logChannel = newState.guild.channels.cache.get(settings.autologChannelId);
    if (!logChannel) return;

    const member = newState.member;
    let action, color, emoji;

    // Joined a voice channel
    if (!oldState.channelId && newState.channelId) {
      action = 'Joined Voice Channel';
      color = 0x00FF00;
      emoji = '🔊';
    }
    // Left a voice channel
    else if (oldState.channelId && !newState.channelId) {
      action = 'Left Voice Channel';
      color = 0xFF0000;
      emoji = '🔇';
    }
    // Moved between voice channels
    else if (oldState.channelId !== newState.channelId) {
      action = 'Moved Voice Channels';
      color = 0xFFA500;
      emoji = '🔄';
    }
    // Mute/unmute, deafen/undeafen
    else if (oldState.serverMute !== newState.serverMute || 
             oldState.serverDeaf !== newState.serverDeaf ||
             oldState.selfMute !== newState.selfMute ||
             oldState.selfDeaf !== newState.selfDeaf) {
      action = 'Voice State Changed';
      color = 0x0099FF;
      emoji = '🎤';
    } else {
      return; // No relevant changes
    }

    const embed = new EmbedBuilder4()
      .setTitle(`${emoji} ${action}`)
      .setColor(color)
      .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
      .addFields({ name: 'Member', value: `${member}`, inline: true })
      .setTimestamp();

    if (oldState.channel) {
      embed.addFields({ name: 'From Channel', value: `${oldState.channel}`, inline: true });
    }
    if (newState.channel) {
      embed.addFields({ name: 'To Channel', value: `${newState.channel}`, inline: true });
    }

    // Add state details
    const states = [];
    if (newState.serverMute !== oldState.serverMute) {
      states.push(`Server Mute: ${newState.serverMute ? '✅' : '❌'}`);
    }
    if (newState.serverDeaf !== oldState.serverDeaf) {
      states.push(`Server Deafen: ${newState.serverDeaf ? '✅' : '❌'}`);
    }
    if (newState.selfMute !== oldState.selfMute) {
      states.push(`Self Mute: ${newState.selfMute ? '✅' : '❌'}`);
    }
    if (newState.selfDeaf !== oldState.selfDeaf) {
      states.push(`Self Deafen: ${newState.selfDeaf ? '✅' : '❌'}`);
    }
    if (newState.streaming !== oldState.streaming) {
      states.push(`Streaming: ${newState.streaming ? '✅' : '❌'}`);
    }
    if (newState.selfVideo !== oldState.selfVideo) {
      states.push(`Video: ${newState.selfVideo ? '✅' : '❌'}`);
    }

    if (states.length > 0) {
      embed.addFields({ name: 'State Changes', value: states.join('\n') });
    }

    await logChannel.send({ embeds: [embed] }).catch(console.error);
  },
};

// ===== NEW: events/channelUpdate.js =====
// Create this for channel updates
const Settings5 = require('../models/Settings');
const { EmbedBuilder: EmbedBuilder5 } = require('discord.js');

module.exports = {
  name: 'channelUpdate',
  async execute(oldChannel, newChannel, client) {
    const settings = await Settings5.findOne({ guildId: newChannel.guild.id });
    if (!settings || !settings.autologChannelId) return;

    const logChannel = newChannel.guild.channels.cache.get(settings.autologChannelId);
    if (!logChannel || logChannel.id === newChannel.id) return;

    const changes = [];

    if (oldChannel.name !== newChannel.name) {
      changes.push({ name: 'Name Changed', value: `**Before:** ${oldChannel.name}\n**After:** ${newChannel.name}` });
    }

    if (oldChannel.topic !== newChannel.topic) {
      changes.push({ 
        name: 'Topic Changed', 
        value: `**Before:** ${oldChannel.topic || '*None*'}\n**After:** ${newChannel.topic || '*None*'}`.substring(0, 1024)
      });
    }

    if (oldChannel.nsfw !== newChannel.nsfw) {
      changes.push({ name: 'NSFW Status', value: newChannel.nsfw ? 'Enabled' : 'Disabled' });
    }

    if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
      changes.push({ 
        name: 'Slowmode Changed', 
        value: `**Before:** ${oldChannel.rateLimitPerUser || 0}s\n**After:** ${newChannel.rateLimitPerUser || 0}s` 
      });
    }

    if (changes.length === 0) return;

    const embed = new EmbedBuilder5()
      .setTitle('📝 Channel Updated')
      .setColor(0x0099FF)
      .addFields(
        { name: 'Channel', value: `${newChannel}`, inline: true },
        { name: 'Channel ID', value: `\`${newChannel.id}\``, inline: true },
        ...changes
      )
      .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch(console.error);
  },
};
