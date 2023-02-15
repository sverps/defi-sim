import { Balance, Range } from "./common.types";

export function toSqrtRange(input: Range) {
  return input.map((v) => Math.sqrt(v)) as Range;
}

export function getLiquidity({ x, y }: Balance, [pa, pb]: Range) {
  const a = pa / pb - 1;
  const b = x * pa + y / pb;
  const c = x * y;
  const D = Math.sqrt(b ** 2 - 4 * a * c);
  return (-b - D) / (2 * a);
}

export function getTokenAmounts(
  { liquidity, sqrtRange }: { liquidity: number; sqrtRange: Range },
  sqrtPrice: number
) {
  const clampedSqrtPrice =
    sqrtPrice > sqrtRange[1]
      ? sqrtRange[1]
      : sqrtPrice < sqrtRange[0]
      ? sqrtRange[0]
      : sqrtPrice;
  return {
    x: liquidity / clampedSqrtPrice - liquidity / sqrtRange[1],
    y: liquidity * clampedSqrtPrice - liquidity * sqrtRange[0],
  };
}

export function getMaxTokenAmounts({
  tokens,
  sqrtRange,
  sqrtPrice,
}: {
  tokens: Balance;
  sqrtRange: Range;
  sqrtPrice: number;
}) {
  const tokensRebalanced = getTokenAmounts(
    { liquidity: getLiquidity(tokens, sqrtRange), sqrtRange },
    sqrtPrice
  );
  const ratios = {
    x: tokensRebalanced.x / tokens.x,
    y: tokensRebalanced.y / tokens.y,
  };
  const deposited = { ...tokens };
  if (ratios.x < ratios.y) {
    deposited.x = (tokensRebalanced.x / tokensRebalanced.y) * tokens.y;
  } else {
    deposited.y = (tokensRebalanced.y / tokensRebalanced.x) * tokens.x;
  }
  return deposited;
}

export function getMaxLiquidity({
  tokens,
  sqrtRange,
  sqrtPrice,
}: {
  tokens: Balance;
  sqrtRange: Range;
  sqrtPrice: number;
}) {
  const tokensRebalanced = getTokenAmounts(
    { liquidity: getLiquidity(tokens, sqrtRange), sqrtRange },
    sqrtPrice
  );
  const ratios = {
    x: tokensRebalanced.x / tokens.x,
    y: tokensRebalanced.y / tokens.y,
  };
  const deposited = { ...tokens };
  if (ratios.x < ratios.y) {
    deposited.x = (tokensRebalanced.x / tokensRebalanced.y) * tokens.y;
  } else {
    deposited.y = (tokensRebalanced.y / tokensRebalanced.x) * tokens.x;
  }
  return getLiquidity(deposited, sqrtRange) - 1000 * Number.EPSILON;
}

export function getRange({
  balance,
  sqrtPrice,
  partialRange,
}: {
  balance: Balance;
  sqrtPrice: number;
  partialRange: { pa: number; pb?: never } | { pa?: never; pb: number };
}) {
  if (partialRange.pb) {
    const pa =
      (balance.y * (sqrtPrice - partialRange.pb)) /
        (balance.x * sqrtPrice * partialRange.pb) +
      sqrtPrice;
    return [pa, partialRange.pb] as Range;
  }
  if (partialRange.pa) {
    const pb =
      (balance.y * sqrtPrice) /
      ((partialRange.pa - sqrtPrice) * balance.x * sqrtPrice + balance.y);
    return [partialRange.pa, pb];
  }
}
