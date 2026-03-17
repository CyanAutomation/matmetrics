import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

export function compareDateOnlyDesc(a: string, b: string): number {
  return b.localeCompare(a)
}

export function isSameMonthAndYear(dateOnly: string, reference: Date): boolean {
  const parsed = parseDateOnly(dateOnly)
  return (
    parsed.getFullYear() === reference.getFullYear() &&
    parsed.getMonth() === reference.getMonth()
  )
}
