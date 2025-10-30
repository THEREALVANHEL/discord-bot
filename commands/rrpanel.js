// commands/rrpanel.js (NEW - Prefix Command Version)
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const Settings = require('../models/Settings');

module.exports = {
  name: 'rpanel',
  description: 'Create a new reaction role panel (Prefix Command).',
  aliases: ['rrpanel'], // You can also use ?rrpanel
  
  async execute(message, args, client) {
    // 1. Check Permissions
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return message.reply('❌ You need the `Manage Guild` permission to use this command.');
    }

    // 2. Get all arguments (everything after the command)
    // We use message.content to preserve newlines
    const commandName = message.content.split(' ')[0].slice(1); // ?rpanel or ?rrpanel
    const fullArgs = message.content.substring(message.content.indexOf(commandName) + commandName.length).trim();
    
    if (!fullArgs) {
        return message.reply('❌ Invalid format. Please provide the details on new lines after the command.');
    }

    const lines = fullArgs.split('\n');
    
    // 3. Validate Format (Title, Description, at least 1 role line)
    if (lines.length < 3) {
        return message.reply('❌ Invalid format. Use:\n`?rpanel`\n`Title`\n`Description`\n`@Role - Details - Emoji`\n`@Role2 - Details 2 - Emoji2`');
    }

    // 4. Parse Arguments
    const title = lines.shift().trim();
    const description = lines.shift().trim();
    const roleLines = lines;

    const rolesToAdd = [];
    const emojisToReact = [];
    let embedDescription = `${description}\n\n`;

    for (const line of roleLines) {
        const parts = line.split('-');
        
        // Ensure we have at least 3 parts (Role, Details, Emoji)
        if (parts.length < 3) {
            return message.reply(`❌ Invalid line format: "${line}". Make sure to use \`@Role - Details - Emoji\`.`);
        }

        // 5. Extract Parts
        const roleString = parts[0].trim();
        // Join all middle parts back together (in case details had a hyphen)
        const detailString = parts.slice(1, -1).join('-').trim();
        const emojiString = parts[parts.length - 1].trim();

        // 6. Validate Role
        const roleMatch = roleString.match(/<@&(\d+)>/);
        if (!roleMatch) {
            return message.reply(`❌ Invalid role: "${roleString}". Please make sure to @mention the role.`);
        }
        const role = message.guild.roles.cache.get(roleMatch[1]);
        if (!role) {
            return message.reply(`❌ Role "${roleString}" not found.`);
        }

        // 7. Validate Emoji
        const emojiMatch = emojiString.match(/<a?:(.+?):(\d+)>|(.+)/);
        if (!emojiMatch) {
            return message.reply(`❌ Invalid emoji: "${emojiString}".`);
        }
        const emojiIdentifier = emojiString; // Use the full string

        // 8. Add to lists
        rolesToAdd.push({ roleId: role.id, emoji: emojiIdentifier });
        emojisToReact.push(emojiIdentifier);
        // Add to embed description
        embedDescription += `${emojiIdentifier} - ${role} - *${detailString}*\n`;
    }

    if (rolesToAdd.length === 0) {
         return message.reply('❌ No valid role lines were found.');
    }

    // 9. Build the Embed
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(embedDescription)
      .setColor(0x7289DA) // Blurple
      .setFooter({ text: 'React to an emoji below to get the corresponding role!' });

    try {
      // 10. Send the panel message
      const panelMessage = await message.channel.send({ embeds: [embed] });

      // 11. Add reactions to the message
      for (const emoji of emojisToReact) {
        await panelMessage.react(emoji);
      }

      // 12. Save to database
      let settings = await Settings.findOne({ guildId: message.guild.id });
      if (!settings) {
        settings = new Settings({ guildId: message.guild.id });
      }

      const newReactionRoles = rolesToAdd.map(r => ({
        messageId: panelMessage.id,
        emoji: r.emoji,
        roleId: r.roleId,
      }));

      settings.reactionRoles.push(...newReactionRoles);
      await settings.save();

      // 13. Clean up
      await message.delete().catch(() => {}); // Delete the user's command
      const confirmation = await message.channel.send('✅ **Success!** The reaction role panel has been created.');
      setTimeout(() => confirmation.delete().catch(() => {}), 5000);

    } catch (error) {
      console.error('Error creating reaction role panel:', error);
      message.reply('❌ **Error:** Failed to create panel. Do I have permissions to send messages, add reactions, and delete your command?');
    }
  },
};
