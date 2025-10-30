// events/messageReactionAdd.js (REPLACE - Fixed emoji identifier)
const Settings = require('../models/Settings');
const emojiList = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

module.exports = {
  name: 'messageReactionAdd',
  execute: async (reaction, user, client) => {
    if (user.bot) return;
    if (!reaction.message.guild) return;
    
    // Fetch reaction data if it's partial
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Something went wrong when fetching the message reaction:', error);
            return;
        }
    }

    // --- 1. Reaction Role Logic ---
    const settings = await Settings.findOne({ guildId: reaction.message.guild.id });
    
    if (settings) {
        // --- FIX: Use reaction.emoji.toString() to match custom emojis ---
        const rr = settings.reactionRoles.find(r =>
            r.messageId === reaction.message.id &&
            r.emoji === reaction.emoji.toString() // Use .toString() to get <a:name:id> or <:name:id> or a unicode emoji
        );
        // --- END FIX ---

        if (rr) {
            const member = await reaction.message.guild.members.fetch(user.id);
            if (member) {
                try {
                    // This handles the user's request: if they have the role, remove it and re-add it
                    // to ensure the bot can remove it later if they unreact.
                    // (Though simply adding it is usually fine)
                    if (member.roles.cache.has(rr.roleId)) {
                        await member.roles.remove(rr.roleId);
                    }
                    await member.roles.add(rr.roleId);
                } catch (error) {
                    console.error('Failed to add reaction role:', error);
                }
            }
            // If it's a reaction role, stop here to avoid conflicting with poll logic
            return;
        }
    }


    // --- 2. Poll Single-Choice Enforcement Logic ---
    if (!client.polls) return; // FIX: Added null check to prevent TypeError crash

    const pollData = client.polls.get(reaction.message.id);
    if (pollData && !pollData.multiChoice) {
        // Only enforce for poll emojis
        if (emojiList.includes(reaction.emoji.name)) {
            const userReactions = reaction.message.reactions.cache.filter(
                reaction => reaction.users.cache.has(user.id) && emojiList.includes(reaction.emoji.name)
            );

            if (userReactions.size > 1) {
                // If the user has reacted with more than one poll emoji, remove all but the current one
                for (const userReaction of userReactions.values()) {
                    if (userReaction.emoji.name !== reaction.emoji.name) {
                        // Remove the *old* reaction(s)
                        await userReaction.users.remove(user.id).catch(error => console.error('Failed to remove old poll reaction:', error));
                    }
                }
            }
        }
    }
  },
};
