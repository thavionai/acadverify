import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type CredentialData = { studentId: Uint8Array;
                               issuerPk: Uint8Array;
                               institutionId: Uint8Array;
                               degreeCode: bigint;
                               graduationYear: bigint;
                               gpaTimes100: bigint
                             };

export type DisclosedClaim = { institutionId: Uint8Array;
                               degreeCode: bigint;
                               graduationYear: bigint;
                               gpaTimes100: bigint
                             };

export type Witnesses<PS> = {
  localSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  credentialFields(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, CredentialData];
  credentialSalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  authorizeIssuer(context: __compactRuntime.CircuitContext<PS>,
                  issuerPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  issue(context: __compactRuntime.CircuitContext<PS>, credentialId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revokeCredential(context: __compactRuntime.CircuitContext<PS>,
                   credentialId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveCredential(context: __compactRuntime.CircuitContext<PS>,
                  credentialId_0: Uint8Array,
                  revealGpa_0: boolean): __compactRuntime.CircuitResults<PS, DisclosedClaim>;
}

export type ProvableCircuits<PS> = {
  authorizeIssuer(context: __compactRuntime.CircuitContext<PS>,
                  issuerPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  issue(context: __compactRuntime.CircuitContext<PS>, credentialId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revokeCredential(context: __compactRuntime.CircuitContext<PS>,
                   credentialId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveCredential(context: __compactRuntime.CircuitContext<PS>,
                  credentialId_0: Uint8Array,
                  revealGpa_0: boolean): __compactRuntime.CircuitResults<PS, DisclosedClaim>;
}

export type PureCircuits = {
  publicKey(sk_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  publicKey(context: __compactRuntime.CircuitContext<PS>, sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  authorizeIssuer(context: __compactRuntime.CircuitContext<PS>,
                  issuerPk_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  issue(context: __compactRuntime.CircuitContext<PS>, credentialId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revokeCredential(context: __compactRuntime.CircuitContext<PS>,
                   credentialId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveCredential(context: __compactRuntime.CircuitContext<PS>,
                  credentialId_0: Uint8Array,
                  revealGpa_0: boolean): __compactRuntime.CircuitResults<PS, DisclosedClaim>;
}

export type Ledger = {
  issuers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  credentials: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  revoked: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  readonly platformOwner: Uint8Array;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
