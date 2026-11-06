import tokenArtifact from '../../../../../contracts/artifacts/contracts/token/Token.sol/Token.json';
import identityRegistryArtifact from '../../../../../contracts/artifacts/contracts/registry/implementation/IdentityRegistry.sol/IdentityRegistry.json';
import modularComplianceArtifact from '../../../../../contracts/artifacts/contracts/compliance/modular/ModularCompliance.sol/ModularCompliance.json';
import tokenFactoryArtifact from '../../../../../contracts/artifacts/contracts/factory/TREXFactory.sol/TREXFactory.json';
import tokenGatewayArtifact from '../../../../../contracts/artifacts/contracts/factory/TREXGateway.sol/TREXGateway.json';
import countryRestrictArtifact from '../../../../../contracts/artifacts/contracts/compliance/modular/modules/CountryRestrictModule.sol/CountryRestrictModule.json';
import maxHolderArtifact from '../../../../../contracts/artifacts/contracts/compliance/modular/modules/MaxHolderModule.sol/MaxHolderModule.json';
import transferWindowArtifact from '../../../../../contracts/artifacts/contracts/compliance/modular/modules/TransferWindowModule.sol/TransferWindowModule.json';

export const tokenAbi = tokenArtifact.abi;
export const tokenBytecode = tokenArtifact.bytecode as `0x${string}`;

export const identityRegistryAbi = identityRegistryArtifact.abi;
export const modularComplianceAbi = modularComplianceArtifact.abi;
export const tokenFactoryAbi = tokenFactoryArtifact.abi;
export const tokenGatewayAbi = tokenGatewayArtifact.abi;

export const countryRestrictModuleAbi = countryRestrictArtifact.abi;
export const countryRestrictModuleBytecode = countryRestrictArtifact.bytecode as `0x${string}`;

export const maxHolderModuleAbi = maxHolderArtifact.abi;
export const maxHolderModuleBytecode = maxHolderArtifact.bytecode as `0x${string}`;

export const transferWindowModuleAbi = transferWindowArtifact.abi;
export const transferWindowModuleBytecode = transferWindowArtifact.bytecode as `0x${string}`;
