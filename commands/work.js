// commands/work.js (REPLACE - Final fix for Job Application display/logic)
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');
const Settings = require('../models/Settings');
const ms = require('ms');

// Function to calculate XP needed for the next level (Harder formula) - KEPT FOR CHAT LEVELING
const getNextLevelXp = (level) => {
    return Math.floor(150 * Math.pow(level + 1, 1.8));
};

const WORK_COOLDOWN_MS = ms('1h');
const RESIGN_COOLDOWN_MS = ms('1h'); // Defined for clarity

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Manage your career and work for coins and XP!')
    .addSubcommand(subcommand => // RENAMED: was 'work work' -> now 'work job'
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
  // Removed global cooldown: 3600, 
  execute: async (interaction, client) => { // Fixed syntax
    const subcommand = interaction.options.getSubcommand();
    let user = await User.findOne({ userId: interaction.user.id });
    await interaction.deferReply();

    if (!user) {
      user = new User({ userId: interaction.user.id });
      await user.save();
    }
    
    // NOTE: Job progression relies only on minWorks, minLevel removed.
    const workProgression = client.config.workProgression.sort((a, b) => a.minWorks - b.minWorks); // Sort by works required

    // --- SUBCOMMAND: JOB (formerly 'work') ---
    if (subcommand === 'job') {
        if (!user.currentJob) {
            return interaction.editReply({ 
                content: `⚠️ **Unemployed:** You are currently unemployed. Use \`/work apply\` to start your career!`, 
                ephemeral: true 
            });
        }
        
        // Cooldown check is now localized to the 'job' subcommand
        if (user.lastWork && (Date.now() - user.lastWork.getTime()) < WORK_COOLDOWN_MS) {
            const timeLeft = ms(WORK_COOLDOWN_MS - (Date.now() - user.lastWork.getTime()), { long: true });
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
        
        // Check for major promotion before proceeding with work (Automatic Promotion)
        // CRITICAL FIX: Removed dependency on user.level for job progression.
        const nextJob = workProgression.find(job => 
             job.minWorks > currentJob.minWorks && user.successfulWorks >= job.minWorks
        );

        if (nextJob) {
             user.currentJob = nextJob.id;
             await user.save();
             return interaction.editReply({
                 content: `⬆️ **AUTOMATIC MAJOR PROMOTION!** Congratulations, ${interaction.user}! You have earned a promotion to **${nextJob.title}** after **${user.successfulWorks}** successful works!`,
                 ephemeral: false
             });
        }
        
        // --- DYNAMIC SUB-PROMOTION TITLE CALCULATION (10 internal promotions) ---
        const worksInCurrentMajor = user.successfulWorks - currentJob.minWorks;
        const totalWorksInMajor = currentJob.worksToNextMajor; // Comes from index.js
        
        let subTier = 10; // Max tier for the job
        
        if (totalWorksInMajor !== Infinity) {
            // Calculate works needed for each of the 10 sub-tiers (10 promotions + starting tier 1)
            const worksPerSubTier = Math.floor(totalWorksInMajor / 10) || 1;
            
            // Tier 1 is 0 to (worksPerSubTier-1). Tier 10 is max.
            subTier = Math.min(10, Math.floor(worksInCurrentMajor / worksPerSubTier) + 1);
        }
        
        const dynamicTitle = `${currentJob.title} (Sub-Tier ${subTier}/10)`;


        // Success check based on job's successRate
        let success = Math.random() * 100 <= currentJob.successRate;
        user.lastWork = new Date(); // Update last work regardless of success

        if (!success) {
            await user.save();
            const failEmbed = new EmbedBuilder()
                .setTitle('😔 Work Failed')
                .setDescription(`You tried to work as a **${dynamicTitle}** but got distracted and earned nothing. Try again in an hour!`)
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
        // NOTE: These values are read from the updated client.config.workProgression in index.js
        const coinsEarned = Math.floor(Math.random() * (currentJob.coinReward[1] - currentJob.coinReward[0] + 1)) + currentJob.coinReward[0];
        const xpEarned = Math.floor(Math.random() * (currentJob.xpReward[1] - currentJob.xpReward[0] + 1)) + currentJob.xpReward[0];

        user.coins += coinsEarned;
        user.xp += xpEarned;
        
        // Level up check (existing chat leveling logic, preserved)
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
            
            // ... (rest of role/message logic for chat leveling is unchanged) ...
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
        
        // Recalculate dynamic title for the final embed after successful work and potential internal promotion
        const worksInCurrentMajorAfter = user.successfulWorks - currentJob.minWorks;
        let subTierAfter = 10;
        if (totalWorksInMajor !== Infinity) {
            const worksPerSubTier = Math.floor(totalWorksInMajor / 10) || 1;
            subTierAfter = Math.min(10, Math.floor(worksInCurrentMajorAfter / worksPerSubTier) + 1);
        }
        const finalDynamicTitle = `${currentJob.title} (Sub-Tier ${subTierAfter}/10)`;

        const embed = new EmbedBuilder()
            .setTitle(`💼 ${finalDynamicTitle} - Payday!`)
            .setDescription(`You successfully completed your task as a **${finalDynamicTitle}** and earned rewards!`)
            .addFields(
                { name: 'Coins Earned', value: `${coinsEarned} 💰`, inline: true },
                { name: 'XP Earned', value: `${xpEarned} ✨`, inline: true },
                { name: 'Successful Works', value: `${user.successfulWorks} Jobs Completed`, inline: true },
                { name: 'Current Balance', value: `${user.coins} 💰`, inline: true },
                { name: 'Current Level', value: `${user.level} ✨`, inline: true } // Still display chat level
            )
            .setColor(0x8B4513)
            .setTimestamp()
            .setFooter({ text: `Next work attempt in 1 hour.` });

        await interaction.editReply({ embeds: [embed] });

    // --- SUBCOMMAND: APPLY ---
    } else if (subcommand === 'apply') {
        const currentJob = workProgression.find(job => job.id === user.currentJob);
        
        // Build Job List UI
        const applyEmbed = new EmbedBuilder()
            // CRITICAL FIX: Removed chat level display from job market.
            .setTitle('📝 Job Market')
            .setDescription(`You are currently **${currentJob ? currentJob.title : 'Unemployed'}** (**${user.successfulWorks}** Works Completed).`)
            .setColor(0x3498DB);
            
        const jobButtons = [];
        let jobListValue = '';
        let row = new ActionRowBuilder();

        workProgression.forEach((job, index) => {
            // CRITICAL FIX: Removed minLevel check.
            const meetsWorks = user.successfulWorks >= job.minWorks;
            const isCurrent = currentJob && job.id === currentJob.id;
            
            // FIX/Refinement: The goal is only to show the immediate next job OR the starting job if unemployed.
            const isNextJob = currentJob 
                ? (index === workProgression.findIndex(j => j.id === currentJob.id) + 1) // Is the direct next job in the list
                : index === 0; // Is the very first job (Intern/Level 0)
                
            // The job is eligible to apply for if:
            // 1. It is the starting job (Index 0) AND the user is unemployed, OR
            // 2. It is the next sequential job AND the user meets the work requirement.
            const isEligibleToApply = (!currentJob && index === 0) || (currentJob && isNextJob && meetsWorks);

            let status = '';
            let emoji = '💼';

            if (isCurrent) {
                status = `**[CURRENT JOB]**`;
                emoji = '✅';
            } else if (isEligibleToApply) {
                status = `**[ELIGIBLE - APPLY NOW]**`;
                emoji = '⬆️';
            } else if (meetsWorks && currentJob && job.minWorks > currentJob.minWorks) {
                // User is eligible for this job but it's NOT the next sequential one (e.g., they skipped one).
                // Or user is eligible for the direct next one, but it's not the correct logic path above.
                // Revert to [INELIGIBLE] for display purposes, they can only apply for the direct next job.
                status = `[INELIGIBLE]`;
                emoji = '❌';
            } else if (job.minWorks > user.successfulWorks) {
                 status = `[INELIGIBLE - Need ${job.minWorks} Works]`;
                 emoji = '❌';
            } else {
                 status = `[INELIGIBLE]`;
                 emoji = '❌';
            }
            
            // CRITICAL FIX: Removed minLevel display.
            jobListValue += `\n${emoji} **${job.title}** ${status}\n\`-\` Req: **${job.minWorks}** Works`;

            if (isEligibleToApply) {
                 const button = new ButtonBuilder()
                    .setCustomId(`job_apply_${job.id}`)
                    .setLabel(`Apply: ${job.title}`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji(emoji);
                
                // Only add the button if the job is an *immediate* promotion or starting job
                if (row.components.length < 5) {
                    row.addComponents(button);
                }
            }
            
            // Max 5 buttons per row
            if (row.components.length === 5 || index === workProgression.length - 1) {
                if (row.components.length > 0) {
                    jobButtons.push(row);
                }
                row = new ActionRowBuilder();
            }
        });
        
        // Add the last row if it has components
        if (row.components.length > 0) {
            jobButtons.push(row);
        }

        applyEmbed.addFields({ name: 'Career Progression', value: jobListValue.substring(0, 1024), inline: false });


        await interaction.editReply({
            embeds: [applyEmbed],
            components: jobButtons.length > 0 ? jobButtons : [],
        });
        
    // --- SUBCOMMAND: RESIGN ---
    } else if (subcommand === 'resign') {
        const RESIGN_COOLDOWN_MS = ms('1h');
        if (user.lastResigned && (Date.now() - user.lastResigned.getTime()) < RESIGN_COOLDOWN_MS) {
            const timeLeft = ms(RESIGN_COOLDOWN_MS - (Date.now() - user.lastResigned.getTime()), { long: true });
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
        user.lastWork = null; // Reset work cooldown (FIX)
        user.lastResigned = new Date(); // Set resignation cooldown
        await user.save();
        
        const resignEmbed = new EmbedBuilder()
            .setTitle('🚪 Resignation Successful')
            .setDescription('You have resigned from your previous position. Use `/work apply` to view open positions.')
            .addFields(
                { name: 'Next Application', value: `<t:${Math.floor((Date.now() + RESIGN_COOLDOWN_MS) / 1000)}:R>`, inline: true },
                { name: 'Current Status', value: 'Unemployed', inline: true }
            )
            .setColor(0xFF4500)
            .setTimestamp();
            
        await interaction.editReply({ embeds: [resignEmbed] });
    }
  },
};
