// commands/spinawheel.js (REPLACE - Free, title option, improved visual)
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('canvas');
const User = require('../models/User');

// Function to draw a winning arrow pointing to a specific angle
function drawPointer(ctx, centerX, centerY, radius, color, winningAngle) {
    ctx.save();
    ctx.translate(centerX, centerY);
    // Rotate the canvas so the winning angle aligns with the top (where the pointer is)
    // The pointer points at the top, which is angle -PI/2 (or 3PI/2) in standard geometry, 
    // but the canvas rotation system means 0 is right. We need to rotate by -winningAngle + PI/2
    const totalRotation = -winningAngle + Math.PI / 2;
    ctx.rotate(totalRotation);

    // Draw a small arrow at the top (relative to the rotated canvas)
    ctx.beginPath();
    ctx.moveTo(0, -radius - 20);
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
    .setDescription('Spin the wheel for a random prize!')
    .addStringOption(option =>
        option.setName('title')
            .setDescription('The title for the wheel.')
            .setRequired(true))
    .addStringOption(option =>
      option.setName('options')
        .setDescription('Comma-separated options (2-10, e.g., "Red,Blue,Green")')
        .setRequired(false)),
  async execute(interaction) {
    await interaction.deferReply();
    const title = interaction.options.getString('title');

    let user = await User.findOne({ userId: interaction.user.id });
    if (!user) {
      user = new User({ userId: interaction.user.id });
    }

    // Cost removed, now free!
    // if (user.coins < 50) {
    //   return interaction.editReply({ content: 'You need 50 coins to spin the wheel!', ephemeral: true });
    // }
    // user.coins -= 50;


    let options = interaction.options.getString('options') ? interaction.options.getString('options').split(',').map(o => o.trim()) : ['Win 100 coins', 'Level Boost +10 XP', 'Nothing :(', 'Cookie +5', 'Rare Item!', 'Lose 20 coins'];
    options = options.filter(Boolean).slice(0, 10); // Filter empty strings and limit to 10
    if (options.length < 2) options = ['Win 100 coins', 'Nothing :('];

    try {
      const canvas = createCanvas(800, 800);
      const ctx = canvas.getContext('2d');
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = 350;

      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];

      const segmentAngle = (2 * Math.PI) / options.length;
      let startAngle = 0;

      // Random spin (simulate rotation by choosing segment)
      const selectedIndex = Math.floor(Math.random() * options.length);
      const selectedOption = options[selectedIndex];

      // Calculate the angle of the center of the winning segment
      const winningCenterAngle = selectedIndex * segmentAngle + segmentAngle / 2;
      
      // Calculate the angle required to show the winning segment at the top (3/2 * PI)
      const rotationAngle = (3 * Math.PI / 2) - winningCenterAngle;

      // Draw wheel segments
      options.forEach((option, index) => {
        const color = colors[index % colors.length];
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle + rotationAngle, startAngle + segmentAngle + rotationAngle);
        ctx.closePath();
        ctx.fill();

        // Text on segment
        ctx.save();
        ctx.translate(centerX, centerY);
        // Rotate to the center of the segment + the wheel's rotation + 90 degrees (Math.PI/2) for horizontal text
        ctx.rotate(startAngle + segmentAngle / 2 + rotationAngle + Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.font = 'bold 20px Arial';
        // Position text further out
        ctx.fillText(option, 0, -radius / 1.5); 
        ctx.restore();

        startAngle += segmentAngle;
      });

      // Draw border
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#333';
      ctx.stroke();
      
      // Draw center circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, 50, 0, 2 * Math.PI);
      ctx.fillStyle = '#FF4500';
      ctx.fill();
      
      // Draw pointer (arrow at top center)
      drawPointer(ctx, centerX, centerY, radius, '#FF4500', 3 * Math.PI / 2); // Red pointer

      // Apply prize
      let prizeMsg = '';
      if (selectedOption.includes('coins')) {
        const prizeCoins = 100;
        user.coins += prizeCoins;
        prizeMsg = `**+${prizeCoins} coins** 💰! Total: ${user.coins} coins.`;
      } else if (selectedOption.includes('XP')) {
        const prizeXp = 10;
        user.xp += prizeXp;
        prizeMsg = `**+${prizeXp} XP** ✨!`;
      } else if (selectedOption.includes('Cookie')) {
        const prizeCookies = 5;
        user.cookies += prizeCookies;
        prizeMsg = `**+${prizeCookies} cookies** 🍪!`;
      } else if (selectedOption.includes('Lose')) {
        const loseCoins = 20;
        user.coins = Math.max(0, user.coins - loseCoins);
        prizeMsg = `**-${loseCoins} coins** 💸! Total: ${user.coins} coins.`;
      } else {
        prizeMsg = `You won **${selectedOption}**! (Effect TBD)`;
      }

      await user.save();

      const attachment = new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'wheel.png' });

      const embed = new EmbedBuilder()
        .setTitle(`🎡 ${title}`)
        .setDescription(`The wheel spun and landed on:\n\n**${selectedOption}**\n\n**Your Prize:** ${prizeMsg}`)
        //.addFields({ name: 'Cost', value: '0 coins (FREE!)', inline: true }) // No cost field
        .setColor(0xFFD700)
        .setImage('attachment://wheel.png')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], files: [attachment] });

    } catch (error) {
      console.error('Wheel error:', error);
      // Fallback to text if Canvas fails
      const selectedOption = options[Math.floor(Math.random() * options.length)];
      const fallbackEmbed = new EmbedBuilder()
        .setTitle('🎡 Wheel Spun! (Fallback)')
        .setDescription(`**Result:** ${selectedOption}\n(Visual wheel failed to render. Please ensure 'canvas' dependency is correctly installed.)`)
        .setColor(0xFFD700)
        .setTimestamp();
      await interaction.editReply({ embeds: [fallbackEmbed] });
    }
  },
};
