// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface INullDayVerifier {
    function verifyProof(bytes calldata proof, uint256[] calldata publicInputs) external pure returns (bool);
    function verifyPatchResolution(bytes32 invariantHash, bytes calldata patchBytecode) external pure returns (bool);
}

/**
 * @title NullDayVault
 * @notice Trustless bounty escrow contract triggered by ZK-Proof of Invariant Violation (ZK-PoIV).
 * @dev Manages protocol bounty deposits, verifies zero-knowledge vulnerability proofs, and automates payouts upon patch deployment or SLA expiry.
 */
contract NullDayVault is ReentrancyGuard {
    address public immutable targetContract;
    address public immutable protocolAdmin;
    IERC20 public immutable bountyToken;
    INullDayVerifier public immutable zkVerifier;
    
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

    event InvariantProven(bytes32 indexed claimId, bytes32 indexed invariantHash, uint256 escrowAmount, address whitehat);
    event BountyPaid(bytes32 indexed claimId, address recipient, uint256 amount);
    event BountyRefunded(bytes32 indexed claimId, uint256 amount);

    constructor(address _targetContract, address _bountyToken, address _zkVerifier) {
        require(_targetContract != address(0), "NullDay: Invalid target");
        require(_bountyToken != address(0), "NullDay: Invalid token");
        require(_zkVerifier != address(0), "NullDay: Invalid verifier");

        targetContract = _targetContract;
        protocolAdmin = msg.sender;
        bountyToken = IERC20(_bountyToken);
        zkVerifier = INullDayVerifier(_zkVerifier);
    }

    /**
     * @notice Submit on-chain ZK-STARK proof that target contract invariant is violated.
     * @param proof ZK-STARK execution trace proof payload.
     * @param publicInputs Public inputs array: [invariantHash, blockHeader, witnessCommitment].
     * @param whitehatAddress Recipient stealth address for automated payout.
     */
    function proveInvariantViolation(
        bytes calldata proof,
        uint256[] calldata publicInputs,
        address whitehatAddress
    ) external nonReentrant returns (bytes32 claimId) {
        require(whitehatAddress != address(0), "NullDay: Invalid recipient address");
        require(publicInputs.length >= 3, "NullDay: Insufficient public inputs");

        // 1. Verify ZK Proof on-chain
        bool valid = zkVerifier.verifyProof(proof, publicInputs);
        require(valid, "NullDay: Invalid ZK-STARK Proof");

        bytes32 invariantHash = bytes32(publicInputs[0]);
        bytes32 witnessCommit = bytes32(publicInputs[2]);

        claimId = keccak256(abi.encodePacked(invariantHash, block.timestamp, msg.sender));
        require(claims[claimId].claimTimestamp == 0, "NullDay: Claim collision");

        uint256 vaultBalance = bountyToken.balanceOf(address(this));
        require(vaultBalance > 0, "NullDay: Vault unfunded");

        uint256 escrowAmount = vaultBalance / 10; // 10% TVL allocation per vulnerability claim

        claims[claimId] = InvariantClaim({
            invariantHash: invariantHash,
            encryptedWitnessCommitment: witnessCommit,
            claimTimestamp: block.timestamp,
            escrowAmount: escrowAmount,
            whitehatStealthAddress: whitehatAddress,
            isPatched: false,
            isPaidOut: false
        });

        emit InvariantProven(claimId, invariantHash, escrowAmount, whitehatAddress);
    }

    /**
     * @notice Releases bounty once protocol team verifies & deploys contract patch bytecode.
     * @param claimId Unique identifier of the verified claim.
     * @param patchBytecode Deployed patch contract bytecode.
     */
    function releaseBountyOnPatch(bytes32 claimId, bytes calldata patchBytecode) external nonReentrant {
        InvariantClaim storage claim = claims[claimId];
        require(claim.claimTimestamp > 0, "NullDay: Claim does not exist");
        require(!claim.isPaidOut, "NullDay: Already paid");

        // Confirm patch resolves the ZK invariant violation
        bool patchVerified = zkVerifier.verifyPatchResolution(claim.invariantHash, patchBytecode);
        require(patchVerified, "NullDay: Patch failed to resolve invariant");

        claim.isPatched = true;
        claim.isPaidOut = true;

        require(bountyToken.transfer(claim.whitehatStealthAddress, claim.escrowAmount), "NullDay: Transfer failed");
        emit BountyPaid(claimId, claim.whitehatStealthAddress, claim.escrowAmount);
    }

    /**
     * @notice Trigger automated payout if protocol team fails to patch within SLA 72-hour window.
     * @param claimId Unique identifier of the verified claim.
     */
    function claimSLAExpiryPayout(bytes32 claimId) external nonReentrant {
        InvariantClaim storage claim = claims[claimId];
        require(claim.claimTimestamp > 0, "NullDay: Claim does not exist");
        require(!claim.isPaidOut, "NullDay: Already paid");
        require(block.timestamp >= claim.claimTimestamp + SLA_PATCH_WINDOW, "NullDay: SLA active");

        claim.isPaidOut = true;

        require(bountyToken.transfer(claim.whitehatStealthAddress, claim.escrowAmount), "NullDay: Transfer failed");
        emit BountyPaid(claimId, claim.whitehatStealthAddress, claim.escrowAmount);
    }
}
