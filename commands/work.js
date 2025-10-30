// commands/work.js (REWORK - Progression based on Works Done, 30min Cooldown, Failure Rate)
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');
const Settings = require('../models/Settings');
const ms = require('ms');
const { getNextLevelXp } = require('../utils/levelUtils'); // Import for chat leveling

// --- REWORK: 30 Minute Cooldown ---
const WORK_COOLDOWN_MS = ms('30m');
const RESIGN_COOLDOWN_MS = ms('1h');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Manage your career and work for coins and XP!')
    .addSubcommand(subcommand => 
        subcommand.setName('job') 
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
  execute: async (interaction, client) => { 
    await interaction.deferReply();
    
    const subcommand = interaction.options.getSubcommand();
    
    let user = await User.findOne({ userId: interaction.user.id });

    if (!user) {
      user = new User({ userId: interaction.user.id });
      await user.save();
    }
    
    // --- REWORK: Progression based on minWorks ---
    const workProgression = client.config.workProgression.sort((a, b) => a.minWorks - b.minWorks); // Sort by works required

    // --- SUBCOMMAND: JOB ---
    if (subcommand === 'job') {
        if (!user.currentJob) {
            return interaction.editReply({ 
                content: `⚠️ **Unemployed:** You are currently unemployed. Use \`/work apply\` to start your career!`, 
                ephemeral: true 
            });
        }
        
        // Cooldown check (30 minutes)
        if (user.lastWork && (Date.now() - user.lastWork.getTime()) < WORK_COOLDOWN_MS) {
            const timeLeft = ms(WORK_COOLDOWN_MS - (Date.now() - user.lastWork.getTime()), { long: true });
            return interaction.editReply({ content: `⏱️ **Work Cooldown:** You can work again in **${timeLeft}**.`, ephemeral: true });
        }

        const currentJob = workProgression.find(job => job.id === user.currentJob);
        if (!currentJob) {
             user.currentJob = null;
             await user.save();
             return interaction.editReply({ 
                content: `❌ **Job Invalid:** Your current job ID is invalid (it may have been removed). You have been resigned. Please \`/work apply\` again.`, 
                ephemeral: true 
            });
        }
        
        // --- REWORK: Automatic Promotion Check based on Works Done ---
        // Find the *highest* job the user qualifies for
        const highestPossibleJob = workProgression
            .filter(job => user.successfulWorks >= job.minWorks)
            .pop(); // .pop() gets the last (highest-level) one

        if (highestPossibleJob && highestPossibleJob.id !== currentJob.id) {
             user.currentJob = highestPossibleJob.id;
             await user.save();
             return interaction.editReply({
                 content: `⬆️ **AUTOMATIC MAJOR PROMOTION!** Congratulations, ${interaction.user}! Your **${user.successfulWorks}** successful works have earned you a promotion to **${highestPossibleJob.title}**!`,
                 ephemeral: false
             });
        }
        
        // --- REWORK: DYNAMIC SUB-PROMOTION TITLE CALCULATION (Based on Works Done) ---
        // Example: Intern (0-9 works). Tier 1 is 0 works. Tier 10 is 9 works.
        const worksInCurrentMajor = user.successfulWorks - currentJob.minWorks;
        
        let subTier = 1;
        let maxSubTier = 1;

        if (currentJob.maxWorks !== Infinity) {
            // maxWorks 9, minWorks 0 -> 10 tiers (0,1,2,3,4,5,6,7,8,9)
            // maxWorks 19, minWorks 10 -> 10 tiers (10..19)
            maxSubTier = currentJob.maxWorks - currentJob.minWorks + 1;
            // user.works 0, minWorks 0 -> tier 1
            // user.works 9, minWorks 0 -> tier 10
            subTier = worksInCurrentMajor + 1;
        } else {
            // For Tech Legend (Infinity)
            subTier = worksInCurrentMajor + 1;
            maxSubTier = "∞";
        }
        
        const dynamicTitle = `${currentJob.title} (Tier ${subTier}/${maxSubTier})`;


        // --- REWORK: Success check based on job's successRate ---
        let success = Math.random() * 100 <= currentJob.successRate;
        user.lastWork = new Date(); // Update last work regardless of success

        if (!success) {
            await user.save();
            const failEmbed = new EmbedBuilder()
                .setTitle('😔 Work Failed')
                .setDescription(`You tried to work as a **${dynamicTitle}** but got distracted and earned nothing. Try again in 30 minutes!`)
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
        user.successfulWorks++; // Increment successful works

        // Calculate rewards from ranges
        const coinsEarned = Math.floor(Math.random() * (currentJob.coinReward[1] - currentJob.coinReward[0] + 1)) + currentJob.coinReward[0];
        const xpEarned = Math.floor(Math.random() * (currentJob.xpReward[1] - currentJob.xpReward[0] + 1)) + currentJob.xpReward[0];

        user.coins += coinsEarned;
        user.xp += xpEarned;
        // NO cookies: user.cookies += ...
        
        // Level up check (for CHAT leveling, independent of work)
        const settings = await require('../models/Settings').findOne({ guildId: interaction.guild.id });
        const levelUpChannel = settings?.levelUpChannelId ? 
            interaction.guild.channels.cache.get(settings.levelUpChannelId) : 
            interaction.channel;

        let leveledUp = false;
        let nextLevelXpCheck = getNextLevelXp(user.level);
        
        while (user.xp >= nextLevelXpCheck) {
            user.level++;
            user.xp -= nextLevelXpCheck;
            leveledUp = true;
            nextLevelXpCheck = getNextLevelXp(user.level);
        }
            
        if (leveledUp) {
            // (Level up role assignment logic - uses client.config.levelingRoles)
            const member = interaction.guild.members.cache.get(interaction.user.id);
            if (member) {
                const levelingRoles = client.config.levelingRoles;
                const targetLevelRole = levelingRoles
                    .filter(r => r.level <= user.level)
                    .sort((a, b) => b.level - a.level)[0];
                const targetLevelRoleId = targetLevelRole ? targetLevelRole.roleId : null;
                for (const roleConfig of levelingRoles) {
                  const roleId = roleConfig.roleId;
                  const hasRole = member.roles.cache.has(roleId);
                  if (roleId === targetLevelRoleId) {
                      if (!hasRole) await member.roles.add(roleId).catch(() => {});
                  } else {
                      if (hasRole) await member.roles.remove(roleId).catch(() => {});
                  }
                }
            }
            if (levelUpChannel) {
                const levelUpEmbed = new EmbedBuilder()
                    .setTitle('🚀 Level UP!')
                    .setDescription(`${interaction.user}, congratulations! You've leveled up to **Level ${user.level}**! 🎉`)
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .setColor(0xFFD700)
                    .setTimestamp();
                await levelUpChannel.send({ content: `${interaction.user}`, embeds: [levelUpEmbed] }).catch(console.error);
            }
        }
        
        await user.save();
        
        // --- REWORK: Recalculate dynamic title for the final embed ---
        // This handles the case where the work was successful, incrementing the count
        const newWorksInMajor = user.successfulWorks - currentJob.minWorks;
        let newSubTier = 1;
        
        if (currentJob.maxWorks !== Infinity) {
             maxSubTier = currentJob.maxWorks - currentJob.minWorks + 1;
             newSubTier = Math.min(maxSubTier, newWorksInMajor + 1); // +1 because 0 works is Tier 1
        } else {
             newSubTier = newWorksInMajor + 1;
             maxSubTier = "∞";
        }
        const finalDynamicTitle = `${currentJob.title} (Tier ${newSubTier}/${maxSubTier})`;

        const embed = new EmbedBuilder()
            .setTitle(`💼 ${finalDynamicTitle} - Payday!`)
            .setDescription(`You successfully completed your task as a **${finalDynamicTitle}** and earned rewards!`)
            .addFields(
                { name: 'Coins Earned', value: `${coinsEarned} 💰`, inline: true },
                { name: 'XP Earned', value: `${xpEarned} ✨`, inline: true },
                { name: 'Successful Works', value: `${user.successfulWorks} Jobs Completed`, inline: true },
                { name: 'Current Balance', value: `${user.coins} 💰`, inline: true },
                { name: 'Current Chat Level', value: `${user.level} ✨`, inline: true }
            )
            .setColor(0x8B4513)
            .setTimestamp()
            .setFooter({ text: `Next work attempt in 30 minutes.` });

        await interaction.editReply({ embeds: [embed] });

    // --- SUBCOMMAND: APPLY ---
    } else if (subcommand === 'apply') {
        const currentJob = workProgression.find(job => job.id === user.currentJob);
        
        const applyEmbed = new EmbedBuilder()
            // REWORK: Show works
            .setTitle('📝 Job Market')
            .setDescription(`You are currently **${currentJob ? currentJob.title : 'Unemployed'}** (**${user.successfulWorks}** Works Completed).`)
            .setColor(0x3498DB);
            
        const jobButtons = [];
        let jobListValue = '';
        let row = new ActionRowBuilder();

        workProgression.forEach((job, index) => {
            // --- REWORK: Check based on works ---
            const meetsWorks = user.successfulWorks >= job.minWorks;
            const isCurrent = currentJob && job.id === currentJob.id;
            
            // The job is eligible to apply for if:
            // 1. It is the starting job (Index 0) AND the user is unemployed, OR
            // 2. It is NOT the current job AND the user meets the work requirement.
            const isEligibleToApply = (!isCurrent) && meetsWorks;
            // --- END REWORK ---

            let status = '';
            let emoji = '💼';

            if (isCurrent) {
                status = `**[CURRENT JOB]**`;
                emoji = '✅';
            } else if (isEligibleToApply) {
                status = `**[ELIGIBLE - APPLY NOW]**`;
                emoji = '⬆️';
            } else if (job.minWorks > user.successfulWorks) {
                 status = `[LOCKED - Need ${job.minWorks} Works]`;
                 emoji = '🔒';
            } else {
                 status = `[ELIGIBLE]`; // Should not happen if logic is right
                 emoji = '⬆️';
            }
            
            // REWORK: Show work requirement
            jobListValue += `\n${emoji} **${job.title}** ${status}\n\`-\` Req: **${job.minWorks}** Works${job.maxWorks !== Infinity ? ` (Tier 1-${job.maxWorks - job.minWorks + 1})` : ''}`;

            if (isEligibleToApply) {
                 const button = new ButtonBuilder()
                    .setCustomId(`job_apply_${job.id}`)
                    .setLabel(`Apply: ${job.title}`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji(emoji);
                
                if (row.components.length < 5) {
                    row.addComponents(button);
                }
            }
            
            if (row.components.length === 5 && jobButtons.length < 4) {
                if (row.components.length > 0) {
                    jobButtons.push(row);
                }
                row = new ActionRowBuilder();
            }
        });
        
        if (row.components.length > 0 && jobButtons.length < 5) {
            jobButtons.push(row);
        }

        applyEmbed.addFields({ name: 'Career Progression', value: jobListValue.substring(0, 1024), inline: false });

        await interaction.editReply({
            embeds: [applyEmbed],
            components: jobButtons.length > 0 ? jobButtons : [],
        });
        
    // --- SUBCOMMAND: RESIGN ---
    } else if (subcommand === 'resign') {
        if (user.lastResigned && (Date.now() - user.lastResigned.getTime()) < RESIGN_COOLDOWN_MS) {
            const timeLeft = ms(RESIGN_COOLDOWN_MS - (Date.now() - user.lastResigned.getTime()), { long: true });
            return interaction.editReply({ 
                content: `⏱️ **Resignation Cooldown:** You must wait **${timeLeft}** before resigning again.`, 
                ephemeral: true 
            });
        }

        if (!user.currentJob) {
            return interaction.editReply({ 
                content: `⚠️ You are already unemployed.`, 
                ephemeral: true 
            });
        }
        
        const oldJobTitle = workProgression.find(j => j.id === user.currentJob)?.title || 'your old job';
        
        user.currentJob = null;
        user.lastWork = null; // Reset work cooldown
        user.lastResigned = new Date(); // Set resignation cooldown
        await user.save();
        
        const resignEmbed = new EmbedBuilder()
            .setTitle('🚪 Resignation Successful')
            .setDescription(`You have resigned from your position as **${oldJobTitle}**. Use \`/work apply\` to view open positions.`)
            .addFields(
                { name: 'Next Resignation', value: `<t:${Math.floor((Date.now() + RESIGN_COOLDOWN_MS) / 1000)}:R>`, inline: true },
                { name: 'Current Status', value: 'Unemployed', inline: true }
            )
            .setColor(0xFF4500)
            .setTimestamp();
            
        await interaction.editReply({ embeds: [resignEmbed] });
    }
  },
};
