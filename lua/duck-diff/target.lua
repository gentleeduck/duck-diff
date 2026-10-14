local M = {}

local STATES = { [''] = 'local', ['local'] = 'local', staged = 'staged', unstaged = 'unstaged' }

local function ref(name)
  if name == '' or name:sub(1, 1) == '-' or name:find('%s') then
    error(('duck-diff: %q is not a ref'):format(name))
  end
  return name
end

---Turns `:DuckDiff` arguments into the protocol's diff target.
---@param args string
function M.parse(args)
  args = vim.trim(args or '')
  if STATES[args] then
    return { kind = STATES[args] }
  end
  local sha = args:match('^commit%s*(.*)$')
  if sha then
    return { kind = 'commit', sha = sha == '' and 'HEAD' or ref(sha) }
  end
  local from, to = args:match('^(.-)%.%.%.(.+)$')
  if from then
    return { kind = 'range', from = ref(from), to = ref(to), mode = 'merge-base' }
  end
  from, to = args:match('^(.-)%.%.(.+)$')
  if from then
    return { kind = 'range', from = ref(from), to = ref(to), mode = 'two-dot' }
  end
  -- A bare ref means "what this branch adds on top of it", the PR view.
  return { kind = 'range', from = ref(args), to = 'HEAD', mode = 'merge-base' }
end

local function encode(value)
  return (value:gsub('[^%w%-%._~]', function(char)
    return ('%%%02X'):format(char:byte())
  end))
end

function M.url(base, target)
  return base .. '&target=' .. encode(vim.json.encode(target))
end

return M
