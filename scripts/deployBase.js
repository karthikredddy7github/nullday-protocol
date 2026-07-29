const hre = require("hardhat");

async function main() {
  console.log("=================================================");
  console.log("  Deploying NullDay Protocol to Base Network...");
  console.log("=================================================");

  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deployer Account: ${deployer ? deployer.address : "N/A"}`);
  
  const networkName = hre.network.name;
  console.log(`Network Target:  ${networkName} (Chain ID: ${hre.network.config.chainId})`);

  // 1. Deploy NullDayBaseVerifier (Base L2 Optimized ZK-STARK Verifier)
  console.log("\n1. Deploying NullDayBaseVerifier.sol...");
  const NullDayBaseVerifier = await hre.ethers.getContractFactory("NullDayBaseVerifier");
  const baseVerifier = await NullDayBaseVerifier.deploy();
  await baseVerifier.waitForDeployment();
  const verifierAddress = await baseVerifier.getAddress();
  console.log(`✅ NullDayBaseVerifier deployed at: ${verifierAddress}`);

  // 2. Deploy Mock Bounty ERC20 Token (if testnet)
  console.log("\n2. Setting up Bounty Asset Token...");
  let tokenAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base Mainnet USDC
  if (networkName === "base-sepolia" || networkName === "localhost" || networkName === "hardhat") {
    tokenAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC
  }
  console.log(`Asset Token Address: ${tokenAddress}`);

  // 3. Deploy NullDayVault with Base Verifier
  console.log("\n3. Deploying NullDayVault.sol...");
  const targetMock = "0x7F2e89d1A48931C6a0928aF220e8b233b9A1"; // Target contract
  const NullDayVault = await hre.ethers.getContractFactory("NullDayVault");
  const vault = await NullDayVault.deploy(targetMock, tokenAddress, verifierAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`✅ NullDayVault deployed at:         ${vaultAddress}`);

  console.log("\n=================================================");
  console.log("  Base Deployment Summary");
  console.log("=================================================");
  console.log(`Network:             ${networkName}`);
  console.log(`NullDayBaseVerifier: ${verifierAddress}`);
  console.log(`NullDayVault:        ${vaultAddress}`);
  console.log(`BaseScan Explorer:   https://${networkName === 'base-mainnet' ? '' : 'sepolia.'}basescan.org/address/${vaultAddress}`);
  console.log("=================================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
