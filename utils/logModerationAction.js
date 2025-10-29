// utils/logModerationAction.js
const { EmbedBuilder } = require('discord.js');

async function logModerationAction(guild, settings, action, target, moderator, reason = 'No reason provided', extra = '') {
  if (!guild || !settings || !settings.modlogChannelId) return;

  let modlogChannel;
   try {
       modlogChannel = await guild.channels.fetch(settings.modlogChannelId);
   } catch {
       console.error(`Could not find modlog channel with ID ${settings.modlogChannelId} in guild ${guild.name}`);
       return;
   }

  if (!modlogChannel || !modlogChannel.isTextBased()) return; // Check if it's a text channel

   // Determine target string (User, Channel, etc.)
   let targetString = 'N/A';
   if (target) {
       if (target.tag && target.id) { // Discord User object
           targetString = `${target.tag} (${target.id})`;
       } else if (target.name && target.id) { // Discord Channel or Role object
            if (target.isTextBased?.() || target.isVoiceBased?.() || target.isCategory?.()) { // Channel
                targetString = `${target.name} (<#${target.id}>)`;
            } else { // Assume Role
                 targetString = `${target.name} (<@&${target.id}>)`;
            }
       } else if (typeof target === 'string') { // String (e.g., message content)
            targetString = target.substring(0, 100); // Truncate long strings
       }
       // Add more checks if needed for other target types
   }


  const embed = new EmbedBuilder()
    .setTitle(`Moderation Action: ${action}`)
    .setColor(0x7289DA) // Blurple or action-specific color
    .addFields(
      { name: 'Target', value: targetString },
      { name: 'Moderator', value: moderator ? `${moderator.tag} (${moderator.id})` : 'Unknown/System' },
      { name: 'Reason', value: reason.substring(0, 1020) }, // Truncate reason
    )
    .setTimestamp();

    if (extra) {
        embed.addFields({ name: 'Details', value: extra.substring(0, 1020) });
    }

  try {
      await modlogChannel.send({ embeds: [embed] });
  } catch (error) {
      console.error(`Failed to send modlog message to channel ${settings.modlogChannelId}:`, error);
  }
}

module.exports = { logModerationAction };
