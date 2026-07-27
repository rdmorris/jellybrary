// Checkout quality profiles. Transcodes are performed by the PRIMARY Jellyfin server
// via its stream API, using whatever hardware acceleration it has configured.

export interface TranscodeProfile {
  label: string
  maxHeight: number
  videoBitRate: number // bits/sec
  audioBitRate: number
}

export const TRANSCODE_PROFILES: Record<string, TranscodeProfile> = {
  '1080p': { label: '1080p HEVC', maxHeight: 1080, videoBitRate: 5_000_000, audioBitRate: 192_000 },
  '720p': { label: '720p HEVC', maxHeight: 720, videoBitRate: 2_500_000, audioBitRate: 128_000 },
}

export type ProfileName = 'original' | keyof typeof TRANSCODE_PROFILES

export function isValidProfile(p: string): p is ProfileName {
  return p === 'original' || p in TRANSCODE_PROFILES
}

/** Rough output size from stream duration; used for space planning and progress. */
export function estimateBytes(profile: string, runTimeTicks?: number): number {
  const spec = TRANSCODE_PROFILES[profile]
  if (!spec || !runTimeTicks) return 0
  const seconds = runTimeTicks / 10_000_000
  return Math.round(((spec.videoBitRate + spec.audioBitRate) / 8) * seconds)
}
