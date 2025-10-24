import bcrypt from 'bcryptjs'

// Generate the actual hash for "Perkily#2025"
const ADMIN_PASSWORD_HASH = bcrypt.hashSync('Perkily#2025', 10)

export async function validateAdminPassword(password: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, ADMIN_PASSWORD_HASH)
  } catch (error) {
    console.error('Password validation error:', error)
    return false
  }
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10)
}
