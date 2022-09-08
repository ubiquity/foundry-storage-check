# 🔥🛠️ Foundry Storage Diff Reporter

- Easily compare gas reports generated by Foundry automatically on each of your Pull Requests!

## How it works

Everytime somebody opens a Pull Request, the action expects [Foundry](https://github.com/foundry-rs/foundry) `forge` to run a test suite, generating a gas report to a temporary file (named `gasreport.ansi` by default).

Once generated, the action will fetch the comparative gas report stored as an artifact from previous runs; parse & compare them, storing the results in the action's outputs as shell and as markdown.

## Getting started

### Automatically generate & compare to the previous storage layout on every PR

Add a workflow (`.github/workflows/foundry-storage-diff.yml`):

```yaml
name: Check storage layout

on:
  push:
    branches:
      - main
  pull_request:
    # Optionally configure to run only for changes in specific files. For example:
    # paths:
    # - src/**
    # - test/**
    # - foundry.toml
    # - remappings.txt
    # - .github/workflows/foundry-storage-diff.yml

jobs:
  check_storage_layout:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          submodules: recursive

      - name: Install Foundry
        uses: onbjerg/foundry-toolchain@v1
        with:
          version: nightly

      # Add any step generating a storage layout to a temporary file named storage_layout.json
      # For example:
      - name: Run tests
        run: forge inspect contracts/compound/Morpho.sol:Morpho storage-layout | tee storage_layout.json

      - name: Check storage layout
        uses: Rubilmax/foundry-storage-diff@v1.0
```

> :information_source: **An error will appear at first run!**<br/>
> 🔴 <em>**Error:** No workflow run found with an artifact named "main.storage_layout.json"</em><br/>
> As the action is expecting a comparative file stored on the base branch and cannot find it (because the action never ran on the target branch and thus has never uploaded any storage layout report)

## Options

### `report` _{string}_

This should correspond to the path of a file where the output of forge's gas report has been logged.
Only necessary when generating multiple gas reports on the same repository.

⚠️ Make sure this file uniquely identifies a gas report, to avoid messing up with a gas report of another workflow on the same repository!

_Defaults to: `gasreport.ansi`_

### `base` _{string}_

The gas diff reference branch name, used to fetch the previous gas report to compare the freshly generated gas report to.

_Defaults to: `${{ github.base_ref || github.ref_name }}`_

### `head` _{string}_

The gas diff target branch name, used to upload the freshly generated gas report.

_Defaults to: `${{ github.head_ref || github.ref_name }}`_

### `token` _{string}_

The github token allowing the action to upload and download gas reports generated by foundry. You should not need to customize this, as the action already has access to the default Github Action token.

_Defaults to: `${{ github.token }}`_

This repository is maintained independently from [Foundry](https://github.com/foundry-rs/foundry) and may not work as expected with all versions of `forge`.
