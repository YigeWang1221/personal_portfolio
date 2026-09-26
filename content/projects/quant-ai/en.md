## Pipeline {#pipeline}

I built a research prototype covering feature engineering, model training and backtesting. The pipeline ranks a hand-picked universe of US stocks by their predicted five-day return after removing what broad ETFs explain, and trades a dollar-neutral long/short basket on the ranking.

- **Data and features.** Daily prices from 2018 to 2025, cached locally, and 35 factors covering momentum, volatility, volume, bands, RSI and performance relative to index, sector, bond and gold ETFs.
- **Labels.** The five-day return minus the return implied by the ETFs, using trailing betas, z-scored per ticker on a rolling window.
- **Evaluation.** {{fact:folds}} expanding walk-forward folds with early stopping on validation rank IC, and a backtest that rebalances on a fixed schedule and charges transaction costs on turnover.

The research notebooks became a modular package with written module contracts: the tensor shapes and file schemas passed between stages.

## Model {#model}

Each batch is one or more whole trading days, so the model sees every stock of a day together.

1. **Time2Vec** embeds the time position of each observation.
2. **Attention over time** runs within each stock's recent history.
3. **Attention across stocks** runs among all stocks of the same day, with padding masks for missing tickers.
4. **Attention pooling** and an MLP produce one score per stock.

Training optimizes an information-coefficient loss — the rank correlation between scores and labels — written in vectorized form and checked numerically against a loop version. Three model sizes were trained: {{fact:model_sizes}} parameters.

## Trainer engineering {#engineering}

- **Memory-aware training.** Day tensors stay on the CPU and move to the GPU one batch at a time; inference is batched; training uses fp16 autocast with a gradient scaler.
- **Cluster runs.** A Slurm script requests one H200 GPU, resubmits itself if it was started on a login node, and checks for CUDA before training. The largest model trained at {{fact:epoch_time}} per epoch.
- **Reproducible runs.** Run names encode the hyperparameters, every run writes a manifest, each fold has its own seed, and a separate runner repeats a configuration across five seeds.

## Scope {#scope}

The evaluation has three limitations: model selection used test-period results, the splits have no embargo gap although labels span several days, and the universe uses today's tickers, introducing survivorship bias.
