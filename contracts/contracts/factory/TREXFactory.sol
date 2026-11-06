// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "../roles/AgentRole.sol";
import "../token/IToken.sol";
import "../registry/interface/IClaimTopicsRegistry.sol";
import "../registry/interface/IIdentityRegistry.sol";
import "../compliance/modular/IModularCompliance.sol";
import "../registry/interface/ITrustedIssuersRegistry.sol";
import "../registry/interface/IIdentityRegistryStorage.sol";
import "../proxy/authority/ITREXImplementationAuthority.sol";
import "../proxy/TokenProxy.sol";
import "../proxy/ClaimTopicsRegistryProxy.sol";
import "../proxy/IdentityRegistryProxy.sol";
import "../proxy/IdentityRegistryStorageProxy.sol";
import "../proxy/TrustedIssuersRegistryProxy.sol";
import "../proxy/ModularComplianceProxy.sol";
import "./ITREXFactory.sol";
import "@onchain-id/solidity/contracts/factory/IIdFactory.sol";

contract TREXFactory is ITREXFactory, Ownable {
    address private _implementationAuthority;

    address private _idFactory;

    mapping(string => address) public tokenDeployed;

    constructor(address implementationAuthority_, address idFactory_) {
        setImplementationAuthority(implementationAuthority_);
        setIdFactory(idFactory_);
    }

    function deployTREXSuite(
        string memory _salt,
        TokenDetails calldata _tokenDetails,
        ClaimDetails calldata _claimDetails
    ) external override onlyOwner {
        require(tokenDeployed[_salt] == address(0), "token already deployed");
        require((_claimDetails.issuers).length == (_claimDetails.issuerClaims).length, "claim pattern not valid");
        require((_claimDetails.issuers).length <= 5, "max 5 claim issuers at deployment");
        require((_claimDetails.claimTopics).length <= 5, "max 5 claim topics at deployment");
        require(
            (_tokenDetails.irAgents).length <= 5 && (_tokenDetails.tokenAgents).length <= 5,
            "max 5 agents at deployment"
        );
        require((_tokenDetails.complianceModules).length <= 30, "max 30 module actions at deployment");
        require(
            (_tokenDetails.complianceModules).length >= (_tokenDetails.complianceSettings).length,
            "invalid compliance pattern"
        );

        ITrustedIssuersRegistry tir = ITrustedIssuersRegistry(_deployTIR(_salt, _implementationAuthority));
        IClaimTopicsRegistry ctr = IClaimTopicsRegistry(_deployCTR(_salt, _implementationAuthority));
        IModularCompliance mc = IModularCompliance(_deployMC(_salt, _implementationAuthority));
        IIdentityRegistryStorage irs;
        if (_tokenDetails.irs == address(0)) {
            irs = IIdentityRegistryStorage(_deployIRS(_salt, _implementationAuthority));
        } else {
            irs = IIdentityRegistryStorage(_tokenDetails.irs);
        }
        IIdentityRegistry ir =
            IIdentityRegistry(_deployIR(_salt, _implementationAuthority, address(tir), address(ctr), address(irs)));
        IToken token = IToken(
            _deployToken(
                _salt,
                _implementationAuthority,
                address(ir),
                address(mc),
                _tokenDetails.name,
                _tokenDetails.symbol,
                _tokenDetails.decimals,
                _tokenDetails.ONCHAINID
            )
        );
        if (_tokenDetails.ONCHAINID == address(0)) {
            address _tokenID = IIdFactory(_idFactory).createTokenIdentity(address(token), _tokenDetails.owner, _salt);
            token.setOnchainID(_tokenID);
        }
        for (uint256 i = 0; i < (_claimDetails.claimTopics).length; i++) {
            ctr.addClaimTopic(_claimDetails.claimTopics[i]);
        }
        for (uint256 i = 0; i < (_claimDetails.issuers).length; i++) {
            tir.addTrustedIssuer(IClaimIssuer((_claimDetails).issuers[i]), _claimDetails.issuerClaims[i]);
        }
        irs.bindIdentityRegistry(address(ir));
        AgentRole(address(ir)).addAgent(address(token));
        for (uint256 i = 0; i < (_tokenDetails.irAgents).length; i++) {
            AgentRole(address(ir)).addAgent(_tokenDetails.irAgents[i]);
        }
        for (uint256 i = 0; i < (_tokenDetails.tokenAgents).length; i++) {
            AgentRole(address(token)).addAgent(_tokenDetails.tokenAgents[i]);
        }
        for (uint256 i = 0; i < (_tokenDetails.complianceModules).length; i++) {
            if (!mc.isModuleBound(_tokenDetails.complianceModules[i])) {
                mc.addModule(_tokenDetails.complianceModules[i]);
            }
            if (i < (_tokenDetails.complianceSettings).length) {
                mc.callModuleFunction(_tokenDetails.complianceSettings[i], _tokenDetails.complianceModules[i]);
            }
        }
        tokenDeployed[_salt] = address(token);
        (Ownable(address(token))).transferOwnership(_tokenDetails.owner);
        (Ownable(address(ir))).transferOwnership(_tokenDetails.owner);
        (Ownable(address(tir))).transferOwnership(_tokenDetails.owner);
        (Ownable(address(ctr))).transferOwnership(_tokenDetails.owner);
        (Ownable(address(mc))).transferOwnership(_tokenDetails.owner);
        emit TREXSuiteDeployed(
            address(token), address(ir), address(irs), address(tir), address(ctr), address(mc), _salt
        );
    }

    function recoverContractOwnership(address _contract, address _newOwner) external override onlyOwner {
        (Ownable(_contract)).transferOwnership(_newOwner);
    }

    function getImplementationAuthority() external view override returns (address) {
        return _implementationAuthority;
    }

    function getIdFactory() external view override returns (address) {
        return _idFactory;
    }

    function getToken(string calldata _salt) external view override returns (address) {
        return tokenDeployed[_salt];
    }

    function setImplementationAuthority(address implementationAuthority_) public override onlyOwner {
        require(implementationAuthority_ != address(0), "invalid argument - zero address");

        require(
            (ITREXImplementationAuthority(implementationAuthority_)).getTokenImplementation() != address(0)
                && (ITREXImplementationAuthority(implementationAuthority_)).getCTRImplementation() != address(0)
                && (ITREXImplementationAuthority(implementationAuthority_)).getIRImplementation() != address(0)
                && (ITREXImplementationAuthority(implementationAuthority_)).getIRSImplementation() != address(0)
                && (ITREXImplementationAuthority(implementationAuthority_)).getMCImplementation() != address(0)
                && (ITREXImplementationAuthority(implementationAuthority_)).getTIRImplementation() != address(0),
            "invalid Implementation Authority"
        );
        _implementationAuthority = implementationAuthority_;
        emit ImplementationAuthoritySet(implementationAuthority_);
    }

    function setIdFactory(address idFactory_) public override onlyOwner {
        require(idFactory_ != address(0), "invalid argument - zero address");
        _idFactory = idFactory_;
        emit IdFactorySet(idFactory_);
    }

    function _deploy(string memory salt, bytes memory bytecode) private returns (address) {
        bytes32 saltBytes = bytes32(keccak256(abi.encodePacked(salt)));
        address addr;

        assembly {
            let encoded_data := add(0x20, bytecode)
            let encoded_size := mload(bytecode)
            addr := create2(0, encoded_data, encoded_size, saltBytes)
            if iszero(extcodesize(addr)) {
                revert(0, 0)
            }
        }
        emit Deployed(addr);
        return addr;
    }

    function _deployTIR(string memory _salt, address implementationAuthority_) private returns (address) {
        bytes memory _code = type(TrustedIssuersRegistryProxy).creationCode;
        bytes memory _constructData = abi.encode(implementationAuthority_);
        bytes memory bytecode = abi.encodePacked(_code, _constructData);
        return _deploy(_salt, bytecode);
    }

    function _deployCTR(string memory _salt, address implementationAuthority_) private returns (address) {
        bytes memory _code = type(ClaimTopicsRegistryProxy).creationCode;
        bytes memory _constructData = abi.encode(implementationAuthority_);
        bytes memory bytecode = abi.encodePacked(_code, _constructData);
        return _deploy(_salt, bytecode);
    }

    function _deployMC(string memory _salt, address implementationAuthority_) private returns (address) {
        bytes memory _code = type(ModularComplianceProxy).creationCode;
        bytes memory _constructData = abi.encode(implementationAuthority_);
        bytes memory bytecode = abi.encodePacked(_code, _constructData);
        return _deploy(_salt, bytecode);
    }

    function _deployIRS(string memory _salt, address implementationAuthority_) private returns (address) {
        bytes memory _code = type(IdentityRegistryStorageProxy).creationCode;
        bytes memory _constructData = abi.encode(implementationAuthority_);
        bytes memory bytecode = abi.encodePacked(_code, _constructData);
        return _deploy(_salt, bytecode);
    }

    function _deployIR(
        string memory _salt,
        address implementationAuthority_,
        address _trustedIssuersRegistry,
        address _claimTopicsRegistry,
        address _identityStorage
    ) private returns (address) {
        bytes memory _code = type(IdentityRegistryProxy).creationCode;
        bytes memory _constructData =
            abi.encode(implementationAuthority_, _trustedIssuersRegistry, _claimTopicsRegistry, _identityStorage);
        bytes memory bytecode = abi.encodePacked(_code, _constructData);
        return _deploy(_salt, bytecode);
    }

    function _deployToken(
        string memory _salt,
        address implementationAuthority_,
        address _identityRegistry,
        address _compliance,
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        address _onchainId
    ) private returns (address) {
        bytes memory _code = type(TokenProxy).creationCode;
        bytes memory _constructData =
            abi.encode(implementationAuthority_, _identityRegistry, _compliance, _name, _symbol, _decimals, _onchainId);
        bytes memory bytecode = abi.encodePacked(_code, _constructData);
        return _deploy(_salt, bytecode);
    }
}
