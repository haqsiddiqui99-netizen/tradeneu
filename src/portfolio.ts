export type PortfolioState = {
  cash: number
  qty: number
  avgEntry: number
  realizedPnL: number
}

export function createPortfolio(initialCash: number) {
  let cash = initialCash
  let qty = 0
  let avgEntry = 0
  let realizedPnL = 0

  function get(): PortfolioState {
    return { cash, qty, avgEntry, realizedPnL }
  }

  function markToMarket(price: number) {
    const unrealized = qty === 0 ? 0 : (price - avgEntry) * qty
    return { unrealized }
  }

  function buy(q: number, price: number) {
    const cost = q * price
    if (cost > cash) return
    const newQty = qty + q
    avgEntry = qty === 0 ? price : (avgEntry * qty + price * q) / newQty
    qty = newQty
    cash -= cost
  }

  function sell(q: number, price: number) {
    const q0 = Math.min(q, qty)
    if (q0 <= 0) return
    realizedPnL += (price - avgEntry) * q0
    cash += q0 * price
    qty -= q0
    if (qty === 0) avgEntry = 0
  }

  return { get, markToMarket, buy, sell }
}
