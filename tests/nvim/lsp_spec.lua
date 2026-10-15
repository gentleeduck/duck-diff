local lsp = require('duck-diff.lsp')

-- An in-process language server: no binary needed, and it records what it was asked.
local function fake_server(asked)
  return function(dispatchers)
    local closing = false
    local id = 0
    return {
      request = function(method, params, callback)
        id = id + 1
        if method == 'initialize' then
          callback(nil, { capabilities = { positionEncoding = 'utf-8', definitionProvider = true, referencesProvider = true, hoverProvider = true } })
        elseif method == 'textDocument/definition' then
          table.insert(asked, params.position)
          callback(nil, { uri = params.textDocument.uri, range = { start = { line = 0, character = 6 }, ['end'] = { line = 0, character = 9 } } })
        elseif method == 'textDocument/hover' then
          callback(nil, { contents = { kind = 'markdown', value = 'the docs' } })
        elseif method == 'shutdown' then
          callback(nil, nil)
        end
        return true, id
      end,
      notify = function(method)
        if method == 'exit' then
          closing = true
          dispatchers.on_exit(0, 15)
        end
        return true
      end,
      is_closing = function()
        return closing
      end,
      terminate = function()
        closing = true
      end,
    }
  end
end

local function file(lines, extension)
  local path = vim.fn.tempname() .. extension
  vim.fn.writefile(lines, path)
  return vim.fn.resolve(path)
end

return {
  ['asks the clients attached for the file type and converts the column'] = function()
    local asked = {}
    local group = vim.api.nvim_create_augroup('duck-diff-lsp-test', { clear = true })
    vim.api.nvim_create_autocmd('FileType', {
      group = group,
      pattern = 'lua',
      callback = function(args)
        vim.lsp.start({ name = 'fake', cmd = fake_server(asked), root_dir = vim.fn.fnamemodify(args.file, ':h') }, { bufnr = args.buf })
      end,
    })
    local path = file({ 'local é = 1', 'return é' }, '.lua')
    -- UTF-16 column 8 is past the é, which this client counts in bytes.
    local out = vim.json.decode(lsp.query(vim.json.encode({ file = path, kind = 'definition', line = 1, character = 8 })))
    eq(1, #out.results)
    eq('fake', out.results[1].server)
    eq(vim.uri_from_fname(path), out.results[1].result.uri)
    local client = vim.lsp.get_clients({ name = 'fake' })[1]
    eq('utf-8', client.offset_encoding)
    eq(9, asked[1].character)
    local hover = vim.json.decode(lsp.query(vim.json.encode({ file = path, kind = 'hover', line = 0, character = 6 })))
    eq('the docs', hover.results[1].result.contents.value)
    vim.api.nvim_del_augroup_by_id(group)
    client:stop(true)
  end,

  ['answers nothing when no client handles the file'] = function()
    local path = file({ 'plain' }, '.duckless')
    local out = vim.json.decode(lsp.query(vim.json.encode({ file = path, kind = 'definition', line = 0, character = 0, wait = 50 })))
    eq({}, out.results)
  end,

  ['answers nothing for a missing file or an unknown kind'] = function()
    eq({}, vim.json.decode(lsp.query(vim.json.encode({ file = '/nope/x.lua', kind = 'definition', line = 0, character = 0 }))).results)
    local path = file({ 'x' }, '.lua')
    eq({}, vim.json.decode(lsp.query(vim.json.encode({ file = path, kind = 'rename', line = 0, character = 0 }))).results)
  end,
}
