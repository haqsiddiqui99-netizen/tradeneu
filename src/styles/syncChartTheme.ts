export type ChartUiTheme = 'light' | 'dark'

/** Read active chart chrome theme from the workspace root. */
export function readChartUiTheme(): ChartUiTheme {
  const theme = document.querySelector('.rw-root')?.getAttribute('data-chart-theme')
  return theme === 'light' ? 'light' : 'dark'
}

/** Apply chart theme to a popover/menu element attached to document.body. */
export function syncChartThemeToElement(el: HTMLElement): void {
  el.setAttribute('data-chart-theme', readChartUiTheme())
}
