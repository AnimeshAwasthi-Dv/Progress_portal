export function zonedWallTimeToIso(date: string, time: string, timeZone: string) {
  const dateParts = date.split("-").map(Number);
  const timeParts = time.split(":").map(Number);
  if (dateParts.length !== 3 || timeParts.length !== 2 || [...dateParts, ...timeParts].some((part) => !Number.isInteger(part)) || dateParts[0] < 1 || dateParts[1] < 1 || dateParts[1] > 12 || dateParts[2] < 1 || dateParts[2] > 31 || timeParts[0] < 0 || timeParts[0] > 23 || timeParts[1] < 0 || timeParts[1] > 59) {
    throw new Error("Enter a valid meeting date and time.");
  }
  const [year, month, day] = dateParts;
  const [hour, minute] = timeParts;
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = targetUtc;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(candidate));
    const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    candidate -= Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute) - targetUtc;
  }
  const verifiedParts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(candidate));
  const verified = Object.fromEntries(verifiedParts.map((part) => [part.type, Number(part.value)]));
  if (verified.year !== year || verified.month !== month || verified.day !== day || verified.hour !== hour || verified.minute !== minute) {
    throw new Error("That local time does not exist in the selected time zone. Choose another time.");
  }
  return new Date(candidate).toISOString();
}
