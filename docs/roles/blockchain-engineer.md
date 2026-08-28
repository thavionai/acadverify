# Blockchain Engineer

## Mission

Own the on-chain layer of AcadVerify: `AcademicCredential.sol` and everything that makes an issued academic credential tamper-evident and independently verifiable.

## Owns

- Compact (Midnight smart contract language) — primary, see `../midnight-integration.md`
- Midnight local devnet + testnet deployment
- Solidity / Hardhat (`blockchain/contracts/`) — Cross-Chain stretch
- Contract Testing
- Chain-service contract API handoff (compiled TS API + keys)

## Responsibilities

- Design and implement `AcademicCredential.sol`: issue credential, verify credential, revoke credential, prevent duplicates, emit events, restrict issuers (see `../smart-contract.md`).
- Define the on-chain data model: credential ID, SHA256 document hash, issuer wallet, metadata URI, timestamp, revocation status — **no personal data ever on-chain**.
- Maintain the authorized-issuer set: how university wallets are authorized, rotated, and revoked on-chain.
- Write and maintain Hardhat unit tests covering happy paths and reverts (unauthorized issuer, duplicate ID, wrong-issuer revocation, double revoke).
- Own deployment scripts (`blockchain/scripts/`) for local node, testnet, and eventually mainnet; commit deployed addresses/ABIs per network for the backend to consume.
- Track gas costs per operation; keep issuance a single cheap transaction.
- Own key-management practices for deployer and issuer wallets together with SRE/DevOps (keys live in AWS Secrets Manager).
- Support future standards alignment: W3C Verifiable Credentials, DIDs, NFT certificates (future enhancements list).

## Works on branch

`feature/blockchain`

## Interfaces with other roles

- **Backend Engineer** ([backend-engineer.md](backend-engineer.md)): provides contract ABI + address per network; agrees on the SHA256 canonicalization rule and the credential-ID encoding used on-chain.
- **SRE/DevOps** ([sre-devops.md](sre-devops.md)): RPC provider setup, Secrets Manager key custody, contract-deploy CI workflow.
- **Product/QA** ([product-qa.md](product-qa.md)): testnet scenarios for the demo (issue → verify → revoke → tamper).

## Definition of done

- Contract changes have tests covering happy path, revocation, and adversarial cases (forged issuer, duplicate ID, hash mismatch).
- Gas impact of the change is measured and noted.
- Deployment steps are scripted and repeatable — never manual console transactions.
- Any on-chain data model change is reflected in the backend's verification logic and in `../smart-contract.md`.
