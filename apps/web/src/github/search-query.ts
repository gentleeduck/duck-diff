// GitHub's search box text, edited qualifier by qualifier the way its filter menus do.
const TOKEN = /\S+:"[^"]*"|\S+/g

const quote = (value: string) => (/[\s"]/.test(value) ? `"${value.replace(/"/g, '')}"` : value)

export function tokens(query: string): string[] {
  return query.match(TOKEN) ?? []
}

// The values a qualifier has in the query, unquoted: label:"area: web" -> ["area: web"].
export function valuesOf(query: string, key: string): string[] {
  return tokens(query)
    .filter((token) => token.startsWith(`${key}:`))
    .map((token) => token.slice(key.length + 1).replace(/^"|"$/g, ''))
}

// Sets a single-valued qualifier (author, assignee, milestone, review), or clears it with null.
export function setQualifier(query: string, key: string, value: string | null): string {
  const kept = tokens(query).filter((token) => !token.startsWith(`${key}:`))
  return [...kept, ...(value === null ? [] : [`${key}:${quote(value)}`])].join(' ')
}

// Adds or removes one value of a qualifier that can repeat, like label.
export function toggleQualifier(query: string, key: string, value: string): string {
  const has = valuesOf(query, key).includes(value)
  const kept = tokens(query).filter(
    (token) => !(token.startsWith(`${key}:`) && token.slice(key.length + 1).replace(/^"|"$/g, '') === value),
  )
  return [...kept, ...(has ? [] : [`${key}:${quote(value)}`])].join(' ')
}
