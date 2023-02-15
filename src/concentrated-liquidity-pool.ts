import { Balance, Range, Direction } from "./common.types";
import { Position, PositionParams } from "./position";

export class ConcentratedLiquidityPool {
  positions = new Map<string, Position>();
  sqrtPrice = 1; // square root of the amount of X you can get for a unit of Y
  feeRate = 0;

  /**
   * Represents a liquidity pool that uses concentrated liquidity (e.g. Uniswap V3)
   * @param options.initialPrice - Initial price
   * @param options.feeRate - Initial fee rate, taken from each trade
   */
  constructor(options: { initialPrice?: number; feeRate?: number } = {}) {
    if (options.initialPrice) {
      this.price = options.initialPrice;
    }
    if (options.feeRate) {
      this.feeRate = options.feeRate;
    }
  }

  get price() {
    return this.sqrtPrice ** 2;
  }

  set price(price) {
    this.sqrtPrice = Math.sqrt(price);
  }

  enterPosition(
    params:
      | { range: Range; liquidity: number; balance?: never }
      | { range: Range; liquidity?: never; balance: Balance }
  ) {
    const position = new Position({
      ...(params as PositionParams),
      liquidityPool: this,
      ...(params.balance ? { sqrtPrice: this.sqrtPrice } : {}),
    });
    this.positions.set(position.id, position);
    return position;
  }

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

  getPosition(id: string) {
    return this.positions.get(id);
  }

  getPositionsInRange(dir: Direction) {
    return Array.from(this.positions.values()).filter(({ sqrtRange }) =>
      dir === Direction.DOWN
        ? this.sqrtPrice > sqrtRange[0] && this.sqrtPrice <= sqrtRange[1]
        : this.sqrtPrice >= sqrtRange[0] && this.sqrtPrice < sqrtRange[1]
    );
  }

  getLiquidityInCurrentRange(dir: Direction) {
    return this.getPositionsInRange(dir).reduce((liquidity, position) => {
      return liquidity + position.liquidity;
    }, 0);
  }

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
