/**
 * Share command metadata from a common spot to be used for both runtime
 * and registration.
 */

export const AWW_COMMAND = {
  name: 'awwww',
  description: 'Drop some cuteness on this channel.',
};

export const INVITE_COMMAND = {
  name: 'invite',
  description: 'Get an invite link to add the bot to your server',
};

export const LOLDLE_COMMAND = {
  name: 'loldle',
  description: 'Launch Loldle from the App Launcher',
  type: 4,
  handler: 2,
};

export const LOLDLE_SLASH_COMMAND = {
  name: 'loldle',
  description: 'Launch the Loldle Activity from chat',
  type: 1,
};
