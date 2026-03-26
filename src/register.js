import { LOLDLE_COMMAND, LOLDLE_SLASH_COMMAND } from './commands.js';
import dotenv from 'dotenv';
import process from 'node:process';

/**
 * This file is meant to be run from the command line, and is not used by the
 * application server.  It's allowed to use node.js primitives, and only needs
 * to be run once.
 */

dotenv.config({ path: '.env' });
dotenv.config({ path: '.dev.vars' });

const token = process.env.DISCORD_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token) {
  throw new Error('The DISCORD_TOKEN environment variable is required.');
}
if (!applicationId) {
  throw new Error(
    'The DISCORD_APPLICATION_ID environment variable is required.',
  );
}

const globalCommandsUrl = `https://discord.com/api/v10/applications/${applicationId}/commands`;
const scopedSlashCommandsUrl = guildId
  ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
  : globalCommandsUrl;

const defaultHeaders = {
  'Content-Type': 'application/json',
  Authorization: `Bot ${token}`,
};

async function parseJsonBody(response) {
  const body = await response.text();
  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Discord API returned non-JSON payload: ${body}`);
  }
}

async function discordRequest(method, url, body = undefined) {
  const response = await fetch(url, {
    method,
    headers: defaultHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await parseJsonBody(response);

  if (!response.ok) {
    throw new Error(
      `Discord API error for ${method} ${url}: ${response.status} ${response.statusText}\n${JSON.stringify(payload, null, 2)}`,
    );
  }

  return payload;
}

function commandKey(command) {
  return `${command.type}:${command.name}`;
}

async function syncScopeCommands(scopeLabel, url, desiredCommands) {
  console.log(`Syncing commands for ${scopeLabel} scope...`);
  const desiredKeys = new Set(desiredCommands.map(commandKey));
  const existingCommands = await discordRequest('GET', url);

  for (const desiredCommand of desiredCommands) {
    const existingCommand = existingCommands.find(
      (command) => commandKey(command) === commandKey(desiredCommand),
    );
    if (existingCommand) {
      await discordRequest(
        'PATCH',
        `${url}/${existingCommand.id}`,
        desiredCommand,
      );
      console.log(
        `Updated command ${existingCommand.id} (${desiredCommand.name}, type ${desiredCommand.type})`,
      );
    } else {
      const createdCommand = await discordRequest('POST', url, desiredCommand);
      console.log(
        `Created command ${createdCommand.id} (${createdCommand.name}, type ${createdCommand.type})`,
      );
    }
  }

  const commandsAfterUpsert = await discordRequest('GET', url);
  const commandsToDelete = commandsAfterUpsert.filter(
    (command) => !desiredKeys.has(commandKey(command)),
  );

  for (const command of commandsToDelete) {
    await discordRequest('DELETE', `${url}/${command.id}`);
    console.log(
      `Deleted command ${command.id} (${command.name}, type ${command.type})`,
    );
  }

  const finalCommands = await discordRequest('GET', url);
  console.log(`Final command set (${scopeLabel}):`);
  for (const command of finalCommands) {
    console.log(`- ${command.id}: ${command.name} (type ${command.type})`);
  }
}

async function main() {
  if (!guildId) {
    await syncScopeCommands('global', globalCommandsUrl, [
      LOLDLE_COMMAND,
      LOLDLE_SLASH_COMMAND,
    ]);
    return;
  }

  // Entry Point commands are global-only, while slash command is guild-first.
  await syncScopeCommands('global entry-point', globalCommandsUrl, [
    LOLDLE_COMMAND,
  ]);
  await syncScopeCommands(`guild ${guildId}`, scopedSlashCommandsUrl, [
    LOLDLE_SLASH_COMMAND,
  ]);
}

main().catch((error) => {
  console.error('Error registering commands');
  console.error(error);
  process.exitCode = 1;
});
