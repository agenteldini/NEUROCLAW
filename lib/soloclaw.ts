import {
  Connection,
  Keypair,
  Transaction,
  PublicKey,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createBurnInstruction,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  OnlinePumpSdk,
  PUMP_SDK,
  PUMP_PROGRAM_ID,
  getBuyTokenAmountFromSolAmount,
  bondingCurveV2Pda,
} from "@pump-fun/pump-sdk";
import {
  OnlinePumpAmmSdk,
  PUMP_AMM_SDK,
  PUMP_AMM_PROGRAM_ID,
  poolV2Pda,
  canonicalPumpPoolPda,
} from "@pump-fun/pump-swap-sdk";
import BN from "bn.js";
import bs58 from "bs58";
import { getSupabaseAdmin } from "./supabase";

interface CycleResult {
  claimed: number;
  boughtBack: number;
  burned: string;
  lpSol: number;
  strategy: string;
  txs: string[];
  skipped: boolean;
  error?: string;
}

interface Strategy {
  name: string;
  buybackFraction: number;
  lpFraction: number;
}

const STRATEGIES: (Strategy & { weight: number })[] = [
  { name: "burn-heavy",  buybackFraction: 0.85, lpFraction: 0.15, weight: 30 },
  { name: "balanced",    buybackFraction: 0.50, lpFraction: 0.50, weight: 25 },
  { name: "lp-focus",   buybackFraction: 0.15, lpFraction: 0.85, weight: 20 },
  { name: "full-burn",  buybackFraction: 1.00, lpFraction: 0.00, weight: 15 },
  { name: "full-lp",    buybackFraction: 0.00, lpFraction: 1.00, weight: 10 },
];

function pickStrategy(): Strategy {
  const total = STRATEGIES.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const s of STRATEGIES) {
    r -= s.weight;
    if (r <= 0) return s;
  }
  return STRATEGIES[0];
}

function getConfig() {
  const privKey = process.env.AGENT_PRIVATE_KEY;
  if (!privKey) throw new Error("AGENT_PRIVATE_KEY not set");

  const mintAddr = process.env.MINT_ADDRESS;
  if (!mintAddr) throw new Error("MINT_ADDRESS not set");

  let keypair: Keypair;
  if (privKey.startsWith("[")) {
    keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(privKey)));
  } else {
    keypair = Keypair.fromSecretKey(bs58.decode(privKey));
  }

  const mint = new PublicKey(mintAddr);
  const rpcUrl = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
  const minClaimSol = parseFloat(process.env.MIN_CLAIM_SOL || "0.01");

  return { keypair, mint, rpcUrl, minClaimSol };
}

function appendV2Account(
  instructions: { programId: PublicKey; keys: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[] }[],
  programId: PublicKey,
  v2Pda: PublicKey
) {
  for (const ix of instructions) {
    if (ix.programId.equals(programId)) {
      ix.keys.push({ pubkey: v2Pda, isSigner: false, isWritable: false });
    }
  }
}

async function sendTx(connection: Connection, tx: Transaction, signer: Keypair): Promise<string> {
  tx.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
  );

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const sig = await sendAndConfirmTransaction(connection, tx, [signer], {
        skipPreflight: false,
        preflightCommitment: "processed",
        maxRetries: 5,
      });
      return sig;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("blockhash") && attempt < 2) {
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        continue;
      }
      throw err;
    }
  }
  throw new Error("tx failed after 3 attempts");
}

async function checkMigration(connection: Connection, mint: PublicKey): Promise<boolean> {
  try {
    const poolPda = canonicalPumpPoolPda(mint);
    const info = await connection.getAccountInfo(poolPda);
    return info !== null;
  } catch {
    return false;
  }
}

async function addLiquidity(
  connection: Connection,
  keypair: Keypair,
  mint: PublicKey,
  lpLamports: number,
  txs: string[]
): Promise<number> {
  try {
    const onlineAmm = new OnlinePumpAmmSdk(connection);
    const poolPda = canonicalPumpPoolPda(mint);
    const ata = getAssociatedTokenAddressSync(mint, keypair.publicKey, true, TOKEN_2022_PROGRAM_ID);

    // 65% of LP allocation buys tokens, 35% goes as SOL into the pool
    const buyLamports = Math.floor(lpLamports * 0.65);
    const depositSolLamports = Math.floor(lpLamports * 0.35);
    const buyBn = new BN(buyLamports);

    // 1. Buy tokens for LP
    const swapState = await onlineAmm.swapSolanaState(poolPda, keypair.publicKey, ata);
    const buyIx = await PUMP_AMM_SDK.buyQuoteInput(swapState, buyBn, 5);
    appendV2Account(buyIx, PUMP_AMM_PROGRAM_ID, poolV2Pda(mint));
    const buyTx = new Transaction().add(...buyIx);
    const buySig = await sendTx(connection, buyTx, keypair);
    txs.push(buySig);

    await new Promise((r) => setTimeout(r, 3000));

    // 2. Deposit tokens + SOL into pool
    const tokenInfo = await connection.getTokenAccountBalance(ata);
    const tokenAmount = BigInt(tokenInfo.value.amount);
    if (tokenAmount === BigInt(0)) return 0;

    const depositSolBn = new BN(depositSolLamports);
    const liquidityState = await onlineAmm.depositSolanaState(poolPda, keypair.publicKey, ata);
    const lpToken = new BN(tokenAmount.toString());
    const depositIx = await onlineAmm.depositInstructions(liquidityState, lpToken, depositSolBn, 5);
    appendV2Account(depositIx, PUMP_AMM_PROGRAM_ID, poolV2Pda(mint));
    const depositTx = new Transaction().add(...depositIx);
    const depositSig = await sendTx(connection, depositTx, keypair);
    txs.push(depositSig);

    return lpLamports / 1e9;
  } catch (err) {
    console.error("LP failed, falling back to buyback:", err instanceof Error ? err.message : err);
    return -1; // signal to caller to fall back
  }
}

async function saveStats(claimed: number, boughtBack: number, burned: string, lpSol: number, strategy: string, txs: string[]) {
  const db = getSupabaseAdmin();
  const { data: existing } = await db
    .from("agent_stats")
    .select("*")
    .eq("id", "default")
    .single();

  await db.from("agent_stats").upsert({
    id: "default",
    total_claimed: (existing?.total_claimed || 0) + claimed,
    total_bought_back: (existing?.total_bought_back || 0) + boughtBack,
    total_burned: (BigInt(existing?.total_burned || "0") + BigInt(burned)).toString(),
    total_lp_sol: (existing?.total_lp_sol || 0) + lpSol,
    last_run_at: new Date().toISOString(),
    transactions: txs,
    updated_at: new Date().toISOString(),
  });
}

async function doBuyback(
  connection: Connection,
  keypair: Keypair,
  mint: PublicKey,
  sdk: OnlinePumpSdk,
  isMigrated: boolean,
  buyLamports: number,
  txs: string[]
): Promise<{ buySol: number; burnedAmount: string }> {
  const buySolBn = new BN(Math.floor(buyLamports));
  const buySol = buyLamports / 1e9;
  const ata = getAssociatedTokenAddressSync(mint, keypair.publicKey, true, TOKEN_2022_PROGRAM_ID);

  if (isMigrated) {
    const onlineAmm = new OnlinePumpAmmSdk(connection);
    const poolPda = canonicalPumpPoolPda(mint);
    const swapState = await onlineAmm.swapSolanaState(poolPda, keypair.publicKey, ata);
    const buyIx = await PUMP_AMM_SDK.buyQuoteInput(swapState, buySolBn, 5);
    appendV2Account(buyIx, PUMP_AMM_PROGRAM_ID, poolV2Pda(mint));
    const buyTx = new Transaction().add(...buyIx);
    txs.push(await sendTx(connection, buyTx, keypair));
  } else {
    const global = await sdk.fetchGlobal();
    const buyState = await sdk.fetchBuyState(mint, keypair.publicKey, TOKEN_2022_PROGRAM_ID);
    const amount = getBuyTokenAmountFromSolAmount({
      global,
      feeConfig: null,
      mintSupply: buyState.bondingCurve.tokenTotalSupply,
      bondingCurve: buyState.bondingCurve,
      amount: buySolBn,
    });
    const buyIx = await PUMP_SDK.buyInstructions({
      global,
      bondingCurveAccountInfo: buyState.bondingCurveAccountInfo,
      bondingCurve: buyState.bondingCurve,
      associatedUserAccountInfo: buyState.associatedUserAccountInfo,
      mint,
      user: keypair.publicKey,
      amount,
      solAmount: buySolBn,
      slippage: 2,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
    });
    appendV2Account(buyIx, PUMP_PROGRAM_ID, bondingCurveV2Pda(mint));
    const buyTx = new Transaction().add(...buyIx);
    txs.push(await sendTx(connection, buyTx, keypair));
  }

  // Burn
  await new Promise((r) => setTimeout(r, 3000));
  let tokenBalance = BigInt(0);
  try {
    const tokenInfo = await connection.getTokenAccountBalance(ata);
    tokenBalance = BigInt(tokenInfo.value.amount);
  } catch {}

  let burnedAmount = "0";
  if (tokenBalance > BigInt(0)) {
    const burnIx = createBurnInstruction(ata, mint, keypair.publicKey, tokenBalance, [], TOKEN_2022_PROGRAM_ID);
    const burnTx = new Transaction().add(burnIx);
    txs.push(await sendTx(connection, burnTx, keypair));
    burnedAmount = tokenBalance.toString();
  }

  return { buySol, burnedAmount };
}

export async function runCycle(): Promise<CycleResult> {
  const { keypair, mint, rpcUrl, minClaimSol } = getConfig();
  const connection = new Connection(rpcUrl, "confirmed");
  const sdk = new OnlinePumpSdk(connection);
  const txs: string[] = [];

  const balanceLamports = await sdk.getCreatorVaultBalanceBothPrograms(keypair.publicKey);
  const balanceSol = balanceLamports.toNumber() / 1e9;

  if (balanceSol < minClaimSol) {
    return { claimed: 0, boughtBack: 0, burned: "0", lpSol: 0, strategy: "skipped", txs: [], skipped: true };
  }

  // 1. Claim
  const claimIx = await sdk.collectCoinCreatorFeeInstructions(keypair.publicKey, keypair.publicKey);
  appendV2Account(claimIx, PUMP_PROGRAM_ID, bondingCurveV2Pda(mint));
  appendV2Account(claimIx, PUMP_AMM_PROGRAM_ID, poolV2Pda(mint));
  const claimTx = new Transaction().add(...claimIx);
  txs.push(await sendTx(connection, claimTx, keypair));

  await new Promise((r) => setTimeout(r, 3000));

  const txFeeSol = 0.005;
  const availableLamports = Math.max(0, balanceLamports.toNumber() - txFeeSol * 1e9);
  if (availableLamports <= 0) {
    await saveStats(balanceSol, 0, "0", 0, "none", txs);
    return { claimed: balanceSol, boughtBack: 0, burned: "0", lpSol: 0, strategy: "none", txs, skipped: false };
  }

  const isMigrated = await checkMigration(connection, mint);

  // 2. Pick strategy — LP only available after migration
  const strategy = isMigrated ? pickStrategy() : { name: "full-burn", buybackFraction: 1.0, lpFraction: 0.0 };

  let lpSol = 0;
  let buyLamports = availableLamports;

  // 3. LP (if applicable)
  if (isMigrated && strategy.lpFraction > 0) {
    const lpLamports = Math.floor(availableLamports * strategy.lpFraction);
    buyLamports = availableLamports - lpLamports;

    const lpResult = await addLiquidity(connection, keypair, mint, lpLamports, txs);
    if (lpResult === -1) {
      // LP failed — redirect to buyback
      buyLamports = availableLamports;
    } else {
      lpSol = lpResult;
    }
  }

  // 4. Buyback + burn
  let buySol = 0;
  let burnedAmount = "0";

  if (buyLamports > 0 && strategy.buybackFraction > 0) {
    const result = await doBuyback(connection, keypair, mint, sdk, isMigrated, buyLamports, txs);
    buySol = result.buySol;
    burnedAmount = result.burnedAmount;
  }

  // 5. Save
  await saveStats(balanceSol, buySol, burnedAmount, lpSol, strategy.name, txs);

  return { claimed: balanceSol, boughtBack: buySol, burned: burnedAmount, lpSol, strategy: strategy.name, txs, skipped: false };
}
