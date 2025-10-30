// commands/work.js (REPLACE - Level-Based Progression, Sub-Tiers, Fixes)
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const User = require('../models/User');
const Settings = require('../models/Settings'); // Keep for level up notifications
const ms = require('ms');

// Function to calculate XP needed for the next level (Keep Moderate formula for chat leveling)
const getNextLevelXp = (level) => {
    return Math.floor(100 * Math.pow(level + 1, 1.5));
};

const WORK_COOLDOWN_MS = ms('1h');
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
            .setDescription('Apply for a new job based on your level.')
        )
    .addSubcommand(subcommand =>
        subcommand.setName('resign')
            .setDescription('Resign from your current job.')
    ),

  execute: async (interaction, client) => {
    // Defer reply at the very top
    await interaction.deferReply();

    const subcommand = interaction.options.getSubcommand();
    let user = await User.findOne({ userId: interaction.user.id });

    if (!user) {
      user = new User({ userId: interaction.user.id });
      // Save immediately if new user to prevent issues later
      try {
          await user.save();
      } catch (saveError) {
          console.error("Error saving new user for work command:", saveError);
          return interaction.editReply({ content: "❌ Error initializing your profile. Please try again." });
      }
    }

    const workProgression = client.config.workProgression.sort((a, b) => a.minLevel - b.minLevel); // Sort by level

    // --- SUBCOMMAND: JOB ---
    if (subcommand === 'job') {
        if (!user.currentJob) {
            return interaction.editReply({
                content: `⚠️ **Unemployed:** You are currently unemployed. Use \`/work apply\` to start your career!`,
                ephemeral: true
            });
        }

        // Local cooldown check
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

        // Automatic Promotion Check (Based on LEVEL now)
        const currentJobIndex = workProgression.findIndex(j => j.id === currentJob.id);
        const nextJob = workProgression[currentJobIndex + 1]; // Get the next job in the sorted list

        // Check if there IS a next job and if the user's level meets its requirement
        if (nextJob && user.level >= nextJob.minLevel) {
             user.currentJob = nextJob.id;
             await user.save();
             return interaction.editReply({
                 content: `⬆️ **AUTOMATIC PROMOTION!** Congratulations, ${interaction.user}! Your Level ${user.level} qualifies you for promotion to **${nextJob.title}**!`,
                 ephemeral: false
             });
        }

        // --- DYNAMIC SUB-PROMOTION TITLE CALCULATION (Based on level within tier) ---
        const levelWithinTier = Math.max(0, user.level - currentJob.minLevel); // Level progress into the current job tier
        const levelsInTier = (currentJob.maxLevel === Infinity ? 500 : currentJob.maxLevel - currentJob.minLevel + 1); // Total levels spanned by this job (+1 includes both ends)
        const levelsPerSubTier = Math.max(1, Math.floor(levelsInTier / 10)); // Levels needed for each sub-tier (at least 1)

        let subTier = Math.min(10, Math.floor(levelWithinTier / levelsPerSubTier) + 1); // Calculate current sub-tier (1-10)
        if (currentJob.maxLevel === Infinity && user.level >= currentJob.minLevel) subTier = 10; // Max out for Tech Legend

        const dynamicTitle = `${currentJob.title} (Sub-Tier ${subTier}/10)`;

        // Success check
        let success = Math.random() * 100 <= currentJob.successRate;
        user.lastWork = new Date(); // Update last work time

        if (!success) {
            await user.save();
            const failEmbed = new EmbedBuilder()
                .setTitle('😔 Work Failed')
                .setDescription(`You tried to work as a **${dynamicTitle}** but failed this time. Try again in an hour!`)
                .addFields(
                    { name: 'Coins', value: `0 💰`, inline: true },
                    { name: 'XP', value: `0 ✨`, inline: true },
                    { name: 'Success Chance', value: `${currentJob.successRate}%`, inline: true },
                )
                .setColor(0xFF0000)
                .setTimestamp();
            return interaction.editReply({ embeds: [failEmbed] });
        }

        // Successful Work
        // Successful works counter is no longer needed for progression
        // user.successfulWorks++; // REMOVED

        const coinsEarned = Math.floor(Math.random() * (currentJob.coinReward[1] - currentJob.coinReward[0] + 1)) + currentJob.coinReward[0];
        const xpEarned = Math.floor(Math.random() * (currentJob.xpReward[1] - currentJob.xpReward[0] + 1)) + currentJob.xpReward[0];

        user.coins += coinsEarned;
        user.xp += xpEarned;

        // Level up check (using chat leveling XP system)
        let leveledUp = false;
        let originalLevel = user.level; // Store level before potential change
        let nextLevelXpCheck = getNextLevelXp(user.level);

        // Handle multiple level ups
        while (user.xp >= nextLevelXpCheck) {
            user.level++;
            user.xp -= nextLevelXpCheck;
            leveledUp = true;
            nextLevelXpCheck = getNextLevelXp(user.level); // Recalculate for the new level
        }

        if (leveledUp) {
            // Send level-up message
            try {
                const settings = await Settings.findOne({ guildId: interaction.guild.id });
                const levelUpChannelId = settings?.levelUpChannelId;
                let notifyChannel = interaction.channel;
                 if (levelUpChannelId) {
                     const foundChannel = await interaction.guild.channels.fetch(levelUpChannelId).catch(() => null);
                     if (foundChannel) notifyChannel = foundChannel;
                 }
                const levelUpEmbed = new EmbedBuilder()
                    .setTitle('🚀 Level UP!')
                    .setDescription(`${interaction.user}, congratulations! You've leveled up to **Level ${user.level}**! 🎉`)
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .setColor(0xFFD700)
                    .setTimestamp();

                await notifyChannel.send({ content: `${interaction.user}`, embeds: [levelUpEmbed] });

                // Update leveling roles (ensure member is fetched)
                 const member = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
                 if (member) {
                     const levelingRoles = client.config.levelingRoles || [];
                     // Logic to remove old roles and add the new highest eligible role
                     const targetLevelRole = levelingRoles
                         .filter(r => r.level <= user.level)
                         .sort((a, b) => b.level - a.level)[0];
                     const targetLevelRoleId = targetLevelRole ? targetLevelRole.roleId : null;

                     for (const roleConfig of levelingRoles) {
                         const roleId = roleConfig.roleId;
                         const hasRole = member.roles.cache.has(roleId);
                         if (roleId === targetLevelRoleId) {
                             if (!hasRole) await member.roles.add(roleId).catch(console.error);
                         } else {
                             if (hasRole) await member.roles.remove(roleId).catch(console.error);
                         }
                     }
                 }

            } catch (levelError) {
                 console.error("Error during level up notification/role assignment:", levelError);
            }
        }
        // --- End Level Up Check ---

        await user.save();

        // Recalculate dynamic title for the final embed *after* potential level up
        const levelWithinTierAfter = Math.max(0, user.level - currentJob.minLevel);
        let subTierAfter = Math.min(10, Math.floor(levelWithinTierAfter / levelsPerSubTier) + 1);
        if (currentJob.maxLevel === Infinity && user.level >= currentJob.minLevel) subTierAfter = 10;
        const finalDynamicTitle = `${currentJob.title} (Sub-Tier ${subTierAfter}/10)`;


        const embed = new EmbedBuilder()
            .setTitle(`💼 ${finalDynamicTitle} - Payday!`)
            .setDescription(`You successfully completed your task as a **${finalDynamicTitle}** and earned rewards!`)
            .addFields(
                { name: 'Coins Earned', value: `${coinsEarned} 💰`, inline: true },
                { name: 'XP Earned', value: `${xpEarned} ✨`, inline: true },
                { name: 'Current Balance', value: `${user.coins} 💰`, inline: true },
                { name: 'Current Level', value: `${user.level} ✨`, inline: true }, // Show current chat level
                { name: 'XP Progress', value: `\`${user.xp}/${getNextLevelXp(user.level)}\``, inline: true } // Show XP progress
            )
            .setColor(0x8B4513) // Brown
            .setTimestamp()
            .setFooter({ text: `Next work attempt in 1 hour.` });

        if (leveledUp && user.level >= (nextJob?.minLevel || Infinity)) {
            embed.addFields({ name: '⬆️ Promotion Available!', value: `You now qualify for **${nextJob.title}**! Use \`/work apply\` to see.`});
        }


        await interaction.editReply({ embeds: [embed] });

    // --- SUBCOMMAND: APPLY ---
    } else if (subcommand === 'apply') {
        const currentJob = workProgression.find(job => job.id === user.currentJob);
        const currentJobIndex = currentJob ? workProgression.findIndex(j => j.id === currentJob.id) : -1;

        const applyEmbed = new EmbedBuilder()
            .setTitle('📝 Job Market')
            .setDescription(`You are currently **${currentJob ? currentJob.title : 'Unemployed'}** (Level **${user.level}**).`)
            .setColor(0x3498DB); // Blue

        let jobListValue = '';
        const jobButtons = [];
        let row = new ActionRowBuilder();

        workProgression.forEach((job, index) => {
            const meetsLevel = user.level >= job.minLevel;
            const isCurrent = currentJob && job.id === currentJob.id;

            // Eligible to apply if:
            // 1. Unemployed AND it's the first job (Intern)
            // 2. Currently employed AND it's the *next* job in sequence AND meets level requirement
            const isEligibleToApply = (!currentJob && index === 0) || (currentJob && index === currentJobIndex + 1 && meetsLevel);

            let status = '';
            let emoji = '💼';

            if (isCurrent) {
                status = `**[CURRENT JOB]**`;
                emoji = '✅';
            } else if (isEligibleToApply) {
                status = `**[ELIGIBLE - APPLY NOW]**`;
                emoji = '⬆️';
            } else if (meetsLevel && currentJob && job.minLevel > currentJob.minLevel) {
                status = `[AVAILABLE - Apply for previous jobs first]`; // Eligible level-wise, but not next sequence
                emoji = '✔️';
            } else if (!meetsLevel) {
                 status = `[LOCKED - Requires Level ${job.minLevel}]`;
                 emoji = '🔒';
            } else {
                 status = `[COMPLETED]`; // User has passed this job's level range
                 emoji = '☑️';
            }

            jobListValue += `\n${emoji} **${job.title}** ${status}\n\`-\` Req: Level **${job.minLevel}**${job.maxLevel !== Infinity ? ` - ${job.maxLevel}` : '+'}`;

            if (isEligibleToApply) {
                 const button = new ButtonBuilder()
                    .setCustomId(`job_apply_${job.id}`)
                    .setLabel(`Apply: ${job.title}`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⬆️'); // Use promotion emoji

                if (row.components.length < 5) {
                    row.addComponents(button);
                }
            }
        });

         // Add the last row if it has components
        if (row.components.length > 0) {
            jobButtons.push(row);
        }

        applyEmbed.addFields({ name: 'Career Progression', value: jobListValue.substring(0, 1024), inline: false });

        await interaction.editReply({
            embeds: [applyEmbed],
            components: jobButtons.length > 0 ? jobButtons : [], // Only show buttons if there's an eligible job
        });

    // --- SUBCOMMAND: RESIGN ---
    } else if (subcommand === 'resign') {
         if (user.lastResigned && (Date.now() - user.lastResigned.getTime()) < RESIGN_COOLDOWN_MS) {
            const timeLeft = ms(RESIGN_COOLDOWN_MS - (Date.now() - user.lastResigned.getTime()), { long: true });
            return interaction.editReply({
                content: `⏱️ **Resignation Cooldown:** You recently resigned. You can apply for a new job in **${timeLeft}**.`,
                ephemeral: true
            });
        }

        if (!user.currentJob) {
            return interaction.editReply({
                content: `⚠️ You are already unemployed.`,
                ephemeral: true
            });
        }

        const resignedJobTitle = workProgression.find(j => j.id === user.currentJob)?.title || 'your previous job';

        user.currentJob = null;
        user.lastWork = null; // Reset work cooldown
        user.lastResigned = new Date(); // Set resignation cooldown
        await user.save();

        const resignEmbed = new EmbedBuilder()
            .setTitle('🚪 Resignation Submitted')
            .setDescription(`You have resigned from **${resignedJobTitle}**. Use \`/work apply\` after the cooldown to view open positions.`)
            .addFields(
                { name: 'Next Application Available', value: `<t:${Math.floor((Date.now() + RESIGN_COOLDOWN_MS) / 1000)}:R>`, inline: true },
                { name: 'Current Status', value: 'Unemployed', inline: true }
            )
            .setColor(0xFF4500) // OrangeRed
            .setTimestamp();

        await interaction.editReply({ embeds: [resignEmbed] });
    }
  },
};
