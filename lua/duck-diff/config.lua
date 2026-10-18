local M = {}

M.defaults = {
  -- Path to a duck-diff binary to use instead of downloading the release.
  binary = nil,
  -- 'app' opens a Chrome app window, 'tab' the default browser; a function receives the url.
  open = 'app',
  -- Browser command for 'app' mode; detected when nil.
  browser = nil,
  repo_url = 'https://github.com/gentleeduck/duck-diff',
  -- Token for private release downloads; GITHUB_TOKEN, GH_TOKEN or `gh auth token` are used when nil.
  github_token = nil,
  server = { idle_timeout_ms = 600000 },
  -- Make each downloaded binary git's merge tool, diff tool and rebase editor (duck-diff git-setup), where no
  -- other tool is chosen; false leaves git's config alone.
  git_setup = true,
}

local current = vim.deepcopy(M.defaults)

function M.setup(opts)
  current = vim.tbl_deep_extend('force', vim.deepcopy(M.defaults), opts or {})
  return current
end

function M.get()
  return current
end

return M
