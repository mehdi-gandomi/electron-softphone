/** National codes are 10-digit strings; keep leading zeros. */

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

function toAsciiDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (ch) => {
    const persian = PERSIAN_DIGITS.indexOf(ch)
    if (persian >= 0) return String(persian)
    const arabic = ARABIC_DIGITS.indexOf(ch)
    return arabic >= 0 ? String(arabic) : ch
  })
}

export function normalizeNationalCode(value: string | null | undefined): string {
  const trimmed = toAsciiDigits(String(value || '').trim())
  if (/^\d{1,10}$/.test(trimmed)) return trimmed.padStart(10, '0')
  return trimmed
}

export function nationalCodesEqual(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = normalizeNationalCode(a)
  const right = normalizeNationalCode(b)
  return Boolean(left && right && left === right)
}
