const { writeFile } = require("node:fs/promises");
const { resolve } = require("node:path");

const TOKEN_CA = "3ZAAAwa8FfAgFqB6SFqewzUe9WVjtzXZxg6b6b7MwL7P";
const AMANA_GENESIS_ADDRESS = "9hrbkka1zzzBUTpwXb2eicGQqQ8QcToFuZSq6Yhim5v9";
const OUTPUT_FILE = resolve(__dirname, "..", "circulating-supply.json");

function requireHeliusApiKey() {
  const apiKey = process.env.HELIUS_API_KEY;

  if (!apiKey) {
    throw new Error("Missing HELIUS_API_KEY environment variable.");
  }

  return apiKey;
}

function parseTokenAmount(tokenAmount, label) {
  if (
    !tokenAmount ||
    typeof tokenAmount.amount !== "string" ||
    !/^\d+$/.test(tokenAmount.amount) ||
    !Number.isInteger(tokenAmount.decimals)
  ) {
    throw new Error(
      `Unexpected ${label} response shape: ${JSON.stringify(tokenAmount)}`,
    );
  }

  return {
    amount: BigInt(tokenAmount.amount),
    decimals: tokenAmount.decimals,
  };
}

function rawAmountToNumber(amount, decimals) {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const decimal =
    fraction === 0n
      ? whole.toString()
      : `${whole}.${fraction
          .toString()
          .padStart(decimals, "0")
          .replace(/0+$/, "")}`;
  const value = Number(decimal);

  if (!Number.isFinite(value)) {
    throw new Error(`Circulating supply is not a valid JSON number: ${decimal}`);
  }

  return value;
}

function assertSameDecimals(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label} decimals ${actual} did not match token supply decimals ${expected}.`,
    );
  }
}

async function callHeliusRpc(method, params, options = {}) {
  const apiKey = requireHeliusApiKey();
  let response;

  try {
    response = await fetch(
      `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: method,
          method,
          params,
        }),
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Helius request failed: ${message}`);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Helius request failed with HTTP ${response.status}: ${body}`);
  }

  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Helius response was not valid JSON: ${message}`);
  }

  if (payload && payload.error && !options.allowRpcError) {
    throw new Error(`Helius RPC error: ${JSON.stringify(payload.error)}`);
  }

  return payload;
}

async function fetchTotalSupply() {
  const payload = await callHeliusRpc("getTokenSupply", [TOKEN_CA]);
  return parseTokenAmount(payload?.result?.value, "token supply");
}

async function fetchAmanaGenesisBalanceFromOwner(expectedDecimals) {
  const payload = await callHeliusRpc("getTokenAccountsByOwner", [
    AMANA_GENESIS_ADDRESS,
    { mint: TOKEN_CA },
    { encoding: "jsonParsed" },
  ]);
  const accounts = payload?.result?.value;

  if (!Array.isArray(accounts)) {
    throw new Error(
      `Unexpected AMANA Genesis owner response shape: ${JSON.stringify(payload)}`,
    );
  }

  if (accounts.length === 0) {
    return null;
  }

  return accounts.reduce((total, account) => {
    const info = account?.account?.data?.parsed?.info;

    if (info?.mint !== TOKEN_CA) {
      throw new Error(
        `AMANA Genesis owner account did not match CA ${TOKEN_CA}: ${JSON.stringify(info)}`,
      );
    }

    const balance = parseTokenAmount(
      info?.tokenAmount,
      "AMANA Genesis owner balance",
    );
    assertSameDecimals(
      balance.decimals,
      expectedDecimals,
      "AMANA Genesis owner balance",
    );

    return total + balance.amount;
  }, 0n);
}

async function fetchAmanaGenesisBalanceFromTokenAccount(expectedDecimals) {
  const payload = await callHeliusRpc("getAccountInfo", [
    AMANA_GENESIS_ADDRESS,
    { encoding: "jsonParsed" },
  ]);
  const info = payload?.result?.value?.data?.parsed?.info;

  if (!info || info.mint !== TOKEN_CA) {
    return null;
  }

  const balance = parseTokenAmount(
    info.tokenAmount,
    "AMANA Genesis token account balance",
  );
  assertSameDecimals(
    balance.decimals,
    expectedDecimals,
    "AMANA Genesis token account balance",
  );

  return balance.amount;
}

async function fetchAmanaGenesisBalance(expectedDecimals) {
  const ownerBalance = await fetchAmanaGenesisBalanceFromOwner(expectedDecimals);

  if (ownerBalance !== null) {
    return ownerBalance;
  }

  const tokenAccountBalance =
    await fetchAmanaGenesisBalanceFromTokenAccount(expectedDecimals);

  if (tokenAccountBalance !== null) {
    return tokenAccountBalance;
  }

  throw new Error(
    `AMANA Genesis address ${AMANA_GENESIS_ADDRESS} is neither an owner ` +
      `wallet with CA ${TOKEN_CA} token accounts nor a token account for that CA.`,
  );
}

async function main() {
  const totalSupply = await fetchTotalSupply();
  const amanaGenesisBalance = await fetchAmanaGenesisBalance(totalSupply.decimals);

  if (amanaGenesisBalance > totalSupply.amount) {
    throw new Error("AMANA Genesis balance is greater than total token supply.");
  }

  // AMANA Genesis address balance is excluded from circulation. If more
  // non-circulating wallets need exclusion later, subtract those balances here too.
  const circulatingSupply = rawAmountToNumber(
    totalSupply.amount - amanaGenesisBalance,
    totalSupply.decimals,
  );
  await writeFile(
    OUTPUT_FILE,
    `${JSON.stringify({ circulatingSupply }, null, 2)}\n`,
    "utf8",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
