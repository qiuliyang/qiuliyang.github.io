/**
 * Author name processing utilities for publication lists.
 *
 * Supports co-author URL linking via coauthors.yml and self-identification
 * by last name match.
 */

export interface AuthorLink {
  /** Display name exactly as it appears in the author list (contribution marks removed). */
  name: string;
  /** Profile URL from coauthors.yml, if matched. */
  url?: string;
  /** True when the last name matches the site owner's configured last name. */
  isSelf: boolean;
  /**
   * Contribution marks written after the name in BibTeX, e.g. "*" (equal contribution)
   * or "†" (corresponding author). Rendered as a superscript.
   */
  mark?: string;
}

/** Characters accepted as author contribution marks at the end of a name. */
const MARK_RE = /[*†‡§]+$/u;

/**
 * Split trailing contribution marks off an author name.
 * "Hannah Lange*" → { name: "Hannah Lange", mark: "*" }
 */
export function splitAuthorMark(author: string): { name: string; mark?: string } {
  const trimmed = author.trim();
  const m = trimmed.match(MARK_RE);
  if (!m) return { name: trimmed };
  return { name: trimmed.slice(0, -m[0].length).trim(), mark: m[0] };
}

/** Remove contribution marks from a ", "-joined author string (for metadata and search). */
export function stripAuthorMarks(authors: string): string {
  return authors
    .split(', ')
    .map((a) => splitAuthorMark(a).name)
    .join(', ');
}

/** One entry in coauthors.yml (keyed by last name). */
export interface CoauthorEntry {
  /** Author's personal or lab website URL. */
  url?: string;
  /** Google Scholar user ID. */
  scholar?: string;
  /** ORCID iD. */
  orcid?: string;
}

/** Parsed structure of src/data/coauthors.yml. */
export type CoauthorMap = Record<string, CoauthorEntry>;

/** Strip Unicode combining diacritics and lowercase a string for comparison. */
function normalizeForMatch(str: string): string {
  return str
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Annotate a list of author name strings with profile URLs and self-identification.
 *
 * Looks up each author's last name in coauthors.yml for a profile URL.
 * Matching is case- and accent-insensitive.
 *
 * @param authorList      Names in "First Last" format (output of getAuthors()).
 * @param coauthors       Parsed coauthors.yml data.
 * @param authorLastName  Site owner's last name for self-identification.
 */
export function linkAuthors(
  authorList: string[],
  coauthors: CoauthorMap,
  authorLastName: string,
): AuthorLink[] {
  const normOwner = normalizeForMatch(authorLastName);
  return authorList.map((rawAuthor) => {
    const { name: author, mark } = splitAuthorMark(rawAuthor);
    const parts = author.split(/\s+/);
    if (parts.length === 0) return { name: author, isSelf: false, mark };

    const last = parts[parts.length - 1];
    const normLast = normalizeForMatch(last);

    const isSelf = normOwner !== '' && normLast === normOwner;

    // Find coauthor entry: exact key first, then accent-normalized fallback
    const entry: CoauthorEntry | undefined =
      coauthors[last] ??
      Object.entries(coauthors).find(([k]) => normalizeForMatch(k) === normLast)?.[1];

    return { name: author, url: entry?.url, isSelf, mark };
  });
}
