// Работа с датами в формате YYYY-MM-DD. Длительность — в календарных днях, включая обе границы.

const DAY_MS = 86_400_000

const toUtc = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10)

export const addDays = (d: string, n: number) => fromUtc(toUtc(d) + n * DAY_MS)
export const daysBetween = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS)
export const lengthDays = (start: string, end: string) => daysBetween(start, end) + 1

export interface Period {
  start_date: string
  end_date: string
}

export const overlaps = (a: Period, b: Period) => a.start_date <= b.end_date && b.start_date <= a.end_date
export const covers = (p: Period, day: string) => p.start_date <= day && day <= p.end_date

export function* eachDay(p: Period) {
  for (let d = p.start_date; d <= p.end_date; d = addDays(d, 1)) yield d
}

// Дата отметки времени (например, подачи заявления) по времени Минска
const minskDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Minsk' })
export const localDate = (timestamp: string) => minskDate.format(new Date(timestamp))

export const formatDate = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`
export const formatPeriod = (p: Period) => `${formatDate(p.start_date)} – ${formatDate(p.end_date)}`
