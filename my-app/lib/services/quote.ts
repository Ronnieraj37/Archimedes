import { getPriceInUsdt, getTokenBySymbol } from '@/lib/constants/tokens';

/**
 * Get estimated output amount when swapping inputAmount of inputSymbol for outputSymbol.
 * Uses constant prices (TOKEN_PRICES_USDT). Once pools exist on testnet, this can be
 * replaced with a pool-based quote.
 */
export function getQuote(
  inputSymbol: string,
  inputAmount: string,
  outputSymbol: string
): string {
  const amount = parseFloat(inputAmount);
  if (!Number.isFinite(amount) || amount <= 0) return '0';

  const inputPrice = getPriceInUsdt(inputSymbol);
  const outputPrice = getPriceInUsdt(outputSymbol);
  if (!inputPrice || !outputPrice) return '0';

  // value in USDT = inputAmount * inputPricePerUnit
  // outputAmount = valueInUsdt / outputPricePerUnit
  const valueInUsdt = amount * inputPrice;
  const outputAmount = valueInUsdt / outputPrice;

  const inputToken = getTokenBySymbol(inputSymbol);
  const outputToken = getTokenBySymbol(outputSymbol);
  const decimals = outputToken?.decimals ?? 18;
  const maxDecimals = Math.min(decimals, 8);
  return outputAmount.toFixed(maxDecimals);
}

/**
 * Get quote for multiple input tokens (basket) to one output token.
 */
export function getQuoteBasket(
  inputs: Array<{ symbol: string; amount: string }>,
  outputSymbol: string
): string {
  let totalValueUsdt = 0;
  for (const { symbol, amount } of inputs) {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    const price = getPriceInUsdt(symbol);
    totalValueUsdt += amt * price;
  }
  const outputPrice = getPriceInUsdt(outputSymbol);
  if (!outputPrice) return '0';
  const outputAmount = totalValueUsdt / outputPrice;
  const outputToken = getTokenBySymbol(outputSymbol);
  const decimals = outputToken?.decimals ?? 18;
  return outputAmount.toFixed(Math.min(decimals, 8));
}

/**
 * Estimated output when swapping along a path (multi-hop).
 * path = [from, mid1, mid2, ..., to]. Chains getQuote for each hop.
 */
export function getQuoteForPath(path: string[], amountIn: string): string {
  if (path.length < 2) return amountIn;
  let amount = amountIn;
  for (let i = 0; i < path.length - 1; i++) {
    amount = getQuote(path[i], amount, path[i + 1]);
    if (amount === '0') return '0';
  }
  return amount;
}
