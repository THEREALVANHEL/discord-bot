// commands/rrpanel.js (REWORKED - Single line input with '|')
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

    // 2. Combine args back into a single string and split by '|'
    const fullArgsString = args.join(' ');
    const parts = fullArgsString.split('|').map(part => part.trim());

    // 3. Validate Format (Title, Description, at least 1 role part)
    if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
        // Provide example in reply
        return message.reply(
            '❌ Invalid format. Use: `?rpanel <Title> | <Description> | <RoleID> <Emoji> <Details> | <RoleID2> <Emoji2> <Details2> ...`\n' +
            '**Example:**\n' +
            '`?rpanel Cool Roles | Get your roles! | 123456789012345678 ❤️ Color Role Red | 876543210987654321 ✨ Ping Role Updates`'
        );
    }

    // 4. Parse Arguments
    const title = parts.shift(); // First part is title
    const description = parts.shift(); // Second part is description
    const roleParts = parts; // Remaining parts are role definitions

    const rolesToAdd = [];
    const emojisToReact = [];
    let embedDescription = `${description}\n\n`;

    for (const roleString of roleParts) {
        // 5. Extract RoleID, Emoji, and Details for each role part
        // Match RoleID (first digits), Emoji (custom or unicode), and the rest is Details
        const match = roleString.match(/^(\d{17,19})\s+(<a?:.+?:\d+>|[\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}]+)\s+(.+)$/u);

        if (!match) {
            return message.reply(`❌ Invalid role format: "${roleString}". Use \`<RoleID> <Emoji> <Details>\`. Make sure the emoji is right after the ID.`);
        }

        const roleIdString = match[1];
        const emojiIdentifier = match[2]; // The detected emoji (custom or unicode)
        const detailString = match[3].trim();

        // 6. Validate Role ID
        const role = message.guild.roles.cache.get(roleIdString);
        if (!role) {
            return message.reply(`❌ Role with ID "${roleIdString}" not found in line: "${roleString}".`);
        }

        // 7. Validate Emoji (already implicitly validated by regex)

        // 8. Add to lists
        rolesToAdd.push({ roleId: role.id, emoji: emojiIdentifier });
        emojisToReact.push(emojiIdentifier);
        embedDescription += `${emojiIdentifier} - ${role} - *${detailString}*\n`; // Show role mention in embed
    }

    if (rolesToAdd.length === 0) {
         return message.reply('❌ No valid role definitions were found after the title and description.');
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
        await panelMessage.react(emoji).catch(reactError => {
            console.warn(`Could not react with ${emoji}: ${reactError.message}`);
            message.channel.send(`⚠️ Couldn't react with ${emoji}. Ensure it's a valid emoji accessible by the bot.`).catch(()=>{});
        });
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
      message.reply('❌ **Error:** Failed to create panel. Do I have permissions to send messages, add reactions, and manage messages?');
    }
  },
};
