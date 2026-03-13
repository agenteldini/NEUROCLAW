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
  txs: string[];
  skipped: boolean;
  error?: string;
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

async function saveStats(claimed: number, boughtBack: number, burned: string, txs: string[]) {
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
    last_run_at: new Date().toISOString(),
    transactions: txs,
    updated_at: new Date().toISOString(),
  });
}

export async function runCycle(): Promise<CycleResult> {
  const { keypair, mint, rpcUrl, minClaimSol } = getConfig();
  const connection = new Connection(rpcUrl, "confirmed");
  const sdk = new OnlinePumpSdk(connection);
  const txs: string[] = [];

  const balanceLamports = await sdk.getCreatorVaultBalanceBothPrograms(keypair.publicKey);
  const balanceSol = balanceLamports.toNumber() / 1e9;

  if (balanceSol < minClaimSol) {
    return { claimed: 0, boughtBack: 0, burned: "0", txs: [], skipped: true };
  }

  // 1. Claim fees (with v2 PDA for both programs)
  const claimIx = await sdk.collectCoinCreatorFeeInstructions(keypair.publicKey, keypair.publicKey);
  appendV2Account(claimIx, PUMP_PROGRAM_ID, bondingCurveV2Pda(mint));
  appendV2Account(claimIx, PUMP_AMM_PROGRAM_ID, poolV2Pda(mint));
  const claimTx = new Transaction().add(...claimIx);
  const claimSig = await sendTx(connection, claimTx, keypair);
  txs.push(claimSig);

  await new Promise((r) => setTimeout(r, 3000));

  const txFeeSol = 0.005;
  const buyLamports = Math.max(0, balanceLamports.toNumber() - txFeeSol * 1e9);
  if (buyLamports <= 0) {
    await saveStats(balanceSol, 0, "0", txs);
    return { claimed: balanceSol, boughtBack: 0, burned: "0", txs, skipped: false };
  }

  const buySolBn = new BN(Math.floor(buyLamports));
  const buySol = buyLamports / 1e9;
  const isMigrated = await checkMigration(connection, mint);

  // 2. Buyback
  let buySig: string;

  if (isMigrated) {
    const onlineAmm = new OnlinePumpAmmSdk(connection);
    const poolPda = canonicalPumpPoolPda(mint);
    const ata = getAssociatedTokenAddressSync(mint, keypair.publicKey, true, TOKEN_2022_PROGRAM_ID);
    const swapState = await onlineAmm.swapSolanaState(poolPda, keypair.publicKey, ata);
    const buyIx = await PUMP_AMM_SDK.buyQuoteInput(swapState, buySolBn, 5);
    appendV2Account(buyIx, PUMP_AMM_PROGRAM_ID, poolV2Pda(mint));
    const buyTx = new Transaction().add(...buyIx);
    buySig = await sendTx(connection, buyTx, keypair);
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
    buySig = await sendTx(connection, buyTx, keypair);
  }
  txs.push(buySig);

  // 3. Burn
  await new Promise((r) => setTimeout(r, 3000));
  const ata = getAssociatedTokenAddressSync(mint, keypair.publicKey, true, TOKEN_2022_PROGRAM_ID);
  let tokenBalance = BigInt(0);
  try {
    const tokenInfo = await connection.getTokenAccountBalance(ata);
    tokenBalance = BigInt(tokenInfo.value.amount);
  } catch {
    // ATA may not exist if buyback returned 0 tokens
  }

  let burnedAmount = "0";
  if (tokenBalance > BigInt(0)) {
    const burnIx = createBurnInstruction(
      ata, mint, keypair.publicKey, tokenBalance, [], TOKEN_2022_PROGRAM_ID
    );
    const burnTx = new Transaction().add(burnIx);
    const burnSig = await sendTx(connection, burnTx, keypair);
    txs.push(burnSig);
    burnedAmount = tokenBalance.toString();
  }

  // 4. Save to Supabase
  await saveStats(balanceSol, buySol, burnedAmount, txs);

  return { claimed: balanceSol, boughtBack: buySol, burned: burnedAmount, txs, skipped: false };
}
