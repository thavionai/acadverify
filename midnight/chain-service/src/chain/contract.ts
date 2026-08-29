import { CompiledContract } from "@midnight-ntwrk/compact-js";
import * as ContractModule from "../../managed/academic_credential/contract/index.js";
import { witnesses } from "./witnesses.js";

export const CONTRACT_TAG = "academic_credential";

/**
 * Build the compiled-contract handle deployContract / findDeployedContract need.
 *
 * CompiledContract is a MODULE with pipeable combinators, not a class — there is
 * no `new CompiledContract(...)`. make() takes the Contract CLASS (not an
 * instance) and is synchronous, so it must not be awaited.
 */
export function loadCompiledContract(zkConfigPath: string) {
  return CompiledContract.make(CONTRACT_TAG, ContractModule.Contract as never).pipe(
    CompiledContract.withWitnesses(witnesses as never),
    // A path string to the compiled output — not a URL.
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );
}

export const { ledger, pureCircuits } = ContractModule;
export type ContractLedger = ReturnType<typeof ContractModule.ledger>;
