## Estimation {#estimation}

### Maximum likelihood with Newton–Raphson {#mle}

Derived maximum-likelihood estimators for exponential and Beta distributions, solved them numerically with Newton–Raphson, and checked the second derivative (the Hessian) to confirm a maximum. Applied in a pair lab and in my own homework.

### Method of moments {#moments}

Fitted a Gaussian by matching sample moments, as part of a lab on the bias–variance trade-off.

## Simulation {#simulation}

### Monte Carlo versus exact enumeration {#monte-carlo}

Estimated probabilities by Monte Carlo simulation and checked them against a full enumeration of all 7⁶ outcomes, to see how quickly the simulation converges. A later lab used a million-run simulation for a set of probability puzzles.

## Bayesian models {#bayesian}

### Beta–Binomial models {#beta-binomial}

Modeled win rates with Beta–Binomial models in PyMC, including a study over simulated Formula 1 seasons.

### Switchpoint detection {#switchpoint}

Used a Poisson switchpoint model in PyMC to locate the moment a rate changes in motorsport telemetry data.

### Metropolis–Hastings by hand, then NUTS {#metropolis}

Wrote a Metropolis–Hastings sampler from scratch, then compared it with PyMC's NUTS sampler on the same model, checking convergence with ArviZ.

### Hierarchical models {#hierarchical}

Built a small three-driver hierarchical model in a lab. It became the starting point of my F1 project, which extends it to the full grid: [F1 Race Prediction with Hierarchical Bayesian Modeling](/projects/f1-bayesian/).

## Hypothesis testing {#testing}

Compared a Welch t-test with Bayesian estimation of a difference in means on the same data, to contrast what each approach reports.

## About these cards {#about}

Several labs were done in pairs, so the cards describe methods rather than individual results. The notebooks were graded coursework and are not published; neither are the course's instructor materials.
