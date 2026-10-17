// The top bar is a container named "top". Below these widths a button drops its words and becomes a 28px
// square icon, the size of every icon button; a count moves to a badge on its corner. The ! beats the
// button's own padding for buttons with an icon.
export const LABEL = { wide: 'hidden @7xl/top:inline', mid: 'hidden @6xl/top:inline' }
export const ICON_ONLY = {
  wide: '@max-7xl/top:size-7 @max-7xl/top:px-0!',
  mid: '@max-6xl/top:size-7 @max-6xl/top:px-0!',
}
// The same, measured against the compare section of the bar (its own container), which shares the bar
// with the search box and buttons.
export const COMPARE = {
  label: 'hidden @4xl:inline',
  icon: '@max-4xl:size-7 @max-4xl:px-0!',
  count:
    '@max-4xl:absolute @max-4xl:-end-1.5 @max-4xl:-top-1.5 @max-4xl:h-auto @max-4xl:border-transparent @max-4xl:bg-tn-yellow @max-4xl:px-1 @max-4xl:py-0 @max-4xl:text-[0.7em] @max-4xl:text-background @max-4xl:leading-[1.4]',
}
export const COUNT = {
  wide: '@max-7xl/top:absolute @max-7xl/top:-end-1.5 @max-7xl/top:-top-1.5 @max-7xl/top:h-auto @max-7xl/top:border-transparent @max-7xl/top:bg-info @max-7xl/top:px-1 @max-7xl/top:py-0 @max-7xl/top:text-[0.7em] @max-7xl/top:text-background @max-7xl/top:leading-[1.4]',
  mid: '@max-6xl/top:absolute @max-6xl/top:-end-1.5 @max-6xl/top:-top-1.5 @max-6xl/top:h-auto @max-6xl/top:border-transparent @max-6xl/top:bg-tn-yellow @max-6xl/top:px-1 @max-6xl/top:py-0 @max-6xl/top:text-[0.7em] @max-6xl/top:text-background @max-6xl/top:leading-[1.4]',
}
