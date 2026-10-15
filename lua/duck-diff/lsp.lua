-- Answers the page's go-to-definition, references and hover with this editor's own language clients, so
-- duck-diff shows what Neovim would and starts no second server. Called by the server through --remote-expr.
local M = {}

local METHODS = {
  definition = 'textDocument/definition',
  references = 'textDocument/references',
  hover = 'textDocument/hover',
}

local function supporting(buf, method)
  return vim.tbl_filter(function(client)
    return client.initialized and client:supports_method(method, buf)
  end, vim.lsp.get_clients({ bufnr = buf }))
end

-- query: { file = absolute path, kind = 'definition'|'references'|'hover', line = 0-based, character = UTF-16 }
function M.query(json)
  local q = vim.json.decode(json)
  local method = METHODS[q.kind]
  if not method or vim.fn.filereadable(q.file) == 0 then
    return vim.json.encode({ results = {} })
  end
  local buf = vim.fn.bufadd(q.file)
  vim.fn.bufload(buf)
  -- A buffer loaded off screen has no filetype yet, and the filetype is what attaches clients.
  if vim.bo[buf].filetype == '' then
    local filetype = vim.filetype.match({ buf = buf })
    if filetype then
      vim.bo[buf].filetype = filetype
    end
  end
  vim.wait(q.wait or 4000, function()
    return #supporting(buf, method) > 0
  end, 20)
  local clients = supporting(buf, method)
  if #clients == 0 then
    return vim.json.encode({ results = {} })
  end
  local line = vim.api.nvim_buf_get_lines(buf, q.line, q.line + 1, false)[1] or ''
  local ok, byte = pcall(vim.str_byteindex, line, 'utf-16', q.character, false)
  byte = ok and byte or q.character
  local results = {}
  for _, client in ipairs(clients) do
    local params = {
      textDocument = { uri = vim.uri_from_bufnr(buf) },
      position = { line = q.line, character = vim.str_utfindex(line, client.offset_encoding, byte, false) },
    }
    if q.kind == 'references' then
      params.context = { includeDeclaration = true }
    end
    local response = client:request_sync(method, params, q.timeout or 8000, buf)
    if response and response.result ~= nil and response.result ~= vim.NIL and not response.err then
      table.insert(results, { server = client.name, encoding = client.offset_encoding, result = response.result })
    end
  end
  return vim.json.encode({ results = results })
end

return M
