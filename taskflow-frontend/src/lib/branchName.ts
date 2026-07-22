// Linear-style branch-name suggestion: `handle/orb-123-slugified-title`.
// Pure + unit-tested. Creating a branch with this name auto-links the task.

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function branchName(username: string, key: string, seq: number, title: string): string {
  const handle = slugify(username || 'user') || 'user'
  const ref = `${key.toLowerCase()}-${seq}`
  const titlePart = slugify(title).slice(0, 40).replace(/-+$/, '')
  return titlePart ? `${handle}/${ref}-${titlePart}` : `${handle}/${ref}`
}
