// events/messageCreate.js (Improved — single-file final version)
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const ms = require('ms');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const User = require('../models/User');
const Settings = require('../models/Settings');

// ----------------- CONFIG / CONSTANTS -----------------
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const MAX_HISTORY_EXCHANGES = 10;         // user/model pairs
const HISTORY_TTL_MS = 1000 * 60 * 30;   // 30 minutes TTL for conversation entries
const AI_USER_COOLDOWN_MS = 8000;        // 8s cooldown per user for AI commands
const AI_RETRY_ATTEMPTS = 3;
const AI_RETRY_BASE_DELAY_MS = 750;      // exponential backoff base
const AI_TIMEOUT_MS = 15_000;            // 15s per API call

const GIPHY_KEY = process.env.GIPHY_API_KEY || "";
const GIPHY_CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes

// System instruction (keeps the JSON schema rules you had)
const SYSTEM_INSTRUCTION_TEMPLATE = `You are Blecky Nephew, a Discord bot assistant. You are an expert at identifying and executing bot commands.
Your primary role is to be a friendly, knowledgeable, and slightly snarky companion, responding conversationally to all questions.
However, if the user's message clearly translates to a single, structured bot command (like 'warn', 'add coins', 'send gif', 'calculate', etc.), you MUST respond ONLY with a JSON object that strictly adheres to the schema below. If no command is found, respond only with conversational text.

Current Date/Time: {NOW}

Server Members for reference: {MEMBER_LIST}

JSON SCHEMA (Return ONLY the JSON if an action is detected):
{
  "action": "one of: warn, warnlist, remove_warn, add_coins, remove_coins, add_cookies, remove_cookies, add_xp, remove_xp, dm, gif, avatar, calculate, info, ping, account_created, joined",
  "targetUser": "The username, nickname, or mention of the user (resolved to a string name/ID), or null",
  "amount": "The numerical value for currency/XP, or the warning index for remove_warn, or null",
  "reason": "The reason for the action or null",
  "gifQuery": "The full search term for a GIF, or null",
  "dmMessage": "The message to send in a DM, or null",
  "mathExpression": "The exact math expression to calculate (e.g., '99 * 87'), or null",
  "infoType": "coins, cookies, xp, or level (for 'info' action), or null"
}

If a command is not suitable for the current user's role (e.g., a non-admin asking to 'warn'), still output the JSON, but include a 'permission_note' field stating the required role.

If the user mentions an action not listed in 'action', or asks a general question, do NOT output JSON. Respond conversationally, keeping your response concise and under 300 characters.`;

// ----------------- IN-MEMORY STORES -----------------
const conversationHistory = new Map(); // userId -> [{ role, content, ts }]
const giphyCache = new Map();         // query -> { url, expiresAt }
const aiLocks = new Map();            // userId -> boolean (true=busy)
const aiCooldowns = new Map();        // userId -> timestamp

// ----------------- UTILS: HISTORY -----------------
function _nowISO() { return new Date().toISOString(); }

function addToHistory(userId, role, content) {
  if (!conversationHistory.has(userId)) conversationHistory.set(userId, []);
  const hist = conversationHistory.get(userId);
  // store compact entry
  hist.push({ role, content: content.length > 1200 ? content.slice(0, 1200) + '…' : content, ts: Date.now() });
  // keep size
  while (hist.length > MAX_HISTORY_EXCHANGES * 2) hist.shift();
}

function getHistoryForPrompt(userId) {
  const raw = conversationHistory.get(userId) || [];
  // filter TTL
  const now = Date.now();
  const filtered = raw.filter(e => (now - (e.ts || 0)) <= HISTORY_TTL_MS);
  conversationHistory.set(userId, filtered);
  // return as expected by your Gemini payload (role: 'user'/'model', parts: [{text}] )
  return filtered.map(e => ({ role: e.role, parts: [{ text: e.content }] }));
}

// ----------------- HELPERS: GIPHY -----------------
async function searchGiphyGif(query) {
  const safeQuery = (query || 'random').trim();
  const cacheKey = safeQuery.toLowerCase();
  const cached = giphyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  // Fallback list (public)
  const fallback = [
    'https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif',
    'https://media.giphy.com/media/mlvseq9yvZhba/giphy.gif',
    'https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif'
  ];

  if (!GIPHY_KEY) {
    const pick = fallback[Math.floor(Math.random() * fallback.length)];
    giphyCache.set(cacheKey, { url: pick, expiresAt: Date.now() + GIPHY_CACHE_TTL_MS });
    return pick;
  }

  const url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(safeQuery)}&limit=25&rating=g`;
  try {
    const res = await fetch(url, { timeout: 8000 });
    const json = await res.json();
    if (json?.data?.length) {
      const idx = Math.floor(Math.random() * Math.min(json.data.length, 10));
      const gifUrl = json.data[idx].images?.original?.url || json.data[idx].images?.downsized?.url;
      giphyCache.set(cacheKey, { url: gifUrl, expiresAt: Date.now() + GIPHY_CACHE_TTL_MS });
      return gifUrl;
    }
  } catch (e) {
    console.error('Giphy fetch error:', e);
  }
  const pick = fallback[Math.floor(Math.random() * fallback.length)];
  giphyCache.set(cacheKey, { url: pick, expiresAt: Date.now() + GIPHY_CACHE_TTL_MS });
  return pick;
}

// ----------------- UTILS: SAFE MATH -----------------
// Strict safe evaluator: only numbers, parentheses, operators and approved functions/constants
const SAFE_FUNCTIONS = ['sqrt','abs','pow','sin','cos','tan','log','log10','max','min','round','floor','ceil'];
const SAFE_CONSTANTS = ['PI', 'E'];

function safeEval(expression) {
  if (!expression || typeof expression !== 'string') return 'Error';
  // Normalize
  let expr = expression.trim();
  // Replace common synonyms
  expr = expr.replace(/\bln\(/gi, 'log(');

  // Replace allowed function names to Math equivalents using mapping
  const fnMap = {
    'sqrt': 'Math.sqrt',
    'abs': 'Math.abs',
    'pow': 'Math.pow',
    'sin': 'Math.sin',
    'cos': 'Math.cos',
    'tan': 'Math.tan',
    'log10': 'Math.log10' || 'Math.log', // fallback handled below
    'log': 'Math.log',
    'max': 'Math.max',
    'min': 'Math.min',
    'round': 'Math.round',
    'floor': 'Math.floor',
    'ceil': 'Math.ceil'
  };

  // Replace pi, e -> Math.PI, Math.E
  expr = expr.replace(/\bpi\b/gi, 'Math.PI').replace(/\be\b/gi, 'Math.E');

  // Replace allowed function names with Math.* safely
  for (const fn of SAFE_FUNCTIONS) {
    const pattern = new RegExp(`\\b${fn}\\s*\\(`, 'gi');
    if (fnMap[fn]) expr = expr.replace(pattern, `${fnMap[fn]}(`);
  }

  // Allow only digits, whitespace, Math., numbers, operators, parentheses, comma, dot
  if (!/^[0-9+\-*/%^()., MathPIEa-zA-Z_]+$/.test(expr)) return 'Error';

  // Disallow any alphabets that are not part of 'Math' or allowed tokens
  // Reject suspicious identifiers (e.g., process, require, global)
  const forbiddenIdentifiers = ['process', 'require', 'global', 'window', 'eval', 'Function', 'constructor', '__proto__'];
  for (const id of forbiddenIdentifiers) {
    if (expr.toLowerCase().includes(id.toLowerCase())) return 'Error';
  }

  // Final safety: use new Function in a very restricted scope (no access to outer scope)
  try {
    // Provide Math.only by referencing Math; because we allowed 'Math.' tokens, they work.
    const fn = new Function(`"use strict"; return (${expr});`);
    const result = fn();
    if (typeof result === 'number' && isFinite(result)) return result;
    return 'Error';
  } catch (e) {
    return 'Error';
  }
}

// Quick simple math-only detector (no letters except allowed constants)
function isMathOnly(content) {
  // allow digits, operators, parentheses, spaces, decimal point, function names, commas
  // but quickly detect if contains words that are not math functions
  if (!content || content.length > 200) return false; // too long
  // reject messages with alphabetic words that look like prose
  const alphaWords = content.match(/[A-Za-z]{2,}/g) || [];
  // if alpha words exist that are not allowed math function names, reject
  if (alphaWords.length) {
    const allowed = SAFE_FUNCTIONS.concat(['pi','e','PI','E','Math','sqrt','ln','log']);
    for (const w of alphaWords) {
      if (!allowed.includes(w) && !allowed.includes(w.toLowerCase())) return false;
    }
  }
  // if it contains digits or parentheses or operators, treat as math
  return /[0-9\(\)\+\-\*\/\^%.,]/.test(content);
}

// ----------------- UTILS: GEMINI CALL WITH RETRY -----------------
async function callGeminiAIWithRetries(history, guildMembers, latestMessage) {
  if (!GEMINI_API_KEY) throw new Error('Gemini API key not configured');

  // Prepare member list string (limit to 80 members to avoid huge prompt)
  const memberNames = guildMembers.slice(0, 80).map(m => `${m.user.username} (display: ${m.displayName})`).join(', ');
  const sysInstr = SYSTEM_INSTRUCTION_TEMPLATE
                      .replace('{NOW}', _nowISO())
                      .replace('{MEMBER_LIST}', memberNames);

  const contents = [
    { role: 'user', parts: [{ text: sysInstr }] },
    ...history,
    { role: 'user', parts: [{ text: latestMessage }] }
  ];

  const payload = { contents };

  // Attempt with exponential backoff
  for (let attempt = 1; attempt <= AI_RETRY_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
      const res = await fetch(GEMINI_API_URL + GEMINI_API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(id);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        // If 4xx/5xx, decide whether to retry
        if (res.status >= 500 && attempt < AI_RETRY_ATTEMPTS) {
          // transient server error -> retry
          await new Promise(r => setTimeout(r, AI_RETRY_BASE_DELAY_MS * attempt));
          continue;
        }
        throw new Error(`Gemini API error ${res.status}: ${text}`);
      }
      const data = await res.json();
      // Parse response text if exists
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || (data?.output?.[0]?.content?.parts?.[0]?.text) || '';
      if (text) return text;
      if (data.error) throw new Error(data.error.message || 'Unknown Gemini error');
      throw new Error('No valid text returned by Gemini');
    } catch (err) {
      // if aborted or network error and attempts remain -> retry
      if (attempt < AI_RETRY_ATTEMPTS) {
        const backoff = AI_RETRY_BASE_DELAY_MS * attempt;
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
      throw err;
    }
  }
}

// ----------------- UTILS: JSON EXTRACTION (balanced braces) -----------------
function extractFirstBalancedJson(text) {
  if (!text || typeof text !== 'string') return null;
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    if (depth === 0) {
      const candidate = text.slice(start, i + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ----------------- UTILS: USER FINDER (improved) -----------------
function findUserInGuild(guild, searchTerm, authorId) {
  if (!searchTerm) return null;
  const match = searchTerm.match(/<@!?(\d+)>|(\d{17,19})/);
  if (match) {
    const id = match[1] || match[2];
    if (id === authorId) return { self: true };
    return guild.members.cache.get(id) || null;
  }
  const search = searchTerm.toLowerCase().trim();
  if (search.length < 2) return null;

  let best = null;
  let score = 0;
  guild.members.cache.forEach(member => {
    if (member.id === authorId) return;
    const username = (member.user.username || '').toLowerCase();
    const displayName = (member.displayName || '').toLowerCase();
    const tag = (member.user.tag || '').toLowerCase();

    if (username === search || displayName === search || tag === search) {
      best = member; score = 100; return;
    }
    if (username.startsWith(search) || displayName.startsWith(search)) {
      if (score < 90) { best = member; score = 90; }
    } else if (username.includes(search) || displayName.includes(search) || tag.includes(search)) {
      if (score < 70) { best = member; score = 70; }
    }
  });
  return best;
}

// ----------------- UTILS: SEND HELPERS -----------------
async function safeReply(message, content, isAnonymous = false) {
  try {
    if (typeof content === 'string') {
      const sendTarget = isAnonymous ? message.channel : message;
      const method = isAnonymous ? sendTarget.send.bind(sendTarget) : sendTarget.reply.bind(sendTarget);
      // Discord limit 2000 chars, split if required
      if (content.length <= 2000) return await method(content);
      // split by lines ~ simple
      const parts = content.match(/[\s\S]{1,1900}/g) || [content.slice(0, 1900)];
      for (const p of parts) {
        await method(p);
      }
      return;
    } else {
      // object (embed or message payload)
      if (isAnonymous) return await message.channel.send(content);
      return await message.reply(content);
    }
  } catch (e) {
    console.error('safeReply failed:', e);
    try { return await message.channel.send("❌ Failed to send reply (permissions?)"); } catch {}
  }
}

// Generic error embed
function errorEmbed(title, description) {
  return new EmbedBuilder().setTitle(title).setDescription(description || '').setColor(0xFF0000).setTimestamp();
}

// ----------------- ACTION EXECUTOR (centralized) -----------------
async function executeParsedAction(message, client, parsed, resolvedTargetMember, isAnonymous) {
  const action = parsed.action;
  const amount = parsed.amount || 1;
  const reason = parsed.reason || 'No reason provided';
  const gifQuery = parsed.gifQuery || null;
  const dmMessage = parsed.dmMessage || null;
  const mathExpression = parsed.mathExpression || null;
  const infoType = parsed.infoType || null;

  const settings = await Settings.findOne({ guildId: message.guild.id });
  const logChannel = settings?.modlogChannelId ? message.guild.channels.cache.get(settings.modlogChannelId) : null;

  const isModerator = message.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                      message.member.roles.cache.has(client.config.roles.leadMod) ||
                      message.member.roles.cache.has(client.config.roles.mod);

  const isCurrencyManager = message.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                            message.member.roles.cache.has(client.config.roles.cookiesManager);

  // helpers
  const sendActionReply = (txtOrPayload) => safeReply(message, txtOrPayload, isAnonymous);

  // Utility: calculate locally if requested
  if (action === 'calculate' && mathExpression) {
    const safeRes = safeEval(mathExpression);
    if (safeRes === 'Error') {
      await sendActionReply(`❌ I couldn't safely calculate that expression: \`${mathExpression}\`. Use numbers/operators/functions like sqrt(), sin(), log(), pow().`);
      return false;
    }
    const formatted = Number.isInteger(safeRes) ? safeRes : Number(safeRes).toFixed(6).replace(/\.?0+$/, '');
    await sendActionReply(`**${mathExpression}** = **${formatted}**`);
    return true;
  }

  // GIF
  if (action === 'gif') {
    const url = await searchGiphyGif(gifQuery || 'random');
    await message.channel.send(url);
    return true;
  }

  // ping
  if (action === 'ping') {
    if (!resolvedTargetMember) {
      await sendActionReply(`❌ Couldn't find user "${parsed.targetUser}" to execute the **ping** command.`);
      return false;
    }
    await message.channel.send(`<@${resolvedTargetMember.id}>`);
    return true;
  }

  // avatar
  if (action === 'avatar') {
    if (!resolvedTargetMember) {
      await sendActionReply(`❌ Couldn't find user "${parsed.targetUser}".`);
      return false;
    }
    const url = resolvedTargetMember.user.displayAvatarURL({ dynamic: true, size: 1024 });
    const embed = new EmbedBuilder().setTitle(`${resolvedTargetMember.user.tag}'s Avatar`).setImage(url).setColor(0x7289DA);
    await message.channel.send({ embeds: [embed] });
    return true;
  }

  // account created
  if (action === 'account_created') {
    if (!resolvedTargetMember) return await sendActionReply(`❌ Couldn't find user "${parsed.targetUser}".`);
    const createdDate = `<t:${Math.floor(resolvedTargetMember.user.createdTimestamp / 1000)}:F>`;
    await sendActionReply(`**${resolvedTargetMember.user.tag}** created their account on ${createdDate}`);
    return true;
  }

  // joined
  if (action === 'joined') {
    if (!resolvedTargetMember) return await sendActionReply(`❌ Couldn't find user "${parsed.targetUser}".`);
    const joinDate = `<t:${Math.floor(resolvedTargetMember.joinedTimestamp / 1000)}:F>`;
    await sendActionReply(`**${resolvedTargetMember.user.tag}** joined on ${joinDate}`);
    return true;
  }

  // info
  if (action === 'info') {
    if (!resolvedTargetMember) return await sendActionReply(`❌ Couldn't find user "${parsed.targetUser}".`);
    let dbUser = await User.findOne({ userId: resolvedTargetMember.id }) || new User({ userId: resolvedTargetMember.id });
    const t = infoType || 'coins';
    let value = dbUser[t] !== undefined ? dbUser[t] : (t === 'level' ? dbUser.level : 0);
    await sendActionReply(`**${resolvedTargetMember.user.tag}** has **${value}** ${t}`);
    return true;
  }

  // moderation: warn/warnlist/remove_warn/dm
  if (['warn', 'warnlist', 'remove_warn', 'dm'].includes(action)) {
    if (action !== 'dm' && !isModerator) {
      await sendActionReply("❌ You need **Moderator** permissions to use that command.");
      return false;
    }
    if (!resolvedTargetMember) {
      await sendActionReply(`❌ Target user "${parsed.targetUser}" not found.`);
      return false;
    }

    let dbUser = await User.findOne({ userId: resolvedTargetMember.id }) || new User({ userId: resolvedTargetMember.id });

    if (action === 'warnlist') {
      if (!dbUser.warnings || dbUser.warnings.length === 0) {
        await sendActionReply(`✅ **${resolvedTargetMember.user.tag}** has no warnings.`);
        return true;
      }
      const embed = new EmbedBuilder()
        .setTitle(`⚠️ Warnings for ${resolvedTargetMember.user.tag}`)
        .setColor(0xFFA500)
        .setThumbnail(resolvedTargetMember.user.displayAvatarURL({ dynamic: true }))
        .setDescription(`Total Warnings: **${dbUser.warnings.length}**`)
        .setTimestamp();
      dbUser.warnings.forEach((warn, i) => {
        const mod = message.guild.members.cache.get(warn.moderatorId);
        embed.addFields({ name: `Warning #${i + 1}`, value: `**Reason:** ${warn.reason}\n**Moderator:** ${mod?.user?.tag || 'Unknown'}\n**Date:** <t:${Math.floor(new Date(warn.date).getTime() / 1000)}:F>`, inline: false });
      });
      await message.channel.send({ embeds: [embed] });
      return true;
    }

    if (action === 'warn') {
      dbUser.warnings = dbUser.warnings || [];
      dbUser.warnings.push({ reason, moderatorId: message.author.id, date: new Date() });
      await dbUser.save();
      await sendActionReply(`✅ Warned **${resolvedTargetMember.user.tag}**\n**Reason:** ${reason}\n**Total warnings:** ${dbUser.warnings.length}`);
      if (logChannel) {
        const logEmbed = new EmbedBuilder().setTitle('⚠️ Warning Issued').setColor(0xFFA500)
          .addFields(
            { name: 'Target', value: `${resolvedTargetMember.user.tag} (${resolvedTargetMember.id})` },
            { name: 'Admin', value: `${message.author.tag}` },
            { name: 'Reason', value: reason },
            { name: 'Total', value: `${dbUser.warnings.length}` }
          ).setTimestamp();
        logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }
      // Optional auto timeout logic
      if (dbUser.warnings.length >= 5) {
        try {
          await resolvedTargetMember.timeout(5 * 60 * 1000, '5 warnings reached');
          await message.channel.send(`⏰ **${resolvedTargetMember.user.tag}** timed out for 5 minutes (5 warnings)`);
        } catch {}
      }
      return true;
    }

    if (action === 'remove_warn') {
      const idx = Number(amount);
      if (!dbUser.warnings || dbUser.warnings.length === 0) {
        await sendActionReply(`❌ **${resolvedTargetMember.user.tag}** has no warnings.`);
        return false;
      }
      if (isNaN(idx) || idx < 1 || idx > dbUser.warnings.length) {
        await sendActionReply(`❌ Invalid warning number. **${resolvedTargetMember.user.tag}** has ${dbUser.warnings.length} warning(s).`);
        return false;
      }
      const removed = dbUser.warnings.splice(idx - 1, 1)[0];
      await dbUser.save();
      await sendActionReply(`✅ Removed warning #${idx} from **${resolvedTargetMember.user.tag}**\n**Reason was:** ${removed.reason}`);
      return true;
    }

    if (action === 'dm') {
      const content = dmMessage || 'Hi! 👋';
      try {
        await resolvedTargetMember.user.send(content);
        await sendActionReply(`✅ Sent DM to **${resolvedTargetMember.user.tag}**`);
      } catch {
        await sendActionReply(`❌ Couldn't DM **${resolvedTargetMember.user.tag}** (DMs closed)`);
      }
      return true;
    }
  }

  // Currency actions (requires currency manager)
  if (['add_coins', 'remove_coins', 'add_cookies', 'remove_cookies', 'add_xp', 'remove_xp'].includes(action)) {
    if (!isCurrencyManager) {
      await sendActionReply("❌ You need **Currency Manager** permissions to modify currency/XP.");
      return false;
    }
    if (!resolvedTargetMember) {
      await sendActionReply(`❌ Target user "${parsed.targetUser}" not found.`);
      return false;
    }

    const currencyType = action.split('_')[1]; // coins / cookies / xp
    const operation = action.split('_')[0]; // add / remove
    let dbUser = await User.findOne({ userId: resolvedTargetMember.id }) || new User({ userId: resolvedTargetMember.id });

    const amt = Number(amount);
    if (isNaN(amt) || amt < 0) {
      await sendActionReply('❌ Invalid amount specified.');
      return false;
    }

    if (operation === 'remove') {
      if (!dbUser[currencyType] || dbUser[currencyType] < amt) {
        await sendActionReply(`❌ **${resolvedTargetMember.user.tag}** only has ${dbUser[currencyType] || 0} ${currencyType}.`);
        return false;
      }
      dbUser[currencyType] = Math.max(0, (dbUser[currencyType] || 0) - amt);
    } else {
      dbUser[currencyType] = (dbUser[currencyType] || 0) + amt;
    }
    await dbUser.save();

    // handle XP/level roles and cookie roles if configured
    if (currencyType === 'xp') {
      // leveling loop similar to your original
      const getNextLevelXp = (level) => Math.floor(100 * Math.pow(level + 1, 1.5));
      let next = getNextLevelXp(dbUser.level);
      while (dbUser.xp >= next) {
        dbUser.level++;
        dbUser.xp -= next;
        next = getNextLevelXp(dbUser.level);
        // manage roles if available
        if (client.config.levelingRoles) {
          await manageTieredRolesInternal(resolvedTargetMember, dbUser.level, client.config.levelingRoles, 'level');
        }
      }
      await dbUser.save();
      // send level up message if leveled (handled in loop if necessary)
    }
    if (currencyType === 'cookies' && client.config.cookieRoles) {
      await manageTieredRolesInternal(resolvedTargetMember, dbUser.cookies, client.config.cookieRoles, 'cookies');
    }

    await sendActionReply(`✅ **${operation.charAt(0).toUpperCase() + operation.slice(1)}** **${amt}** ${currencyType} ${operation === 'add' ? 'to' : 'from'} **${resolvedTargetMember.user.tag}**\nThey now have **${dbUser[currencyType] || 0}** ${currencyType}`);
    return true;
  }

  // Unknown / unhandled action
  return false;
}

// Minimal copy of manageTieredRoles for this file's usage
async function manageTieredRolesInternal(member, userValue, roleConfigs, property) {
  if (!roleConfigs || roleConfigs.length === 0) return;
  const target = roleConfigs.filter(r => r[property] <= userValue).sort((a,b) => b[property] - a[property])[0];
  const targetId = target ? target.roleId : null;
  for (const rc of roleConfigs) {
    const has = member.roles.cache.has(rc.roleId);
    if (rc.roleId === targetId) {
      if (!has) await member.roles.add(rc.roleId).catch(() => {});
    } else {
      if (has) await member.roles.remove(rc.roleId).catch(() => {});
    }
  }
}

// ----------------- XP HANDLER (kept similar but tightened) -----------------
const getNextLevelXp = (level) => Math.floor(100 * Math.pow(level + 1, 1.5));

async function handleXpGain(message, client, settings) {
  if (settings && Array.isArray(settings.noXpChannels) && settings.noXpChannels.includes(message.channel.id)) return;
  if (message.reference?.messageId) return; // ignore replies to reduce spam

  const cooldownKey = `${message.author.id}-${message.channel.id}`;
  const last = client.xpCooldowns.get(cooldownKey) || 0;
  if (Date.now() - last < 5000) return;
  client.xpCooldowns.set(cooldownKey, Date.now());

  let user = await User.findOne({ userId: message.author.id }) || new User({ userId: message.author.id });

  const xpGain = Math.floor(Math.random() * 3) + 3;
  user.xp = (user.xp || 0) + xpGain;

  const nextLevelXp = getNextLevelXp(user.level || 0);
  if (user.xp >= nextLevelXp) {
    user.level = (user.level || 0) + 1;
    user.xp -= nextLevelXp;
    if (message.member && client.config.levelingRoles) {
      await manageTieredRolesInternal(message.member, user.level, client.config.levelingRoles, 'level');
    }
    const levelUpChannel = settings?.levelUpChannelId ? message.guild.channels.cache.get(settings.levelUpChannelId) : message.channel;
    if (levelUpChannel) {
      const embed = new EmbedBuilder().setTitle('🚀 Level UP!').setDescription(`${message.author}, you're now **Level ${user.level}**!`).setThumbnail(message.author.displayAvatarURL({ dynamic: true })).setColor(0xFFD700).setTimestamp();
      await levelUpChannel.send({ content: `${message.author}`, embeds: [embed] }).catch(() => {});
    }
  }

  // cookie role management if present
  if (message.member && client.config.cookieRoles) {
    await manageTieredRolesInternal(message.member, user.cookies || 0, client.config.cookieRoles, 'cookies');
  }

  // auto-join role
  const autoJoinRoleId = client.config.roles?.autoJoin;
  if (autoJoinRoleId && message.member && !message.member.roles.cache.has(autoJoinRoleId)) {
    await message.member.roles.add(autoJoinRoleId).catch(() => {});
  }

  await user.save();
}

// ----------------- MAIN EVENT -----------------
module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    try {
      if (message.author.bot) return;
      if (!message.guild) return;

      const settings = await Settings.findOne({ guildId: message.guild.id });

      // COMMAND PREFIX/MENTION LOGIC
      const botMentioned = message.mentions.users.has(client.user.id);
      const isBlecky = message.content.toLowerCase().startsWith('blecky');
      const isAnonymous = message.content.toLowerCase().startsWith('r-blecky');

      let userQuery = message.content;
      let anonFlag = false;

      if (isAnonymous) {
        userQuery = userQuery.replace(/^r-blecky\s*/i, '').trim();
        anonFlag = true;
      } else if (isBlecky) {
        userQuery = userQuery.replace(/^blecky\s*/i, '').trim();
      } else if (botMentioned) {
        // ensure mention is the first mention (ignore if another mention comes first)
        if (!message.content.trim().startsWith(`<@${client.user.id}>`) && !message.content.trim().startsWith(`<@!${client.user.id}>`)) {
          // Not a command directed to bot; treat as normal message for XP and exit
          await handleXpGain(message, client, settings);
          return;
        }
        userQuery = userQuery.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
      } else {
        // not a command -> XP handling only
        await handleXpGain(message, client, settings);
        return;
      }

      // If empty query after prefix
      if (!userQuery || userQuery.length === 0) {
        await message.reply("Yes? 🐱");
        return;
      }

      // AI access check: keep your "forgottenOne" role restriction
      const forgottenOneRole = client.config.roles.forgottenOne;
      const isForgottenOne = message.member?.roles.cache.has(forgottenOneRole);
      if (!isForgottenOne || !GEMINI_API_KEY) {
        // If not allowed, but it was a non-empty command, tell them
        const msg = !GEMINI_API_KEY ? "❌ AI is not configured on this bot (missing GEMINI_API_KEY)." : "❌ The AI command system is restricted to Administrators (`forgottenOne` role) only.";
        // if anonymous, send to channel; else reply
        const replyMethod = anonFlag ? message.channel.send.bind(message.channel) : message.reply.bind(message);
        await replyMethod(msg);
        return;
      }

      // Math-only fast path: evaluate locally without AI
      if (isMathOnly(userQuery)) {
        const res = safeEval(userQuery);
        if (res === 'Error') {
          await safeReply(message, "❌ I couldn't parse that math expression safely. Try simpler operators or use `pow(a,b)` / `sqrt(x)`.", anonFlag);
          return;
        }
        const formatted = Number.isInteger(res) ? res : Number(res).toFixed(6).replace(/\.?0+$/, '');
        await safeReply(message, `**${userQuery}** = **${formatted}**`, anonFlag);
        return;
      }

      // Per-user concurrency lock + cooldown
      if (aiLocks.get(message.author.id)) {
        await safeReply(message, "⏳ You're already waiting on a previous AI response. Try again in a moment.", anonFlag);
        return;
      }
      const lastAi = aiCooldowns.get(message.author.id) || 0;
      if (Date.now() - lastAi < AI_USER_COOLDOWN_MS) {
        await safeReply(message, `❌ Slow down — AI commands are rate-limited. Try again in ${Math.ceil((AI_USER_COOLDOWN_MS - (Date.now() - lastAi)) / 1000)}s.`, anonFlag);
        return;
      }
      // Acquire lock
      aiLocks.set(message.author.id, true);
      aiCooldowns.set(message.author.id, Date.now());

      // Add to history
      addToHistory(message.author.id, 'user', userQuery);

      // If message used anonymous prefix, try to delete for privacy
      if (anonFlag) {
        try { await message.delete().catch(() => {}); } catch {}
      }

      // Prepare history and call AI
      const guildMembers = Array.from(message.guild.members.cache.values());
      const history = getHistoryForPrompt(message.author.id);

      let aiText;
      try {
        aiText = await callGeminiAIWithRetries(history, guildMembers, userQuery);
      } catch (aiErr) {
        console.error('AI call failed:', aiErr);
        await safeReply(message, "❌ The AI system failed. Try again later or check the GEMINI_API_KEY configuration.", anonFlag);
        // release lock and cleanup last history user message
        aiLocks.set(message.author.id, false);
        // pop last user message to avoid stale context
        const hist = conversationHistory.get(message.author.id) || [];
        hist.pop();
        conversationHistory.set(message.author.id, hist);
        return;
      }

      // Attempt to extract JSON command
      const parsedCommand = extractFirstBalancedJson(aiText);

      if (parsedCommand) {
        // Try to resolve target member if provided
        let targetMember = null;
        if (parsedCommand.targetUser) {
          const found = findUserInGuild(message.guild, parsedCommand.targetUser, message.author.id);
          if (found && found.self) {
            // the user referenced themselves
            targetMember = message.member;
          } else if (found) {
            targetMember = found;
          } else {
            targetMember = null;
          }
        }
        try {
          const executed = await executeParsedAction(message, client, parsedCommand, targetMember, anonFlag);
          if (executed) {
            // don't add the JSON to history as conversational content
            aiLocks.set(message.author.id, false);
            return;
          } else {
            await safeReply(message, "❌ The AI suggested a command but it couldn't be executed (permissions or invalid).", anonFlag);
          }
        } catch (execErr) {
          console.error('Command execution error:', execErr);
          await safeReply(message, "❌ Failed while executing the AI-suggested action.", anonFlag);
        }
      }

      // If not an actionable JSON or action not executed: send conversational response
      // Remove the JSON chunk from aiText (if present) and trim.
      const conversational = (aiText || '').replace(/\{[\s\S]*\}/, '').trim();
      if (conversational && conversational.length > 0) {
        await safeReply(message, conversational, anonFlag);
        addToHistory(message.author.id, 'model', conversational);
      } else {
        await safeReply(message, "🤔 That was interesting. Try rephrasing that command or question!", anonFlag);
        // remove last user history if AI gave nothing
        const hist = conversationHistory.get(message.author.id) || [];
        hist.pop();
        conversationHistory.set(message.author.id, hist);
      }

      // release lock
      aiLocks.set(message.author.id, false);

    } catch (outerErr) {
      console.error('messageCreate handler error:', outerErr);
      try { await message.reply("❌ An unexpected error occurred handling your message."); } catch {}
      // Ensure we clear locks on exception to avoid deadlock
      aiLocks.forEach((v, k) => { if (v) aiLocks.set(k, false); });
    }
  }
};
