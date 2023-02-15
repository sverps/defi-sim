import { Range } from "../common.types";
import {
  getLiquidity,
  getMaxLiquidity,
  getTokenAmounts,
  toSqrtRange,
} from "../utils";

describe("Utils", () => {
  test("getLiquidity", () => {
    const l1 = getLiquidity({ x: 1, y: 0 }, toSqrtRange([1, 1.1]));
    const l2 = getLiquidity({ x: 0, y: 1 }, toSqrtRange([1 / 1.1, 1]));
    const l3 = getLiquidity({ x: 1, y: 1 }, toSqrtRange([1 / 1.1, 1.1]));
    console.log(l1, l2, l3);

    expect(l1).toBeCloseTo(l2, 13);
    expect(l1).toBeCloseTo(l3, 13);

    expect(getLiquidity({ x: 1, y: 0 }, toSqrtRange([1, 4]))).toBe(2);
    expect(getLiquidity({ x: 2, y: 0 }, toSqrtRange([0.25, 1]))).toBe(2);
    expect(getLiquidity({ x: 0, y: 1 }, toSqrtRange([0.25, 1]))).toBe(2);
  });

  test("getMaxLiquidity", () => {
    const deposited = { x: 9.416240480727904, y: 9.482120863710932 };
    const sqrtPrice = 1.0002708901436785;
    const sqrtRange = [0.9537208728633851, 1.0490929601497239] as Range;

    const liquidity = getMaxLiquidity({
      tokens: deposited,
      sqrtPrice,
      sqrtRange,
    });
    const tokenAmounts = getTokenAmounts({ liquidity, sqrtRange }, sqrtPrice);

    expect(tokenAmounts.x <= deposited.x).toBe(true);
    expect(tokenAmounts.y <= deposited.y).toBe(true);
    expect(tokenAmounts.x).toBeCloseTo(deposited.x, 13);
    expect(tokenAmounts.y).toBeCloseTo(9.421342705178915, 13);
  });

  test("getLiquidity", () => {
    const deposited = { x: 9.416240480727907, y: 9.421342705178915 };
    const sqrtPrice = 1.0002708901436785;
    const sqrtRange = [0.9537208728633851, 1.0490929601497239] as Range;

    const liquidity = getLiquidity(deposited, sqrtRange);
    const tokenAmounts = getTokenAmounts({ liquidity, sqrtRange }, sqrtPrice);

    expect(tokenAmounts.x <= deposited.x).toBe(true);
    expect(tokenAmounts.x).toBeCloseTo(deposited.x, 13);
    expect(tokenAmounts.y).toBeCloseTo(deposited.y, 13);
  });
});
