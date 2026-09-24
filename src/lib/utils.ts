import { twMerge } from 'tailwind-merge';

type ClassValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>
  | readonly ClassValue[];

function appendClassValue(value: ClassValue, classes: string[]): void {
  if (!value) return;

  if (typeof value === 'string' || typeof value === 'number') {
    classes.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => appendClassValue(item, classes));
    return;
  }

  if (typeof value === 'object') {
    Object.entries(value).forEach(([className, enabled]) => {
      if (enabled) classes.push(className);
    });
  }
}

export function cn(...inputs: ClassValue[]): string {
  const classes: string[] = [];
  inputs.forEach((input) => appendClassValue(input, classes));
  return twMerge(classes.join(' '));
}

export type DateLabelStyle =
  | 'month-year'
  | 'weekday-month-day'
  | 'weekday-month-day-year'
  | 'month-day-year'
  | 'day-month-short';

export function addCalendarDays(date: Date, amount: number): Date {
  const result = new Date(date.getTime());
  if (amount !== 0) result.setDate(result.getDate() + amount);
  return result;
}

function dateParts(
  date: Date,
  options: Intl.DateTimeFormatOptions
): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', options)
      .formatToParts(date)
      .map(({ type, value }) => [type, value])
  );
}

function ordinalDay(day: string): string {
  const value = Number(day);
  const lastTwoDigits = value % 100;
  const suffix =
    lastTwoDigits >= 11 && lastTwoDigits <= 13
      ? 'th'
      : value % 10 === 1
        ? 'st'
        : value % 10 === 2
          ? 'nd'
          : value % 10 === 3
            ? 'rd'
            : 'th';
  return `${day}${suffix}`;
}

export function formatDateLabel(date: Date, style: DateLabelStyle): string {
  switch (style) {
    case 'month-year': {
      const parts = dateParts(date, { month: 'long', year: 'numeric' });
      return `${parts.month} ${parts.year}`;
    }
    case 'weekday-month-day':
    case 'weekday-month-day-year': {
      const parts = dateParts(date, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        ...(style === 'weekday-month-day-year' && { year: 'numeric' }),
      });
      return `${parts.weekday}, ${parts.month} ${ordinalDay(parts.day)}${
        parts.year ? `, ${parts.year}` : ''
      }`;
    }
    case 'month-day-year': {
      const parts = dateParts(date, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      return `${parts.month} ${parts.day}, ${parts.year}`;
    }
    case 'day-month-short': {
      const parts = dateParts(date, { month: 'short', day: 'numeric' });
      return `${parts.day} ${parts.month}`;
    }
  }
}

export function formatRelativeDistanceToNowStrict(
  date: Date,
  now: Date = new Date()
): string {
  if (Number.isNaN(date.getTime()) || Number.isNaN(now.getTime())) {
    throw new RangeError('Invalid time value');
  }

  const comparison = date.getTime() - now.getTime();
  const dateLeft = comparison > 0 ? now : date;
  const dateRight = comparison > 0 ? date : now;
  const milliseconds = Math.abs(comparison);
  const minutes = milliseconds / 60_000;
  const timezoneOffset =
    dateRight.getTimezoneOffset() - dateLeft.getTimezoneOffset();
  const dstNormalizedMinutes = milliseconds / 60_000 - timezoneOffset;

  let unit: Intl.RelativeTimeFormatUnit;
  let value: number;
  if (minutes < 1) {
    unit = 'second';
    value = Math.round(milliseconds / 1_000);
  } else if (minutes < 60) {
    unit = 'minute';
    value = Math.round(minutes);
  } else if (minutes < 1_440) {
    unit = 'hour';
    value = Math.round(minutes / 60);
  } else if (dstNormalizedMinutes < 43_200) {
    unit = 'day';
    value = Math.round(dstNormalizedMinutes / 1_440);
  } else if (dstNormalizedMinutes < 525_600) {
    unit = 'month';
    value = Math.round(dstNormalizedMinutes / 43_200);
    if (value === 12) {
      unit = 'year';
      value = 1;
    }
  } else {
    unit = 'year';
    value = Math.round(dstNormalizedMinutes / 525_600);
  }

  if (comparison <= 0 && value === 0) return '0 seconds ago';

  const signedValue = comparison > 0 ? value : -value;
  return new Intl.RelativeTimeFormat('en-US', { numeric: 'always' }).format(
    signedValue,
    unit
  );
}

export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatLocalDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function compareDateOnlyDesc(a: string, b: string): number {
  return b.localeCompare(a);
}

export function isSameMonthAndYear(dateOnly: string, reference: Date): boolean {
  const parsed = parseDateOnly(dateOnly);
  return (
    parsed.getFullYear() === reference.getFullYear() &&
    parsed.getMonth() === reference.getMonth()
  );
}
