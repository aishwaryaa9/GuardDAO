const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const deploymentPath = path.join(
  root,
  "ignition",
  "deployments",
  "chain-31337",
  "deployed_addresses.json"
);
const configPath = path.join(root, "frontend", "src", "config", "deployment.json");
const abiDirectory = path.join(root, "frontend", "src", "config", "abis");

const addressNames = [
  "GovernanceToken",
  "DAOGovernor",
  "DAOTimelock",
  "Treasury",
  "MilestoneEscrow",
  "DAOReputation",
];

if (!fs.existsSync(deploymentPath)) {
  throw new Error(`Missing Ignition deployment record: ${deploymentPath}`);
}

const deployed = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
const contracts = {};
for (const name of addressNames) {
  const address = deployed[`GuardDAOFresh#${name}`];
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`GuardDAOFresh Ignition deployment is missing a valid ${name} address.`);
  }

  const artifactPath = path.join(root, "artifacts", "contracts", `${name}.sol`, `${name}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Missing compiled ABI artifact for ${name}: ${artifactPath}`);
  }

  const { abi } = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  fs.writeFileSync(
    path.join(abiDirectory, `${name}.json`),
    `${JSON.stringify(abi, null, 2)}\n`
  );
  contracts[name] = address;
}

fs.writeFileSync(
  configPath,
  `${JSON.stringify({ chainId: 31337, contracts }, null, 2)}\n`
);
console.log(`Synchronized ${addressNames.length} local GuardDAO addresses and ABIs.`);
