// The top bar is a container named "top". Below these widths a button drops its words and becomes a 28px
// square icon, the size of every icon button; a count moves to a badge on its corner. The ! beats the
// button's own padding for buttons with an icon.
export const LABEL = { wide: 'hidden @7xl/top:inline', mid: 'hidden @6xl/top:inline' }
export const ICON_ONLY = {
  wide: '@max-7xl/top:size-7 @max-7xl/top:px-0!',
  mid: '@max-6xl/top:size-7 @max-6xl/top:px-0!',
}
export const COUNT = {
  mid: '@max-6xl/top:absolute @max-6xl/top:-end-1.5 @max-6xl/top:-top-1.5 @max-6xl/top:rounded-full @max-6xl/top:bg-tn-yellow @max-6xl/top:px-1 @max-6xl/top:text-[0.7em] @max-6xl/top:text-background @max-6xl/top:leading-[1.4]',
}
