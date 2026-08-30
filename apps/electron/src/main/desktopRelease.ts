export interface GitHubRelease {
  tag_name?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
}

export interface DesktopRelease extends GitHubRelease {
  tag_name: string;
  html_url: string;
}

const DESKTOP_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const DESKTOP_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;

function versionParts(version: string): [number, number, number] | null {
  const match = DESKTOP_VERSION.exec(version);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** A API devolve releases da mais recente para a mais antiga. */
export function selectLatestDesktopRelease(releases: unknown): DesktopRelease | null {
  if (!Array.isArray(releases)) return null;
  return releases.find((release): release is DesktopRelease => {
    if (!release || typeof release !== 'object') return false;
    const candidate = release as GitHubRelease;
    return candidate.draft !== true
      && candidate.prerelease !== true
      && typeof candidate.tag_name === 'string'
      && DESKTOP_TAG.test(candidate.tag_name)
      && typeof candidate.html_url === 'string'
      && candidate.html_url.startsWith('https://github.com/britors/Fina/releases/');
  }) ?? null;
}

export function isNewerDesktopVersion(candidate: string, current: string): boolean {
  const next = versionParts(candidate);
  const installed = versionParts(current);
  if (!next || !installed) return false;
  for (let index = 0; index < next.length; index += 1) {
    if (next[index] !== installed[index]) return next[index] > installed[index];
  }
  return false;
}
