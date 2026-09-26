/**
 * src/strategy/strategyBuildingScreen.ts
 *
 * The "Building your strategy" waiting state, shared by both AI entry points
 * ("I have a strategy" and "I need a strategy") so the two never drift apart.
 * Styles live in strategyObjectifyView.css alongside the rest of the shell.
 */

export function buildingScreenHtml(attr: string, status = 'Finalizing your strategy document'): string {
  return `
    <div class="sx-strat-obj__building" ${attr} hidden>
      <span class="sx-strat-obj__building-icon" aria-hidden="true"><i class="fa-solid fa-wand-magic-sparkles"></i></span>
      <h2 class="sx-strat-obj__building-title">Building your strategy</h2>
      <p class="sx-strat-obj__building-sub">Turning your answers into an objective, testable strategy.</p>
      <p class="sx-strat-obj__building-status">
        <span class="sx-strat-obj__building-chev" aria-hidden="true"><i class="fa-solid fa-angles-right"></i></span>
        <em>${status}</em>
        <span class="sx-strat-obj__dots" aria-hidden="true"><i></i><i></i><i></i></span>
      </p>
      <div class="sx-strat-obj__skeleton" aria-hidden="true">
        <div class="sx-strat-obj__skeleton-main">
          <span style="width: 62%"></span>
          <span style="width: 38%"></span>
          <span style="width: 88%"></span>
          <span style="width: 70%"></span>
          <span style="width: 30%"></span>
          <span style="width: 46%"></span>
          <span style="width: 34%"></span>
        </div>
        <div class="sx-strat-obj__skeleton-side">
          <span class="sx-strat-obj__skeleton-dot"></span>
          <span style="width: 80%"></span>
          <span style="width: 60%"></span>
          <span style="width: 70%"></span>
          <span style="width: 45%"></span>
        </div>
      </div>
    </div>`
}
