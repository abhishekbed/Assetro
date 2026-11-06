// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "@onchain-id/solidity/contracts/interface/IClaimIssuer.sol";
import "@onchain-id/solidity/contracts/interface/IIdentity.sol";

import "../interface/IClaimTopicsRegistry.sol";
import "../interface/ITrustedIssuersRegistry.sol";
import "../interface/IIdentityRegistry.sol";
import "../../roles/AgentRoleUpgradeable.sol";
import "../interface/IIdentityRegistryStorage.sol";
import "../storage/IRStorage.sol";

contract IdentityRegistry is IIdentityRegistry, AgentRoleUpgradeable, IRStorage {
    function init(address _trustedIssuersRegistry, address _claimTopicsRegistry, address _identityStorage)
        external
        initializer
    {
        require(
            _trustedIssuersRegistry != address(0) && _claimTopicsRegistry != address(0)
                && _identityStorage != address(0),
            "invalid argument - zero address"
        );
        _tokenTopicsRegistry = IClaimTopicsRegistry(_claimTopicsRegistry);
        _tokenIssuersRegistry = ITrustedIssuersRegistry(_trustedIssuersRegistry);
        _tokenIdentityStorage = IIdentityRegistryStorage(_identityStorage);
        emit ClaimTopicsRegistrySet(_claimTopicsRegistry);
        emit TrustedIssuersRegistrySet(_trustedIssuersRegistry);
        emit IdentityStorageSet(_identityStorage);
        __Ownable_init();
    }

    function batchRegisterIdentity(
        address[] calldata _userAddresses,
        IIdentity[] calldata _identities,
        uint16[] calldata _countries
    ) external override {
        for (uint256 i = 0; i < _userAddresses.length; i++) {
            registerIdentity(_userAddresses[i], _identities[i], _countries[i]);
        }
    }

    function updateIdentity(address _userAddress, IIdentity _identity) external override onlyAgent {
        IIdentity oldIdentity = identity(_userAddress);
        _tokenIdentityStorage.modifyStoredIdentity(_userAddress, _identity);
        emit IdentityUpdated(oldIdentity, _identity);
    }

    function updateCountry(address _userAddress, uint16 _country) external override onlyAgent {
        _tokenIdentityStorage.modifyStoredInvestorCountry(_userAddress, _country);
        emit CountryUpdated(_userAddress, _country);
    }

    function deleteIdentity(address _userAddress) external override onlyAgent {
        IIdentity oldIdentity = identity(_userAddress);
        _tokenIdentityStorage.removeIdentityFromStorage(_userAddress);
        emit IdentityRemoved(_userAddress, oldIdentity);
    }

    function setIdentityRegistryStorage(address _identityRegistryStorage) external override onlyOwner {
        _tokenIdentityStorage = IIdentityRegistryStorage(_identityRegistryStorage);
        emit IdentityStorageSet(_identityRegistryStorage);
    }

    function setClaimTopicsRegistry(address _claimTopicsRegistry) external override onlyOwner {
        _tokenTopicsRegistry = IClaimTopicsRegistry(_claimTopicsRegistry);
        emit ClaimTopicsRegistrySet(_claimTopicsRegistry);
    }

    function setTrustedIssuersRegistry(address _trustedIssuersRegistry) external override onlyOwner {
        _tokenIssuersRegistry = ITrustedIssuersRegistry(_trustedIssuersRegistry);
        emit TrustedIssuersRegistrySet(_trustedIssuersRegistry);
    }

    function isVerified(address _userAddress) external view override returns (bool) {
        if (address(identity(_userAddress)) == address(0)) return false;
        uint256[] memory requiredClaimTopics = _tokenTopicsRegistry.getClaimTopics();
        if (requiredClaimTopics.length == 0) {
            return true;
        }

        uint256 foundClaimTopic;
        uint256 scheme;
        address issuer;
        bytes memory sig;
        bytes memory data;
        uint256 claimTopic;
        for (claimTopic = 0; claimTopic < requiredClaimTopics.length; claimTopic++) {
            IClaimIssuer[] memory trustedIssuers =
                _tokenIssuersRegistry.getTrustedIssuersForClaimTopic(requiredClaimTopics[claimTopic]);

            if (trustedIssuers.length == 0) return false;

            bytes32[] memory claimIds = new bytes32[](trustedIssuers.length);
            for (uint256 i = 0; i < trustedIssuers.length; i++) {
                claimIds[i] = keccak256(abi.encode(trustedIssuers[i], requiredClaimTopics[claimTopic]));
            }

            for (uint256 j = 0; j < claimIds.length; j++) {
                (foundClaimTopic, scheme, issuer, sig, data,) = identity(_userAddress).getClaim(claimIds[j]);

                if (foundClaimTopic == requiredClaimTopics[claimTopic]) {
                    try IClaimIssuer(issuer)
                        .isClaimValid(identity(_userAddress), requiredClaimTopics[claimTopic], sig, data) returns (
                        bool _validity
                    ) {
                        if (_validity) {
                            j = claimIds.length;
                        }
                        if (!_validity && j == (claimIds.length - 1)) {
                            return false;
                        }
                    } catch {
                        if (j == (claimIds.length - 1)) {
                            return false;
                        }
                    }
                } else if (j == (claimIds.length - 1)) {
                    return false;
                }
            }
        }
        return true;
    }

    function investorCountry(address _userAddress) external view override returns (uint16) {
        return _tokenIdentityStorage.storedInvestorCountry(_userAddress);
    }

    function issuersRegistry() external view override returns (ITrustedIssuersRegistry) {
        return _tokenIssuersRegistry;
    }

    function topicsRegistry() external view override returns (IClaimTopicsRegistry) {
        return _tokenTopicsRegistry;
    }

    function identityStorage() external view override returns (IIdentityRegistryStorage) {
        return _tokenIdentityStorage;
    }

    function contains(address _userAddress) external view override returns (bool) {
        if (address(identity(_userAddress)) == address(0)) {
            return false;
        }
        return true;
    }

    function registerIdentity(address _userAddress, IIdentity _identity, uint16 _country) public override onlyAgent {
        _tokenIdentityStorage.addIdentityToStorage(_userAddress, _identity, _country);
        emit IdentityRegistered(_userAddress, _identity);
    }

    function identity(address _userAddress) public view override returns (IIdentity) {
        return _tokenIdentityStorage.storedIdentity(_userAddress);
    }
}
