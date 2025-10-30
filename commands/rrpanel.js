// commands/rrpanel.js (NEW - Prefix Command Version, Uses Role ID)
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const Settings = require('../models/Settings');

module.exports = {
  name: 'rpanel',
  description: 'Create a new reaction role panel (Prefix Command).',
  aliases: ['rrpanel'],

  async execute(message, args, client) {
    // 1. Check Permissions
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
        return message.reply('❌ You need the `Manage Guild` permission to use this command.');
    }

    // 2. Get all arguments (everything after the command) using message.content
    const commandName = message.content.split(' ')[0].slice(1); // ?rpanel or ?rrpanel
    const fullArgs = message.content.substring(message.content.indexOf(commandName) + commandName.length).trim();

    // 3. Provide example if no args are given
    if (!fullArgs) {
        // FIXED: Provide example in reply
        return message.reply('❌ Invalid format. Please provide the details on new lines after the command.\n**Example:**\n`?rpanel`\n`Cool Roles`\n`Get your roles here!`\n`123456789012345678 - Color Role Red - ❤️`\n`876543210987654321 - Ping Role Updates - ✨`');
    }

    const lines = fullArgs.split('\n');

    // 4. Validate Format (Title, Description, at least 1 role line)
    if (lines.length < 3) {
        return message.reply('❌ Invalid format. Use:\n`?rpanel`\n`Title`\n`Description`\n`<RoleID> - Details - Emoji`\n`<RoleID2> - Details 2 - Emoji2`');
    }

    // 5. Parse Arguments
    const title = lines.shift().trim();
    const description = lines.shift().trim();
    const roleLines = lines;

    const rolesToAdd = [];
    const emojisToReact = [];
    let embedDescription = `${description}\n\n`;

    for (const line of roleLines) {
        const parts = line.split('-');

        // Ensure we have at least 3 parts (RoleID, Details, Emoji)
        if (parts.length < 3) {
            return message.reply(`❌ Invalid line format: "${line}". Make sure to use \`<RoleID> - Details - Emoji\`.`);
        }

        // 6. Extract Parts
        const roleIdString = parts[0].trim();
        const detailString = parts.slice(1, -1).join('-').trim(); // Join middle parts for details
        const emojiString = parts[parts.length - 1].trim();

        // 7. Validate Role ID
        if (!/^\d{17,19}$/.test(roleIdString)) { // Check if it looks like a Discord ID
            return message.reply(`❌ Invalid Role ID: "${roleIdString}". Please provide a valid Role ID number.`);
        }
        const role = message.guild.roles.cache.get(roleIdString);
        if (!role) {
            return message.reply(`❌ Role with ID "${roleIdString}" not found.`);
        }

        // 8. Validate Emoji
        const emojiMatch = emojiString.match(/<a?:(.+?):(\d+)>|(.+)/); // Matches custom or unicode
        if (!emojiMatch) {
            return message.reply(`❌ Invalid emoji: "${emojiString}".`);
        }
        const emojiIdentifier = emojiString; // Use the full string

        // 9. Add to lists
        rolesToAdd.push({ roleId: role.id, emoji: emojiIdentifier });
        emojisToReact.push(emojiIdentifier);
        embedDescription += `${emojiIdentifier} - ${role} - *${detailString}*\n`; // Still show role mention in embed
    }

    if (rolesToAdd.length === 0) {
         return message.reply('❌ No valid role lines were found.');
    }

    // 10. Build the Embed
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(embedDescription)
      .setColor(0x7289DA) // Blurple
      .setFooter({ text: 'React to an emoji below to get the corresponding role!' });

    try {
      // 11. Send the panel message
      const panelMessage = await message.channel.send({ embeds: [embed] });

      // 12. Add reactions to the message
      for (const emoji of emojisToReact) {
        await panelMessage.react(emoji).catch(reactError => {
            console.warn(`Could not react with ${emoji}: ${reactError.message}`);
            message.channel.send(`⚠️ Couldn't react with ${emoji}. Ensure it's a valid emoji accessible by the bot.`).catch(()=>{});
        });
      }

      // 13. Save to database
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

      // 14. Clean up
      await message.delete().catch(() => {}); // Delete the user's command
      const confirmation = await message.channel.send('✅ **Success!** The reaction role panel has been created.');
      setTimeout(() => confirmation.delete().catch(() => {}), 5000);

    } catch (error) {
      console.error('Error creating reaction role panel:', error);
      message.reply('❌ **Error:** Failed to create panel. Do I have permissions to send messages, add reactions, and manage messages?');
    }
  },
};
