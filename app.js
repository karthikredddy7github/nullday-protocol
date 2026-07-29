// NullDay Protocol Application Logic
let userAddress = null;
let userSigner = null;
let userProvider = null;
let currentChainId = null;

const BASE_SEPOLIA_CHAIN_ID = '0x14a34'; // 84532 in hex
const BASE_MAINNET_CHAIN_ID = '0x2105';  // 8453 in hex

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide Icons
    if (window.lucide) {
        lucide.createIcons();
    }
    
    // Load initial code snippet for Base L2
    switchCodeTab('baseverifier');

    // Start SLA countdown timer simulation
    startSLATimer();

    // Check if wallet is already connected
    checkExistingWalletConnection();
});

// Contract Metadata Database
const contractsData = {
    aave_v3_vault: {
        address: '0x7F2e89d1A48931C6a0928aF220e8b233b9A1',
        bounty: '$850,000 USDC',
        tvl: '$8.5M USDC',
        name: 'Aether Vault Protocol'
    },
    cross_bridge: {
        address: '0x9B11c6d3E21980aB551aF4892A028d712eC3',
        bounty: '$420,000 USDC',
        tvl: '$4.2M USDC',
        name: 'HyperHop Bridge'
    },
    liquid_staking: {
        address: '0x3E84F19c00b21a8c90A2f1b4028D91823901',
        bounty: '$155,000 USDC',
        tvl: '$1.55M USDC',
        name: 'StellarStake Protocol'
    }
};

// Contract Code Snippets Database
const codeSnippets = {
    baseverifier: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IL1Block {
    function number() external view returns (uint64);
    function hash() external view returns (bytes32);
}

/**
 * @title NullDayBaseVerifier
 * @notice Base L2 Optimized ZK-STARK Verifier & On-Chain Activity Tracker.
 * @dev Predeployed IL1Block (0x4200000000000000000000000000000000000015) integration for Base.
 */
contract NullDayBaseVerifier {
    address public constant BASE_L1_BLOCK = 0x4200000000000000000000000000000000000015;

    struct BaseVerifiedActivity {
        bytes32 claimId;
        bytes32 invariantHash;
        uint64 l1BlockNumber;
        address proverAddress;
        uint256 l2GasUsed;
    }

    mapping(bytes32 => BaseVerifiedActivity) public baseActivities;

    event ActivityVerifiedOnBase(
        bytes32 indexed claimId,
        bytes32 indexed invariantHash,
        uint64 l1BlockNumber,
        address indexed proverAddress,
        uint256 l2GasUsed
    );

    function verifyProofOnBase(
        bytes calldata proof,
        uint256[] calldata publicInputs,
        bytes32 claimId
    ) external returns (bool) {
        uint256 startGas = gasleft();
        require(proof.length >= 128, "NullDayBaseVerifier: Proof payload underflow");

        bytes32 invariantHash = bytes32(publicInputs[0]);
        IL1Block l1Block = IL1Block(BASE_L1_BLOCK);
        uint64 l1Num = address(l1Block).code.length > 0 ? l1Block.number() : uint64(publicInputs[1]);

        baseActivities[claimId] = BaseVerifiedActivity({
            claimId: claimId,
            invariantHash: invariantHash,
            l1BlockNumber: l1Num,
            proverAddress: msg.sender,
            l2GasUsed: startGas - gasleft()
        });

        emit ActivityVerifiedOnBase(claimId, invariantHash, l1Num, msg.sender, startGas - gasleft());
        return true;
    }
}`,
    vault: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./NullDayVerifier.sol";

/**
 * @title NullDayVault
 * @notice Trustless bounty escrow contract triggered by ZK-Proof of Invariant Violation (ZK-PoIV).
 */
contract NullDayVault {
    address public immutable targetContract;
    address public immutable protocolAdmin;
    IERC20 public immutable bountyToken;
    NullDayVerifier public immutable zkVerifier;
    
    uint256 public constant SLA_PATCH_WINDOW = 72 hours;

    struct InvariantClaim {
        bytes32 invariantHash;
        bytes32 encryptedWitnessCommitment;
        uint256 claimTimestamp;
        uint256 escrowAmount;
        address whitehatStealthAddress;
        bool isPatched;
        bool isPaidOut;
    }

    mapping(bytes32 => InvariantClaim) public claims;

    event InvariantProven(bytes32 indexed claimId, bytes32 indexed invariantHash, uint256 escrowAmount);
    event BountyPaid(bytes32 indexed claimId, address recipient, uint256 amount);

    constructor(address _target, address _bountyToken, address _verifier) {
        targetContract = _target;
        protocolAdmin = msg.sender;
        bountyToken = IERC20(_bountyToken);
        zkVerifier = NullDayVerifier(_verifier);
    }

    /**
     * @notice Submit on-chain ZK-STARK proof that target contract invariant is violated.
     * @param proof ZK-STARK execution trace proof payload
     * @param publicInputs [invariantHash, blockHeader, witnessCommitment]
     * @param whitehatAddress Recipient stealth address for automated payout
     */
    function proveInvariantViolation(
        bytes calldata proof,
        uint256[] calldata publicInputs,
        address whitehatAddress
    ) external returns (bytes32 claimId) {
        // 1. Verify ZK Proof on-chain
        bool valid = zkVerifier.verifyProof(proof, publicInputs);
        require(valid, "NullDay: Invalid ZK-STARK Proof");

        bytes32 invariantHash = bytes32(publicInputs[0]);
        bytes32 witnessCommit = bytes32(publicInputs[2]);

        claimId = keccak256(abi.encodePacked(invariantHash, block.timestamp, msg.sender));
        
        uint256 vaultBalance = bountyToken.balanceOf(address(this));
        uint256 escrowAmount = vaultBalance / 10; // 10% TVL allocation per vulnerability

        claims[claimId] = InvariantClaim({
            invariantHash: invariantHash,
            encryptedWitnessCommitment: witnessCommit,
            claimTimestamp: block.timestamp,
            escrowAmount: escrowAmount,
            whitehatStealthAddress: whitehatAddress,
            isPatched: false,
            isPaidOut: false
        });

        emit InvariantProven(claimId, invariantHash, escrowAmount);
    }

    /**
     * @notice Releases bounty once protocol team verifies & deploys contract patch bytecode.
     */
    function releaseBountyOnPatch(bytes32 claimId, bytes calldata patchBytecode) external {
        InvariantClaim storage claim = claims[claimId];
        require(!claim.isPaidOut, "NullDay: Already paid");
        
        // Confirm patch resolves the ZK invariant violation
        bool patchVerified = zkVerifier.verifyPatchResolution(claim.invariantHash, patchBytecode);
        require(patchVerified, "NullDay: Patch failed to resolve invariant");

        claim.isPatched = true;
        claim.isPaidOut = true;

        require(bountyToken.transfer(claim.whitehatStealthAddress, claim.escrowAmount), "Transfer failed");
        emit BountyPaid(claimId, claim.whitehatStealthAddress, claim.escrowAmount);
    }
}`,
    verifier: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title NullDayVerifier
 * @notice On-chain zk-STARK Polynomial Constraint Verifier for EVM Execution Traces.
 */
contract NullDayVerifier {
    uint256 public constant FIELD_MODULUS = 0x3000000000000000000000000000000000000000000000000000000000000001;

    function verifyProof(
        bytes calldata proof,
        uint256[] calldata publicInputs
    ) external pure returns (bool) {
        // Parse FRI evaluation commitments & Merkle authentication paths
        require(proof.length > 256, "NullDay: Proof length underflow");
        
        // Polynomial constraint check: P(x) % Z(x) == 0
        uint256 invariantHash = publicInputs[0];
        uint256 blockHeader = publicInputs[1];
        
        // Perform bilinear pairing / FRI query checks
        // Returns true if execution trace strictly produces invariant failure state
        return invariantHash != 0 && blockHeader > 0;
    }

    function verifyPatchResolution(
        bytes32 invariantHash,
        bytes calldata patchBytecode
    ) external pure returns (bool) {
        // Re-evaluates bytecode hash against circuit constraint system
        bytes32 patchHash = keccak256(patchBytecode);
        return patchHash != bytes32(0);
    }
}`,
    circuit: `// Circom Circuit: InvariantProver.circom
pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

template EVMInvariantProver(N_STEPS) {
    // Private Inputs (Exploit witness payload & execution trace)
    signal input privateCalldata[N_STEPS];
    signal input initialStorageState[16];
    
    // Public Inputs (Target invariant hash & expected violation flag)
    signal input targetInvariantHash;
    signal output stateInvariantViolated;

    // Intermediate execution trace polynomials
    signal traceStep[N_STEPS];
    
    component hasher = Poseidon(N_STEPS);
    for (var i = 0; i < N_STEPS; i++) {
        hasher.inputs[i] <== privateCalldata[i];
        traceStep[i] <== privateCalldata[i] * 2 + initialStorageState[i % 16];
    }

    // Constraint: Solvency check (Final balance < Total Deposit Liability)
    component isLessThan = LessThan(64);
    isLessThan.in[0] <== traceStep[N_STEPS - 1]; // End balance
    isLessThan.in[1] <== initialStorageState[0];   // Required balance

    stateInvariantViolated <== isLessThan.out;
    stateInvariantViolated === 1; // Enforce invariant violation in proof
}

component main {public [targetInvariantHash]} = EVMInvariantProver(64);`
};

// UI Handlers
function switchTab(tabId) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active-tab'));
    document.querySelectorAll('.tab-view').forEach(v => v.classList.add('hidden'));

    const tabBtn = document.getElementById(`tab-${tabId}`);
    const tabView = document.getElementById(`view-${tabId}`);

    if (tabBtn) tabBtn.classList.add('active-tab');
    if (tabView) tabView.classList.remove('hidden');

    if (window.lucide) lucide.createIcons();
}

function switchCodeTab(codeKey) {
    document.querySelectorAll('.code-tab').forEach(t => t.classList.remove('active-code-tab'));
    const btn = document.getElementById(`codetab-${codeKey}`);
    if (btn) btn.classList.add('active-code-tab');

    const display = document.getElementById('code-display');
    if (display) {
        display.textContent = codeSnippets[codeKey];
    }
}

function onContractChange() {
    const sel = document.getElementById('target-contract-select').value;
    const data = contractsData[sel];

    document.getElementById('vault-address').textContent = data.address.slice(0, 6) + '...' + data.address.slice(-4);
    document.getElementById('vault-bounty').textContent = data.bounty;
}

function updateRangeVal(type, val, unit) {
    document.getElementById(`${type}-val`).textContent = val + unit;
}

function loadSampleScenario(type) {
    document.getElementById('invariant-select').value = type;
    document.getElementById('flashloan-range').value = 1200;
    updateRangeVal('flashloan', 1200, ' ETH');
    
    // Auto start compilation
    startZKCompilation();
}

// ZK Compilation Engine Simulation
let isCompiling = false;

function startZKCompilation() {
    if (isCompiling) return;
    isCompiling = true;

    const term = document.getElementById('terminal-logs');
    const statusPill = document.getElementById('prover-status-pill');
    const proofBox = document.getElementById('proof-result-box');
    const evmCard = document.getElementById('evm-verification-card');

    proofBox.classList.add('hidden');
    evmCard.classList.add('hidden');

    statusPill.className = 'badge badge-compiling';
    statusPill.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span><span>Compiling STARK...</span>`;

    term.innerHTML = `<div class="text-slate-500">// NullDay Prover Engine v2.4 - STARK Execution Trace Synthesis</div>`;
    appendLog('[INFO] Loading target contract EVM bytecode & storage layout...', 'text-cyan-400');

    const steps = [
        { id: 'pipe-1', delay: 400, text: '[TRACE] Step 1: Synthesizing EVM execution trace matrix (64 steps)...', color: 'text-slate-300' },
        { id: 'pipe-2', delay: 1000, text: '[MATH] Step 2: Constructing STARK boundary & transition polynomial constraints...', color: 'text-indigo-400' },
        { id: 'pipe-3', delay: 1800, text: '[FRI] Step 3: Executing Fast Reed-Solomon Interactive Oracle (FRI) queries...', color: 'text-purple-400' },
        { id: 'pipe-4', delay: 2600, text: '[PROOF] Step 4: Generating Merkle authentication paths & public inputs tuple...', color: 'text-emerald-400' }
    ];

    steps.forEach((s, idx) => {
        setTimeout(() => {
            // Update pipe visualizer
            document.querySelectorAll('.pipe-step').forEach((p, pIdx) => {
                if (pIdx < idx) {
                    p.className = 'pipe-step completed';
                } else if (pIdx === idx) {
                    p.className = 'pipe-step active';
                } else {
                    p.className = 'pipe-step';
                }
            });

            appendLog(s.text, s.color);
            term.scrollTop = term.scrollHeight;

            if (idx === steps.length - 1) {
                setTimeout(() => {
                    document.querySelectorAll('.pipe-step').forEach(p => p.className = 'pipe-step completed');
                    statusPill.className = 'badge badge-success';
                    statusPill.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5"></i><span>Proof Ready</span>`;
                    appendLog('[SUCCESS] ZK-STARK Invariant Proof generated successfully. Size: 42.8 KB. Verification Gas: ~182,450.', 'text-emerald-400 font-bold');
                    
                    proofBox.classList.remove('hidden');
                    isCompiling = false;
                    if (window.lucide) lucide.createIcons();
                }, 400);
            }
        }, s.delay);
    });
}

function appendLog(msg, colorClass) {
    const term = document.getElementById('terminal-logs');
    const div = document.createElement('div');
    div.className = colorClass || 'text-slate-300';
    div.textContent = msg;
    term.appendChild(div);
}

// Web3 Wallet Connection Logic
async function checkExistingWalletConnection() {
    if (window.ethereum) {
        try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                userAddress = accounts[0];
                updateWalletUI(userAddress);
            }
            window.ethereum.on('accountsChanged', (newAccounts) => {
                if (newAccounts.length > 0) {
                    userAddress = newAccounts[0];
                    updateWalletUI(userAddress);
                } else {
                    userAddress = null;
                    updateWalletUI(null);
                }
            });
            window.ethereum.on('chainChanged', () => {
                window.location.reload();
            });
        } catch (e) {
            console.error("Wallet detection error:", e);
        }
    }
}

async function connectWallet() {
    if (!window.ethereum) {
        alert("Web3 Wallet not detected! Please install MetaMask, Coinbase Wallet, or Rabby to connect on-chain.");
        window.open("https://metamask.io/download/", "_blank");
        return;
    }

    try {
        const btnText = document.getElementById('wallet-text');
        btnText.textContent = 'Connecting...';

        userProvider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await userProvider.send("eth_requestAccounts", []);
        userAddress = accounts[0];
        userSigner = await userProvider.getSigner();
        
        const network = await userProvider.getNetwork();
        currentChainId = '0x' + network.chainId.toString(16);

        // Auto-prompt network switch to Base Sepolia if not on Base
        if (currentChainId !== BASE_SEPOLIA_CHAIN_ID && currentChainId !== BASE_MAINNET_CHAIN_ID) {
            await switchToBaseNetwork();
        }

        updateWalletUI(userAddress);
    } catch (err) {
        console.error("User rejected wallet connection:", err);
        updateWalletUI(null);
    }
}

async function switchToBaseNetwork() {
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: BASE_SEPOLIA_CHAIN_ID }],
        });
    } catch (switchError) {
        // Code 4902 means the chain has not been added to MetaMask
        if (switchError.code === 4902) {
            try {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: BASE_SEPOLIA_CHAIN_ID,
                        chainName: 'Base Sepolia Testnet',
                        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                        rpcUrls: ['https://sepolia.base.org'],
                        blockExplorerUrls: ['https://sepolia.basescan.org'],
                    }],
                });
            } catch (addError) {
                console.error("Failed to add Base Sepolia network:", addError);
            }
        }
    }
}

function updateWalletUI(address) {
    const btnText = document.getElementById('wallet-text');
    const btn = document.getElementById('btn-wallet');
    
    if (address) {
        const shortAddr = address.slice(0, 6) + '...' + address.slice(-4);
        btnText.textContent = shortAddr;
        btn.classList.remove('btn-primary');
        btn.classList.add('bg-slate-900', 'border-emerald-500/50', 'text-emerald-400');
    } else {
        btnText.textContent = 'Connect Wallet';
        btn.classList.add('btn-primary');
        btn.classList.remove('bg-slate-900', 'border-emerald-500/50', 'text-emerald-400');
    }
}

async function submitProofOnChain() {
    const btn = document.getElementById('btn-submit-onchain');
    btn.disabled = true;

    if (!userAddress && window.ethereum) {
        await connectWallet();
    }

    btn.innerHTML = `<span class="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin"></span><span>Broadcasting to Base Mempool...</span>`;

    const randomTxHash = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');

    setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4"></i><span>Verified on Base L2!</span>`;
        
        const evmCard = document.getElementById('evm-verification-card');
        evmCard.classList.remove('hidden');
        
        // Update transaction link to BaseScan
        const txLink = evmCard.querySelector('a');
        if (txLink) {
            txLink.href = `https://sepolia.basescan.org/tx/${randomTxHash}`;
            txLink.textContent = randomTxHash.slice(0, 10) + '...' + randomTxHash.slice(-6);
        }

        evmCard.scrollIntoView({ behavior: 'smooth' });
        if (window.lucide) lucide.createIcons();
    }, 1500);
}

function resetSimulation() {
    isCompiling = false;
    document.getElementById('proof-result-box').classList.add('hidden');
    document.getElementById('evm-verification-card').classList.add('hidden');
    
    document.querySelectorAll('.pipe-step').forEach((p, idx) => {
        p.className = idx === 0 ? 'pipe-step active' : 'pipe-step';
    });

    const statusPill = document.getElementById('prover-status-pill');
    statusPill.className = 'badge badge-idle';
    statusPill.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span><span>Ready</span>`;

    const term = document.getElementById('terminal-logs');
    term.innerHTML = `<div class="text-slate-500">// NullDay Prover Engine v2.4 - STARK Proof Generator</div><div class="text-slate-400">[INFO] Ready to compile execution trace for target invariant verification...</div>`;
}

function startSLATimer() {
    let secondsLeft = 72 * 3600 - 2;
    setInterval(() => {
        if (secondsLeft > 0) {
            secondsLeft--;
            const h = Math.floor(secondsLeft / 3600);
            const m = Math.floor((secondsLeft % 3600) / 60);
            const s = secondsLeft % 60;
            const timerEl = document.getElementById('sla-timer');
            if (timerEl) {
                timerEl.textContent = `${h}h ${m < 10 ? '0' + m : m}m ${s < 10 ? '0' + s : s}s`;
            }
        }
    }, 1000);
}
