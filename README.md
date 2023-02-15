# Defi Simulator tools

## Goal

This package attains to be a set of tools to simulate defi protocols based on their whitepaper. It tries to implement a base set of interactions with which to simulate real interactions with protocol contracts.

In a first step, an AMM liquidity pool with concentrated liquidity (e.g. Uniswap V3) was added.

## Install

`npm i defi-sim`

or

`yarn add defi-sim`

## Uniswap V3 simulation

Concentrated liquidity works by providing a price range in which the capital provided for the position is active. At one end of the price range, the balance of a position will consist entirely of token X. At the other end of the price range, the entire balance of a position will consist of token Y. The advantage is an increased capital efficiency (i.e. a reduction in price swings for the same capital, compared to clasical AMMs).

### Docs

Documentation can be found here: [https://sverps.github.io/defi-sim/](https://sverps.github.io/defi-sim/)

### Code example

```js
import { ConcentratedLiquidityPool } from "defi-sim";

// Initialize a liquidity pool with an initial price of 1500 and a fee rate of 0.3%
const liquidityPool = new ConcentratedLiquidityPool({
  initialPrice: 1500,
  feeRate: 0.003,
});

// Add some liquidity in the price range
const position = liquidityPool.enterPosition({
  balance: { x: 10, y: 15000 },
  range: [1500 / 1.1, 1500 * 1.1],
});

// Let's make a trade occur that moves the price to 1650 (the end of the range)
liquidityPool.movePrice(1650);

// The entire balance will now be in token Y
console.log(position.balance); // { x: 0, y: 30732.132722552284 }

// The position was awarded about 47 Y tokens, which are the trade fee of 0.3% of the 15779 Y tokens that
// the trader needed to spend to buy the whole balance of X tokens
console.log(position.rewards); // { x: 0, y: 47.33841340788045 }

// Lets exit the position from the pool
const finalBalance = liquidityPool.exitPosition(position.id);

// The final balance should yield the position balance plus its rewards
console.log(finalBalance); // { x: 0, y: 30779.471135960164 }
```
