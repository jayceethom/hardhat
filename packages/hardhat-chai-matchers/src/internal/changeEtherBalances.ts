import type EthersT from "ethers";
import type { Addressable, BigNumberish, TransactionResponse } from "ethers";
import ordinal from "ordinal";

import { buildAssert } from "../utils";
import { getAddressOf } from "./misc/account";
import {
  BalanceChangeOptions,
  getAddresses,
  getBalances,
} from "./misc/balance";
import { assertIsNotNull } from "./utils";

export function supportChangeEtherBalances(Assertion: Chai.AssertionStatic) {
  Assertion.addMethod(
    "changeEtherBalances",
    function (
      this: any,
      accounts: Array<Addressable | string>,
      balanceChanges: BigNumberish[],
      options?: BalanceChangeOptions
    ) {
      const { toBigInt } = require("ethers") as typeof EthersT;
      // capture negated flag before async code executes; see buildAssert's jsdoc
      const negated = this.__flags.negate;

      let subject = this._obj;
      if (typeof subject === "function") {
        subject = subject();
      }

      const checkBalanceChanges = ([actualChanges, accountAddresses]: [
        bigint[],
        string[]
      ]) => {
        const assert = buildAssert(negated, checkBalanceChanges);

        assert(
          actualChanges.every(
            (change, ind) => change === toBigInt(balanceChanges[ind])
          ),
          () => {
            const lines: string[] = [];
            actualChanges.forEach((change: bigint, i) => {
              if (change !== toBigInt(balanceChanges[i])) {
                lines.push(
                  `Expected the ether balance of ${
                    accountAddresses[i]
                  } (the ${ordinal(
                    i + 1
                  )} address in the list) to change by ${balanceChanges[
                    i
                  ].toString()} wei, but it changed by ${change.toString()} wei`
                );
              }
            });
            return lines.join("\n");
          },
          () => {
            const lines: string[] = [];
            actualChanges.forEach((change: bigint, i) => {
              if (change === toBigInt(balanceChanges[i])) {
                lines.push(
                  `Expected the ether balance of ${
                    accountAddresses[i]
                  } (the ${ordinal(
                    i + 1
                  )} address in the list) NOT to change by ${balanceChanges[
                    i
                  ].toString()} wei, but it did`
                );
              }
            });
            return lines.join("\n");
          }
        );
      };

      const derivedPromise = Promise.all([
        getBalanceChanges(subject, accounts, options),
        getAddresses(accounts),
      ]).then(checkBalanceChanges);
      this.then = derivedPromise.then.bind(derivedPromise);
      this.catch = derivedPromise.catch.bind(derivedPromise);
      this.promise = derivedPromise;
      return this;
    }
  );
}

export async function getBalanceChanges(
  transaction: TransactionResponse | Promise<TransactionResponse>,
  accounts: Array<Addressable | string>,
  options?: BalanceChangeOptions
): Promise<bigint[]> {
  const txResponse = await transaction;

  const txReceipt = await txResponse.wait();
  assertIsNotNull(txReceipt, "txReceipt");
  const txBlockNumber = txReceipt.blockNumber;

  const balancesAfter = await getBalances(accounts, txBlockNumber);
  const balancesBefore = await getBalances(accounts, txBlockNumber - 1);

  const txFees = await getTxFees(accounts, txResponse, options);

  return balancesAfter.map(
    (balance, ind) => balance + txFees[ind] - balancesBefore[ind]
  );
}

async function getTxFees(
  accounts: Array<Addressable | string>,
  txResponse: TransactionResponse,
  options?: BalanceChangeOptions
): Promise<bigint[]> {
  return Promise.all(
    accounts.map(async (account) => {
      if (
        options?.includeFee !== true &&
        (await getAddressOf(account)) === txResponse.from
      ) {
        const txReceipt = await txResponse.wait();
        assertIsNotNull(txReceipt, "txReceipt");
        const gasPrice = txReceipt.gasPrice ?? txResponse.gasPrice;
        const gasUsed = txReceipt.gasUsed;
        const txFee = gasPrice * gasUsed;

        return txFee;
      }

      return 0n;
    })
  );
}
