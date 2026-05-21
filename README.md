# Circulating Supply JSON API

This repository publishes a tiny static JSON endpoint for Jupiter:

```json
{
  "circulatingSupply": 0
}
```

The file is served by GitHub Pages from:

```text
https://GITHUB_USERNAME.github.io/REPO_NAME/circulating-supply.json
```

## Token

CA / token identifier:

```text
3ZAAAwa8FfAgFqB6SFqewzUe9WVjtzXZxg6b6b7MwL7P
```

The script gets the total supply for this CA from Helius `getTokenSupply`, then
subtracts the AMANA Genesis address balance before publishing:

```text
9hrbkka1zzzBUTpwXb2eicGQqQ8QcToFuZSq6Yhim5v9
```

## Setup

1. Add a repository secret named `HELIUS_API_KEY`.
2. Enable GitHub Pages for this repository.
3. Set the Pages source to the repository branch and root directory.
4. Run the `Update circulating supply` workflow manually once, or wait for the daily schedule.

## Local Update

Run the updater with Node.js 20:

```sh
HELIUS_API_KEY=your_helius_api_key node scripts/update-supply.js
```

The script writes `circulating-supply.json` with exactly one field. The value is
the total supply minus the AMANA Genesis address balance:

```json
{
  "circulatingSupply": 123456789
}
```
