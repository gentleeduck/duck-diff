local M = {}

local STATES = { [''] = 'local', ['local'] = 'local', staged = 'staged', unstaged = 'unstaged' }

local function ref(name)
  if name == '' or name:sub(1, 1) == '-' or name:find('%s') then
    error(('%q is not a ref'):format(name), 0)
  end
  return name
end

---Turns `:DuckDiff` arguments into the protocol's diff target.
---@param args string
function M.parse(args)
  args = vim.trim(args or '')
  -- `diff <target>` is a diff even for a ref named like a view, as the command line takes it.
  args = args == 'diff' and '' or args:match('^diff%s+(.+)$') or args
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

-- Opened by name, as apps/server/src/args.ts VIEWS; anything else is a diff target.
M.VIEWS = { 'graph', 'files', 'prs', 'issues', 'inbox', 'releases', 'actions', 'discussions', 'security', 'insights', 'merge' }

-- A file named from inside the repo is read from `cwd`, as git does; one that lands outside (or with no root
-- given) is taken as the repo's own path.
local function from_root(file, root, cwd)
  if not root then
    return file
  end
  -- A name such as $USER.tsx is a file's own name, not a variable.
  local full = vim.fs.normalize(file:sub(1, 1) == '/' and file or cwd .. '/' .. file, { expand_env = false })
  if vim.startswith(full, root .. '/') then
    return full:sub(#root + 2)
  end
  return file
end

---The page path for a view named by `:DuckDiff` words, or nil when they name a diff.
---@param words string[] as Neovim splits the command's arguments, so `my\ file.txt` is one word
---@param root? string the repo, to read a file's path from `cwd`
---@param cwd? string
function M.view(words, root, cwd)
  local name, arg = words[1], words[2]
  if not vim.tbl_contains(M.VIEWS, name) then
    return nil
  end
  if #words > 2 then
    error(('%s takes at most one argument'):format(name), 0)
  end
  if name == 'prs' or name == 'issues' then
    if not arg then
      return '/' .. name
    end
    local number = tonumber((arg:gsub('^#', '')))
    if not number or number <= 0 or number % 1 ~= 0 then
      error(('%s needs a number, like %s 12'):format(name, name), 0)
    end
    return ('/%s/%d'):format(name, number)
  end
  if name == 'files' and arg then
    -- path:line opens the file at that line, as editors take it.
    local file, line = arg:match('^(.+):(%d+)$')
    return '/files?file=' .. encode(from_root(file or arg, root, cwd)) .. (line and '&line=' .. line or '')
  end
  if arg then
    error(('%s takes no argument'):format(name), 0)
  end
  return '/' .. name
end

---@param server { origin: string, token: string }
function M.page_url(server, path)
  return server.origin .. path .. (path:find('?', 1, true) and '&' or '?') .. 'token=' .. server.token
end

return M
