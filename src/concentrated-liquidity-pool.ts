import { Balance, Range, Direction } from "./common.types";
import {
  ConcentratedLiquidityPosition,
  PositionParams,
} from "./concentrated-liquidity-position";

/** Represents a liquidity pool that uses concentrated liquidity (e.g. Uniswap V3). */
export class ConcentratedLiquidityPool {
  /** Holds a map of all active positions in the liquidity pool. */
  positions = new Map<string, ConcentratedLiquidityPosition>();

  /**
   * The internal representation of the price. The square root is tracked for easier math.
   */
  private sqrtPrice: number; // square root of the amount of Y you can get for a unit of X

  /** The amount of fees taken from each transaction with the pool. */
  readonly feeRate: number;

  /**
   * @param options.initialPrice - Initial price
   * @param options.feeRate - Initial fee rate, taken from each trade
   */
  constructor({
    initialPrice = 1,
    feeRate = 0,
  }: { initialPrice?: number; feeRate?: number } = {}) {
    this.sqrtPrice = Math.sqrt(initialPrice);
    this.feeRate = feeRate;
  }

  /** Current price of X as expressed in Y (i.e. amount of Y tokens needed to buy 1 token of X). */
  get price() {
    return this.sqrtPrice ** 2;
  }

  /** When you enter a position, you start providing liquidity to the pool. The position will gain rewards when a trade occurs inside the range in which it is active.*/
  enterPosition(
    params:
      | { range: Range; liquidity: number; balance?: never }
      | { range: Range; liquidity?: never; balance: Balance }
  ) {
    const position = new ConcentratedLiquidityPosition({
      ...(params as PositionParams),
      liquidityPool: this,
      ...(params.balance ? { sqrtPrice: this.sqrtPrice } : {}),
    });
    this.positions.set(position.id, position);
    return position;
  }

  /** Exit all tokens of a position and the rewards that were acrued. */
  exitPosition(id: string) {
    const position = this.positions.get(id);
    if (!position) {
      throw Error("Position doesn't exist");
    }
    this.positions.delete(id);
    return {
      x: position.balance.x + position.rewards.x,
      y: position.balance.y + position.rewards.y,
    };
  }

  /** Returns the position with the requested id. */
  getPosition(id: string) {
    return this.positions.get(id);
  }

  /**
   * @param dir - The direction of price movement to consider. This becomes relevant when you're at a point exactly in between two possible ranges, each of which could have a different virtual liquidity
   * @returns An array of positions that are currently contributing to the virtual liquidity in the active range. */
  getPositionsInRange(dir: Direction) {
    return Array.from(this.positions.values()).filter(({ sqrtRange }) =>
      dir === Direction.DOWN
        ? this.sqrtPrice > sqrtRange[0] && this.sqrtPrice <= sqrtRange[1]
        : this.sqrtPrice >= sqrtRange[0] && this.sqrtPrice < sqrtRange[1]
    );
  }

  /**
   * @param dir -  The direction of price movement to consider. This becomes relevant when you're at a point exactly in between two possible ranges, each of which could have a different virtual liquidity
   * @returns The amount of virtual liquidity that is available in the current active range. */
  getLiquidityInCurrentRange(dir: Direction) {
    return this.getPositionsInRange(dir).reduce((liquidity, position) => {
      return liquidity + position.liquidity;
    }, 0);
  }

  /**
   * Consider all positions whose range includes the current price and find the narrowest range that is contained by all the ranges of the matched positions. Within this range, the liquidity stays constant during price movements.
   * @param dir -  The direction of price movement to consider. This becomes relevant when you're at a point exactly in between two possible ranges, each of which could have a different virtual liquidity
   * @returns The current active range. */
  getCurrentRange(dir: Direction = Direction.UP) {
    const currentRange = this.getPositionsInRange(dir)
      .map((position) => position.sqrtRange)
      .reduce<Range | null>((currentRange, range) => {
        if (!currentRange) {
          return range;
        }
        return [
          Math.max(currentRange[0], range[0]),
          Math.min(currentRange[1], range[1]),
        ];
      }, null);

    if (!currentRange) {
      throw Error("Out of range, no liquidity.");
    }
    return currentRange;
  }

  /** @returns The amount of X tokens you receive. */
  sellY(yWithFees: number): number {
    if (yWithFees <= 0) {
      throw Error("Can't sell a negative amount");
    }
    const fees = yWithFees * this.feeRate;
    let dY = yWithFees - fees;
    let dX = 0;
    while (dY > 0) {
      const currentRange = this.getCurrentRange(Direction.UP);
      const liquidity = this.getLiquidityInCurrentRange(Direction.UP);
      if (liquidity === 0) {
        throw Error("Not enough liquidity.");
      }
      const dSqrtPrice = Math.min(
        dY / liquidity,
        currentRange[1] - this.sqrtPrice
      );
      const dYPartial = dSqrtPrice * liquidity;
      const dXPartial = liquidity * this.getDInvSqrtPrice(dSqrtPrice);
      const partialFees = (fees * dYPartial) / dY;
      this.addFeesToPositions({
        feesToSplit: partialFees,
        totalLiquidity: liquidity,
        token: "y",
        direction: Direction.UP,
      });
      dX += dXPartial;
      dY -= dYPartial;
      this.sqrtPrice += dSqrtPrice;
    }
    return -dX;
  }

  /** @returns The amount of X tokens you need to pay. */
  buyY(yDesired: number): number {
    if (yDesired <= 0) {
      throw Error("Can't buy a negative amount");
    }
    let dY = -yDesired;
    let dX = 0;
    while (dY < 0) {
      const currentRange = this.getCurrentRange(Direction.DOWN);
      const liquidity = this.getLiquidityInCurrentRange(Direction.DOWN);
      if (liquidity === 0) {
        throw Error("Not enough liquidity.");
      }
      const dSqrtPrice = Math.max(
        dY / liquidity,
        currentRange[0] - this.sqrtPrice
      );
      const dYPartial = dSqrtPrice * liquidity;
      const dXPartial = liquidity * this.getDInvSqrtPrice(dSqrtPrice);
      const partialFees = dXPartial / (1 - this.feeRate) - dXPartial;
      this.addFeesToPositions({
        feesToSplit: partialFees,
        totalLiquidity: liquidity,
        token: "x",
        direction: Direction.DOWN,
      });
      dX += dXPartial + partialFees;
      dY -= dYPartial;
      this.sqrtPrice += dSqrtPrice;
    }
    return dX;
  }

  /** @returns The amount of Y tokens you receive. */
  sellX(xWithFees: number): number {
    if (xWithFees <= 0) {
      throw Error("Can't sell a negative amount");
    }
    const fees = xWithFees * this.feeRate;
    let dX = xWithFees - fees;
    let dY = 0;
    while (dX > 0) {
      const currentRange = this.getCurrentRange(Direction.DOWN);
      const liquidity = this.getLiquidityInCurrentRange(Direction.DOWN);
      if (liquidity === 0) {
        throw Error("Not enough liquidity.");
      }
      const dSqrtPrice = Math.max(
        this.getDSqrtPrice(dX / liquidity),
        currentRange[0] - this.sqrtPrice
      );
      const dYPartial = dSqrtPrice * liquidity;
      const dXPartial = liquidity * this.getDInvSqrtPrice(dSqrtPrice);
      const partialFees = (fees * dXPartial) / dX;
      this.addFeesToPositions({
        feesToSplit: partialFees,
        totalLiquidity: liquidity,
        token: "x",
        direction: Direction.DOWN,
      });
      dX -= dXPartial;
      dY += dYPartial;
      this.sqrtPrice += dSqrtPrice;
    }
    return -dY;
  }

  /** @returns The amount of Y tokens you need to pay. */
  buyX(xDesired: number): number {
    if (xDesired <= 0) {
      throw Error("Can't buy a negative amount");
    }
    let dX = -xDesired;
    let dY = 0;
    while (dX < 0) {
      const currentRange = this.getCurrentRange(Direction.UP);
      const liquidity = this.getLiquidityInCurrentRange(Direction.UP);
      if (liquidity === 0) {
        throw Error("Not enough liquidity.");
      }
      const dSqrtPrice = Math.min(
        this.getDSqrtPrice(dX / liquidity),
        currentRange[1] - this.sqrtPrice
      );
      const dYPartial = dSqrtPrice * liquidity;
      const dXPartial = liquidity * this.getDInvSqrtPrice(dSqrtPrice);
      const partialFees = dYPartial / (1 - this.feeRate) - dYPartial;
      this.addFeesToPositions({
        feesToSplit: partialFees,
        totalLiquidity: liquidity,
        token: "y",
        direction: Direction.UP,
      });
      dY += dYPartial + partialFees;
      dX -= dXPartial;
      this.sqrtPrice += dSqrtPrice;
    }
    return dY;
  }

  /** Make a trade that moves the price to the target.
   * @returns The balance delta required to make this trade. Negative values are paid to the pool, positive values are received in return.
   */
  movePrice(targetPrice: number): { delta: Balance } {
    const sqrtTargetPrice = Math.sqrt(targetPrice);
    if (this.sqrtPrice === sqrtTargetPrice) {
      return { delta: { x: 0, y: 0 } };
    }
    let dSqrtPrice = sqrtTargetPrice - this.sqrtPrice;
    let dX = 0;
    let dY = 0;
    while (dSqrtPrice !== 0) {
      const currentRange = this.getCurrentRange(
        dSqrtPrice < 0 ? Direction.DOWN : Direction.UP
      );
      const liquidity = this.getLiquidityInCurrentRange(
        dSqrtPrice < 0 ? Direction.DOWN : Direction.UP
      );
      if (liquidity === 0) {
        throw Error("Not enough liquidity.");
      }
      const nextSqrtPrice =
        dSqrtPrice > 0
          ? Math.min(currentRange[1], this.sqrtPrice + dSqrtPrice)
          : Math.max(currentRange[0], this.sqrtPrice + dSqrtPrice);
      const dSqrtPricePartial = nextSqrtPrice - this.sqrtPrice;
      const dYPartial = liquidity * dSqrtPricePartial;
      const dXPartial = liquidity * this.getDInvSqrtPrice(dSqrtPricePartial);
      const partialFees =
        (dSqrtPrice > 0 ? dYPartial : dXPartial) * (1 / (1 - this.feeRate) - 1);
      this.addFeesToPositions({
        feesToSplit: partialFees,
        totalLiquidity: liquidity,
        token: dSqrtPrice > 0 ? "y" : "x",
        direction: dSqrtPrice < 0 ? Direction.DOWN : Direction.UP,
      });
      dX += dXPartial + (dSqrtPrice > 0 ? 0 : partialFees);
      dY += dYPartial + (dSqrtPrice < 0 ? 0 : partialFees);
      this.sqrtPrice = nextSqrtPrice;
      dSqrtPrice = sqrtTargetPrice - this.sqrtPrice;
    }
    return { delta: { x: dX, y: dY } };
  }

  private addFeesToPositions({
    feesToSplit,
    totalLiquidity,
    token,
    direction,
  }: {
    feesToSplit: number;
    totalLiquidity: number;
    token: "x" | "y";
    direction: Direction;
  }) {
    const positions = this.getPositionsInRange(direction).forEach(
      (position) => {
        const feesForPosition =
          (position.liquidity / totalLiquidity) * feesToSplit;
        if (token === "x") {
          position.rewards.x += feesForPosition;
        } else {
          position.rewards.y += feesForPosition;
        }
      }
    );
  }

  private getDInvSqrtPrice(dSqrtPrice: number) {
    const dInvSqrtPrice =
      -dSqrtPrice / (this.sqrtPrice ** 2 + this.sqrtPrice * dSqrtPrice);
    return dInvSqrtPrice;
  }

  private getDSqrtPrice(dInvSqrtPrice: number) {
    const dSqrtPrice =
      -dInvSqrtPrice *
      (this.sqrtPrice ** 2 / (1 + dInvSqrtPrice * this.sqrtPrice));
    return dSqrtPrice;
  }
}
