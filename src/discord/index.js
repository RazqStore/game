const DISCORD_API = 'https://discord.com/api/v10';

function getAuthUrl() {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    prompt: 'consent'
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: process.env.DISCORD_REDIRECT_URI
  });
  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) throw new Error('discord token exchange failed: ' + (await res.text()));
  return res.json();
}

async function fetchDiscordUser(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error('discord user fetch failed');
  return res.json();
}

// Uses the bot token to look up the member's server nickname + avatar (falls back to global).
async function fetchGuildMember(userId) {
  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!guildId || !botToken) return null;
  try {
    const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${botToken}` }
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function avatarUrl(discordUser, member) {
  const memberAvatar = member && member.avatar;
  if (memberAvatar && process.env.DISCORD_GUILD_ID) {
    return `https://cdn.discordapp.com/guilds/${process.env.DISCORD_GUILD_ID}/users/${discordUser.id}/avatars/${memberAvatar}.png?size=128`;
  }
  if (discordUser.avatar) {
    return `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`;
  }
  const idx = Number(BigInt(discordUser.id) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

function displayName(discordUser, member) {
  if (member && member.nick) return member.nick;
  if (discordUser.global_name) return discordUser.global_name;
  return discordUser.username;
}

module.exports = { getAuthUrl, exchangeCode, fetchDiscordUser, fetchGuildMember, avatarUrl, displayName };
