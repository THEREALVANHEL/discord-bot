const User = require('../models/User');
const Settings = require('../models/Settings');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const ms = require('ms');

// --- LEVENSHTEIN DISTANCE ---
function levenshteinDistance(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
            if (i === 0) {
                costs[j] = j;
            } else if (j > 0) {
                let newValue = costs[j - 1];
                if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                    newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                }
                costs[j - 1] = lastValue;
                lastValue = newValue;
            }
        }
        if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
}

// --- GIPHY API ---
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function searchGiphyGif(query) {
    const GIPHY_KEY = process.env.GIPHY_API_KEY || "";
    if (!GIPHY_KEY) {
        console.log('No Giphy API key found, using fallback');
        const fallbackGifs = [
            'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',
            'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif',
            'https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif'
        ];
        return fallbackGifs[Math.floor(Math.random() * fallbackGifs.length)];
    }
    
    const searchUrl = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=25&rating=g`;
    
    try {
        const response = await fetch(searchUrl);
        const data = await response.json();
        
        if (data.data && data.data.length > 0) {
            const randomIndex = Math.floor(Math.random() * Math.min(data.data.length, 10));
            return data.data[randomIndex].images.original.url;
        }
    } catch (error) {
        console.error('Giphy API error:', error);
    }
    
    const fallbackGifs = [
        'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',
        'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif',
        'https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif'
    ];
    return fallbackGifs[Math.floor(Math.random() * fallbackGifs.length)];
}

// --- CORE UTILITIES ---
const xpCooldowns = new Map();
const XP_COOLDOWN_MS = 5000;

const getNextLevelXp = (level) => Math.floor(100 * Math.pow(level + 1, 1.5));

async function manageTieredRoles(member, userValue, roleConfigs, property) {
    if (!roleConfigs || roleConfigs.length === 0) return;
    
    const targetRoleConfig = roleConfigs
      .filter(r => r[property] <= userValue)
      .sort((a, b) => b.level - a.level)[0];
    
    const targetRoleId = targetRoleConfig ? targetRoleConfig.roleId : null;

    for (const roleConfig of roleConfigs) {
        const roleId = roleConfig.roleId;
        const hasRole = member.roles.cache.has(roleId);
        
        if (roleId === targetRoleId) {
            if (!hasRole) await member.roles.add(roleId).catch(() => {});
        } else {
            if (hasRole) await member.roles.remove(roleId).catch(() => {});
        }
    }
}

// IMPROVED user resolution
function resolveUser(guild, input, authorId) {
    if (!input || input.length < 2) return null;
    
    const match = input.match(/<@!?(\d+)>|(\d{17,19})/);
    if (match) {
        const id = match[1] || match[2];
        const member = guild.members.cache.get(id);
        if (id === authorId) return { self: true };
        return member;
    }

    const searchKey = input.toLowerCase().trim();
    
    let exactMatch = guild.members.cache.find(m => 
        m.id !== authorId && 
        (m.user.username.toLowerCase() === searchKey || 
         m.displayName.toLowerCase() === searchKey ||
         m.user.tag.toLowerCase() === searchKey)
    );
    if (exactMatch) return exactMatch;
    
    let startsWithMatch = guild.members.cache.find(m =>
        m.id !== authorId &&
        (m.user.username.toLowerCase().startsWith(searchKey) || 
         m.displayName.toLowerCase().startsWith(searchKey))
    );
    if (startsWithMatch) return startsWithMatch;
    
    let containsMatch = guild.members.cache.find(m =>
        m.id !== authorId &&
        (m.user.username.toLowerCase().includes(searchKey) || 
         m.displayName.toLowerCase().includes(searchKey))
    );
    if (containsMatch) return containsMatch;
    
    let bestMatch = null;
    let bestScore = 999;

    guild.members.cache.forEach(member => {
        if (member.id === authorId) return;
        
        const username = member.user.username.toLowerCase();
        const displayName = member.displayName.toLowerCase();
        
        const distUser = levenshteinDistance(searchKey, username);
        const distDisplay = levenshteinDistance(searchKey, displayName);
        const minDist = Math.min(distUser, distDisplay);
        const maxAllowed = Math.max(2, Math.floor(searchKey.length / 3));
        
        if (minDist < bestScore && minDist <= maxAllowed) {
            bestScore = minDist;
            bestMatch = member;
        }
    });

    return bestMatch;
}

// COMPREHENSIVE command parser
function parseCommand(text, guild, authorId) {
    const lower = text.toLowerCase().trim();
    const words = lower.split(/\s+/);
    
    const skipWords = ['blecky', 'warn', 'add', 'remove', 'send', 'show', 'dm', 'how', 'many', 'does', 'have', 'get', 'view', 'check', 'what', 'whats', 'when', 'did', 'to', 'for', 'from', 'me', 'my', 'a', 'an', 'the', 'coins', 'coin', 'cookies', 'cookie', 'xp', 'level', 'saying', 'say', 'message', 'gif', 'give', 'reason', 'is', 'with', 'picture', 'avatar', 'profile', 'image', 'ping', 'warnlist', 'list', 'of', 'warning', 'warnings', 'one', 'their', 'his', 'her'];
    
    const findTarget = () => {
        const mentionMatch = text.match(/<@!?(\d+)>/);
        if (mentionMatch) {
            const id = mentionMatch[1];
            const member = guild.members.cache.get(id);
            if (id === authorId) return { self: true };
            return member;
        }
        
        for (let wordCount = 3; wordCount >= 1; wordCount--) {
            for (let i = 0; i <= words.length - wordCount; i++) {
                const phrase = words.slice(i, i + wordCount).join(' ');
                if (skipWords.includes(phrase) || phrase.length < 2) continue;
                
                const resolved = resolveUser(guild, phrase, authorId);
                if (resolved?.self) return { self: true };
                if (resolved) return resolved;
            }
        }
        
        return null;
    };
    
    if (lower.match(/what.*log|show.*log|whats.*log/i)) {
        const numberMatch = lower.match(/(\d+)/);
        const logNumber = numberMatch ? parseInt(numberMatch[1]) : 10;
        return { type: 'LOG', count: Math.min(logNumber, 50) };
    }
    
    if (lower.match(/remove.*warning|remove.*warn|delete.*warn/i)) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "❌ Can't remove your own warnings" };
        
        const warnNumMatch = lower.match(/warning\s*#?\s*(\d+)|warn\s*#?\s*(\d+)|#\s*(\d+)/i);
        const warnIndex = warnNumMatch ? parseInt(warnNumMatch[1] || warnNumMatch[2] || warnNumMatch[3]) : 1;
        
        if (target) {
            return { type: 'REMOVE_WARNING', targetId: target.id, targetTag: target.user.tag, warnIndex: warnIndex };
        }
        return { type: 'ERROR', message: "❌ User not found" };
    }
    
    if (lower.match(/remove|take/i) && lower.match(/coin|cookie/i)) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "❌ Can't remove from yourself" };
        
        const amountMatch = lower.match(/(\d+)/);
        const amount = amountMatch ? parseInt(amountMatch[1]) : 1;
        
        let command = 'removecoins';
        if (lower.includes('cookie')) command = 'removecookies';
        
        if (target) {
            return { type: 'REMOVE_CURRENCY', command: command, targetId: target.id, targetTag: target.user.tag, amount: amount };
        }
        return { type: 'ERROR', message: "❌ User not found" };
    }
    
    if (lower.match(/(?:show|get|view|check|what|whats|display).*(?:warnlist|warnings|warn list)|warnlist.*(?:of|for)|warnings.*(?:of|for)/i)) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "❌ Check your own warnlist with /warnlist" };
        if (target) {
            return { type: 'WARNLIST', targetId: target.id, targetTag: target.user.tag };
        }
        return { type: 'ERROR', message: "❌ User not found" };
    }
    
    if (lower.match(/^ping\s+/i) && !lower.includes('saying') && !lower.includes('dm')) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "❌ Can't ping yourself" };
        if (target) return { type: 'PING', targetId: target.id };
        return { type: 'ERROR', message: "❌ User not found" };
    }
    
    if (lower.match(/(?:send|show|get|what|whats|display).*(?:profile|avatar|picture|pfp|pic)/i)) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "❌ Use /avatar" };
        if (target) return { type: 'AVATAR', targetId: target.id, targetTag: target.user.tag };
        return { type: 'ERROR', message: "❌ User not found" };
    }
    
    if (lower.match(/when.*(?:make|create|made|start).*(?:account|discord)/i)) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "❌ Use /userinfo" };
        if (target) return { type: 'ACCOUNT_CREATED', targetId: target.id, targetTag: target.user.tag };
        return { type: 'ERROR', message: "❌ User not found" };
    }
    
    if (lower.match(/send.*gif|show.*gif|gif.*of|get.*gif|.*gif$/i)) {
        let gifQuery = text
            .replace(/blecky/gi, '')
            .replace(/send/gi, '')
            .replace(/show/gi, '')
            .replace(/get/gi, '')
            .replace(/give/gi, '')
            .replace(/me/gi, '')
            .replace(/\ba\b/gi, '')
            .replace(/\ban\b/gi, '')
            .replace(/\bthe\b/gi, '')
            .replace(/gif/gi, '')
            .replace(/\bof\b/gi, '')
            .trim();
        
        if (!gifQuery || gifQuery.length === 0) gifQuery = 'random funny';
        return { type: 'GIF', query: gifQuery };
    }
    
    if (lower.includes('dm') || (lower.includes('message') && !lower.includes('delete'))) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "❌ Can't DM yourself" };
        
        const contentMatch = text.match(/(?:saying|say|message|tell|with|:)\s+(.+)/i);
        const content = contentMatch ? contentMatch[1].trim() : "Hi! 👋";
        
        if (target) return { type: 'DM', targetId: target.id, targetTag: target.user.tag, content: content };
        return { type: 'ERROR', message: "❌ User not found" };
    }
    
    if (lower.includes('warn') && !lower.includes('warnlist') && !lower.includes('remove')) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "❌ Can't warn yourself" };
        
        const reasonMatch = text.match(/(?:reason|for|because|:)\s+(.+)/i);
        const reason = reasonMatch ? reasonMatch[1].trim() : 'Warned by admin';
        
        if (target) return { type: 'WARN', targetId: target.id, targetTag: target.user.tag, reason: reason };
        return { type: 'ERROR', message: "❌ User not found" };
    }
    
    if (lower.match(/add|give/i) && lower.match(/coin|cookie|xp/i) && !lower.includes('remove')) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "❌ Can't add to yourself" };
        
        const amountMatch = lower.match(/(\d+)/);
        const amount = amountMatch ? parseInt(amountMatch[1]) : 1;
        
        let command = 'addcoins';
        if (lower.includes('cookie')) command = 'addcookies';
        if (lower.includes('xp')) command = 'addxp';
        
        if (target) return { type: 'ADD_CURRENCY', command: command, targetId: target.id, targetTag: target.user.tag, amount: amount };
        return { type: 'ERROR', message: "❌ User not found" };
    }
    
    if (lower.match(/how many|how much|what.*balance|check.*balance/i)) {
        const target = findTarget();
        let query = 'coins';
        if (lower.includes('cookie')) query = 'cookies';
        if (lower.includes('xp')) query = 'xp';
        if (lower.includes('level')) query = 'level';
        
        if (target?.self) return { type: 'ERROR', message: "❌ Use /profile" };
        if (target) return { type: 'INFO', targetId: target.id, targetTag: target.user.tag, query: query };
        return { type: 'ERROR', message: "❌ User not found" };
    }
    
    if (lower.match(/when.*join/i)) {
        const target = findTarget();
        if (target?.self) return { type: 'ERROR', message: "❌ Use /userinfo" };
        if (target) return { type: 'JOINED', targetId: target.id, targetTag: target.user.tag };
        return { type: 'ERROR', message: "❌ User not found" };
    }
    
    return null;
}

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const settings = await Settings.findOne({ guildId: message.guild.id });
    
    const botMention = message.mentions.users.has(client.user.id);
    const isBleckyCommand = message.content.toLowerCase().startsWith('blecky');
    const forgottenOneRole = client.config.roles.forgottenOne;
    const isForgottenOne = message.member?.roles.cache.has(forgottenOneRole);
    
    if ((botMention || isBleckyCommand) && isForgottenOne) {
        let userQuery = message.content;
        if (botMention) {
            userQuery = userQuery.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
        } else if (isBleckyCommand) {
            userQuery = userQuery.replace(/^blecky\s*/i, '').trim();
        }
        
        if (userQuery.length === 0) {
            await message.reply("Yes? 🐱");
            return;
        }

        try {
            const parsed = parseCommand(userQuery, message.guild, message.author.id);
            
            if (parsed?.type === 'ERROR') {
                await message.reply(parsed.message);
                return;
            }
            
            if (parsed) {
                if (parsed.type === 'LOG') {
                    const messages = await message.channel.messages.fetch({ limit: Math.min(parsed.count + 1, 50) });
                    const messageList = Array.from(messages.values()).filter(m => m.id !== message.id).slice(0, parsed.count).reverse();
                    
                    const embed = new EmbedBuilder()
                        .setTitle(`📜 Last ${messageList.length} Messages`)
                        .setColor(0x7289DA)
                        .setTimestamp();
                    
                    messageList.forEach((msg, index) => {
                        const content = msg.content.length > 100 ? msg.content.substring(0, 100) + '...' : msg.content;
                        embed.addFields({ name: `${index + 1}. ${msg.author.tag}`, value: content || '*[No content]*', inline: false });
                    });
                    
                    await message.reply({ embeds: [embed] });
                    return;
                }
                
                if (parsed.type === 'PING') {
                    await message.channel.send(`<@${parsed.targetId}>`);
                    return;
                }
                
                if (parsed.type === 'WARNLIST') {
                    const targetUser = await User.findOne({ userId: parsed.targetId });
                    const member = message.guild.members.cache.get(parsed.targetId);
                    
                    if (!targetUser || !targetUser.warnings || targetUser.warnings.length === 0) {
                        await message.reply(`✅ **${member?.user.tag || parsed.targetTag}** has no warnings.`);
                        return;
                    }
                    
                    const embed = new EmbedBuilder()
                        .setTitle(`⚠️ Warnings for ${member?.user.tag || parsed.targetTag}`)
                        .setColor(0xFFA500)
                        .setThumbnail(member?.user.displayAvatarURL({ dynamic: true }))
                        .setDescription(`Total Warnings: **${targetUser.warnings.length}**`)
                        .setTimestamp();
                    
                    targetUser.warnings.forEach((warn, index) => {
                        const moderator = message.guild.members.cache.get(warn.moderatorId);
                        embed.addFields({
                            name: `Warning #${index + 1}`,
                            value: `**Reason:** ${warn.reason}\n**Moderator:** ${moderator?.user.tag || 'Unknown'}\n**Date:** <t:${Math.floor(warn.date.getTime() / 1000)}:F>`,
                            inline: false
                        });
                    });
                    
                    await message.channel.send({ embeds: [embed] });
                    return;
                }
                
                if (parsed.type === 'REMOVE_WARNING') {
                    const targetUser = await User.findOne({ userId: parsed.targetId });
                    const member = message.guild.members.cache.get(parsed.targetId);
                    
                    if (!targetUser || !targetUser.warnings || targetUser.warnings.length === 0) {
                        await message.reply(`❌ **${member?.user.tag || parsed.targetTag}** has no warnings.`);
                        return;
                    }
                    
                    if (parsed.warnIndex < 1 || parsed.warnIndex > targetUser.warnings.length) {
                        await message.reply(`❌ Invalid warning number. **${member?.user.tag}** has ${targetUser.warnings.length} warning(s).`);
                        return;
                    }
                    
                    const removedWarn = targetUser.warnings[parsed.warnIndex - 1];
                    targetUser.warnings.splice(parsed.warnIndex - 1, 1);
                    await targetUser.save();
                    
                    await message.reply(`✅ Removed warning #${parsed.warnIndex} from **${member?.user.tag}**\n**Reason was:** ${removedWarn.reason}`);
                    
                    if (settings?.modlogChannelId) {
                        const logChannel = message.guild.channels.cache.get(settings.modlogChannelId);
                        if (logChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setTitle('⚠️ Warning Removed')
                                .setColor(0x00FF00)
                                .addFields(
                                    { name: 'Target', value: `${member?.user.tag} (${parsed.targetId})` },
                                    { name: 'Admin', value: `${message.author.tag} (${message.author.id})` },
                                    { name: 'Warning #', value: `${parsed.warnIndex}` },
                                    { name: 'Reason', value: removedWarn.reason }
                                )
                                .setTimestamp();
                            logChannel.send({ embeds: [logEmbed] });
                        }
                    }
                    return;
                }
                
                if (parsed.type === 'REMOVE_CURRENCY') {
                    const targetUser = await User.findOne({ userId: parsed.targetId });
                    if (!targetUser) {
                        await message.reply("❌ User not found in database.");
                        return;
                    }
                    
                    const member = message.guild.members.cache.get(parsed.targetId);
                    const currencyType = parsed.command === 'removecoins' ? 'coins' : 'cookies';
                    
                    if (targetUser[currencyType] < parsed.amount) {
                        await message.reply(`❌ **${member?.user.tag}** only has ${targetUser[currencyType]} ${currencyType}.`);
                        return;
                    }
                    
                    targetUser[currencyType] -= parsed.amount;
                    await targetUser.save();
                    
                    if (currencyType === 'cookies' && member) {
                        await manageTieredRoles(member, targetUser.cookies, client.config.cookieRoles, 'cookies');
                    }
                    
                    await message.reply(`✅ Removed **${parsed.amount}** ${currencyType} from **${member?.user.tag}**\nThey now have **${targetUser[currencyType]}** ${currencyType}`);
                    return;
                }
                
                if (parsed.type === 'AVATAR') {
                    const member = message.guild.members.cache.get(parsed.targetId);
                    if (member) {
                        const avatarUrl = member.user.displayAvatarURL({ dynamic: true, size: 1024 });
                        const embed = new EmbedBuilder()
                            .setTitle(`${member.user.tag}'s Avatar`)
                            .setImage(avatarUrl)
                            .setColor(0x7289DA);
                        await message.channel.send({ embeds: [embed] });
                    }
                    return;
                }
                
                if (parsed.type === 'ACCOUNT_CREATED') {
                    const member = message.guild.members.cache.get(parsed.targetId);
                    if (member) {
                        const createdDate = `<t:${Math.floor(member.user.createdTimestamp / 1000)}:F>`;
                        await message.reply(`**${member.user.tag}** created their Discord account on ${createdDate}`);
                    }
                    return;
                }
                
                if (parsed.type === 'GIF') {
                    const gifUrl = await searchGiphyGif(parsed.query);
                    await message.channel.send(gifUrl);
                    return;
                }
                
                if (parsed.type === 'DM') {
                    const target = await client.users.fetch(parsed.targetId).catch(() => null);
                    if (target) {
                        try {
                            await target.send(parsed.content);
                            await message.reply(`✅ Sent DM to **${target.tag}**: "${parsed.content}"`);
                        } catch {
                            await message.reply(`❌ Couldn't DM **${target.tag}** (DMs closed)`);
                        }
                    }
                    return;
                }
                
                if (parsed.type === 'WARN') {
                    let targetUser = await User.findOne({ userId: parsed.targetId });
                    if (!targetUser) targetUser = new User({ userId: parsed.targetId });
                    
                    targetUser.warnings.push({
                        reason: parsed.reason,
                        moderatorId: message.author.id,
                        date: new Date()
                    });
                    await targetUser.save();
                    
                    const member = message.guild.members.cache.get(parsed.targetId);
                    await message.reply(`✅ Warned **${member?.user.tag}**\n**Reason:** ${parsed.reason}\n**Total warnings:** ${targetUser.warnings.length}`);
                    
                    if (targetUser.warnings.length >= 5 && member) {
                        try {
                            await member.timeout(5 * 60 * 1000, '5 warnings reached');
                            await message.channel.send(`⏰ **${member.user.tag}** timed out for 5 minutes (5 warnings)`);
                        } catch {}
                    }
                    
                    if (settings?.modlogChannelId) {
                        const logChannel = message.guild.channels.cache.get(settings.modlogChannelId);
                        if (logChannel) {
                            const logEmbed = new EmbedBuilder()
                                .setTitle('⚠️ Warning Issued')
                                .setColor(0xFFA500)
                                .addFields(
                                    { name: 'Target', value: `${member?.user.tag} (${parsed.targetId})` },
                                    { name: 'Admin', value: `${message.author.tag} (${message.author.id})` },
                                    { name: 'Reason', value: parsed.reason },
                                    { name: 'Total', value: `${targetUser.warnings.length}` }
                                )
                                .setTimestamp();
                            logChannel.send({ embeds: [logEmbed] });
                        }
                    }
                    return;
                }
                
                if (parsed.type === 'ADD_CURRENCY') {
                    let targetUser = await User.findOne({ userId: parsed.targetId });
                    if (!targetUser) targetUser = new User({ userId: parsed.targetId });
                    
                    const member = message.guild.members.cache.get(parsed.targetId);
                    const currencyType = parsed.command === 'addcoins' ? 'coins' : parsed.command === 'addcookies' ? 'cookies' : 'xp';
                    
                    targetUser[currencyType] += parsed.amount;
                    await targetUser.save();
                    
                    if (currencyType === 'cookies' && member) {
                        await manageTieredRoles(member, targetUser.cookies, client.config.cookieRoles, 'cookies');
                    }
                    
                    await message.reply(`✅ Added **${parsed.amount}** ${currencyType} to **${member?.user.tag}**\nThey now have **${targetUser[currencyType]}** ${currencyType}`);
                    return;
                }
                
                if (parsed.type === 'INFO') {
                    const targetUser = await User.findOne({ userId: parsed.targetId });
                    const member = message.guild.members.cache.get(parsed.targetId);
                    let value = 0;
                    
                    switch(parsed.query) {
                        case 'coins': value = targetUser?.coins || 0; break;
                        case 'cookies': value = targetUser?.cookies || 0; break;
                        case 'xp': value = targetUser?.xp || 0; break;
                        case 'level': value = targetUser?.level || 0; break;
                    }
                    
                    await message.reply(`**${member?.user.tag}** has **${value}** ${parsed.query}`);
                    return;
                }
                
                if (parsed.type === 'JOINED') {
                    const member = message.guild.members.cache.get(parsed.targetId);
                    if (member) {
                        const joinDate = `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`;
                        await message.reply(`**${member.user.tag}** joined the server on ${joinDate}`);
                    }
                    return;
                }
            }
            
            await message.reply("❓ I couldn't understand that. Try:\n• `blecky ping ali`\n• `blecky show warnlist of vanhel`\n• `blecky send alien gif`\n• `blecky what log 10`");
            
        } catch (error) {
            console.error('AI Command Error:', error);
            await message.reply(`❌ Error: ${error.message}`);
        }
        return;
    }

    if (settings && settings.noXpChannels.includes(message.channel.id)) return;

    const cooldownKey = `${message.author.id}-${message.channel.id}`;
    const lastXpTime = xpCooldowns.get(cooldownKey);
    if (lastXpTime && (Date.now() - lastXpTime < XP_COOLDOWN_MS)) return;
    xpCooldowns.set(cooldownKey, Date.now());

    let user = await User.findOne({ userId: message.author.id });
    if (!user) user = new User({ userId: message.author.id });

    const xpGain = Math.floor(Math.random() * 3) + 3;
    user.xp += xpGain;

    const nextLevelXp = getNextLevelXp(user.level);
    if (user.xp >= nextLevelXp) {
      user.level++;
      user.xp -= nextLevelXp;

      const member = message.member;
      if (member) {
          await manageTieredRoles(member, user.level, client.config.levelingRoles, 'level');
      }
      const levelUpChannel = settings?.levelUpChannelId ? 
        message.guild.channels.cache.get(settings.levelUpChannelId) : message.channel;
      if (levelUpChannel) {
        const levelUpEmbed = new EmbedBuilder()
          .setTitle('🚀 Level UP!')
          .setDescription(`${message.author}, you're now **Level ${user.level}**!`)
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .setColor(0xFFD700)
          .setTimestamp();
        await levelUpChannel.send({ content: `${message.author}`, embeds: [levelUpEmbed] });
      }
    }

    const member = message.member;
    if (member) {
        await manageTieredRoles(member, user.cookies, client.config.cookieRoles, 'cookies');
    }
    
    const autoJoinRoleId = client.config.roles.autoJoin;
    if (autoJoinRoleId && member && !member.roles.cache.has(autoJoinRoleId)) {
      await member.roles.add(autoJoinRoleId).catch(() => {});
    }

    await user.save();
  },
};
