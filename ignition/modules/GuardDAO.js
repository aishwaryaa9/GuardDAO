// A separate Ignition module keeps the existing Governance deployment record intact.
const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");
const { id } = require("ethers");

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ONE_DAY = 60 * 60 * 24;
const selector = (signature) => id(signature).slice(0, 10);

module.exports = buildModule("GuardDAOFresh", (m) => {
  const deployer = m.getAccount(0);

  const token = m.contract("GovernanceToken", [deployer]);
  const timelock = m.contract("DAOTimelock", [ONE_DAY, [], [], deployer]);
  const treasury = m.contract("Treasury", [timelock]);
  const escrow = m.contract("MilestoneEscrow", [timelock, treasury]);
  const reputation = m.contract("DAOReputation", [timelock, escrow]);

  const allowedTargets = [treasury, escrow, reputation];
  const allowedSelectors = [
    [
      selector("disburseEth(address,uint256,string)"),
      selector("disburseToken(address,address,uint256,string)"),
      selector("setAssetPolicy(address,uint256,uint256,uint64,bool)"),
      selector("setRecipientAllowed(address,bool)"),
    ],
    [
      selector("createPlan((bytes32,string,address,address,uint256,uint64,uint256[],uint64[]))"),
      selector("setReputation(address)"),
      selector("cancelPlan(bytes32)"),
    ],
    [
      selector("grantRole(bytes32,address)"),
      selector("revoke(bytes32,string)"),
    ],
  ];

  const governor = m.contract("DAOGovernor", [
    token,
    timelock,
    allowedTargets,
    allowedSelectors,
  ]);

  const proposerRole = m.staticCall(timelock, "PROPOSER_ROLE");
  const executorRole = m.staticCall(timelock, "EXECUTOR_ROLE");
  const adminRole = m.staticCall(timelock, "DEFAULT_ADMIN_ROLE");

  const grantGovernorProposer = m.call(
    timelock,
    "grantRole",
    [proposerRole, governor],
    { id: "grantGovernorProposer" }
  );
  const grantOpenExecutor = m.call(
    timelock,
    "grantRole",
    [executorRole, ZERO_ADDRESS],
    { id: "grantOpenExecutor" }
  );
  m.call(
    timelock,
    "renounceRole",
    [adminRole, deployer],
    {
      id: "renounceDeploymentAdmin",
      after: [grantGovernorProposer, grantOpenExecutor],
    }
  );

  return { token, timelock, governor, treasury, escrow, reputation };
});
