export function isRfc3339(value) {
    const match = typeof value === 'string' && !value.endsWith('-00:00')
        ? value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+\-](\d{2}):(\d{2}))$/)
        : null;
    if (!match) return false;

    const [year, month, day, hour, minute, second] = match
        .slice(1, 7)
        .map((part) => Number(part));
    const offsetHour = Number(match[7] ?? 0);
    const offsetMinute = Number(match[8] ?? 0);
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    return year >= 1
        && month >= 1
        && month <= 12
        && day >= 1
        && day <= daysInMonth[month - 1]
        && hour <= 23
        && minute <= 59
        && second <= 59
        && offsetHour <= 14
        && offsetMinute <= 59
        && (offsetHour < 14 || offsetMinute === 0);
}
