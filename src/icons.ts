/** Inline SVGs — stroke icons, currentColor for theming. */

const svg = (inner: string, w = 20, h = 20) =>
  `<svg class="sx-ico" width="${w}" height="${h}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`

/** Bar Replay dock — 18×18 outline icons (TradingView pixel clarity). */
const svgReplayTv = (inner: string) =>
  `<svg class="sx-ico sx-ico--replay-tv" width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" shape-rendering="geometricPrecision">${inner}</svg>`

/** Bar-pick cursor — theme PNGs (public/icons/scissors-select-bar-*-theme.png). */
const scissorsSelectBarImg = () =>
  `<img class="rw-select-bar-scissors-img rw-select-bar-scissors-img--light" src="/icons/scissors-select-bar-light-theme.png" width="18" height="22" alt="" aria-hidden="true" draggable="false" decoding="async" />` +
  `<span class="rw-select-bar-scissors-img rw-select-bar-scissors-img--dark" role="img" aria-hidden="true"></span>`

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
  /** TradingView toolbar — hex nut settings. */
  tvToolbarSettings: svg(
    '<path d="M12 3.25 16.4 5.6v4.8L16.4 15.2 12 17.5l-4.4-2.3v-4.8L7.6 5.6 12 3.25z" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round"/><circle cx="12" cy="10.4" r="2" stroke="currentColor" stroke-width="1.55"/>',
  ),
  /** TradingView toolbar — exit fullscreen (corners inward). */
  tvToolbarCompress: svg(
    '<path d="M9 9V3H3M15 9V3h6M15 15v6h6M9 15v6H3" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  /** FX Replay trade bar — quick order rocket. */
  tradeRocket: svg(
    '<path d="M12 2.5c1.8 3.1-.2 7-.9 9.2-1.6 2.2-3.8 3.2-5.1 3.5 1.2.3 3.3-.4 5-2.1 2.2-2.2 6.1-4.1 9.2-2.3-2.1-.9-3.8-2.6-4.7-4.7z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M7.25 12.75 5 18.5l5.75-2.25" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10.25" cy="8.75" r="1.05" fill="currentColor"/>',
    18,
    18,
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
  eye: svg(
    '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke="currentColor" stroke-width="1.65"/><circle cx="12" cy="12" r="2.75" stroke="currentColor" stroke-width="1.65"/>',
    18,
    18,
  ),
  eyeOff: svg(
    '<path d="M3 3l18 18M10.6 10.6A3 3 0 0012 15a3 3 0 002.4-4.4M6.7 6.7C4.6 8.1 3 10.2 2 12s3.5 7 10 7c1.8 0 3.4-.4 4.8-1.1M17.3 17.3C19.4 15.9 21 13.8 22 12s-3.5-7-10-7c-1.8 0-3.4.4-4.8 1.1" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/>',
    18,
    18,
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
  /** Top toolbar — Bar Replay launch (double chevron left). */
  replayLaunch: svg(
    '<path d="M14 7.5 9 12l5 4.5M19 7.5 14 12l5 4.5" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"/>',
    18,
    18,
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
  /** Bar-pick cursor — theme PNGs on the blue vertical line. */
  scissorsSelectBar: scissorsSelectBarImg(),
  /** Bar Replay toolbar — jump to first bar (|◄||, mirror of jump end ||►). */
  replayTvJumpStart: svgReplayTv(
    '<rect x="2.25" y="4.75" width="1.25" height="8.5" rx="0.3" fill="currentColor"/><path d="M9.25 4.75 4.25 9 9.25 13.25Z" fill="currentColor"/><path d="M11.75 5.5v7M14.25 5.5v7" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" vector-effect="non-scaling-stroke"/>',
  ),
  /** Bar Replay — circular goto arrow (FXReplay-style). */
  replayGoto: svg(
    '<path d="M12 4a8 8 0 107.07 4.18M16 4h4v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    18,
    18,
  ),
  replayPlusCircle: svg(
    '<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.45"/><path d="M12 8.25v7.5M8.25 12h7.5" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>',
    18,
    18,
  ),
  replayJournal: svg(
    '<path d="M6 4.5h12a1.5 1.5 0 011.5 1.5v14l-3.5-2-3.5 2-3.5-2-3.5 2V6a1.5 1.5 0 011.5-1.5z" stroke="currentColor" stroke-width="1.45" stroke-linejoin="round"/><path d="M9 9h6M9 12.5h6M9 16h4" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>',
    18,
    18,
  ),
  /** Bar Replay — calendar with “+” (go to date). */
  replayCalendarPlus: svg(
    '<rect x="3" y="5" width="15" height="13" rx="1.75" stroke="currentColor" stroke-width="1.5"/><path d="M3 9h15M7.5 3v3.5M13.5 3v3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M16.5 15.5v4.5M14 18h5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>',
    20,
    20,
  ),
  /** Bar Replay — “Select date” (calendar + left arrow, TV dock). */
  replaySelectDate: svgReplayTv(
    '<rect x="2.5" y="4.25" width="10.5" height="9.25" rx="1" stroke="currentColor" stroke-width="1.25" vector-effect="non-scaling-stroke"/><path d="M2.5 7h10.5M5 2.75v2M10.5 2.75v2" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" vector-effect="non-scaling-stroke"/><path d="M7.75 10.25 6 9.25l1.75-1" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>',
  ),
  /** Bar Replay toolbar — play (filled triangle, TV dock). */
  replayTvPlay: svgReplayTv(
    '<path d="M6.75 4.75 13.5 9 6.75 13.25Z" fill="currentColor"/>',
  ),
  replayTvPause: svgReplayTv(
    '<rect x="5.75" y="4.75" width="2.5" height="8.5" rx="0.4" fill="currentColor"/><rect x="10.75" y="4.75" width="2.5" height="8.5" rx="0.4" fill="currentColor"/>',
  ),
  /** Next bar — filled triangle + vertical bar (skip one candle). */
  replayTvStepFwd: svgReplayTv(
    '<path d="M5.5 4.75 10.75 9 5.5 13.25Z" fill="currentColor"/><rect x="12.75" y="4.75" width="1.75" height="8.5" rx="0.35" fill="currentColor"/>',
  ),
  /** Previous bar — vertical bar + filled triangle. */
  replayTvStepBack: svgReplayTv(
    '<rect x="3.5" y="4.75" width="1.75" height="8.5" rx="0.35" fill="currentColor"/><path d="M7.25 4.75 12.5 9 7.25 13.25Z" fill="currentColor"/>',
  ),
  /** Floating replay bar — drag grip (2×3 dots). */
  replayDragGrip: svg(
    '<circle cx="7" cy="7" r="1.35" fill="currentColor"/><circle cx="12" cy="7" r="1.35" fill="currentColor"/><circle cx="7" cy="12" r="1.35" fill="currentColor"/><circle cx="12" cy="12" r="1.35" fill="currentColor"/><circle cx="7" cy="17" r="1.35" fill="currentColor"/><circle cx="12" cy="17" r="1.35" fill="currentColor"/>',
    20,
    20,
  ),
  /** Replay dock — decrease playback speed. */
  replayTvSpeedDown: svgReplayTv(
    '<path d="M5.25 9h7.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" vector-effect="non-scaling-stroke"/>',
  ),
  /** Replay dock — increase playback speed. */
  replayTvSpeedUp: svgReplayTv(
    '<path d="M9 5.25v7.5M5.25 9h7.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" vector-effect="non-scaling-stroke"/>',
  ),
  /** Jump to latest — two bars + outline triangle (TV dock). */
  replayTvJumpEnd: svgReplayTv(
    '<path d="M3.75 5.5v7M6.25 5.5v7" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" vector-effect="non-scaling-stroke"/><path d="M10.25 6.25v5.5l4.75-2.75L10.25 6.25z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>',
  ),
  /** Bar Replay dock — clear filter (circular arrow + center dot). */
  replayClearFilter: svgReplayTv(
    '<circle cx="9" cy="9" r="1.15" stroke="currentColor" stroke-width="1.15" fill="none" vector-effect="non-scaling-stroke"/><path d="M12.15 6.4a5.25 5.25 0 1 0-1.9 7.55" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" vector-effect="non-scaling-stroke"/><path d="M10.2 13.65 9.05 15.3l1.65-.95" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>',
  ),
  /** Bar Replay dock — thin close (TV clarity). */
  replayTvClose: svgReplayTv(
    '<path d="M5.25 5.25l7.5 7.5M12.75 5.25l-7.5 7.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" vector-effect="non-scaling-stroke"/>',
  ),
  /** Side rail — place order (+ in circle, FXReplay). */
  panelOrder: svg(
    '<circle cx="12" cy="12" r="8.25" stroke="currentColor" stroke-width="1.55"/><path d="M12 8.25v7.5M8.25 12h7.5" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>',
  ),
  /** Side rail — go to bar / session. */
  panelGoTo: svg(
    '<path d="M5 12h11M13 8.5 17.5 12 13 15.5" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  /** Side rail — news / calendar. */
  panelNews: svg(
    '<rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" stroke-width="1.55"/><path d="M4 10h16M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>',
  ),
  /** Side rail — Pine Script editor. */
  panelPine: svg(
    '<path d="M8 4 6 20M14 4l2 16M6 9h10M6 15h10" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/>',
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
  /** Chart bottom nav — zoom / pan / reset (TradingView-style outline tiles). */
  chartNavMinus: svg(
    '<path d="M5 12h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" vector-effect="non-scaling-stroke"/>',
    16,
    16,
  ),
  chartNavPlus: svg(
    '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" vector-effect="non-scaling-stroke"/>',
    16,
    16,
  ),
  chartNavLeft: svg(
    '<path d="M14 7.5 9.5 12 14 16.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>',
    16,
    16,
  ),
  chartNavRight: svg(
    '<path d="M10 7.5 14.5 12 10 16.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>',
    16,
    16,
  ),
  chartNavReset: svg(
    '<path d="M17 8a7 7 0 10-1.75 4.67M7 8H4M7 8l2-2M7 8l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>',
    16,
    16,
  ),
}