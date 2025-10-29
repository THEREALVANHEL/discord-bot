// commands/aisetup.js (NEW - Configure AI chat features)
const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const Settings = require('../models/Settings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aisetup')
    .setDescription('Configure AI chat settings for the server.')
    .addChannelOption(option =>
      option.setName('ai_channel')
        .setDescription('Set the designated AI chat channel')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('anonymous_mode')
        .setDescription('Enable anonymous mode for AI channel (hides usernames)')
        .setRequired(false))
    .addBooleanOption(option =>
      option.setName('math_mode')
        .setDescription('Enable automatic math expression evaluation')
        .setRequired(false)),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    let settings = await Settings.findOne({ guildId: interaction.guild.id });
    if (!settings) {
      settings = new Settings({ guildId: interaction.guild.id });
    }

    const updatedFields = [];

    const aiChannel = interaction.options.getChannel('ai_channel');
    if (aiChannel) {
      settings.aiChannelId = aiChannel.id;
      updatedFields.push(`AI Channel: ${aiChannel}`);
    }

    const anonymousMode = interaction.options.getBoolean('anonymous_mode');
    if (anonymousMode !== null) {
      settings.aiAnonymousMode = anonymousMode;
      updatedFields.push(`Anonymous Mode: ${anonymousMode ? 'Enabled' : 'Disabled'}`);
    }

    const mathMode = interaction.options.getBoolean('math_mode');
    if (mathMode !== null) {
      settings.aiMathMode = mathMode;
      updatedFields.push(`Math Mode: ${mathMode ? 'Enabled' : 'Disabled'}`);
    }

    await settings.save();

    const embed = new EmbedBuilder()
      .setTitle('🤖 AI Configuration Updated')
      .setDescription('The AI chat settings have been configured successfully.')
      .addFields(
        { name: 'Updated Settings', value: updatedFields.length > 0 ? updatedFields.join('\n') : 'No settings were updated.' }
      )
      .setColor(0x7289DA)
      .setTimestamp()
      .setFooter({ 
        text: 'Usage: Users can type "blecky [message]" anywhere or use the AI channel directly.' 
      });

    await interaction.editReply({ embeds: [embed] });
  },
};
