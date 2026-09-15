/** Convert ASCII digits to Persian digits. */
export function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]!)
}

function startOfLocalDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return startOfLocalDay(a).getTime() === startOfLocalDay(b).getTime()
}

/** Full Jalali date for headers, e.g. شنبه ۱۰ مرداد ۱۴۰۴ */
export function formatJalaliDateLong(date: Date = new Date()): string {
  const formatted = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
  return toPersianDigits(formatted)
}

/** Short Jalali date, e.g. ۱۴۰۴/۰۵/۱۰ */
export function formatJalaliDateShort(date: Date): string {
  const formatted = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  return toPersianDigits(formatted)
}

export function formatTimeFa(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return toPersianDigits(`${h}:${m}`)
}

/**
 * Time only when on the same calendar day as `referenceDay`;
 * if exactly the next day, append (فردا); otherwise Jalali date + time.
 */
export function formatShiftMoment(date: Date, referenceDay: Date): string {
  const time = formatTimeFa(date)
  if (isSameLocalDay(date, referenceDay)) {
    return time
  }

  const nextDay = startOfLocalDay(referenceDay)
  nextDay.setDate(nextDay.getDate() + 1)
  if (isSameLocalDay(date, nextDay)) {
    return `${time} (فردا)`
  }

  return `${formatJalaliDateShort(date)} ${time}`
}

export function formatShiftDurationLabelFa(hours: number): string {
  const labels: Record<number, string> = {
    8: 'شیفت هشت ساعته',
    12: 'شیفت ۱۲ ساعته',
    16: 'شیفت ۱۶ ساعته',
    24: 'شیفت ۲۴ ساعته',
  }
  return toPersianDigits(labels[hours] || `شیفت ${hours} ساعته`)
}
