// Example: cast a vote on an existing proposal.
//
// Usage:
//   GOVERNOR_ADDRESS=0x...  PROPOSAL_ID=123...  VOTE=for  \
//   npx hardhat run scripts/vote.js --network sepolia
//
// VOTE values: against | for | abstain

const { ethers } = require("hardhat");

const VOTE_MAP = { against: 0, for: 1, abstain: 2 };

async function main() {
  const governorAddr = process.env.GOVERNOR_ADDRESS;
  const proposalId   = process.env.PROPOSAL_ID;
  const voteStr      = (process.env.VOTE || "for").toLowerCase();

  if (!governorAddr || !proposalId) {
    throw new Error("Missing env vars: GOVERNOR_ADDRESS, PROPOSAL_ID");
  }
  if (!(voteStr in VOTE_MAP)) {
    throw new Error(`VOTE must be one of: against, for, abstain (got '${voteStr}')`);
  }

  const governor = await ethers.getContractAt("DAOGovernor", governorAddr);

  console.log(`Casting '${voteStr}' vote on proposal ${proposalId}...`);
  const tx = await governor.castVote(proposalId, VOTE_MAP[voteStr]);
  const receipt = await tx.wait();
  console.log("✅ Vote cast. Tx:", receipt.hash);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
