// The temporary password a new account is created with and emailed.
//
// Generated rather than typed. Asking whoever creates the account to invent
// one is a step with no decision in it: the password is emailed to the new
// user and replaced on their first sign-in, so nobody needs to have chosen it.
//
// Ambiguous characters are left out (no I/l/1, O/0) because this gets read off
// a screen and typed by hand.
export function generateTempPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%'
  const all = upper + lower + digits + symbols
  const arr = [
    upper[Math.floor(Math.random() * upper.length)],
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
    ...Array.from({ length: 4 }, () => all[Math.floor(Math.random() * all.length)]),
  ]
  return arr.sort(() => Math.random() - 0.5).join('')
}
