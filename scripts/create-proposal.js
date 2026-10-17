// Example: create a proposal that asks the DAO to send ETH from the Treasury.
//
// Usage:
//   GOVERNOR_ADDRESS=0x...  TREASURY_ADDRESS=0x...  \
//   RECIPIENT=0x...  AMOUNT_ETH=1.5  \
//   npx hardhat run scripts/create-proposal.js --network sepolia

const { ethers } = require("hardhat");

async function main() {
  const governorAddr  = process.env.GOVERNOR_ADDRESS;
  const treasuryAddr  = process.env.TREASURY_ADDRESS;
  const recipient     = process.env.RECIPIENT;
  const amountEth     = process.env.AMOUNT_ETH || "1";
  const reason        = process.env.REASON || "Ecosystem grant";

  if (!governorAddr || !treasuryAddr || !recipient) {
    throw new Error("Missing env vars: GOVERNOR_ADDRESS, TREASURY_ADDRESS, RECIPIENT");
  }

  const governor = await ethers.getContractAt("DAOGovernor", governorAddr);
  const treasury = await ethers.getContractAt("Treasury", treasuryAddr);

  const amount = ethers.parseEther(amountEth);
  const targets = [treasuryAddr];
  const values = [0];
  const calldatas = [
    treasury.interface.encodeFunctionData("disburseEth", [recipient, amount, reason]),
  ];
  const description = `Proposal: send ${amountEth} ETH to ${recipient} — ${reason}`;
  const descriptionHash = ethers.id(description);

  console.log("Submitting proposal...");
  const tx = await governor.propose(targets, values, calldatas, description);
  const receipt = await tx.wait();

  const proposalId = await governor.hashProposal(targets, values, calldatas, descriptionHash);

  console.log("✅ Proposal created");
  console.log("   Proposal ID:", proposalId.toString());
  console.log("   Description:", description);
  console.log("   Tx hash:    ", receipt.hash);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
