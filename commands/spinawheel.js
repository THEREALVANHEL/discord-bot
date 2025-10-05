const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, registerFont } = require('canvas');
const path = require('path');
const User = require('../models/User');

// Optional: Register custom font if available
try {
  registerFont(path.join(__dirname, '../assets/fonts/Poppins-Bold.ttf'), { family: 'Poppins' });
} catch {
  console.warn('⚠️ Poppins font not found, using default sans-serif.');
}

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
        .setRequired(false)
    ),

  execute: async (interaction) => {
    await interaction.deferReply({ ephemeral: false });

    const title = interaction.options.getString('title');
    const rawOptions = interaction.options.getString('options');
    let options = rawOptions ? rawOptions.split(',').map(o => o.trim()) : [
      'Win 100 coins', 'Lose 50 coins', 'Cookie +5', 'Nothing :(', 'XP +10', 'Rare Item'
    ];
    options = options.filter(Boolean).slice(0, 10);
    if (options.length < 2) options = ['Win 100 coins', 'Nothing :('];

    // Fetch or create user in MongoDB
    let user = await User.findOne({ userId: interaction.user.id });
    if (!user) {
      user = new User({ userId: interaction.user.id, coins: 0, cookies: 0, xp: 0 });
      await user.save();
    }

    // Pick winner
    const selectedIndex = Math.floor(Math.random() * options.length);
    const selectedOption = options[selectedIndex];

    // Prize logic
    let prizeMsg = 'No prize awarded.';
    if (selectedOption.toLowerCase().includes('coin')) {
      const match = selectedOption.match(/(\d+)/);
      const amount = match ? parseInt(match[1]) : 0;
      if (selectedOption.toLowerCase().includes('lose')) {
        user.coins = Math.max(0, user.coins - amount);
        prizeMsg = `**-${amount} coins** 💰! Total: ${user.coins}`;
      } else {
        user.coins += amount;
        prizeMsg = `**+${amount} coins** 💰! Total: ${user.coins}`;
      }
    } else if (selectedOption.toLowerCase().includes('cookie')) {
      const match = selectedOption.match(/(\d+)/);
      const amount = match ? parseInt(match[1]) : 0;
      user.cookies += amount;
      prizeMsg = `**+${amount} cookies** 🍪! Total: ${user.cookies}`;
    } else if (selectedOption.toLowerCase().includes('xp')) {
      const match = selectedOption.match(/(\d+)/);
      const amount = match ? parseInt(match[1]) : 0;
      user.xp += amount;
      prizeMsg = `**+${amount} XP** ✨!`;
    } else if (selectedOption.toLowerCase().includes('nothing')) {
      prizeMsg = 'You won nothing! Better luck next time.';
    } else {
      prizeMsg = `You won **${selectedOption}**! (Item effect pending)`;
    }

    await user.save();

    try {
      // Canvas setup
      const canvas = createCanvas(800, 800);
      const ctx = canvas.getContext('2d');
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = 350;

      // White background fix
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
        ctx.font = 'bold 26px Poppins, sans-serif';
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
