// commands/work.js (REPLACE - Job Progression: work, apply, resign subcommands + Cooldowns + GUI)
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
            .setDescription('Apply for a new job based on your progress.')
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
    
    const workProgression = client.config.workProgression.sort((a, b) => a.minWorks - b.minWorks); // Sort by works required

    // --- SUBCOMMAND: WORK ---
    if (subcommand === 'work') {
        if (!user.currentJob) {
            return interaction.editReply({ 
                content: `⚠️ **Unemployed:** You are currently unemployed. Use \`/work apply\` to start your career!`, 
                ephemeral: true 
            });
        }
        
        const cooldown = module.exports.cooldown * 1000;
        if (user.lastWork && (Date.now() - user.lastWork.getTime()) < cooldown) {
            const timeLeft = ms(cooldown - (Date.now() - user.lastWork.getTime()), { long: true });
            return interaction.editReply({ content: `⏱️ **Work Cooldown:** You can work again in **${timeLeft}**.`, ephemeral: true });
        }

        const currentJob = workProgression.find(job => job.id === user.currentJob);
        if (!currentJob) {
             user.currentJob = null;
             await user.save();
             return interaction.editReply({ 
                content: `❌ **Job Invalid:** Your current job ID is invalid. You have been resigned. Please \`/work apply\` again.`, 
                ephemeral: true 
            });
        }
        
        // Check for promotion before proceeding with work (Automatic Promotion)
        const nextJob = workProgression.find(job => 
             job.minWorks > currentJob.minWorks && user.successfulWorks >= job.minWorks && user.level >= job.minLevel
        );

        if (nextJob) {
             user.currentJob = nextJob.id;
             await user.save();
             return interaction.editReply({
                 content: `⬆️ **AUTOMATIC PROMOTION!** Congratulations, ${interaction.user}! You have earned a promotion to **${nextJob.title}** after **${user.successfulWorks}** successful works!`,
                 ephemeral: false
             });
        }

        // Success check based on job's successRate
        let success = Math.random() * 100 <= currentJob.successRate;
        user.lastWork = new Date(); // Update last work regardless of success

        if (!success) {
            await user.save();
            const failEmbed = new EmbedBuilder()
                .setTitle('😔 Work Failed')
                .setDescription(`You tried to work as a **${currentJob.title}** but got distracted and earned nothing. Try again in an hour!`)
                .addFields(
                    { name: 'Coins', value: `0 💰`, inline: true },
                    { name: 'XP', value: `0 ✨`, inline: true },
                    { name: 'Success Chance', value: `${currentJob.successRate}%`, inline: true },
                )
                .setColor(0xFF0000)
                .setTimestamp();
            return interaction.editReply({ embeds: [failEmbed] });
        }
        
        // Successful Work Logic
        user.successfulWorks++;

        // Calculate rewards from ranges
        const coinsEarned = Math.floor(Math.random() * (currentJob.coinReward[1] - currentJob.coinReward[0] + 1)) + currentJob.coinReward[0];
        const xpEarned = Math.floor(Math.random() * (currentJob.xpReward[1] - currentJob.xpReward[0] + 1)) + currentJob.xpReward[0];

        user.coins += coinsEarned;
        user.xp += xpEarned;
        
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
            .setDescription(`You successfully completed your task as a **${currentJob.title}** and earned rewards!`)
            .addFields(
                { name: 'Coins Earned', value: `${coinsEarned} 💰`, inline: true },
                { name: 'XP Earned', value: `${xpEarned} ✨`, inline: true },
                { name: 'Successful Works', value: `${user.successfulWorks} Jobs Completed`, inline: true },
                { name: 'Current Balance', value: `${user.coins} 💰`, inline: true },
                { name: 'Current Level', value: `${user.level} ✨`, inline: true }
            )
            .setColor(0x8B4513)
            .setTimestamp()
            .setFooter({ text: `Next work attempt in 1 hour.` });

        await interaction.editReply({ embeds: [embed] });

    // --- SUBCOMMAND: APPLY ---
    } else if (subcommand === 'apply') {
        const currentJob = workProgression.find(job => job.id === user.currentJob);
        
        const eligibleJob = workProgression.find(job => 
            (currentJob ? job.minWorks > currentJob.minWorks : job.minWorks === 0) && user.level >= job.minLevel
        );

        if (currentJob && !eligibleJob) {
            return interaction.editReply({ 
                content: `⚠️ **Current Job: ${currentJob.title}**\n\n**Next Promotion:** You are not yet eligible for a promotion. You need **Level ${currentJob.minLevel}** and **${workProgression.find(job => job.minWorks > currentJob.minWorks)?.minWorks || '???'}** successful works.`,
                ephemeral: true 
            });
        }
        
        if (!currentJob && !eligibleJob) {
             return interaction.editReply({ 
                content: `❌ You need to reach at least Level **${workProgression[0].minLevel}** to start your career.`, 
                ephemeral: true 
            });
        }

        const jobToApply = currentJob ? eligibleJob : workProgression.find(job => job.minWorks === 0 && user.level >= job.minLevel);

        if (jobToApply) {
            const isPromotion = currentJob && currentJob.id !== jobToApply.id;
            const actionText = isPromotion ? 'Promotion' : 'Job Application';
            const actionEmoji = isPromotion ? '⬆️' : '📝';

            const menu = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`job_apply_${jobToApply.id}`)
                    .setLabel(`Apply for ${jobToApply.title}`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji(actionEmoji)
            );
            
            await interaction.editReply({
                content: `${actionEmoji} **${actionText}:** You are eligible for **${jobToApply.title}**. Click to apply!`,
                components: [menu]
            });
        } else {
             return interaction.editReply({ 
                content: `❌ No suitable jobs found for your current level (Level ${user.level}).`, 
                ephemeral: true 
            });
        }
        
    // --- SUBCOMMAND: RESIGN ---
    } else if (subcommand === 'resign') {
        const resignCooldown = ms('1h');
        if (user.lastResigned && (Date.now() - user.lastResigned.getTime()) < resignCooldown) {
            const timeLeft = ms(resignCooldown - (Date.now() - user.lastResigned.getTime()), { long: true });
            return interaction.editReply({ 
                content: `⏱️ **Resignation Cooldown:** You must wait **${timeLeft}** before applying for a new job.`, 
                ephemeral: true 
            });
        }

        if (!user.currentJob) {
            return interaction.editReply({ 
                content: `⚠️ You are already unemployed.`, 
                ephemeral: true 
            });
        }
        
        user.currentJob = null;
        user.lastWork = null; // Reset work cooldown
        user.lastResigned = new Date(); // Set resignation cooldown
        await user.save();
        
        const resignEmbed = new EmbedBuilder()
            .setTitle('🚪 Resignation Successful')
            .setDescription('You have resigned from your previous position. Use `/work apply` to start a new career in 1 hour.')
            .addFields(
                { name: 'Cooldown', value: '1 hour before re-applying.', inline: true },
                { name: 'Current Status', value: 'Unemployed', inline: true }
            )
            .setColor(0xFF4500)
            .setTimestamp();
            
        await interaction.editReply({ embeds: [resignEmbed] });
    }
  },
};
