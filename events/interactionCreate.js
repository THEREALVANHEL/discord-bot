module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    // Permission checks for admin, cookies manager, etc.
    const member = interaction.member;
    const config = client.config;

    // Admin roles
    const isAdmin = member.roles.cache.has(config.roles.forgottenOne) || member.roles.cache.has(config.roles.overseer);

    // Cookies manager role
    const isCookiesManager = member.roles.cache.has(config.roles.cookiesManager);

    // Lead mod or mod roles
    const isMod = member.roles.cache.has(config.roles.leadMod) || member.roles.cache.has(config.roles.mod);

    // Restrict commands based on roles (example)
    if (['addcookies', 'removecookies', 'addcookiesall', 'removecookiesall'].includes(interaction.commandName) && !isCookiesManager && !isAdmin) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    if (['claimticket', 'closeticket'].includes(interaction.commandName) && !isMod && !isAdmin) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    if (['addxp', 'removexp', 'addcoins', 'removecoins'].includes(interaction.commandName) && !isAdmin) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    if (interaction.commandName === 'gamelog' && !member.roles.cache.has(config.roles.gamelogUser ) && !isAdmin) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    if (interaction.commandName === 'purge' || interaction.commandName === 'purgeuser') {
      if (!isMod && !isAdmin) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      }
    }

    if (interaction.commandName === 'quicksetup' && !isAdmin) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'There was an error executing that command!', ephemeral: true });
      } else {
        await interaction.reply({ content: 'There was an error executing that command!', ephemeral: true });
      }
    }
  },
};
