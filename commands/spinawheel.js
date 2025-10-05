// commands/spinawheel.js (REPLACE - Fixed Winner Display)
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas } = require('canvas'); 
const User = require('../models/User');

// ... (drawPointer function remains the same)

module.exports = {
  data: new SlashCommandBuilder()
// ... (data remains the same)
  async execute(interaction) {
    await interaction.deferReply();
    const title = interaction.options.getString('title');

    let user = await User.findOne({ userId: interaction.user.id });
// ... (user creation remains the same)

    let options = interaction.options.getString('options') ? interaction.options.getString('options').split(',').map(o => o.trim()) : ['Win 100 coins', 'Level Boost +10 XP', 'Nothing :(', 'Cookie +5', 'Rare Item!', 'Lose 20 coins'];
    options = options.filter(Boolean).slice(0, 10); // Filter empty strings and limit to 10
    if (options.length < 2) options = ['Win 100 coins', 'Nothing :('];

    // Randomly select the winning index before drawing the wheel
    const selectedIndex = Math.floor(Math.random() * options.length);
    const selectedOption = options[selectedIndex]; // This is the string we need to use
    
    // Apply prize logic early to ensure prizeMsg is available for fallback
    let prizeMsg = 'No prize awarded.';
    if (selectedOption.toLowerCase().includes('coins')) {
// ... (prize logic remains the same)
    } else if (selectedOption.toLowerCase().includes('xp')) {
// ... (prize logic remains the same)
    } else if (selectedOption.toLowerCase().includes('cookie')) {
// ... (prize logic remains the same)
    } else {
        // FIX: Ensure this fallback uses the full selectedOption string
        prizeMsg = `You won **${selectedOption}**! (Item effect is pending implementation)`;
    }
    await user.save(); // Save the result

    try {
// ... (canvas drawing logic remains the same)

      const attachment = new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'wheel.png' });

      const embed = new EmbedBuilder()
        .setTitle(`🎰 ${title}`)
        .setDescription(`The wheel spun and landed on the section pointed to by the red arrow.`)
        .addFields(
            { name: '🎉 Winning Option', value: `**${selectedOption}**`, inline: true}, // FIX: Use selectedOption here
            { name: '🎁 Your Reward', value: prizeMsg, inline: true},
            { name: '⚙️ All Options', value: options.map((opt, i) => `${i + 1}. ${opt}`).join('\n').substring(0, 1024), inline: false}
        )
// ... (rest of the embed remains the same)
      await interaction.editReply({ embeds: [embed], files: [attachment] });

    } catch (error) {
// ... (fallback logic remains the same)
    }
  },
};
