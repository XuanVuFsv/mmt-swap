import { MmtSDK, TickMath } from '../src';
import { Transaction } from '@mysten/sui/transactions';
import Decimal from 'decimal.js';
import { TxHelper } from '../tests/transaction';
import { executeTxExample } from './example-utils';
import BN from 'bn.js';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const loopCount = 2; //Số lần swap

export async function main(isXtoY) {
  // Initialize SDK
  const sdk = MmtSDK.NEW({
    network: 'testnet',
  });

  //-----------CONFIG---------------
  const key = ''; //Nhập key ở đây
  const swapAmount = '1'; //Số token mỗi lần swap

  // Define the liquidity pool ID
  // const poolId = '0xb0a595cb58d35e07b711ac145b4846c8ed39772c6d6f6716d89d71c64384543b'; //suiUSDT-suiUSDC
  // Các pool khác xem tại https://developers.mmt.finance/clmm-smart-contracts/deployments
  //-------------------------------

  // const signer = Ed25519Keypair.fromSecretKey(key);
  const senderAddress = '0xae55cde531ea8d707e69011301e78b2f21e6a0e1094e60033ab93a8e894e6871';
  // const senderAddress = signer.toSuiAddress();

  // Create a new transaction instance
  const tx = new Transaction();

  const poolId = '0x53ceda0bbe1bdb3c1c0b1c53ecb49856f135a9fffc91e5a50aa4045a3f8240f7'; //MMT/USDC
  // const poolId = '0xaa740e3d58ecfd2323eb5ab4cedab5f07554385d96aea2d5050471aba1e2e0ea' //DEEP/SUI
  // const poolId = '0xf0d3fa213889a7c2bc79505c030b6a105d549e6608aeab201811af333f9b18a4' //DEEP/USDC

  const pool = await sdk.Pool.getPool(poolId);
  if (!pool) throw new Error('Pool not found');

  // console.log('Pool liquidity:', pool.liquidity.toString());

  // ------------------------
  const coinType = isXtoY ? pool.tokenX.coinType : pool.tokenY.coinType;
  const isGasCoin =
    coinType === '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI'; // Kiểm tra xem token có phải là SUI không
  let coin;
  if (isGasCoin) {
    coin = await TxHelper.prepareSplitCoin(tx, sdk.rpcClient, coinType, swapAmount, senderAddress);
    // console.log('Swap Gas Coin')
  } else {
    coin = await TxHelper.prepareCoin(tx, sdk.rpcClient, coinType, swapAmount, senderAddress);
    // console.log('Swap Normal Coin')
  }
  // ------------------------

  let currentPrice: Decimal;
  let limitSqrtPrice: BN;
  let limitPrice: Decimal;

  if (isXtoY) {
    currentPrice = TickMath.sqrtPriceX64ToPrice(
      new BN(pool.currentSqrtPrice),
      pool.tokenX.decimals,
      pool.tokenY.decimals,
    );

    limitPrice = currentPrice.mul(new Decimal(0.8));
    limitSqrtPrice = TickMath.priceToSqrtPriceX64(
      limitPrice,
      pool.tokenX.decimals,
      pool.tokenY.decimals,
    );
  } else {
    // Đảo giá: Y → X
    currentPrice = TickMath.sqrtPriceX64ToPrice(
      new BN(pool.currentSqrtPrice),
      pool.tokenX.decimals,
      pool.tokenY.decimals,
    );

    const invertedPrice = new Decimal(1).div(currentPrice); // X per Y → Y per X
    limitPrice = invertedPrice.mul(new Decimal(0.8));

    limitSqrtPrice = TickMath.priceToSqrtPriceX64(
      limitPrice,
      pool.tokenY.decimals,
      pool.tokenX.decimals,
    );
  }

  console.log('Current price:', currentPrice.toString());
  console.log('Limit price (80%):', limitPrice.toString());
  // console.log('Sqrt limit price:', limitSqrtPrice.toString());

  sdk.Pool.swap(
    tx,
    {
      objectId: poolId,
      tokenXType: pool.tokenX.coinType,
      tokenYType: pool.tokenY.coinType,
      tickSpacing: pool.tickSpacing,
    },
    BigInt(swapAmount),
    coin,
    isXtoY,
    senderAddress,
    BigInt(limitSqrtPrice.toString()),
  );

  const resp = await executeTxExample({
    tx,
    sdk,
    execution: {
      dryRun: true, // Change to false to actually submit
      address: senderAddress,
      // signer: signer, // Uncomment this line if dryRun = false
    },
  });

  console.log(resp['effects']['status']);
  console.log('Swap from:', coinType);
  console.log('Swap direction:', isXtoY ? 'X → Y' : 'Y → X');
  console.log('Swap amount:', swapAmount);
}

async function executeSwapLoop(loopCount) {
  let isXtoY = true; // Bắt đầu với hướng X → Y

  for (let i = 0; i < loopCount; i++) {
    try {
      console.log(`Starting swap iteration ${i + 1}...`);
      await main(isXtoY); // Gọi hàm main với hướng swap hiện tại
      console.log(`Swap iteration ${i + 1} finished.`);
      console.log('********************' + '\n');
      isXtoY = !isXtoY; // Đảo ngược hướng swap cho lần tiếp theo
    } catch (err) {
      console.error(`Swap iteration ${i + 1} failed:`, err);
    }
  }
}

// Gọi hàm executeSwapLoop với số lần lặp mong muốn
executeSwapLoop(loopCount);
// main().then(() => console.log('Swap finished')).catch((err) => console.error('Swap failed:', err));
