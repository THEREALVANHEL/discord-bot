// commands/rrpanel.js (SIMPLIFIED - Comma separated with fullstop breaks)
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

    // 2. Combine all args into a single string
    const fullInput = args.join(' ');

    // 3. Split by fullstop (period) to get panel description and role entries
    const sections = fullInput.split('.').map(s => s.trim()).filter(s => s);

    // 4. Validate minimum input (panel description + at least 1 role)
    if (sections.length < 2) {
        return message.reply(
            '❌ Invalid format!\n\n' +
            '**Usage:** `?rpanel <Panel Description>, <RoleID>, <Role Description>, <Emoji>. <RoleID2>, <Role Description2>, <Emoji2>. ...`\n\n' +
            '**Example:**\n' +
            '`?rpanel Get your awesome roles here, 123456789012345678, Color Role Red, ❤️. 876543210987654321, Notification Role, 🔔.`'
        );
    }

    // 5. First section is the panel description (title)
    const panelDescription = sections.shift();

    // 6. Parse each role entry
    const rolesToAdd = [];
    const emojisToReact = [];
    let embedDescription = `${panelDescription}\n\n`;

    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        
        // Split by comma to get: RoleID, Role Description, Emoji
        const parts = section.split(',').map(p => p.trim());

        // Validate we have exactly 3 parts
        if (parts.length !== 3) {
            return message.reply(
                `❌ Invalid format in section ${i + 1}: "${section}"\n\n` +
                'Each role entry must have exactly 3 parts separated by commas:\n' +
                '`<RoleID>, <Role Description>, <Emoji>`'
            );
        }

        const [roleIdString, roleDescription, emojiIdentifier] = parts;

        // 7. Validate Role ID exists
        const role = message.guild.roles.cache.get(roleIdString);
        if (!role) {
            return message.reply(
                `❌ Role with ID "${roleIdString}" not found.\n` +
                `Entry: "${section}"`
            );
        }

        // 8. Validate Emoji (basic check for custom or unicode emoji)
        const emojiRegex = /^(<a?:.+?:\d+>|[\p{Emoji}\p{Emoji_Modifier}\p{Emoji_Component}\p{Emoji_Presentation}\p{Emoji_Modifier_Base}]+)$/u;
        if (!emojiRegex.test(emojiIdentifier)) {
            return message.reply(
                `❌ Invalid emoji "${emojiIdentifier}" in entry: "${section}"\n` +
                'Please use a valid emoji.'
            );
        }

        // 9. Add to lists
        rolesToAdd.push({ roleId: role.id, emoji: emojiIdentifier });
        emojisToReact.push(emojiIdentifier);
        embedDescription += `${emojiIdentifier} ${role} - *${roleDescription}*\n`;
    }

    // 10. Validate we have at least one role
    if (rolesToAdd.length === 0) {
        return message.reply('❌ No valid role entries found. Please add at least one role.');
    }

    // 11. Build the Embed
    const embed = new EmbedBuilder()
      .setTitle('🎭 Reaction Roles')
      .setDescription(embedDescription)
      .setColor(0x7289DA) // Blurple
      .setFooter({ text: 'React to an emoji below to get the corresponding role!' })
      .setTimestamp();

    try {
      // 12. Send the panel message
      const panelMessage = await message.channel.send({ embeds: [embed] });

      // 13. Add reactions to the message
      for (const emoji of emojisToReact) {
        await panelMessage.react(emoji).catch(reactError => {
            console.warn(`Could not react with ${emoji}: ${reactError.message}`);
            message.channel.send(`⚠️ Couldn't react with ${emoji}. Make sure it's a valid emoji the bot can use.`).catch(()=>{});
        });
      }

      // 14. Save to database
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

      // 15. Confirmation and cleanup
      await message.delete().catch(() => {}); // Delete command message
      const confirmation = await message.channel.send('✅ **Success!** Reaction role panel created!');
      setTimeout(() => confirmation.delete().catch(() => {}), 5000);

    } catch (error) {
      console.error('Error creating reaction role panel:', error);
      message.reply('❌ **Error:** Failed to create panel. Check my permissions (Send Messages, Add Reactions, Manage Messages).');
    }
  },
};
