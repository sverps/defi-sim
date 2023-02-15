import { randomUUID } from "crypto";
import { Balance, Range } from "./common.types";
import { ConcentratedLiquidityPool } from "./concentrated-liquidity-pool";
import { getMaxLiquidity, getTokenAmounts } from "./utils";

export type BaseParam = {
  id?: string;
  liquidityPool: ConcentratedLiquidityPool;
};
export type RangeParam =
  | { range: Range; sqrtRange?: never }
  | { range?: never; sqrtRange: Range };
export type LiquidityParam =
  | { liquidity: number; balance?: never }
  | { liquidity?: never; balance: Balance; sqrtPrice: number };

export type PositionParams = BaseParam & RangeParam & LiquidityParam;

/** Represents a position in a {@link ConcentratedLiquidityPool | liquidity pool that uses concentrated liquidity} */
export class ConcentratedLiquidityPosition {
  id: string;
  sqrtRange: Range;
  liquidity: number;
  initialBalance: Balance;
  rewards: Balance;
  liquidityPool: ConcentratedLiquidityPool;

  constructor(params: PositionParams) {
    this.id = params.id ?? randomUUID();
    this.liquidityPool = params.liquidityPool;
    this.sqrtRange =
      params.sqrtRange ?? (params.range.map((v) => Math.sqrt(v)) as Range);
    this.liquidity =
      params.liquidity ??
      getMaxLiquidity({
        tokens: params.balance,
        sqrtRange: this.sqrtRange,
        sqrtPrice: params.sqrtPrice,
      });
    this.initialBalance = params.balance
      ? {
          x: Math.min(this.balance.x, params.balance.x),
          y: Math.min(this.balance.y, params.balance.y),
        }
      : this.balance;
    this.rewards = { x: 0, y: 0 };
  }

  get range() {
    return this.sqrtRange.map((v) => v ** 2) as Range;
  }

  get balance() {
    return getTokenAmounts(
      { liquidity: this.liquidity, sqrtRange: this.sqrtRange },
      (this.liquidityPool as any).sqrtPrice // To avoid losing precision, we access the private property sqrtPrice directly
    );
  }
}
