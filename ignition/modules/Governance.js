// Hardhat Ignition deployment module for GuardDAO.
//
// Deploys in order:
//   1. GovernanceToken      (ERC20Votes, full supply minted to deployer)
//   2. DAOTimelock          (no proposers/executors yet, deployer = admin)
//   3. DAOGovernor          (Token + Timelock bound)
//   4. Treasury             (owned by Timelock)
//   5. Wire roles:
//        - Grant PROPOSER_ROLE  to Governor on Timelock
//        - Grant EXECUTOR_ROLE  to address(0) (open execution)
//        - Deployer renounces DEFAULT_ADMIN_ROLE so the Timelock self-controls

const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_DAY = 60 * 60 * 24; // Timelock minimum delay (seconds)

module.exports = buildModule("Governance", (m) => {
  const deployer = m.getAccount(0);

  // 1. Governance Token
  const token = m.contract("GovernanceToken", [deployer]);

  // 2. Timelock — empty roles, deployer is admin temporarily
  const timelock = m.contract("DAOTimelock", [
    ONE_DAY,
    [],           // proposers (granted below to Governor)
    [],           // executors (granted below to address(0))
    deployer,     // admin (renounced below)
  ]);

  // 3. Governor — references Token + Timelock
  const governor = m.contract("DAOGovernor", [token, timelock]);

  // 4. Treasury — owned by Timelock
  const treasury = m.contract("Treasury", [timelock]);

  // 5. Wire roles on the Timelock
  const proposerRole = m.staticCall(timelock, "PROPOSER_ROLE");
  const executorRole = m.staticCall(timelock, "EXECUTOR_ROLE");
  const adminRole = m.staticCall(timelock, "DEFAULT_ADMIN_ROLE");

  m.call(timelock, "grantRole", [proposerRole, governor], { id: "grantProposer" });
  m.call(timelock, "grantRole", [executorRole, ZERO_ADDRESS], { id: "grantExecutor" });
  m.call(timelock, "renounceRole", [adminRole, deployer], { id: "renounceAdmin" });

  return { token, timelock, governor, treasury };
});
