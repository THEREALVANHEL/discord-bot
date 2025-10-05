// events/messageReactionAdd.js (REPLACE - Added null check for client.polls and fixed syntax)
const Settings = require('../models/Settings');
const emojiList = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

module.exports = {
  name: 'messageReactionAdd',
  execute: async (reaction, user, client) => { // FIX: Changed syntax for stability
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
        const rr = settings.reactionRoles.find(r =>
            r.messageId === reaction.message.id &&
            (r.emoji === reaction.emoji.identifier || r.emoji === reaction.emoji.name)
        );
        if (rr) {
            const member = await reaction.message.guild.members.fetch(user.id);
            if (member) {
                try {
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
