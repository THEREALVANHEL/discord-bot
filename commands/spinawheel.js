// commands/spinawheel.js (REPLACE - Made options compulsory, removed default/prize logic)
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas } = require('canvas'); // REMOVED: registerFont import
const path = require('path');
const User = require('../models/User');

// FIX: Register the custom font from the assets folder once on load.
// REMOVED THE ENTIRE TRY/CATCH BLOCK FOR FONT REGISTRATION to ensure stability.


// Function to draw a winning arrow pointer
function drawPointer(ctx, centerX, centerY, radius, color) {
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.beginPath();
  ctx.moveTo(0, -radius - 25);
  ctx.lineTo(-20, -radius + 10);
  ctx.lineTo(20, -radius + 10);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spinawheel')
    .setDescription('Spin a colorful wheel for a random prize!')
    .addStringOption(option =>
      option.setName('title')
        .setDescription('The title for the wheel.')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('options')
        .setDescription('Comma-separated options (2–10, e.g., "Win 10 coins, Lose 5 coins, Nothing")')
        // FIX: Made options required
        .setRequired(true) 
    ),

  execute: async (interaction) => {
    await interaction.deferReply({ ephemeral: false });

    const title = interaction.options.getString('title');
    const rawOptions = interaction.options.getString('options');
    // FIX: Removed default options and min length checks
    let options = rawOptions.split(',').map(o => o.trim()).filter(Boolean).slice(0, 10);
    
    if (options.length < 2) {
      // Re-check for minimum length after processing, just in case user provides only one option
      return interaction.editReply({ content: '❌ **Error:** Please provide at least two comma-separated options.', ephemeral: true });
    }

    // Fetch or create user in MongoDB (kept for general consistency, even if coins/xp aren't directly used by this command anymore)
    let user = await User.findOne({ userId: interaction.user.id });
    if (!user) {
      user = new User({ userId: interaction.user.id, coins: 0, cookies: 0, xp: 0 });
      await user.save();
    }

    // Pick winner
    const selectedIndex = Math.floor(Math.random() * options.length);
    const selectedOption = options[selectedIndex];

    // Prize logic
    // FIX: Simplified prize logic to simply announce the result
    const prizeMsg = `You won **${selectedOption}**! (Reward handled externally)`;
    
    // NOTE: Removed `await user.save()` as coins/cookies/xp are no longer modified here.

    try {
      // Canvas setup
      const canvas = createCanvas(800, 800);
      const ctx = canvas.getContext('2d');
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = 350;

      // White background fix is vital for rendering issues
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];
      const segmentAngle = (2 * Math.PI) / options.length;

      // Calculate rotation so winner aligns with arrow (top)
      const winningCenterAngle = selectedIndex * segmentAngle + segmentAngle / 2;
      const rotationToApply = (3 * Math.PI / 2) - winningCenterAngle;

      let startAngle = 0;

      // Draw segments + labels
      for (let i = 0; i < options.length; i++) {
        const color = colors[i % colors.length];
        const option = options[i];

        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle + rotationToApply, startAngle + segmentAngle + rotationToApply);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();

        // Text
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(startAngle + segmentAngle / 2 + rotationToApply);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#000000';
        // FIX: Use a generic font for stability
        ctx.font = 'bold 26px sans-serif'; 
        ctx.fillText(option.substring(0, 25), radius - 40, 10);
        ctx.restore();

        startAngle += segmentAngle;
      }

      // Border
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#333';
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.stroke();

      // Center circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, 50, 0, 2 * Math.PI);
      ctx.fillStyle = '#FF4500';
      ctx.fill();

      // Pointer (arrow)
      drawPointer(ctx, centerX, centerY, radius, '#FF4500');

      const attachment = new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'wheel.png' });

      const embed = new EmbedBuilder()
        .setTitle(`🎰 ${title}`)
        .setDescription('The wheel spun and landed on the section pointed to by the red arrow.')
        .addFields(
          { name: '🎉 Winning Option', value: `**${selectedOption}**`, inline: true },
          { name: '🎁 Your Reward', value: prizeMsg, inline: true },
          { name: '⚙️ All Options', value: options.map((o, i) => `${i + 1}. ${o}`).join('\n').substring(0, 1024) }
        )
        .setColor(0xFFD700)
        .setImage('attachment://wheel.png')
        .setTimestamp()
        .setFooter({ text: `Spin by ${interaction.user.tag}` });

      await interaction.editReply({ embeds: [embed], files: [attachment] });

    } catch (err) {
      console.error('❌ Wheel render failed:', err);
      const fallbackEmbed = new EmbedBuilder()
        .setTitle('🎰 Wheel Spun! (Fallback)')
        .setDescription(`Result: **${selectedOption}**\n\nPrize applied: ${prizeMsg}`)
        .setColor(0xFFD700);
      await interaction.editReply({ embeds: [fallbackEmbed] });
    }
  }
};
