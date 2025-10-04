// commands/spinawheel.js (REPLACE - Visual spinning wheel with Canvas)
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage, registerFont } = require('canvas');
const User = require('../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spinawheel')
    .setDescription('Spin the wheel for a random prize! Costs 50 coins.')
    .addStringOption(option =>
      option.setName('options')
        .setDescription('Comma-separated options (2-10, e.g., "Red,Blue,Green")')
        .setRequired(false)),
  async execute(interaction) {
    let user = await User.findOne({ userId: interaction.user.id });
    if (!user) {
      user = new User({ userId: interaction.user.id });
    }

    if (user.coins < 50) {
      return interaction.reply({ content: 'You need 50 coins to spin the wheel!', ephemeral: true });
    }

    let options = interaction.options.getString('options') ? interaction.options.getString('options').split(',').map(o => o.trim()) : ['Win 100 coins', 'Level Boost +10 XP', 'Nothing :(', 'Cookie +5', 'Rare Item!', 'Lose 20 coins'];
    options = options.slice(0, 10); // Limit to 10
    if (options.length < 2) options = ['Win 100 coins', 'Nothing :(']; // Minimum 2

    user.coins -= 50;
    await user.save();

    try {
      // Create canvas (800x800)
      const canvas = createCanvas(800, 800);
      const ctx = canvas.getContext('2d');

      // Wheel radius and center
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = 350;

      // Colors for segments
      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'];

      // Draw wheel segments
      const segmentAngle = (2 * Math.PI) / options.length;
      let startAngle = 0;

      options.forEach((option, index) => {
        const color = colors[index % colors.length];
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + segmentAngle);
        ctx.closePath();
        ctx.fill();

        // Text on segment
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(startAngle + segmentAngle / 2);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#000';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(option, radius / 2 - 50, 5);
        ctx.restore();

        startAngle += segmentAngle;
      });

      // Draw border
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#000';
      ctx.stroke();

      // Draw arrow (pointer at top)
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - radius - 20);
      ctx.lineTo(centerX - 20, centerY - radius + 10);
      ctx.lineTo(centerX + 20, centerY - radius + 10);
      ctx.closePath();
      ctx.fillStyle = '#000';
      ctx.fill();

      // Random spin (simulate rotation by choosing segment)
      const randomAngle = Math.random() * 2 * Math.PI;
      const selectedIndex = Math.floor((randomAngle % (2 * Math.PI)) / segmentAngle);
      const selectedOption = options[selectedIndex];

      // Apply prize (simple logic)
      let prizeMsg = '';
      if (selectedOption.includes('coins')) {
        const prizeCoins = 100;
        user.coins += prizeCoins;
        await user.save();
        prizeMsg = `You won 100 coins! Total: ${user.coins}`;
      } else if (selectedOption.includes('XP')) {
        user.xp += 10;
        await user.save();
        prizeMsg = 'You won +10 XP!';
      } else if (selectedOption.includes('Cookie')) {
        user.cookies += 5;
        await user.save();
        prizeMsg = 'You won 5 cookies!';
      } else if (selectedOption.includes('Lose')) {
        user.coins = Math.max(0, user.coins - 20);
        await user.save();
        prizeMsg = 'You lost 20 coins! Total: ${user.coins}';
      } else {
        prizeMsg = 'You won a rare item! (Placeholder)';
      }

      // Create attachment
      const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'wheel.png' });

      const embed = new EmbedBuilder()
        .setTitle('🎡 Wheel Spun!')
        .setDescription(`You spent 50 coins to spin.\n**Result:** ${selectedOption}\n${prizeMsg}`)
        .setColor(0xFFD700)
        .setImage('attachment://wheel.png')
        .setTimestamp();

      await interaction.reply({ embeds: [embed], files: [attachment] });

    } catch (error) {
      console.error('Wheel error:', error);
      // Fallback to text if Canvas fails
      const selectedOption = options[Math.floor(Math.random() * options.length)];
      const embed =
