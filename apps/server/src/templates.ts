import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FormField, IssueTemplate, Templates } from '@duck-diff/protocol'

const PULL_TEMPLATES = [
  '.github/pull_request_template.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  'pull_request_template.md',
  'PULL_REQUEST_TEMPLATE.md',
  'docs/pull_request_template.md',
  'docs/PULL_REQUEST_TEMPLATE.md',
]

const list = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string'
      ? value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : []

const text = (value: unknown) => (typeof value === 'string' ? value : value === undefined ? '' : String(value))

// "---\nname: Bug\n---\nbody" -> front matter and body.
function frontMatter(source: string): { meta: Record<string, unknown>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source)
  if (!match) return { meta: {}, body: source }
  return { meta: (Bun.YAML.parse(match[1] ?? '') as Record<string, unknown>) ?? {}, body: match[2] ?? '' }
}

interface RawFormItem {
  type?: string
  id?: string
  attributes?: Record<string, unknown>
  validations?: { required?: boolean }
}

function formField(item: RawFormItem, index: number): FormField | null {
  const type = item.type
  if (type !== 'markdown' && type !== 'input' && type !== 'textarea' && type !== 'dropdown' && type !== 'checkboxes')
    return null
  const attributes = item.attributes ?? {}
  const options = Array.isArray(attributes.options)
    ? attributes.options.map((option) =>
        typeof option === 'object' && option ? text((option as { label?: unknown }).label) : text(option),
      )
    : []
  return {
    type,
    id: item.id ?? `field-${index}`,
    label: text(attributes.label),
    description: text(attributes.description),
    placeholder: text(attributes.placeholder),
    value: type === 'markdown' ? text(attributes.value) : text(attributes.value ?? attributes.render ?? ''),
    options,
    required: Boolean(item.validations?.required),
  }
}

// The repo's own templates, read from the checkout, as GitHub offers them when an issue or pull request opens.
export function readTemplates(repo: string): Templates {
  const folder = join(repo, '.github', 'ISSUE_TEMPLATE')
  const issue: IssueTemplate[] = []
  if (existsSync(folder)) {
    for (const file of readdirSync(folder).sort()) {
      if (file === 'config.yml' || file === 'config.yaml') continue
      const source = readFileSync(join(folder, file), 'utf8')
      if (file.endsWith('.md')) {
        const { meta, body } = frontMatter(source)
        issue.push({
          file,
          name: text(meta.name) || file,
          about: text(meta.about),
          title: text(meta.title),
          labels: list(meta.labels),
          assignees: list(meta.assignees),
          body,
          form: [],
        })
      } else if (file.endsWith('.yml') || file.endsWith('.yaml')) {
        const form = (Bun.YAML.parse(source) as Record<string, unknown>) ?? {}
        issue.push({
          file,
          name: text(form.name) || file,
          about: text(form.description),
          title: text(form.title),
          labels: list(form.labels),
          assignees: list(form.assignees),
          body: null,
          form: ((form.body as RawFormItem[] | undefined) ?? []).flatMap((item, index) => formField(item, index) ?? []),
        })
      }
    }
  }
  const pullFile = PULL_TEMPLATES.find((path) => existsSync(join(repo, path)))
  return { issue, pull: pullFile ? readFileSync(join(repo, pullFile), 'utf8') : null }
}
