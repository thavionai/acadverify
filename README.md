# 🎓 AcadVerify

> **Blockchain-Based Academic Credential Verification Platform**

AcadVerify is a decentralized platform that enables educational institutions to issue, manage, and verify tamper-proof academic credentials using blockchain technology. Instead of relying on manual transcript verification, universities issue digitally signed credentials that employers, licensing bodies, and students can instantly verify through an immutable blockchain record.

This project is being developed as a **hackathon MVP** with a focus on demonstrating a complete end-to-end blockchain application using modern cloud-native technologies.

---

## Documentation

All project documentation lives in [`docs/`](docs/):

| Document | Contents |
|---|---|
| [Local Setup](docs/local-setup.md) | How to start developing on your machine with Docker |
| [Architecture](docs/architecture.md) | Problem statement, solution, high-level architecture, technology stack, user workflow |
| [API Specification](docs/api-spec.md) | Backend REST API endpoints, verification responses, error semantics |
| [Midnight Integration](docs/midnight-integration.md) | Midnight network privacy layer — Compact contract, ZK verification, hackathon tracks |
| [Smart Contract](docs/smart-contract.md) | `AcademicCredential.sol` design (Cross-Chain stretch), on-chain data, events, access control |
| [Data Model](docs/data-model.md) | On-chain record, DynamoDB tables, S3 layout, hashing rules |
| [Deployment](docs/deployment.md) | AWS infrastructure, Terraform, Docker, CI/CD, monitoring, secrets |
| [Hackathon Plan](docs/hackathon-plan.md) | Roadmap phases, demo storyline, team workstreams, future enhancements |
| [Team Roles](docs/roles/) | Ownership and responsibilities per role |

### Team roles

- [Blockchain Engineer](docs/roles/blockchain-engineer.md)
- [Backend Engineer](docs/roles/backend-engineer.md)
- [Frontend Engineer](docs/roles/frontend-engineer.md)
- [SRE / DevOps](docs/roles/sre-devops.md)
- [Product / QA](docs/roles/product-qa.md)

---

## Repository Structure

```
acadverify/

├── frontend/
│
├── backend/
│
├── blockchain/
│   ├── contracts/
│   ├── scripts/
│   ├── test/
│   └── artifacts/
│
├── infrastructure/
│   ├── terraform/
│   ├── docker/
│   └── kubernetes/
│
├── docs/
│
├── data/
│
├── scripts/
│
├── .github/
│   └── workflows/
│
└── README.md
```

---

## Contributing

We welcome contributions!

1. Fork the repository
2. Create a feature branch

```
git checkout -b feature/my-feature
```

3. Commit your changes

```
git commit -m "Add new feature"
```

4. Push your branch

```
git push origin feature/my-feature
```

5. Open a Pull Request

---

## Branch Strategy

```
main
develop

feature/frontend
feature/backend
feature/blockchain
feature/devops
feature/docs
```

---

## License

This project is licensed under the MIT License.

---

## Acknowledgements

Built with ❤️ using

- Solidity
- Hardhat
- Next.js
- FastAPI
- AWS
- Terraform
- Docker
- GitHub Actions
- Polygon Blockchain

---

## Project Status

🚧 **Hackathon MVP**

This project is under active development as part of a blockchain hackathon. The goal is to deliver a complete end-to-end decentralized academic credential verification platform demonstrating blockchain, cloud-native architecture, DevOps practices, and secure credential management.
