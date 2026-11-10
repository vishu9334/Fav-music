import { randomInt } from 'node:crypto';

/** Four readable initials plus two digits; IDs already use TEXT, so no schema change is needed. */
export function roomCodePrefix(displayName: string): string {
  const words = displayName.normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase().match(/[A-Z]+/g) ?? [];
  if (!words.length) return 'ROOM';
  if (words.length === 1) return words[0]!.slice(0, 4).padEnd(4, 'X');
  return words[0]!.slice(0, 2).padEnd(2, 'X') + words[words.length - 1]!.slice(0, 2).padEnd(2, 'X');
}

export function roomCodeCandidates(displayName: string): string[] {
  const prefix = roomCodePrefix(displayName);
  const suffixes = Array.from({ length: 100 }, (_, i) => i);
  for (let i = suffixes.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [suffixes[i], suffixes[j]] = [suffixes[j]!, suffixes[i]!];
  }
  return suffixes.map(value => `${prefix}${value.toString().padStart(2, '0')}`);
}

export function normalizeRoomId(value: string): string {
  const trimmed = value.trim();
  return /^[a-z]{4}\d{2}$/i.test(trimmed) ? trimmed.toUpperCase() : trimmed;
}
