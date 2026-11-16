export type SkipKind = 'opening' | 'ending';

export interface SkipInterval {
  time: number;
  length: number;
}

export type SkipMarkers = Partial<Record<SkipKind, SkipInterval>>;

export function skipKind(label: unknown): SkipKind | null;

export function seconds(value: unknown): number | null;

export function normalizeSkips(raw: unknown, duration?: number): SkipMarkers;

export function mergeSkips(...sources: unknown[]): SkipMarkers;

export function parseSkipTimes(raw: unknown): SkipMarkers;

export function providerSkips(data: unknown, html?: string): SkipMarkers;

export function metadataSkips(raw: unknown): SkipMarkers;

export function hlsSkips(text: string): SkipMarkers;

export function activeSkip(
  skips: unknown,
  position: number,
  duration?: number
): (SkipInterval & { kind: SkipKind }) | null;
