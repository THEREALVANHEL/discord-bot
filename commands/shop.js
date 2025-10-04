// commands/shop.js
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');

// Example shop items (add this to client.config in index.js)
/*
client.config.shopItems = [
  { id: 'xp_boost_1h', name: '1 Hour XP Boost', description: 'Gain 2x XP for 1 hour.', price: 500, type: 'boost' },
  { id: 'cookie_pack_small', name: 'Small Cookie Pack', description: 'Get 100 cookies instantly.', price: 200, type: 'item', cookies: 100 },
  { id: 'rename_ticket', name: 'Nickname Change Ticket', description: 'Change your nickname once.', price: 1000, type: 'utility' },
];
*/

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Browse and purchase items from the server shop.')
    .addSubcommand(subcommand =>
      subcommand.setName('view')
        .setDescription('View available items in the shop.'))
    .addSubcommand(subcommand =>
      subcommand.setName('buy')
        .setDescription('Buy an item from the shop.')
        .addStringOption(option =>
          option.setName('item_id')
            .setDescription('The ID of the item to buy (e.g., xp_boost_1h)')
            .setRequired(true))),
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const shopItems = interaction.client.config.shopItems || [];

    if (subcommand === 'view') {
      if (shopItems.length === 0) {
        return interaction.reply({ content: 'The shop is currently empty!', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('🛒 Server Shop')
        .setDescription('Here are the items available for purchase:')
        .setColor(0x9932CC) // Dark Orchid
        .setTimestamp();

      shopItems.forEach(item => {
        embed.addFields({
          name: `${item.name} (ID: \`${item.id}\`)`,
          value: `Description: ${item.description}\nPrice: **${item.price} coins** 💰`,
          inline: false,
        });
      });

      await interaction.reply({ embeds: [embed] });

    } else if (subcommand === 'buy') {
      const itemId = interaction.options.getString('item_id');
      const itemToBuy = shopItems.find(item => item.id === itemId);

      if (!itemToBuy) {
        return interaction.reply({ content: 'That item ID does not exist in the shop.', ephemeral: true });
      }

      let user = await User.findOne({ userId: interaction.user.id });
      if (!user) {
        user = new User({ userId: interaction.user.id });
        await user.save();
      }

      if (user.coins < itemToBuy.price) {
        return interaction.reply({ content: `You don't have enough coins to buy "${itemToBuy.name}". You need ${itemToBuy.price} coins, but you only have ${user.coins}.`, ephemeral: true });
      }

      user.coins -= itemToBuy.price;

      let responseMessage = `You successfully purchased **${itemToBuy.name}** for ${itemToBuy.price} coins!`;
      let success = true;

      // Handle item effects
      switch (itemToBuy.type) {
        case 'boost':
          // Implement boost logic (e.g., add to a temporary boost array in user model)
          responseMessage += '\n(Boost effect will be applied. This feature needs further implementation.)';
          break;
        case 'item':
          if (itemToBuy.cookies) {
            user.cookies += itemToBuy.cookies;
            responseMessage += ` You gained ${itemToBuy.cookies} cookies!`;

            // Update cookie roles
            const member = interaction.guild.members.cache.get(interaction.user.id);
            if (member) {
              const cookieRoles = interaction.client.config.cookieRoles;
              for (const roleConfig of cookieRoles) {
                if (member.roles.cache.has(roleConfig.roleId)) {
                  await member.roles.remove(roleConfig.roleId).catch(() => {});
                }
              }
              const newCookieRole = cookieRoles
                .filter(r => r.cookies <= user.cookies)
                .sort((a, b) => b.cookies - a.cookies)[0];
              if (newCookieRole) {
                await member.roles.add(newCookieRole.roleId).catch(() => {});
              }
            }
          }
          break;
        case 'utility':
          responseMessage += '\n(Utility item effect will be applied. This feature needs further implementation.)';
          break;
        default:
          responseMessage += '\n(This item has no defined effect yet.)';
          success = false;
          break;
      }

      await user.save();

      const embed = new EmbedBuilder()
        .setTitle(success ? 'Purchase Successful!' : 'Purchase Processed (Effect Pending)')
        .setDescription(responseMessage)
        .addFields(
          { name: 'Your New Coin Balance', value: `${user.coins} coins 💰`, inline: true },
          { name: 'Your New Cookie Balance', value: `${user.cookies} cookies 🍪`, inline: true },
        )
        .setColor(success ? 0x00FF00 : 0xFFA500)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};
