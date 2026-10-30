// Shared by the hosted button (browser) and the skill's scripts (Node), so the links a
// visitor clicks are exactly the ones the tests cover. No dependencies on purpose.

// Offset between a time zone's wall clock and UTC at a given instant, in ms.
function zoneOffsetMs(timeZone, utcMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const value = (type) => Number(parts.find((part) => part.type === type).value);
  const wallAsUtc = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
  return wallAsUtc - utcMs;
}

// "2026-11-18" + "19:00" in "America/New_York" -> "2026-11-19T00:00:00.000Z".
// Throws on a wall time that does not exist (the spring-forward gap), rather than
// silently shifting the event by an hour.
export function zonedTimeToUtc(date, time, timeZone) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!dateMatch) throw new Error(`Date must be YYYY-MM-DD, got "${date}"`);
  if (!timeMatch) throw new Error(`Time must be HH:MM (24-hour), got "${time}"`);
  const [, year, month, day] = dateMatch.map(Number);
  const [, hour, minute] = timeMatch.map(Number);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);

  // Second pass corrects the guess when the first offset was taken on the other side of a DST change
  let utcMs = wallAsUtc - zoneOffsetMs(timeZone, wallAsUtc);
  utcMs = wallAsUtc - zoneOffsetMs(timeZone, utcMs);

  if (utcMs + zoneOffsetMs(timeZone, utcMs) !== wallAsUtc) {
    throw new Error(`${date} ${time} does not exist in ${timeZone} (clocks skip it for daylight saving)`);
  }
  return new Date(utcMs).toISOString();
}

// 2026-11-19T00:00:00.000Z -> 20261119T000000Z (Google, Yahoo and ICS format)
export function compactUtc(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// 2026-11-19T00:00:00.000Z -> 2026-11-19T00:00:00Z (Outlook deep links)
function isoNoMillis(iso) {
  return new Date(iso).toISOString().replace(/\.\d{3}/, '');
}

// Built by hand rather than with URLSearchParams, which encodes spaces as "+" and
// Outlook shows that "+" literally in the event title.
function query(params) {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value ?? '')}`)
    .join('&');
}

export function buildCalendarLinks(event) {
  const start = compactUtc(event.start);
  const end = compactUtc(event.end);
  const outlookParams = {
    subject: event.title,
    startdt: isoNoMillis(event.start),
    enddt: isoNoMillis(event.end),
    body: event.description,
    location: event.location,
    path: '/calendar/action/compose',
    rru: 'addevent',
  };
  return {
    google: `https://calendar.google.com/calendar/render?action=TEMPLATE&${query({ text: event.title })}`
      + `&dates=${start}/${end}&${query({ details: event.description, location: event.location })}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?${query(outlookParams)}`,
    office365: `https://outlook.office.com/calendar/0/deeplink/compose?${query(outlookParams)}`,
    yahoo: `https://calendar.yahoo.com/?${query({
      v: '60', title: event.title, st: start, et: end, desc: event.description, in_loc: event.location,
    })}`,
  };
}

function escapeIcsText(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// RFC 5545 caps content lines at 75 octets; Apple Calendar rejects some files that ignore it.
function foldIcsLine(line) {
  const encoder = new TextEncoder();
  const chunks = [];
  let current = '';
  for (const character of line) {
    const limit = chunks.length === 0 ? 75 : 74; // continuation lines start with a space
    if (encoder.encode(current + character).length > limit) {
      chunks.push(current);
      current = character;
    } else {
      current += character;
    }
  }
  chunks.push(current);
  return chunks.join('\r\n ');
}

export function buildIcs(event, { uid, sequence = 0, stamp = new Date().toISOString() }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//calendar-buttons//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${compactUtc(stamp)}`,
    `DTSTART:${compactUtc(event.start)}`,
    `DTEND:${compactUtc(event.end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    event.description ? `DESCRIPTION:${escapeIcsText(event.description)}` : null,
    event.location ? `LOCATION:${escapeIcsText(event.location)}` : null,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
