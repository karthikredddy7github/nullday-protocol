# NullDay Protocol 🛡️
> **Zero-Knowledge Autonomous Bug Bounty & Invariant Verification Escrow**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Network](https://img.shields.io/badge/Network-Base%20(Chain%208453-84532)-blue.svg)](https://base.org)
[![Category](https://img.shields.io/badge/Category-Developer%20Tools%20%26%20Infrastructure-blue.svg)](#)
[![EVMSolidity](https://img.shields.io/badge/Solidity-0.8.24-lightgrey.svg)](https://soliditylang.org/)
[![ZK-STARK](https://img.shields.io/badge/ZK-STARK-cyan.svg)](#)

---

## 🔵 Base Network Integration & On-Chain Activity Tracking

NullDay Protocol is optimized for **Base Network (OP Stack L2)**:

* **Base Predeploy Integration (`0x4200000000000000000000000000000000000015`):** The `NullDayBaseVerifier.sol` contract directly calls Base's predeployed `L1Block` contract to fetch canonical Ethereum L1 block hashes and timestamps, enabling cross-layer ZK proof verification without expensive L1 state relayers.
* **Sub-Cent Gas Fees:** Verification gas cost on Base is reduced by ~95% compared to Ethereum L1 (~0.00005 ETH / ~15,000 L2 gas).
* **On-Chain Activity Registry:** Tracks every verified ZK claim ID, invariant hash, prover address, and gas consumption on BaseScan.

### Base Contract Deployments

| Network | Contract | BaseScan Address | Chain ID |
| :--- | :--- | :--- | :--- |
| **Base Mainnet** | `NullDayBaseVerifier.sol` | [`0x...`](https://basescan.org) | `8453` |
| **Base Mainnet** | `NullDayVault.sol` | [`0x...`](https://basescan.org) | `8453` |
| **Base Sepolia** | `NullDayBaseVerifier.sol` | [`0x...`](https://sepolia.basescan.org) | `84532` |

---

## 💡 Overview & Paradigm Shift

In traditional Web3 security (Immunefi, Code4rena, centralized bounty boards), whitehat researchers and protocol teams face a **fundamental asymmetric trust paradox**:

1. **Whitehat Counterparty Risk:** Researchers must submit unencrypted exploit scripts in plain text. Protocol teams can silently patch the vulnerability and refuse payment, claim it was a "known issue", or delay payouts indefinitely.
2. **Protocol Extortion Risk & MEV Leakage:** Protocol teams fear whitehats leaking zero-days publicly or demanding ransom. Furthermore, disclosures cannot be made directly on-chain because public mempool state changes would alert MEV searchers who could front-run the exploit before a patch is deployed.

**NullDay Protocol** introduces **Zero-Knowledge Proof of Invariant Violation (ZK-PoIV)**. 

Instead of revealing *how* to break a contract, a researcher uses an EVM execution trace circuit to generate a ZK-STARK proof proving a mathematical statement:

$$\exists \text{ Tx Payload } T \text{ such that } \text{EVM}(S_0, T) \implies \mathcal{I}(S_{\text{final}}) = \text{FALSE}$$

Where $\mathcal{I}$ is a declared protocol state invariant (e.g., $\text{VaultBalance} \ge \text{TotalCollateral}$).

```
+---------------------------+     ZK-STARK Proof (42 KB)     +----------------------------+
|  Whitehat Security Prover | -----------------------------> |  NullDayVerifier.sol (EVM) |
| (Exploit Payload Private) |                                | (Verifies Trace ~180k Gas) |
+---------------------------+                                +----------------------------+
                                                                            |
                                                                            v (Proof Valid)
                                                             +----------------------------+
                                                             |   NullDayVault.sol Escrow  |
                                                             |  Auto-Locks $850,000 USDC  |
                                                             +----------------------------+
```

---

## ✨ Key Technical Breakthroughs

* **Zero Exploit Disclosure:** The ZK-STARK proof exposes zero bytes of the transaction payload, calldata, or storage key mutations.
* **Trustless Automated Escrow:** The on-chain `NullDayVerifier.sol` contract verifies the ZK proof in ~180k gas and automatically locks the protocol’s escrowed bounty funds into an immutable payout vault.
* **SLA Timelock & Auto-Payout:** A 72-hour SLA countdown begins for protocol maintainers to deploy a bytecode patch. When the patch is deployed and verified to restore invariant $\mathcal{I}$, the bounty funds are automatically released to the whitehat's stealth payout wallet.

---

## 🏗️ Architecture & Component Flow

```
                      ┌───────────────────────────────────────────────┐
                      │    1. Whitehat executes exploit locally      │
                      │       in zk-EVM sandbox & generates proof     │
                      └───────────────────────┬───────────────────────┘
                                              │
                                              ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ 2. Submit ZK Proof to NullDayVerifier.sol                                                  │
│    -> Verifies FRI polynomial constraints on-chain (~182,450 gas)                          │
└─────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                              │
                                              ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ 3. NullDayVault.sol Locks Escrow Bounty Funds                                             │
│    -> Auto-locks 10% TVL allocation ($850k USDC)                                         │
│    -> Starts 72-hour SLA patch timer                                                      │
└─────────────────────────────────────────────┬─────────────────────────────────────────────┘
                                              │
                         ┌────────────────────┴────────────────────┐
                         ▼                                         ▼
            [Option A: Devs Deploy Patch]             [Option B: SLA Timeout (72h)]
            -> Verifier confirms fix                  -> Timelocked keys reveal witness
            -> Bounty paid to whitehat                -> Bounty paid automatically
```

---

## 📂 Repository Structure

```
nullday-protocol/
├── contracts/
│   ├── NullDayVault.sol       # Non-custodial escrow & automated payout contract
│   └── NullDayVerifier.sol    # On-chain ZK-STARK polynomial constraint verifier
├── circuits/
│   └── InvariantProver.circom # Circom ZK circuit for EVM invariant violation proofs
├── index.html                 # Interactive Web3 dashboard UI
├── style.css                  # Modern Web3 dark glassmorphism styling
├── app.js                     # Interactive ZK compilation engine & EVM verifier simulator
├── package.json               # Project dependencies and script runner
├── LICENSE                    # MIT License
└── README.md                  # Comprehensive protocol documentation
```

---

## 🚀 Quick Start & Local Run

### Prerequisites
* Node.js v16+

### Deploying Contracts to Base Network

```bash
# Set environment variables in .env
PRIVATE_KEY="your-wallet-private-key"
BASESCAN_API_KEY="your-basescan-api-key"

# Deploy to Base Sepolia Testnet (Chain 84532)
npm run deploy:base-sepolia

# Deploy to Base Mainnet (Chain 8453)
npm run deploy:base-mainnet

# Verify contracts on BaseScan
npm run verify:base-sepolia -- <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

---

## 🔐 Smart Contracts & Circuit Specs

### 1. `NullDayVault.sol`
Implements automated liquidity locking upon receiving a valid ZK verification receipt from `NullDayVerifier.sol`. Enforces SLA patch deadlines and guarantees whitehat payouts via non-custodial smart contract rules.

### 2. `NullDayVerifier.sol`
Parses ZK-STARK FRI query commitments and verifies that the execution trace polynomial evaluates to an invariant failure state without requiring private transaction witness data.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
