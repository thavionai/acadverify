# AcadVerify — Smart Contract Design

## Primary Contract

```
AcademicCredential.sol
```

Stack: **Solidity + Hardhat + OpenZeppelin Contracts**, deployed to **Polygon Amoy Testnet** (or Base Sepolia). Lives in `blockchain/contracts/`, with Hardhat scripts in `blockchain/scripts/` and tests in `blockchain/test/`.

## Responsibilities

- Issue credential
- Verify credential
- Revoke credential
- Prevent duplicates
- Emit blockchain events
- Restrict issuers

## Stored on-chain

Per credential:

| Field | Type | Notes |
|---|---|---|
| Credential ID | `bytes32` | keccak of the public `credentialId` string |
| Document Hash | `bytes32` | SHA256 of the canonical credential document |
| Issuer Wallet | `address` | must be an authorized issuer |
| Metadata URI | `string` | pointer to off-chain metadata (S3/CloudFront URL; IPFS is a future enhancement) |
| Timestamp | `uint256` | block timestamp at issuance |
| Revocation Status | `bool` | set once, never unset |

**No personal information is stored on-chain — only the hash and pointers.** Names, degrees, and documents live in DynamoDB/S3 (see `data-model.md`).

## Interface sketch

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAcademicCredential {
    event IssuerAuthorized(address indexed issuer);
    event IssuerRevoked(address indexed issuer);
    event CredentialIssued(
        bytes32 indexed credentialId,
        bytes32 documentHash,
        address indexed issuer,
        string metadataURI,
        uint256 timestamp
    );
    event CredentialRevoked(bytes32 indexed credentialId, address indexed issuer);

    // Owner (platform) only
    function authorizeIssuer(address issuer) external;
    function revokeIssuer(address issuer) external;

    // Authorized issuers only
    function issueCredential(
        bytes32 credentialId,
        bytes32 documentHash,
        string calldata metadataURI
    ) external;                                   // reverts on duplicate credentialId
    function revokeCredential(bytes32 credentialId) external;  // original issuer only

    // Anyone (view)
    function verifyCredential(bytes32 credentialId, bytes32 documentHash)
        external view
        returns (bool exists, bool hashMatches, bool revoked, address issuer);
    function getCredential(bytes32 credentialId)
        external view
        returns (bytes32 documentHash, address issuer, string memory metadataURI, uint256 timestamp, bool revoked);
}
```

## Design decisions

### Access control

- OpenZeppelin `Ownable` (or `AccessControl`) — the platform owner wallet manages the authorized-issuer set.
- One issuer wallet per university; for the hackathon MVP the platform custodies these keys in AWS Secrets Manager (institutions holding their own keys is a future enhancement).
- `revokeCredential` is restricted to the wallet that issued that credential.

### Duplicate prevention

`issueCredential` reverts if the `credentialId` already exists. Credential IDs embed a UUID component off-chain, so two otherwise-identical degrees still get distinct IDs and hashes.

### Revocation is one-way

There is no un-revoke. Correcting a mistake means issuing a new credential with a new ID.

### No upgradability for MVP

Deploy non-upgradeable. Issued records are append-only facts; if logic must change, deploy a v2 and have the backend read both. This avoids proxy-admin key risk for a trust product.

## Events

Every state change emits an event (`CredentialIssued`, `CredentialRevoked`, `IssuerAuthorized`, `IssuerRevoked`) so the backend and any third party can audit the full history from logs alone.

## Testing requirements

- Unit (Hardhat + chai): issue/verify/revoke happy paths; reverts for unauthorized issuer, duplicate ID, revoking someone else's credential, double revoke.
- Negative verification: wrong hash → `hashMatches == false`; unknown ID → `exists == false`.
- Gas snapshot per operation tracked in CI.

## Deployment

- Scripted via Hardhat (`blockchain/scripts/deploy.ts`), never manual.
- Deployed addresses + ABIs are committed per network under `blockchain/artifacts/` / a `deployments/<network>.json` file consumed by the backend.
- Deployer and issuer keys come from AWS Secrets Manager in CI — never from committed files. See `deployment.md`.
