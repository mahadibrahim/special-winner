# Aspire Sports Financial Model

Generates `output/aspire-financial-model.xlsx` — a partner-pitch-ready
5-year monthly financial model for Aspire Sports.

Source spec: `../docs/superpowers/specs/2026-04-15-aspire-sports-financial-model-design.md`

## Install

    cd scripts/financial-model
    pip install -e .[dev]

## Regenerate the xlsx

    python build_model.py

Output lands at `output/aspire-financial-model.xlsx` (gitignored).

## Run tests

    pytest -v

## Updating assumptions

Edit `assumptions.yaml` and re-run `python build_model.py`. The xlsx is
regenerated deterministically from the YAML; never edit the xlsx directly
(it will be overwritten).

## Structure

- `assumptions.yaml` — single source of truth
- `engine/` — pure Python calculation modules (no IO)
- `writers/` — xlsx tab writer modules
- `build_model.py` — orchestrator CLI

## Known data gaps (base case v1)

See spec §9 for the full list. The YAML flags low-confidence cells with
the `LOW CONFIDENCE` comment. Before the partner meeting:

- Call i9 Sports Dublin/Hilliard for actual pricing
- Call 2-3 Central Ohio cities for outdoor field permit rates
- Call the indoor facility owner for actual hourly quote
- Call Resolute for weekend/evening turf rate
