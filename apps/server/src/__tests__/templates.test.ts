import { afterEach, describe, expect, it } from 'bun:test'
import { createRepo, type TestRepo } from '@duck-diff/testing'
import { readTemplates } from '../templates'

let repo: TestRepo
afterEach(() => repo.cleanup())

describe('readTemplates', () => {
  it('reads Markdown templates, issue forms and the pull request template from the checkout', () => {
    repo = createRepo()
    repo.write(
      '.github/ISSUE_TEMPLATE/bug.md',
      '---\nname: Bug report\nabout: Something broke\ntitle: "[bug] "\nlabels: bug, triage\nassignees: octo\n---\n## Steps\n',
    )
    repo.write(
      '.github/ISSUE_TEMPLATE/feature.yml',
      [
        'name: Feature',
        'description: An idea',
        'labels: [enhancement]',
        'body:',
        '  - type: markdown',
        '    attributes: { value: "Thanks!" }',
        '  - type: input',
        '    id: what',
        '    attributes: { label: What, placeholder: "One line" }',
        '    validations: { required: true }',
        '  - type: dropdown',
        '    id: area',
        '    attributes: { label: Area, options: [web, server] }',
        '  - type: checkboxes',
        '    id: terms',
        '    attributes: { label: Terms, options: [{ label: I searched first }] }',
      ].join('\n'),
    )
    repo.write('.github/ISSUE_TEMPLATE/config.yml', 'blank_issues_enabled: true\n')
    repo.write('.github/PULL_REQUEST_TEMPLATE.md', '## Why\n')
    const templates = readTemplates(repo.path)
    expect(templates.pull).toBe('## Why\n')
    expect(templates.issue.map((template) => template.name)).toEqual(['Bug report', 'Feature'])
    expect(templates.issue[0]).toMatchObject({
      title: '[bug] ',
      labels: ['bug', 'triage'],
      assignees: ['octo'],
      body: '## Steps\n',
    })
    expect(templates.issue[1]?.form.map((field) => [field.type, field.label, field.options, field.required])).toEqual([
      ['markdown', '', [], false],
      ['input', 'What', [], true],
      ['dropdown', 'Area', ['web', 'server'], false],
      ['checkboxes', 'Terms', ['I searched first'], false],
    ])
  })

  it('has nothing to offer in a repo without templates', () => {
    repo = createRepo()
    expect(readTemplates(repo.path)).toEqual({ issue: [], pull: null })
  })
})
