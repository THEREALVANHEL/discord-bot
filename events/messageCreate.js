import { EmbedBuilder, ChannelType } from "discord.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "dotenv";
import User from "../models/User.js";
import Server from "../models/Server.js";
import Settings from "../models/Settings.js";
import { findOrCreateUser } from "../utils/findOrCreateUser.js";
import { generateUserLevel } from "../utils/levelSystem.js";
import { updateUserRank } from "../utils/rankSystem.js";
import { generateXP, XP_COOLDOWN } from "../utils/xpSystem.js";
import { createNewUser } from "../utils/createNewUser.js";
import { processCommand } from "../commands/index.js";
import { safeEval } from "../utils/safeEval.js";
import { findUserInGuild } from "../utils/findUserInGuild.js";
import { searchGiphyGif } from "../utils/searchGiphyGif.js";
import { delay } from "../utils/delay.js";
import { formatDuration } from "../utils/formatDuration.js";
import { truncateText } from "../utils/truncateText.js";

config();

const client = global.clientInstance;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ======== SYSTEM INSTRUCTION TEMPLATE ==========
const SYSTEM_INSTRUCTION_TEMPLATE = `
You are Blecky AI, a helpful and powerful AI assistant inside a Discord server. 
You can perform any function, command, or message interaction available to the bot.
Always output a valid JSON when performing an action. Example:

{
  "action": "command",
  "commandName": "ping",
  "targetUser": "Vanhel"
}

If the user only wants to talk, reply naturally (no JSON).

When generating commands:
- Always set "targetUser" to the username, nickname, or tag that best matches from the list below or from the MongoDB user collection.
- You may assume access to MongoDB 'User' collection, which contains every user's username, tag, displayName, and userId.
- If you cannot find a match, omit targetUser or set it to null.

Server Members and Database Users for reference:
{MEMBER_LIST}

Keep responses short, polite, and relevant.
`;

const AI_CHAT_MODEL = "gemini-1.5-flash";
const AI_MAX_RETRIES = 3;

// =================================================
const xpCooldowns = new Map();

export default async (client, message) => {
  try {
    if (
      message.author.bot ||
      message.channel.type === ChannelType.DM ||
      !message.guild
    ) return;

    // ---- Quick XP system ----
    const userKey = `${message.guild.id}-${message.author.id}`;
    const now = Date.now();
    if (!xpCooldowns.has(userKey) || now - xpCooldowns.get(userKey) > XP_COOLDOWN) {
      const user = await findOrCreateUser(message.author.id, message.guild.id);
      const xpGain = generateXP();
      user.xp += xpGain;
      const leveledUp = generateUserLevel(user);
      await user.save();
      xpCooldowns.set(userKey, now);
      if (leveledUp) {
        await updateUserRank(message.guild.id, message.author.id);
        message.reply(`🎉 Congrats <@${message.author.id}>! You leveled up to level ${user.level}!`);
      }
    }

    // ---- Load Server Settings ----
    const server = await Server.findOne({ serverId: message.guild.id });
    if (!server) return;
    const settings = await Settings.findOne({ serverId: message.guild.id });
    if (!settings || !settings.aiChannelId) return;

    const aiChannel = message.guild.channels.cache.get(settings.aiChannelId);
    if (!aiChannel || message.channel.id !== aiChannel.id) return;

    // ---- Anonymous Mode ----
    const isAnonymousMode = settings.aiAnonymousMode;
    const authorDisplay = isAnonymousMode ? "Anonymous" : message.author.username;

    // ---- Math Mode ----
    const isMathMode = settings.aiMathMode;
    if (isMathMode && /^[0-9+\-*/().\s^√]+$/.test(message.content)) {
      try {
        const result = safeEval(message.content);
        return message.reply(`🧮 \`${message.content}\` = **${result}**`);
      } catch {
        return message.reply("⚠️ Invalid math expression.");
      }
    }

    // ---- Build AI context ----
    const memberList = message.guild.members.cache.map(m =>
      `${m.user.username} (${m.displayName})`
    ).join(", ");

    const systemInstruction = SYSTEM_INSTRUCTION_TEMPLATE.replace(
      "{MEMBER_LIST}",
      truncateText(memberList, 4000)
    );

    // ---- Prepare chat context ----
    const history = await getRecentChatHistory(message.channel.id, 10);
    const chatHistory = history.map(m => ({
      role: m.authorId === client.user.id ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    chatHistory.push({
      role: "user",
      parts: [{ text: `${authorDisplay}: ${message.content}` }],
    });

    // ---- AI call ----
    const model = genAI.getGenerativeModel({
      model: AI_CHAT_MODEL,
      systemInstruction: systemInstruction,
    });

    let aiResponse = null;
    for (let i = 0; i < AI_MAX_RETRIES; i++) {
      try {
        const result = await model.generateContent({
          contents: chatHistory,
          generationConfig: { maxOutputTokens: 512 },
        });
        aiResponse = result.response.text();
        if (aiResponse) break;
      } catch (err) {
        if (i === AI_MAX_RETRIES - 1)
          throw new Error("Gemini API failed after 3 retries");
        await delay(1000 * (i + 1));
      }
    }

    if (!aiResponse) return;

    // ---- Try extract JSON ----
    const parsed = extractFirstBalancedJson(aiResponse);

    // ---- If command JSON found ----
    if (parsed?.action === "command") {
      await executeParsedAction(message, parsed, isAnonymousMode);
      return;
    }

    // ---- Otherwise, normal AI reply ----
    const replyMsg = isAnonymousMode
      ? `🤖 **Anonymous:** ${truncateText(aiResponse, 1800)}`
      : `🤖 **${client.user.username}:** ${truncateText(aiResponse, 1800)}`;

    await message.reply(replyMsg);
  } catch (err) {
    console.error("❌ AI Handler Error:", err);
    message.reply("⚠️ Something went wrong while processing your message.");
  }
};

// =================================================
// === HELPER FUNCTIONS ===

function extractFirstBalancedJson(text) {
  if (!text || typeof text !== "string") return null;
  text = text.replace(/```json|```/gi, "");
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") depth--;
    if (depth === 0) {
      const chunk = text.slice(start, i + 1);
      try { return JSON.parse(chunk); } catch {}
    }
  }
  return null;
}

async function executeParsedAction(message, action, isAnonymousMode) {
  try {
    if (action.commandName === "say" && action.arguments?.[0]) {
      return message.channel.send(action.arguments.join(" "));
    }

    if (action.commandName === "ping" && action.targetUser) {
      const target = await findUserInGuild(message.guild, action.targetUser, message.author.id);
      if (target) {
        return message.channel.send(`🏓 Pong! <@${target.id}>`);
      } else {
        const embed = new EmbedBuilder()
          .setColor("Red")
          .setDescription(`❌ Couldn't find user "${action.targetUser}" to execute the ping command.`);
        return message.reply({ embeds: [embed] });
      }
    }

    if (action.commandName === "gif" && action.arguments?.[0]) {
      const term = action.arguments.join(" ");
      const gif = await searchGiphyGif(term);
      if (gif) return message.channel.send(gif);
    }

    if (action.commandName === "math" && action.arguments?.[0]) {
      const expr = action.arguments.join(" ");
      const result = safeEval(expr);
      return message.reply(`🧮 \`${expr}\` = **${result}**`);
    }

    // Fallback to command processor
    const handled = await processCommand(client, message, action.commandName, action.arguments || []);
    if (!handled) {
      const embed = new EmbedBuilder()
        .setColor("Red")
        .setDescription(`❌ The AI suggested a command but it couldn't be executed (permissions or invalid).`);
      await message.reply({ embeds: [embed] });
    }
  } catch (err) {
    console.error("❌ Error executing parsed action:", err);
    message.reply("⚠️ Error executing the AI-suggested command.");
  }
}

async function getRecentChatHistory(channelId, limit = 10) {
  // Optionally connect to a database if you store AI history.
  return []; // placeholder — can integrate message history from DB if available
}
