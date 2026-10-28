if vim.g.loaded_duck_diff then
  return
end
vim.g.loaded_duck_diff = true

vim.api.nvim_create_user_command('DuckDiff', function(command)
  require('duck-diff.commands').run(command.args, command.fargs)
end, {
  nargs = '*',
  desc = 'Open the duck-diff viewer for a comparison',
  complete = function(lead, cmdline)
    return require('duck-diff.commands').complete(lead, cmdline)
  end,
})
