export type DialOption = {
  name: string
  dial: string
  placeholder: string
}

/** All dial options — label shows +code and country name in the custom picker. */
export const LOGIN_DIAL_OPTIONS: DialOption[] = [
  { name: 'India', dial: '91', placeholder: '10-digit mobile' },
  { name: 'United States', dial: '1', placeholder: '10-digit mobile' },
  { name: 'Canada', dial: '1', placeholder: '10-digit mobile' },
  { name: 'United Kingdom', dial: '44', placeholder: '10-digit mobile' },
  { name: 'Australia', dial: '61', placeholder: '9-digit mobile' },
  { name: 'Germany', dial: '49', placeholder: '10–11 digit mobile' },
  { name: 'France', dial: '33', placeholder: '9-digit mobile' },
  { name: 'United Arab Emirates', dial: '971', placeholder: '9-digit mobile' },
  { name: 'Singapore', dial: '65', placeholder: '8-digit mobile' },
  { name: 'Pakistan', dial: '92', placeholder: '10-digit mobile' },
  { name: 'Bangladesh', dial: '880', placeholder: '10-digit mobile' },
  { name: 'China', dial: '86', placeholder: '11-digit mobile' },
  { name: 'Japan', dial: '81', placeholder: '10-digit mobile' },
  { name: 'South Korea', dial: '82', placeholder: '10-digit mobile' },
  { name: 'Saudi Arabia', dial: '966', placeholder: '9-digit mobile' },
  { name: 'Qatar', dial: '974', placeholder: '8-digit mobile' },
  { name: 'Kuwait', dial: '965', placeholder: '8-digit mobile' },
  { name: 'Oman', dial: '968', placeholder: '8-digit mobile' },
  { name: 'Bahrain', dial: '973', placeholder: '8-digit mobile' },
  { name: 'Nepal', dial: '977', placeholder: '10-digit mobile' },
  { name: 'Sri Lanka', dial: '94', placeholder: '9-digit mobile' },
  { name: 'Malaysia', dial: '60', placeholder: '9–10 digit mobile' },
  { name: 'Indonesia', dial: '62', placeholder: '9–12 digit mobile' },
  { name: 'Philippines', dial: '63', placeholder: '10-digit mobile' },
  { name: 'Thailand', dial: '66', placeholder: '9-digit mobile' },
  { name: 'Vietnam', dial: '84', placeholder: '9-digit mobile' },
  { name: 'Hong Kong', dial: '852', placeholder: '8-digit mobile' },
  { name: 'New Zealand', dial: '64', placeholder: '9-digit mobile' },
  { name: 'South Africa', dial: '27', placeholder: '9-digit mobile' },
  { name: 'Nigeria', dial: '234', placeholder: '10-digit mobile' },
  { name: 'Kenya', dial: '254', placeholder: '9-digit mobile' },
  { name: 'Brazil', dial: '55', placeholder: '10–11 digit mobile' },
  { name: 'Mexico', dial: '52', placeholder: '10-digit mobile' },
  { name: 'Argentina', dial: '54', placeholder: '10-digit mobile' },
  { name: 'Italy', dial: '39', placeholder: '10-digit mobile' },
  { name: 'Spain', dial: '34', placeholder: '9-digit mobile' },
  { name: 'Netherlands', dial: '31', placeholder: '9-digit mobile' },
  { name: 'Switzerland', dial: '41', placeholder: '9-digit mobile' },
  { name: 'Sweden', dial: '46', placeholder: '9-digit mobile' },
  { name: 'Norway', dial: '47', placeholder: '8-digit mobile' },
  { name: 'Denmark', dial: '45', placeholder: '8-digit mobile' },
  { name: 'Ireland', dial: '353', placeholder: '9-digit mobile' },
  { name: 'Russia', dial: '7', placeholder: '10-digit mobile' },
  { name: 'Turkey', dial: '90', placeholder: '10-digit mobile' },
  { name: 'Israel', dial: '972', placeholder: '9-digit mobile' },
  { name: 'Egypt', dial: '20', placeholder: '10-digit mobile' },
]

export function formatDialLabel(dial: string): string {
  if (!dial) return '+ —'
  return `+${dial}`
}

export function formatDialOptionLabel(opt: DialOption): string {
  return `${formatDialLabel(opt.dial)} ${opt.name}`
}

export function findDialOption(dial: string, name?: string): DialOption | undefined {
  const d = dial.replace(/\D/g, '')
  if (name) {
    const byBoth = LOGIN_DIAL_OPTIONS.find((o) => o.dial === d && o.name === name)
    if (byBoth) return byBoth
  }
  return LOGIN_DIAL_OPTIONS.find((o) => o.dial === d)
}

export function buildFullMobile(dial: string, local: string): string {
  const code = dial.replace(/\D/g, '')
  const digits = local.replace(/\D/g, '')
  if (!code && !digits) return ''
  if (!code) return digits
  return `${code}${digits}`
}

export function validateLocalMobile(dial: string, local: string): string | null {
  const digits = local.replace(/\D/g, '')
  if (!digits) return 'Enter your mobile number.'
  const code = dial.replace(/\D/g, '')
  if (!code) {
    if (digits.length < 10) return 'Enter a valid mobile number (at least 10 digits).'
    return null
  }
  if (digits.length < 6) return 'Enter a valid mobile number (too short).'
  if (digits.length > 12) return 'Enter a valid mobile number (too long).'
  if (code === '91' && digits.length !== 10) return 'Indian mobile numbers must be 10 digits.'
  if (code === '1' && digits.length !== 10) return 'US/Canada mobile numbers must be 10 digits.'
  return null
}
