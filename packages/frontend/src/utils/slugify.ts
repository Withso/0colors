/**
 * Slug utilities for URL-based project routing.
 *
 * Converts project names into URL-safe slugs and resolves slugs back to projects.
 */

/** Turn an arbitrary name into a URL-safe slug. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // strip accents
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled'
  );
}

/**
 * Given a slug from the URL, find the matching project.
 *
 * If multiple projects share the same slug (duplicate names) the first match wins.
 * Falls back to partial ID match if no name match is found.
 */
export function findProjectBySlug(
  projects: { id: string; name: string }[],
  slug: string,
): { id: string; name: string } | undefined {
  // Exact name-slug match
  const byName = projects.find((p) => slugify(p.name) === slug);
  if (byName) return byName;

  // Fallback: check if slug is a project ID or starts with one
  const byId = projects.find(
    (p) => p.id === slug || p.id.startsWith(slug) || slug.startsWith(p.id),
  );
  return byId;
}
