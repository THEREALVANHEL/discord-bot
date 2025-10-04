// commands/work.js (REPLACE - Job Progression: work, apply, resign subcommands)
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');
const Settings = require('../models/Settings');
const ms = require('ms');

// Function to calculate XP needed for the next level (Harder formula)
const getNextLevelXp = (level) => {
    return Math.floor(150 * Math.pow(level + 1, 1.8));
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Manage your career and work for coins and XP!')
    .addSubcommand(subcommand =>
        subcommand.setName('work')
            .setDescription('Work your current job to earn rewards.')
    )
    .addSubcommand(subcommand =>
        subcommand.setName('apply')
            .setDescription('Apply for a new job based on your level.')
    )
    .addSubcommand(subcommand =>
        subcommand.setName('resign')
            .setDescription('Resign from your current job.')
    ),
  cooldown: 3600, // 1 hour cooldown for the actual work action
  async execute(interaction, client) {
    const subcommand = interaction.options.getSubcommand();
    let user = await User.findOne({ userId: interaction.user.id });
    await interaction.deferReply();

    if (!user) {
      user = new User({ userId: interaction.user.id });
      await user.save();
    }
    
    const workProgression = client.config.workProgression;

    // --- SUBCOMMAND: WORK ---
    if (subcommand === 'work') {
        if (!user.currentJob) {
            return interaction.editReply({ 
                content: `⚠️ You are currently unemployed. Use \`/work apply\` to start your career!`, 
                ephemeral: true 
            });
        }
        
        const cooldown = module.exports.cooldown * 1000;
        if (user.lastWork && (Date.now() - user.lastWork.getTime()) < cooldown) {
            const timeLeft = ms(cooldown - (Date.now() - user.lastWork.getTime()), { long: true });
            return interaction.editReply({ content: `⏱️ You can work again in **${timeLeft}**.`, ephemeral: true });
        }

        const currentJob = workProgression.find(job => job.id === user.currentJob);
        if (!currentJob) {
             user.currentJob = null;
             await user.save();
             return interaction.editReply({ 
                content: `❌ Your current job ID is invalid. You have been resigned. Please \`/work apply\` again.`, 
                ephemeral: true 
            });
        }
        
        // Success check based on job's successRate
        if (Math.random() * 100 > currentJob.successRate) {
            user.lastWork = new Date();
            await user.save();
            const failEmbed = new EmbedBuilder()
                .setTitle('😔 Work Failed')
                .setDescription(`You tried to work as a **${currentJob.title}** but got distracted and earned nothing. Try again in an hour!`)
                .setColor(0xFF0000)
                .setTimestamp();
            return interaction.editReply({ embeds: [failEmbed] });
        }

        // Calculate rewards from ranges
        const coinsEarned = Math.floor(Math.random() * (currentJob.coinReward[1] - currentJob.coinReward[0] + 1)) + currentJob.coinReward[0];
        const xpEarned = Math.floor(Math.random() * (currentJob.xpReward[1] - currentJob.xpReward[0] + 1)) + currentJob.xpReward[0];

        user.coins += coinsEarned;
        user.xp += xpEarned;
        user.lastWork = new Date();

        // Level up check (existing logic)
        const settings = await Settings.findOne({ guildId: interaction.guild.id });
        const levelUpChannel = settings?.levelUpChannelId ? 
            interaction.guild.channels.cache.get(settings.levelUpChannelId) : 
            interaction.channel;

        let leveledUp = false;
        const nextLevelXpCheck = getNextLevelXp(user.level);
        if (user.xp >= nextLevelXpCheck) {
            user.level++;
            user.xp -= nextLevelXpCheck;
            leveledUp = true;
            
            const member = interaction.guild.members.cache.get(interaction.user.id);
            if (member) {
                const levelingRoles = client.config.levelingRoles;
                for (const roleConfig of levelingRoles) {
                    if (member.roles.cache.has(roleConfig.roleId)) {
                        await member.roles.remove(roleConfig.roleId).catch(() => {});
                    }
                }
                const newLevelRole = levelingRoles
                    .filter(r => r.level <= user.level)
                    .sort((a, b) => b.level - a.level)[0];
                if (newLevelRole) {
                    await member.roles.add(newLevelRole.roleId).catch(() => {});
                }
            }
            
            // Send level-up message
            if (levelUpChannel && leveledUp) {
                const levelUpEmbed = new EmbedBuilder()
                    .setTitle('🚀 Level UP!')
                    .setDescription(`${interaction.user}, congratulations! You've leveled up to **Level ${user.level}**! 🎉`)
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .setColor(0xFFD700)
                    .setTimestamp();
                
                await levelUpChannel.send({ content: `${interaction.user}`, embeds: [levelUpEmbed] });
            }
        }

        await user.save();

        const embed = new EmbedBuilder()
            .setTitle(`💼 ${currentJob.title} - Payday!`)
            .setDescription(`You successfully completed your task as a **${currentJob.title}**!`)
            .addFields(
                { name: 'Coins Earned', value: `${coinsEarned} 💰`, inline: true },
                { name: 'XP Earned', value: `${xpEarned} ✨`, inline: true },
                { name: 'Success Chance', value: `${currentJob.successRate}%`, inline: true },
                { name: 'Current Coins', value: `${user.coins} 💰`, inline: true },
                { name: 'Current Level', value: `${user.level} ✨`, inline: true }
            )
            .setColor(0x8B4513)
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

    // --- SUBCOMMAND: APPLY ---
    } else if (subcommand === 'apply') {
        const availableJobs = workProgression
            .filter(job => user.level >= job.minLevel && user.level <= job.maxLevel);
        
        const currentJob = workProgression.find(job => job.id === user.currentJob);
        
        if (availableJobs.length === 0 && !currentJob) {
            return interaction.editReply({ 
                content: `❌ You need to reach at least Level **${workProgression[0].minLevel}** to start your career.`, 
                ephemeral: true 
            });
        }
        
        if (currentJob) {
            // Find the job immediately above the user's current job's max level
            const nextTierJob = workProgression.find(job => job.minLevel === currentJob.maxLevel + 1 && user.level >= job.minLevel);
            
            let message = `**Your Current Job:** ${currentJob.title} (Level ${currentJob.minLevel}-${currentJob.maxLevel}).`;
            if (nextTierJob) {
                message += `\n\n**Promotion Available!** You are eligible for a promotion to **${nextTierJob.title}** (Requires Level ${nextTierJob.minLevel}).`;
            } else if (user.level < currentJob.maxLevel) {
                 message += `\n\nKeep working! Your next promotion requires Level **${currentJob.maxLevel + 1}**.`;
            }
             
            const promotionJob = nextTierJob ? [{ 
                label: `Apply for ${nextTierJob.title}`,
                value: nextTierJob.id,
                description: `Requires Level ${nextTierJob.minLevel}. Success: ${nextTierJob.successRate}%`,
                emoji: '⬆️'
            }] : [];

            const row = new ActionRowBuilder().addComponents(
                ...promotionJob.map(job => new ButtonBuilder()
                    .setCustomId(`job_apply_${job.value}`)
                    .setLabel(job.label)
                    .setStyle(ButtonStyle.Success)
                    .setEmoji(job.emoji))
            );
            
            return interaction.editReply({ 
                content: message, 
                components: promotionJob.length > 0 ? [row] : []
            });
        }
        
        // No current job, list options (only the lowest eligible one)
        const startingJob = availableJobs[0];

        if (startingJob) {
            const menu = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`job_apply_${startingJob.id}`)
                    .setLabel(`Apply for ${startingJob.title}`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📝')
            );
            
            await interaction.editReply({
                content: `📝 **Job Application:** You are eligible for **${startingJob.title}**. Click to apply and start your career!`,
                components: [menu]
            });
        } else {
             // Fallback for an unforeseen case where level > 0 but no job is found (shouldn't happen with the logic above)
             return interaction.editReply({ 
                content: `❌ No suitable jobs found for your current level (Level ${user.level}).`, 
                ephemeral: true 
            });
        }
        
    // --- SUBCOMMAND: RESIGN ---
    } else if (subcommand === 'resign') {
        if (!user.currentJob) {
            return interaction.editReply({ 
                content: `⚠️ You are already unemployed.`, 
                ephemeral: true 
            });
        }
        
        user.currentJob = null;
        user.lastWork = null; // Reset work cooldown
        await user.save();
        
        const resignEmbed = new EmbedBuilder()
            .setTitle('🚪 Resignation Successful')
            .setDescription('You have resigned from your previous position. You are now unemployed. Use `/work apply` to start a new career!')
            .setColor(0xFF4500)
            .setTimestamp();
            
        await interaction.editReply({ embeds: [resignEmbed] });
    }
  },
};
