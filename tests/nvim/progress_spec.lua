local progress = require('duck-diff.progress')

-- The same cases as apps/server/src/__tests__/cli-ui.test.ts, so the plugin draws what duck-diff update draws.
return {
  ['writes sizes the way a person reads them'] = function()
    eq({ '512 B', '1.5 KB', '96.4 MB' }, { progress.bytes(512), progress.bytes(1536), progress.bytes(101082726) })
  end,

  ['draws a download as a bar, a share, the sizes, the speed and the time left'] = function()
    local mb = 1024 * 1024
    eq('█████░░░░░  50%  40.0 MB / 80.0 MB  10.0 MB/s  4s left', progress.line(40 * mb, 80 * mb, 4000, 10))
    assert(progress.line(mb, 200 * mb, 1000, 4):find('  3m 19s left$'))
    eq('3.0 MB  3.0 MB/s', progress.line(3 * mb, nil, 1000, 10))
    -- Too narrow for a bar: the numbers alone.
    eq('25%  1.0 KB / 4.0 KB  1.0 KB/s  3s left', progress.line(1024, 4096, 1000, 3))
  end,
}
