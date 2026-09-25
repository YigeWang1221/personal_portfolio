## Pipeline {#pipeline}

The goal was to learn a professional quantitative-research workflow by building one end to end. The pipeline ranks a hand-picked universe of US stocks by their predicted five-day return after removing what broad ETFs explain, and trades a dollar-neutral long/short basket on the ranking.

- **Data.** Daily prices from 2018 to 2025, cached locally, with index, sector, bond and gold ETFs as features and as factor proxies.
- **Features.** 35 factors covering momentum, volatility, volume, bands, RSI and performance relative to the ETFs.
- **Labels.** The five-day return minus the return implied by the ETFs, using trailing betas, then z-scored per ticker on a rolling window.
- **Evaluation.** Expanding walk-forward folds for training, and a backtest that rebalances on a fixed schedule, goes long the top names and short the bottom names, and charges transaction costs on turnover.

## Model {#model}

Each batch is one or more whole trading days, so the model sees every stock of a day together.

1. **Time2Vec** embeds the time position of each observation.
2. **Attention over time** runs within each stock's recent history.
3. **Attention across stocks** runs among all stocks of the same day, with padding masks for missing tickers.
4. **Attention pooling** and an MLP produce one score per stock.

The two attention steps repeat in stacked layers. Training optimizes an information-coefficient loss — the rank correlation between scores and labels — written in vectorized form and checked numerically against a loop version. A ListNet ranking loss is available as an alternative.

## Trainer engineering {#engineering}

- **Memory-aware training.** Day tensors stay on the CPU and move to the GPU one batch at a time; inference is batched; training uses fp16 autocast with a gradient scaler. I diagnosed and fixed a GPU out-of-memory error on the way.
- **Walk-forward folds.** {{fact:folds}} expanding folds with early stopping on validation rank IC.
- **Cluster runs.** A Slurm script requests one H200 GPU, resubmits itself if it was started on a login node, and checks for CUDA before training. The largest model trained at {{fact:epoch_time}} per epoch.
- **Reproducible runs.** Run names encode the hyperparameters, every run writes JSON and text manifests, each fold has its own seed, and a separate runner repeats a configuration across five seeds to test stability.
- **From notebooks to a package.** The research notebooks became a modular package with written module contracts: the tensor shapes and file schemas passed between stages.

## How it evolved {#process}

The versions read like a research plan: a toy first version; then rolling normalization and costs; then Time2Vec and the factor set; then real cross-stock attention and walk-forward evaluation; and finally a modular package with two label definitions and three model sizes ({{fact:model_sizes}} parameters). A 24-step progress log records each change and the reason for it. Along the way I found and fixed an evaluation bug of my own: the transformed label had been used as if it were the realized return.

## What I owned {#ownership}

All of it. It is a solo project, written with AI coding assistance, and the design draws on published models of temporal and cross-sectional attention.

## Scope and known limits {#limits}

The results were weak and unstable, so this page does not report returns, information coefficients or Sharpe ratios. A careful reviewer would also point to the evaluation design, and I would change it first:

- the signal direction and the best configuration were chosen using test-period results;
- there is no embargo gap between the training, validation and test windows, although labels span several days;
- the universe is today's list of tickers, which builds in survivorship bias.

Next steps: embargoed splits, model selection on validation data only, a point-in-time universe, and benchmark comparisons with significance tests.
