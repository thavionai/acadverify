# SRE / DevOps Engineer

## Mission

Keep AcadVerify reliable, secure, and deployable: AWS infrastructure, CI/CD, observability, key custody, and the operational health of both the off-chain services and the chain-facing components.

## Owns

- AWS (ECS Fargate, ECR, S3, DynamoDB, CloudFront, CloudWatch, Secrets Manager)
- Docker
- Terraform (`infrastructure/terraform/`)
- CI/CD (GitHub Actions, `.github/workflows/`)
- Monitoring
- Logging
- Secrets
- Security (Trivy, IAM)

## Responsibilities

- Own CI/CD pipelines: lint/test → Docker build → Trivy scan → push to ECR → Terraform apply → ECS deploy, per component and branch (see `../deployment.md`).
- Manage environments (dev via Docker Compose, staging, production) with parity — staging verifies against the public testnet before anything is promoted.
- Provision and maintain all infrastructure as Terraform: ECS services, DynamoDB tables, S3 buckets, CloudFront, IAM, alarms.
- Own key custody with the blockchain engineer: deployer and issuer wallet keys live in AWS Secrets Manager with scoped IAM access — never in the repo or plain CI variables; rotation is audited.
- Build observability in CloudWatch: metrics, structured PII-free logs, and alarms for API errors, pending-transaction age, RPC provider failures, and ECS task health — the public verification endpoint is the highest-availability surface.
- Manage DynamoDB point-in-time recovery and S3 versioning; test restores; maintain the "re-index from chain events" recovery path.
- Handle incident response: runbooks for every alarm, blameless postmortems for Sev1/Sev2.
- Enforce security baselines: Trivy blocking on high/critical CVEs, least-privilege IAM, TLS everywhere, dependency scanning.
- Prepare the future path to Kubernetes + Helm for production without blocking the hackathon ECS setup.

## Works on branch

`feature/devops`

## Interfaces with other roles

- **Blockchain Engineer** ([blockchain-engineer.md](blockchain-engineer.md)): contract-deploy workflow, RPC provider config, wallet key custody.
- **Backend Engineer** ([backend-engineer.md](backend-engineer.md)): service health checks, task definitions, Secrets Manager injection.
- **Frontend Engineer** ([frontend-engineer.md](frontend-engineer.md)): CloudFront hosting, cache strategy, client error reporting.
- **Product/QA** ([product-qa.md](product-qa.md)): environment access for testing, release gates, rollback criteria.

## Definition of done

- Infrastructure changes are in Terraform and peer-reviewed — no console-only changes.
- New services ship with health checks, a dashboard, and at least one meaningful alarm before production traffic.
- Runbooks exist for every alarm that can page someone.
- Production deployments have a manual approval gate and a tested rollback path.
