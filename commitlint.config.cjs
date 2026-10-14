/**
 * Commit message rules.
 *
 * This config existed before but never ran: neither commitlint nor husky was
 * installed, and core.hooksPath was unset, so .husky/commit-msg was inert. The
 * hook is only worth having if it executes, so both are now devDependencies and
 * `prepare` runs husky on every install.
 */

/**
 * Reject anything outside printable ASCII.
 *
 * Em dashes, curly quotes, arrows and ellipsis characters get into commit
 * messages easily and are a nuisance afterwards: they break `grep` against what
 * you actually typed, render differently across terminals and mail clients, and
 * turn into mojibake wherever the encoding is not honoured. Plain ASCII costs a
 * hyphen instead of a dash and nothing else.
 *
 * The check runs against the raw message, so it covers the subject and the body.
 */
const localRules = {
  rules: {
    'ascii-only': (parsed) => {
      const raw = parsed.raw ?? ''
      // Checked by codepoint rather than a regex: writing the ASCII range as a
      // character class means putting literal control characters in the pattern,
      // which is itself a lint error, and this reads more plainly anyway.
      const TAB = 9
      const LINE_FEED = 10
      const CARRIAGE_RETURN = 13
      const FIRST_PRINTABLE = 32
      const LAST_PRINTABLE = 126
      const offenders = [
        ...new Set(
          [...raw].filter((ch) => {
            const code = ch.codePointAt(0) ?? 0
            if (code === TAB || code === LINE_FEED || code === CARRIAGE_RETURN) return false
            return code < FIRST_PRINTABLE || code > LAST_PRINTABLE
          }),
        ),
      ]
      return [
        offenders.length === 0,
        `commit message must be plain ASCII. Replace: ${offenders
          .map((ch) => `${ch} (U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`)
          .join(', ')}`,
      ]
    },

    /**
     * The rule is in CLAUDE.md and had no gate behind it, so 43 commits on one
     * branch carry the trailer and cannot be rewritten now that they are pushed.
     */
    'no-co-authored-by': (parsed) => [
      !/^co-authored-by:/im.test(parsed.raw ?? ''),
      'commit message must not carry a Co-Authored-By trailer',
    ],
  },
}

/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: [localRules],
  rules: {
    'ascii-only': [2, 'always'],
    'no-co-authored-by': [2, 'always'],
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'chore', 'refactor', 'perf', 'test', 'build', 'ci', 'style', 'revert'],
    ],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [2, 'always', 200],
  },
}
