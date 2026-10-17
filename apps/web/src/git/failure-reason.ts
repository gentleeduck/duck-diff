// What a failed git command's toast says: the reason in a sentence. Everything git and the hooks printed is
// in Output, which a failure opens.
export function failureReason(message: string): string {
  // Colour codes from hooks and tools: the escape character, then its [..m tail.
  const plain = message.replaceAll('\u001b', '').replace(/\[[0-9;]*m/g, '')
  const lines = plain
    .replace(/^git [\w-]+ exited \d+:\s*/, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const text = lines.join('\n')
  if (/\[rejected\]|non-fast-forward|fetch first/.test(text))
    return 'The remote has commits you do not have. Pull, then try again.'
  if (/permission denied|authentication failed|could not read username/i.test(text))
    return 'The remote refused your credentials.'
  if (/could not resolve host|connection (timed out|refused)|unable to access/i.test(text))
    return 'Could not reach the remote.'
  // Git ends with one generic line; whatever ran before it (a hook, a check) is what failed.
  if (/hook/i.test(text) || (/failed to push some refs/.test(text) && lines.length > 1))
    return 'A git hook failed, so nothing went through.'
  const last = (lines.findLast((line) => /^(fatal|error):/.test(line)) ?? lines.at(-1) ?? message).replace(
    /^(fatal|error):\s*/,
    '',
  )
  return last.charAt(0).toUpperCase() + last.slice(1)
}
