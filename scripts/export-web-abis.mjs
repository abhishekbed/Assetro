import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = path.join(repoRoot, 'contracts/artifacts/contracts');

const contracts = {
  token: 'token/Token.sol/Token.json',
  identityRegistry: 'registry/implementation/IdentityRegistry.sol/IdentityRegistry.json',
  modularCompliance: 'compliance/modular/ModularCompliance.sol/ModularCompliance.json',
  tokenFactory: 'factory/TREXFactory.sol/TREXFactory.json',
  tokenGateway: 'factory/TREXGateway.sol/TREXGateway.json',
  countryRestrictModule: 'compliance/modular/modules/CountryRestrictModule.sol/CountryRestrictModule.json',
  maxHolderModule: 'compliance/modular/modules/MaxHolderModule.sol/MaxHolderModule.json',
  transferWindowModule: 'compliance/modular/modules/TransferWindowModule.sol/TransferWindowModule.json',
};

const abis = Object.fromEntries(
  Object.entries(contracts).map(([name, artifactPath]) => {
    const artifact = JSON.parse(readFileSync(path.join(artifactRoot, artifactPath), 'utf8'));
    if (!Array.isArray(artifact.abi)) {
      throw new Error(`Missing ABI in ${artifactPath}`);
    }
    return [name, artifact.abi];
  }),
);

const outputPath = path.join(repoRoot, 'apps/web-platform/src/lib/contracts/abis.json');
writeFileSync(outputPath, `${JSON.stringify(abis, null, 2)}\n`);
console.log(`Exported ${Object.keys(abis).length} contract ABIs to ${outputPath}`);
