import { Balance, Direction } from "../common.types";
import { ConcentratedLiquidityPool } from "../concentrated-liquidity-pool";
import { Position } from "../position";

const initialTokens = { x: 100, y: 100 };

describe("LiquidityPool with 0 fees", () => {
  let lp: ConcentratedLiquidityPool;
  let tokensIn: Balance;
  let id: string;

  beforeEach(() => {
    lp = new ConcentratedLiquidityPool();
    const position = lp.enterPosition({
      balance: { ...initialTokens },
      range: [1 / 1.1, 1 * 1.1],
    });
    id = position.id;
    tokensIn = position.balance;
  });

  test("Current range works as expected", () => {
    expect(lp.getCurrentRange()).toEqual(
      [1 / 1.1, 1 * 1.1].map((v) => Math.sqrt(v))
    );
    lp.price = 1.1;
    expect(lp.getCurrentRange(Direction.DOWN)).toEqual(
      [1 / 1.1, 1 * 1.1].map((v) => Math.sqrt(v))
    );
    expect(() => lp.getCurrentRange()).toThrow();

    lp.price = 1;
    lp.enterPosition({ balance: { x: 1, y: 1 }, range: [1 / 2, 2] });
    expect(lp.getCurrentRange()).toEqual(
      [1 / 1.1, 1 * 1.1].map((v) => Math.sqrt(v))
    );
    lp.enterPosition({ balance: { x: 1, y: 1 }, range: [1 / 2, 1.05] });
    expect(lp.getCurrentRange()).toEqual(
      [1 / 1.1, 1.05].map((v) => Math.sqrt(v))
    );
    lp.enterPosition({ balance: { x: 1, y: 1 }, range: [1 / 1.05, 1.2] });
    expect(lp.getCurrentRange()).toEqual(
      [1 / 1.05, 1.05].map((v) => Math.sqrt(v))
    );
  });

  test("Entering and exiting position should yield the same initial tokens.", () => {
    expect(initialTokens.x).toBe(tokensIn.x);
    expect(initialTokens.y).toBe(tokensIn.y);

    const tokensOut = lp.exitPosition(id);

    expect(tokensOut.x).toBe(tokensIn.x);
    expect(tokensOut.y).toBe(tokensIn.y);
  });

  test("Liquidity in current range should be calculated correctly", () => {
    const unitOfLiquidity = 2148.808848170151;
    expect(lp.getLiquidityInCurrentRange(Direction.UP)).toBe(unitOfLiquidity);
    lp.enterPosition({
      balance: { ...initialTokens },
      range: [1 / 1.1, 1 * 1.1],
    });
    expect(lp.getLiquidityInCurrentRange(Direction.UP)).toBe(
      unitOfLiquidity * 2
    );
    lp.enterPosition({
      balance: { x: initialTokens.x * 2, y: initialTokens.y * 2 },
      range: [1 / 1.1, 1 * 1.1],
    });
    expect(lp.getLiquidityInCurrentRange(Direction.UP)).toBe(
      unitOfLiquidity * 4
    );
  });

  test("Can't buy more tokens than liquidity allows", () => {
    const initialPrice = lp.price;
    expect(() => lp.buyY(101)).toThrow();

    lp.price = initialPrice;
    expect(() => lp.buyX(101)).toThrow();
  });

  test("dSqrPrice helpers", () => {
    expect(
      (lp as any).getDSqrtPrice((lp as any).getDInvSqrtPrice(1))
    ).toBeCloseTo(1, 15);
    expect(
      (lp as any).getDSqrtPrice((lp as any).getDInvSqrtPrice(0.05))
    ).toBeCloseTo(0.05, 15);
    expect(
      (lp as any).getDSqrtPrice((lp as any).getDInvSqrtPrice(-0.05))
    ).toBeCloseTo(-0.05, 15);
  });

  test("Executing inverse trade should yield original token amount", () => {
    const initialPrice = lp.price;
    let xReceived = lp.sellY(10); // dY > 0 means selling Y and receiving X
    let xPaid = lp.buyY(10);
    expect(xReceived).toBeCloseTo(xPaid, 15);
    expect(initialPrice).toBeCloseTo(lp.price, 15);

    let yReceived = lp.sellX(10);
    let yPaid = lp.buyX(10);
    expect(yReceived).toBeCloseTo(yPaid, 15);
    expect(initialPrice).toBeCloseTo(lp.price, 15);

    yReceived = lp.sellX(10);
    xReceived = lp.sellY(yReceived); // sell the y bought in a first step back into the pool
    expect(xReceived).toBeCloseTo(10, 15);
    expect(initialPrice).toBeCloseTo(lp.price, 15);

    xReceived = lp.sellY(10);
    yReceived = lp.sellX(xReceived);
    expect(yReceived).toBeCloseTo(10, 15);
    expect(initialPrice).toBeCloseTo(lp.price, 15);
  });

  test("Move price should yield the correct token deltas", () => {
    const { delta: delta1 } = lp.movePrice(1.1);
    expect(initialTokens.x + delta1.x).toBeCloseTo(0, 12);
    const { delta: delta2 } = lp.movePrice(1);
    expect(delta1.x + delta2.x).toBeCloseTo(0, 12);
  });

  test("Total tokens should remain constant when moving price", () => {
    const { delta } = lp.movePrice(1.1);
    const tokensInLp = lp.exitPosition(id);
    expect(initialTokens.x + delta.x).toBeCloseTo(tokensInLp.x, 12);
    expect(initialTokens.y + delta.y).toBeCloseTo(tokensInLp.y, 12);
  });

  test("Total tokens should remain constant when moving price and trading", () => {
    const { delta } = lp.movePrice(1.05);
    const xReceived = lp.sellY(10); // sell 10 Y
    const tokensInLp = lp.exitPosition(id);
    expect(initialTokens.x + delta.x - xReceived).toBeCloseTo(tokensInLp.x, 12);
    expect(initialTokens.y + delta.y + 10).toBeCloseTo(tokensInLp.y, 12);
  });

  test("Total tokens should remain constant when moving price and trading with multiple positions", () => {
    const pos2 = lp.enterPosition({
      liquidity: 10000,
      range: [1 / 2, 1.2],
    });
    const initialBalancePos2 = pos2.balance;
    const { delta } = lp.movePrice(1.05);
    const ySold = 20;
    const xReceived = lp.sellY(ySold); // sell 10 Y
    const tokensInLp = lp.exitPosition(id);
    const tokensInLp2 = lp.exitPosition(pos2.id);
    expect(
      initialTokens.x + initialBalancePos2.x + delta.x - xReceived
    ).toBeCloseTo(tokensInLp.x + tokensInLp2.x, 11);
    expect(
      initialTokens.y + initialBalancePos2.y + delta.y + ySold
    ).toBeCloseTo(tokensInLp.y + tokensInLp2.y, 11);
  });
});

describe("LiquidityPool with 0.3% fees", () => {
  let lp: ConcentratedLiquidityPool;
  let position: Position;
  let tokensIn: Balance;
  let id: string;

  beforeEach(() => {
    lp = new ConcentratedLiquidityPool({ feeRate: 0.003 });
    position = lp.enterPosition({
      balance: { ...initialTokens },
      range: [1 / 1.1, 1 * 1.1],
    });
    id = position.id;
    tokensIn = position.balance;
  });

  test("Selling token should add feeRate of that token to the position rewards", () => {
    lp.sellX(10);
    lp.sellY(20);
    expect(position.rewards.x).toBeCloseTo(10 * lp.feeRate, 13);
    expect(position.rewards.y).toBeCloseTo(20 * lp.feeRate, 13);
  });

  test("Buying token should add feeRate of the paid token to the position rewards", () => {
    const paidY = lp.buyX(10);
    const paidX = lp.buyY(20);
    expect(position.rewards.x).toBeCloseTo(paidX * lp.feeRate, 13);
    expect(position.rewards.y).toBeCloseTo(paidY * lp.feeRate, 13);
  });

  test("Adding fees to positions should split it according to liquidity", () => {
    const testFeeAmount = 0.5;
    const { id: idNew } = lp.enterPosition({
      liquidity: 1000,
      range: [1, 1.1 ** 3],
    });

    // Add a position that should not receive any fees
    const { id: idNoFees } = lp.enterPosition({
      liquidity: 1000,
      range: [0.95, 1],
    });
    (lp as any).addFeesToPositions({
      feesToSplit: testFeeAmount,
      totalLiquidity: lp.getLiquidityInCurrentRange(Direction.UP),
      direction: Direction.UP,
      token: "x",
    });
    const position = lp.getPosition(id) as Position;
    const positionNew = lp.getPosition(idNew) as Position;
    const positionNoFees = lp.getPosition(idNoFees) as Position;
    expect(position.rewards.x).toBeCloseTo(
      (testFeeAmount * position.liquidity) /
        (position.liquidity + positionNew.liquidity),
      12
    );
    expect(positionNoFees.rewards.x).toBe(0);
  });
});
