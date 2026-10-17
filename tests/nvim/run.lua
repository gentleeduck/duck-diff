-- Minimal spec runner: `nvim --headless -l tests/nvim/run.lua [files...]`. Each spec file returns a table of
-- name -> function; a test fails by raising an error.
local root = vim.fn.fnamemodify(debug.getinfo(1, 'S').source:sub(2), ':p:h:h:h')
vim.opt.runtimepath:prepend(root)
package.path = root .. '/lua/?.lua;' .. root .. '/lua/?/init.lua;' .. package.path
-- Servers the specs start remember their repos; that goes under this run's temp folder, not the user's list.
vim.env.XDG_DATA_HOME = vim.fn.tempname()

_G.eq = function(expected, actual)
  if not vim.deep_equal(expected, actual) then
    error(('expected %s, got %s'):format(vim.inspect(expected), vim.inspect(actual)), 2)
  end
end

local files = #_G.arg > 0 and _G.arg or vim.fn.glob(root .. '/tests/nvim/*_spec.lua', false, true)
local passed, failed = 0, 0
for _, file in ipairs(files) do
  local specs = dofile(file)
  local names = vim.tbl_keys(specs)
  table.sort(names)
  for _, name in ipairs(names) do
    local ok, err = pcall(specs[name])
    if ok then
      passed = passed + 1
    else
      failed = failed + 1
      io.stdout:write(('FAIL %s > %s\n  %s\n'):format(vim.fn.fnamemodify(file, ':t'), name, err))
    end
  end
end
io.stdout:write(('%d passed, %d failed\n'):format(passed, failed))
-- os.exit skips Neovim's own cleanup, which would leave this run's repos and binary copies in /tmp.
vim.fn.delete(vim.fn.fnamemodify(vim.fn.tempname(), ':h'), 'rf')
os.exit(failed == 0 and 0 or 1)
