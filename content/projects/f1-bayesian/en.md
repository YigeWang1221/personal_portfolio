## Modeling approach {#approach}

We used data from the first 23 races of the 2025 season to predict the finishing order of the final race, the Abu Dhabi Grand Prix, with a Bayesian model.

The data comes from the FastF1 API: every completed 2025 session, cached locally and turned into driver and team features such as grid position, track type, recent form and retirement history. The model went through two main versions: an ordinal-logistic hierarchical model first, then the Normal-likelihood model described below.

## The model {#model}

- **Hierarchy.** Teams are grouped into tiers, and each driver's effect sits below its team tier, with a HalfNormal hyperprior on the spread of driver effects. Pooling lets drivers with few races borrow strength from their team.
- **Covariates.** Grid position, three track types, recent form and the risk of not finishing.
- **Likelihood.** A Normal likelihood on finishing position. It gave a lower in-sample R² than the earlier ordinal model but a clearly better mean absolute error, with no divergences.
- **Priors from data.** The tier-level priors take their means and spreads from the observed tier distributions, and the noise term uses a pooled standard deviation.
- **Collinearity.** Grid position and qualifying position are almost perfectly correlated, so the model uses one of them.
- **Sampling.** NUTS with four chains, a long tuning phase and a high target acceptance rate, followed by automated convergence checks and posterior predictive checks.

## From posterior to finishing orders {#simulation}

A posterior draw gives each driver a score, not a place. The simulation turns every draw into a complete, valid finishing order: drivers are ranked by their sampled scores, so no two share a position and every position from P1 to P20 is filled. Each race gets {{fact:simulations}} simulated orders, run in parallel with joblib. From them come each driver's distribution of finishing positions, podium probabilities and — added up over the remaining races — a championship projection, including a team-orders scenario.

## Forecast results {#results}

The Abu Dhabi forecast was saved the day before the race, without race results.

- It named all three podium finishers — {{fact:podium}} — and the final championship order.
- Its mean absolute error over all twenty drivers was {{fact:finale_mae}}.
- The model converged cleanly: maximum R-hat {{fact:rhat}}, no divergent transitions, and an in-sample mean absolute error of {{fact:in_sample_mae}}.

## Limits {#limits}

- **One season of data.** The model sees only 2025, so it learns little about how teams change.
- **The Qatar score is in-sample.** The training data covers every round up to and including Qatar, plus pre-season testing, and the score was computed after the race. Only the Abu Dhabi forecast is out of sample.
- **Backtest results.** Over a 22-race backtest the model picked the winner in {{fact:backtest_winner}} races and placed {{fact:backtest_top10}} of the top ten correctly.
- **Ranking fusion.** A "fusion" step meant to blend several ranking strategies stopped at its starting guess, so the four strategies it compared ended up identical.
- **Planned evaluation:** a non-hierarchical baseline for comparison; a rolling time-split backtest that trains only on past races, which also fixes the Qatar leak; a check of how stable the probabilities are as the number of simulations grows; and a pinned environment.

## Statistical methods and implementation {#foundations}

In related individual and paired experiments, I implemented and compared the following statistical methods:

- **Estimation.** Derived maximum-likelihood estimators for exponential and Beta distributions, solved them with Newton–Raphson and checked the Hessian to confirm a maximum; fitted a Gaussian by the method of moments in a lab on the bias–variance trade-off.
- **Simulation.** Estimated probabilities by Monte Carlo and checked them against an exact enumeration of all 7⁶ outcomes, to see how fast the simulation converges.
- **Bayesian models in PyMC.** Beta–Binomial models of win rates, including a study over simulated Formula 1 seasons; a Poisson switchpoint model that locates the moment a rate changes in motorsport telemetry; and the three-driver hierarchical model that became the starting point of this project.
- **Samplers.** Wrote a Metropolis–Hastings sampler from scratch, then compared it with PyMC's NUTS on the same model, checking convergence with ArviZ.
- **Testing.** Compared a Welch t-test with Bayesian estimation of a difference in means on the same data, to contrast what each approach reports.
