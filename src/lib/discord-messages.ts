export const DISCORD_ERRORS = {
  disabled: 'Discord sign-in is not configured on this instance.',
  state: 'This Discord sign-in expired or is invalid. Please try again.',
  denied: 'Discord authorization was cancelled. You can try again.',
  email: 'Discord sign-in requires a verified email address on Discord.',
  registration: 'Registration is disabled. Contact your administrator.',
  account_exists:
    'An account already uses this email. Sign in with your password, then connect Discord in account settings.',
  linked: 'This Discord account or Drawspace account is already connected.',
  failed: 'Discord sign-in could not be completed. Please try again.',
} as const

export function discordErrorMessage(code?: string) {
  return code && Object.hasOwn(DISCORD_ERRORS, code)
    ? DISCORD_ERRORS[code as keyof typeof DISCORD_ERRORS]
    : undefined
}
