export function timeToRow(iso: string, dayStartHour: number): number {
  const d = new Date(iso);
  const minutes = (d.getUTCHours() - dayStartHour) * 60 + d.getUTCMinutes();
  return Math.floor(minutes / 30) + 1;
}

export function blockRows(startsAt: string, endsAt: string, dayStartHour: number) {
  return { rowStart: timeToRow(startsAt, dayStartHour), rowEnd: timeToRow(endsAt, dayStartHour) };
}

export function columnsForSpaces(spaces: { id: string; name: string }[]) {
  return spaces.map((s, i) => ({ ...s, index: i + 2 }));
}
