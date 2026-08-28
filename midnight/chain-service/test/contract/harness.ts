/**
 * Local simulator for the AcadVerify Compact contract.
 *
 * Runs the COMPILED contract via @midnight-ntwrk/compact-runtime with no devnet,
 * no proof server, and no wallet — so the privacy and adversarial properties can
 * be asserted in milliseconds.
 *
 * API note: runtime 0.19 takes `circuitId` as the FIRST argument to
 * createCircuitContext. Older published examples show a 4-arg form without it.
 */
import {
  createCircuitContext,
  createConstructorContext,
  dummyContractAddress,
} from "@midnight-ntwrk/compact-runtime";
import {
  Contract,
  ledger,
  pureCircuits,
  type Ledger,
} from "../../managed/academic_credential/contract/index.js";

const ADDR = dummyContractAddress();
const COIN_PK = "0".repeat(64);

export interface CredentialData {
  studentId: Uint8Array;
  issuerPk: Uint8Array;
  institutionId: Uint8Array;
  degreeCode: bigint;
  graduationYear: bigint;
  gpaTimes100: bigint;
}

/** Whatever the three witnesses need to answer for the current call. */
export interface PrivateState {
  secretKey: Uint8Array;
  fields: CredentialData;
  salt: Uint8Array;
}

export const bytes32 = (fill: number): Uint8Array => new Uint8Array(32).fill(fill);
export const publicKeyOf = (sk: Uint8Array): Uint8Array => pureCircuits.publicKey(sk);

export function credential(over: Partial<CredentialData> = {}): CredentialData {
  return {
    studentId: bytes32(0xab),
    issuerPk: bytes32(0x00),
    institutionId: bytes32(0x11),
    degreeCode: 4711n,
    graduationYear: 2026n,
    gpaTimes100: 390n,
    ...over,
  };
}

/**
 * Witnesses read from the *currently active* private state, which the harness
 * swaps per call. That mirrors how the real chain-service loads a working set
 * for one credential before proving.
 */
const witnesses = {
  localSecretKey: (ctx: { privateState: PrivateState }): [PrivateState, Uint8Array] => [
    ctx.privateState,
    ctx.privateState.secretKey,
  ],
  credentialFields: (ctx: { privateState: PrivateState }): [PrivateState, CredentialData] => [
    ctx.privateState,
    ctx.privateState.fields,
  ],
  credentialSalt: (ctx: { privateState: PrivateState }): [PrivateState, Uint8Array] => [
    ctx.privateState,
    ctx.privateState.salt,
  ],
};

export class Sim {
  // biome-ignore lint: the generated Contract type is intentionally loose
  private contract!: any;
  private state: unknown;
  private active!: PrivateState;

  /**
   * Deploy. Async because the generated contract's initialState and every
   * circuit are async in runtime 0.19.
   */
  static async deploy(ownerSecret: Uint8Array): Promise<Sim> {
    const sim = new Sim();
    sim.contract = new (Contract as any)(witnesses);
    sim.active = { secretKey: ownerSecret, fields: credential(), salt: bytes32(0x99) };
    const deployed = await sim.contract.initialState(
      createConstructorContext(sim.active, COIN_PK),
    );
    sim.state = deployed.currentContractState.data;
    return sim;
  }

  /** Select the witness working set used by the NEXT call. */
  as(ps: Partial<PrivateState>): this {
    this.active = { ...this.active, ...ps };
    return this;
  }

  ledger(): Ledger {
    return ledger(this.state as any);
  }

  private run(name: string, args: unknown[]): Promise<any> {
    const ctx = createCircuitContext(name, ADDR, COIN_PK, this.state as any, this.active);
    return this.contract.circuits[name](ctx, ...args);
  }

  /** Call a circuit and COMMIT the resulting state. */
  async call(name: string, ...args: unknown[]): Promise<unknown> {
    const res = await this.run(name, args);
    this.state = res.context.callContext.currentQueryContext.state;
    return res.result;
  }

  /** Call a circuit WITHOUT committing state — verification is a read. */
  async read(name: string, ...args: unknown[]): Promise<unknown> {
    return (await this.run(name, args)).result;
  }

  /** Full result including proof data, for public-transcript inspection. */
  async raw(name: string, ...args: unknown[]): Promise<any> {
    return this.run(name, args);
  }
}
