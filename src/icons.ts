/** Inline SVGs — stroke icons, currentColor for theming. */

const svg = (inner: string, w = 20, h = 20) =>
  `<svg class="sx-ico" width="${w}" height="${h}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`

export const icons = {
  chart: svg(
    '<path d="M4 19h16M6 17V9m4 8V5m4 12v-6m4 6v-9" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  camera: svg(
    '<path d="M4 8h2l2-3h8l2 3h2a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2v-8a2 2 0 012-2z" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.25" stroke="currentColor" stroke-width="1.65"/>',
  ),
  compass: svg(
    '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.65"/><polygon points="12,6 17.2,16.5 6.8,16.5" stroke="currentColor" stroke-width="1.65" fill="none" stroke-linejoin="round"/><circle cx="12" cy="13" r="1.35" fill="currentColor"/>',
  ),
  swords: svg(
    '<path d="M4.5 4.5l6 6M10.5 4.5l-6 6M14 14l5.5 5.5M19.5 14L14 19.5" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/><circle cx="7.5" cy="7.5" r="1.25" fill="currentColor"/><circle cx="16.5" cy="16.5" r="1.25" fill="currentColor"/>',
  ),
  gradCap: svg(
    '<path d="M4.5 10.5 12 7l7.5 3.5L12 14 4.5 10.5zM4.5 10.5V16a7.5 7.5 0 0015 0v-5.5" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/>',
  ),
  gear: svg(
    '<path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" stroke-width="1.65"/><path d="M12 1.5v2.2M12 20.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M1.5 12h2.2M20.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>',
  ),
  layout: svg(
    '<rect x="3" y="3" width="7" height="7" rx="1.25" stroke="currentColor" stroke-width="1.65"/><rect x="14" y="3" width="7" height="7" rx="1.25" stroke="currentColor" stroke-width="1.65"/><rect x="3" y="14" width="18" height="7" rx="1.25" stroke="currentColor" stroke-width="1.65"/>',
  ),
  stack: svg(
    '<path d="M12 3 4 7l8 4 8-4-8-4zM4 12l8 4 8-4M4 17l8 4 8-4" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  swap: svg(
    '<path d="M7 16V4M7 4 4 7M7 4l3 3M17 8v12M17 20l3-3M17 20l-3-3" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  pie: svg(
    '<path d="M12 12V3a9 9 0 019 9h-9z" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/><path d="M12 12H3a9 9 0 009 9v-9z" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round" opacity=".4"/>',
  ),
  bolt: svg(
    '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/>',
  ),
  chevronDown: svg('<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>', 12, 12),
  chevronUp: svg(
    '<path d="M6 15l6-6 6 6" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>',
    12,
    12,
  ),
  help: svg(
    '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.65"/><path d="M9.5 9.5a2.5 2.5 0 015 0c0 2-2.5 2-2.5 4M12 17h.01" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>',
  ),
  spark: svg(
    '<path d="M12 3l1.2 4.2L17.4 8l-4.2.8L12 13l-1.2-4.2L6.6 8l4.2-.8L12 3zM19 14l.7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14zM5 16l.5 1.5L7 18l-1.5.5L5 20l-.5-1.5L3 18l1.5-.5L5 16z" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/>',
  ),
  moon: svg(
    '<path d="M21 14.5A8.5 8.5 0 019.5 3a8.5 8.5 0 1011.5 11.5z" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/>',
  ),
  sun: svg(
    '<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.65"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 6.34L4.93 4.93M19.07 19.07l-1.41-1.41M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>',
  ),
  expand: svg(
    '<path d="M9 3H3v6M15 3h6v6M21 15v6h-6M3 15v6h6" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  /** Compact plus — compare / add symbol (chart toolbar). */
  plus: svg(
    '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>',
    18,
    18,
  ),
  plusLg: `<svg class="sx-ico sx-ico--xl" width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  trophy: `<svg class="sx-ico sx-ico--xl" width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M8 21h8M12 17v4M6 3h12v4a4 4 0 01-4 4h-4a4 4 0 01-4-4V3zM6 5H4a2 2 0 000 4h2M18 5h2a2 2 0 010 4h-2" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  info: svg(
    '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.45"/><path d="M12 16v-5M12 8h.01" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>',
    16,
    16,
  ),
  play: svg('<path d="M9.5 7.5v9l7.5-4.5-7.5-4.5z" fill="currentColor"/>', 22, 22),
  close: svg(
    '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>',
  ),
  search: svg(
    '<circle cx="10.5" cy="10.5" r="6.25" stroke="currentColor" stroke-width="1.65"/><path d="M15.2 15.2L21 21" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>',
  ),
  calendar: svg(
    '<rect x="3.5" y="5" width="17" height="15" rx="2" stroke="currentColor" stroke-width="1.65"/><path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>',
  ),
  clock: svg(
    '<circle cx="12" cy="12" r="8.25" stroke="currentColor" stroke-width="1.65"/><path d="M12 8.25V12l3.5 2" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>',
  ),
  /** Bar Replay “select bar” — vertical mark + left arrow (TradingView-style). */
  replayBarSelect: svg(
    '<path d="M9 5v14M13 8l-4-4 4-4" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>',
    18,
    18,
  ),
  replayFlag: svg(
    '<path d="M5 3v18M5 5.5h9.5l-2 3.2 2 3.3H5" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round"/>',
    18,
    18,
  ),
  replayDice: svg(
    '<rect x="4.5" y="4.5" width="15" height="15" rx="2.5" stroke="currentColor" stroke-width="1.65"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="15" cy="9" r="1.1" fill="currentColor"/><circle cx="9" cy="15" r="1.1" fill="currentColor"/><circle cx="15" cy="15" r="1.1" fill="currentColor"/>',
    18,
    18,
  ),
  /**
   * Select-bar replay cursor on chart: classic open scissors, blades **up**, loops down.
   * Longer handle “tail” vs stock art; `rotate(180 12 12)` flips tips upward.
   */
  scissorsSelectBar: svg(
    '<g transform="rotate(180 12 12)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M9.35 3.65 5.85 5.75 11.15 14.25M14.65 3.65 18.15 5.75 12.85 14.25" stroke-width="1.5"/><ellipse cx="5.45" cy="5.15" rx="2.35" ry="2.55" stroke-width="1.35"/><ellipse cx="18.55" cy="5.15" rx="2.35" ry="2.55" stroke-width="1.35"/><path d="M11.2 14.25c.85 1.55 1.1 2.35 2.05 3.55M12.8 14.25c-.85 1.55-1.1 2.35-2.05 3.55" stroke-width="1.5"/></g>',
    24,
    24,
  ),
  /** Bar Replay toolbar — jump to first bar (vertical bar + left triangle). */
  replayTvJumpStart: svg(
    '<path d="M5.5 6.5v11" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/><path d="M14.5 12 9 8.5v7l5.5-3.5z" fill="currentColor"/>',
    20,
    20,
  ),
  /** Bar Replay — calendar with “+” (go to date). */
  replayCalendarPlus: svg(
    '<rect x="3" y="5" width="15" height="13" rx="1.75" stroke="currentColor" stroke-width="1.5"/><path d="M3 9h15M7.5 3v3.5M13.5 3v3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M16.5 15.5v4.5M14 18h5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>',
    20,
    20,
  ),
  /** Bar Replay toolbar — play (TradingView-style thin). */
  replayTvPlay: svg(
    '<path d="M9.5 7.5v9l7.5-4.5-7.5-4.5z" fill="currentColor"/>',
    20,
    20,
  ),
  replayTvPause: svg(
    '<path d="M8.5 6.5h3.5v11H8.5V6.5zm5.5 0h3.5v11H14V6.5z" fill="currentColor"/>',
    20,
    20,
  ),
  /** Next bar — triangle + vertical bar. */
  replayTvStepFwd: svg(
    '<path d="M8.5 7.5v9l6-4.5-6-4.5z" fill="currentColor"/><path d="M16.5 6.5v11" stroke="currentColor" stroke-width="1.85" stroke-linecap="round"/>',
    20,
    20,
  ),
  /** Jump to latest — two bars + triangle. */
  replayTvJumpEnd: svg(
    '<path d="M5.5 6.5v11M8.5 6.5v11" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/><path d="M13 7.5v9l7.5-4.5L13 7.5z" fill="currentColor"/>',
    20,
    20,
  ),
  /** Right sidebar — watchlist rail. */
  bookmarkRibbon: svg(
    '<path d="M6 3.5h12v17l-6-3.5-6 3.5V3.5z" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"/>',
  ),
  /** Stacked panels — data window. */
  layersBox: svg(
    '<rect x="4" y="14" width="16" height="5" rx="1" stroke="currentColor" stroke-width="1.45"/><rect x="6" y="9" width="12" height="5" rx="1" stroke="currentColor" stroke-width="1.45"/><rect x="8" y="4" width="8" height="5" rx="1" stroke="currentColor" stroke-width="1.45"/>',
  ),
  chatBubble: svg(
    '<path d="M4.5 5.5h15a1.5 1.5 0 011.5 1.5v7a1.5 1.5 0 01-1.5 1.5h-4l-4 3v-3h-7a1.5 1.5 0 01-1.5-1.5V7a1.5 1.5 0 011.5-1.5z" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"/>',
  ),
  targetRing: svg(
    '<circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.55"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.55"/><circle cx="12" cy="12" r="1.25" fill="currentColor"/>',
  ),
  bell: svg(
    '<path d="M12 22a2 2 0 002-2H10a2 2 0 002 2zM18 16V11a6 6 0 10-12 0v5L4 18h16l-2-2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  ),
  gridApps: svg(
    '<rect x="4" y="4" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.45"/><rect x="15" y="4" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.45"/><rect x="4" y="15" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.45"/><rect x="15" y="15" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.45"/>',
  ),
  grid2: svg(
    '<rect x="5" y="5" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.45"/><rect x="13" y="5" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.45"/><rect x="5" y="13" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.45"/><rect x="13" y="13" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.45"/>',
  ),
  pencil: svg(
    '<path d="M12 20h9M4.5 13.5 13 5l3 3-8.5 8.5H4v-3.5z" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  dotsVertical: svg(
    '<circle cx="12" cy="5" r="1.35" fill="currentColor"/><circle cx="12" cy="12" r="1.35" fill="currentColor"/><circle cx="12" cy="19" r="1.35" fill="currentColor"/>',
  ),
  /** Order ticket — bid / sell (circle + down arrow, same stroke; uses currentColor). */
  ticketBid: svg(
    '<circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="1.35" fill="none"/><path d="M12 8.5v5M9 12.5l3 2.75 3-2.75" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    16,
    16,
  ),
  /** Order ticket — ask / buy (circle + up arrow). */
  ticketAsk: svg(
    '<circle cx="12" cy="12" r="7" stroke="currentColor" stroke-width="1.35" fill="none"/><path d="M12 15.5v-5M9 11.5l3-2.75 3 2.75" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    16,
    16,
  ),
}