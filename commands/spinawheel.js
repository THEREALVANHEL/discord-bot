// commands/spinawheel.js (REPLACE - Improved visual robustness and result clarity)
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas } = require('canvas'); // Removed loadImage and registerFont for better portability
const User = require('../models/User');

// Function to draw a winning arrow pointing to a specific angle
function drawPointer(ctx, centerX, centerY, radius, color) {
    ctx.save();
    ctx.translate(centerX, centerY);

    // Draw a small arrow at the top
    ctx.beginPath();
    // Start slightly above the wheel
    ctx.moveTo(0, -radius - 30);
    // Left tip
    ctx.lineTo(-20, -radius + 10);
    // Right tip
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

    let options = interaction.options.getString('options') ? interaction.options.getString('options').split(',').map(o => o.trim()) : ['Win 100 coins', 'Level Boost +10 XP', 'Nothing :(', 'Cookie +5', 'Rare Item!', 'Lose 20 coins'];
    options = options.filter(Boolean).slice(0, 10); // Filter empty strings and limit to 10
    if (options.length < 2) options = ['Win 100 coins', 'Nothing :('];

    try {
      const canvas = createCanvas(800, 800);
      const ctx = canvas.getContext('2d');
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = 350;

      // FIX: Ensure white background explicitly to prevent black image issues
      ctx.fillStyle = '#FFFFFF'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];

      const segmentAngle = (2 * Math.PI) / options.length;
      let startAngle = 0;

      // Random spin (simulate rotation by choosing segment)
      const selectedIndex = Math.floor(Math.random() * options.length);
      const selectedOption = options[selectedIndex];

      // Calculate the angle required to show the winning segment at the top (3/2 * PI)
      const winningCenterAngle = selectedIndex * segmentAngle + segmentAngle / 2;
      const rotationAngle = (3 * Math.PI / 2) - winningCenterAngle;

      // Draw wheel segments
      options.forEach((option, index) => {
        const color = colors[index % colors.length];
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        // Apply rotation to the starting and ending angle
        ctx.arc(centerX, centerY, radius, startAngle + rotationAngle, startAngle + segmentAngle + rotationAngle);
        ctx.closePath();
        ctx.fill();

        // Text on segment
        ctx.save();
        ctx.translate(centerX, centerY);
        // Rotate to the center of the segment + the wheel's rotation + 90 degrees (Math.PI/2) for horizontal text
        ctx.rotate(startAngle + segmentAngle / 2 + rotationAngle + Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000000'; // Ensure text is black/visible
        // Set a standard font, hoping the system has it
        ctx.font = 'bold 24px sans-serif'; 
        // Position text further out
        ctx.fillText(option.substring(0, 15), 0, -radius / 1.5); // Truncate long text
        ctx.restore();

        startAngle += segmentAngle;
      });

      // Draw border
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.lineWidth = 15; // Thicker border
      ctx.strokeStyle = '#333333';
      ctx.stroke();
      
      // Draw center circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, 50, 0, 2 * Math.PI);
      ctx.fillStyle = '#FF4500';
      ctx.fill();
      
      // Draw pointer (arrow at top center)
      drawPointer(ctx, centerX, centerY, radius, '#FF4500'); // Red pointer

      // Apply prize
      let prizeMsg = '';
      if (selectedOption.includes('coins')) {
        // Attempt to extract number
        const match = selectedOption.match(/(\d+)/);
        const prizeCoins = match ? parseInt(match[1]) : 0;
        
        if (selectedOption.toLowerCase().includes('lose')) {
             user.coins = Math.max(0, user.coins - prizeCoins);
             prizeMsg = `**-${prizeCoins} coins** 💰! Total: ${user.coins} coins.`;
        } else {
             user.coins += prizeCoins;
             prizeMsg = `**+${prizeCoins} coins** 💰! Total: ${user.coins} coins.`;
        }
      } else if (selectedOption.includes('XP')) {
        const match = selectedOption.match(/(\d+)/);
        const prizeXp = match ? parseInt(match[1]) : 0;
        user.xp += prizeXp;
        prizeMsg = `**+${prizeXp} XP** ✨!`;
      } else if (selectedOption.includes('Cookie')) {
        const match = selectedOption.match(/(\d+)/);
        const prizeCookies = match ? parseInt(match[1]) : 0;
        user.cookies += prizeCookies;
        prizeMsg = `**+${prizeCookies} cookies** 🍪!`;
      } else {
        prizeMsg = `You won **${selectedOption}**! (Effect TBD - Item needs manual application)`;
      }

      await user.save();

      const attachment = new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'wheel.png' });

      const embed = new EmbedBuilder()
        .setTitle(`🎡 ${title}`)
        .setDescription(`The wheel spun and landed on:\n\n**🎯 ${selectedOption}**\n\n**Your Prize:** ${prizeMsg}`)
        .addFields(
            { name: 'Options', value: options.map((opt, i) => `${i + 1}. ${opt}`).join('\n').substring(0, 1024), inline: false} // Show all options
        )
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
        .setDescription(`**Result:** ${selectedOption}\n(Visual wheel failed to render. Please ensure 'canvas' dependency is correctly installed.)\n\n**Options Were:**\n${options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}`)
        .setColor(0xFFD700)
        .setTimestamp();
      await interaction.editReply({ embeds: [fallbackEmbed] });
    }
  },
};
