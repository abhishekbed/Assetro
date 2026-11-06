// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ITREXImplementationAuthority.sol";
import "../../token/IToken.sol";
import "../interface/IProxy.sol";
import "../../factory/ITREXFactory.sol";
import "./IIAFactory.sol";

contract TREXImplementationAuthority is ITREXImplementationAuthority, Ownable {
    Version private _currentVersion;

    mapping(bytes32 => TREXContracts) private _contracts;

    bool private _reference;

    address private _trexFactory;

    address private _iaFactory;

    constructor(bool referenceStatus, address trexFactory, address iaFactory) {
        _reference = referenceStatus;
        _trexFactory = trexFactory;
        _iaFactory = iaFactory;
        emit ImplementationAuthoritySet(referenceStatus, trexFactory);
        emit IAFactorySet(iaFactory);
    }

    function setTREXFactory(address trexFactory) external override onlyOwner {
        require(
            isReferenceContract() && ITREXFactory(trexFactory).getImplementationAuthority() == address(this),
            "only reference contract can call"
        );
        _trexFactory = trexFactory;
        emit TREXFactorySet(trexFactory);
    }

    function setIAFactory(address iaFactory) external override onlyOwner {
        require(
            isReferenceContract() && ITREXFactory(_trexFactory).getImplementationAuthority() == address(this),
            "only reference contract can call"
        );
        _iaFactory = iaFactory;
        emit IAFactorySet(iaFactory);
    }

    function addAndUseTREXVersion(Version calldata _version, TREXContracts calldata _trex) external override {
        addTREXVersion(_version, _trex);
        useTREXVersion(_version);
    }

    function fetchVersion(Version calldata _version) external override {
        require(!isReferenceContract(), "cannot call on reference contract");
        if (_contracts[_versionToBytes(_version)].tokenImplementation != address(0)) {
            revert("version fetched already");
        }
        _contracts[_versionToBytes(_version)] =
            ITREXImplementationAuthority(getReferenceContract()).getContracts(_version);
        emit TREXVersionFetched(_version, _contracts[_versionToBytes(_version)]);
    }

    function changeImplementationAuthority(address _token, address _newImplementationAuthority) external override {
        require(_token != address(0), "invalid argument - zero address");
        if (_newImplementationAuthority == address(0) && !isReferenceContract()) {
            revert("only reference contract can deploy new IAs");
        }

        address _ir = address(IToken(_token).identityRegistry());
        address _mc = address(IToken(_token).compliance());
        address _irs = address(IIdentityRegistry(_ir).identityStorage());
        address _ctr = address(IIdentityRegistry(_ir).topicsRegistry());
        address _tir = address(IIdentityRegistry(_ir).issuersRegistry());

        if (
            Ownable(_token).owner() != msg.sender || Ownable(_ir).owner() != msg.sender
                || Ownable(_mc).owner() != msg.sender || Ownable(_irs).owner() != msg.sender
                || Ownable(_ctr).owner() != msg.sender || Ownable(_tir).owner() != msg.sender
        ) {
            revert("caller NOT owner of all contracts impacted");
        }

        if (_newImplementationAuthority == address(0)) {
            _newImplementationAuthority = IIAFactory(_iaFactory).deployIA(_token);
        } else {
            if (
                _versionToBytes(ITREXImplementationAuthority(_newImplementationAuthority).getCurrentVersion())
                    != _versionToBytes(_currentVersion)
            ) {
                revert("version of new IA has to be the same as current IA");
            }
            if (
                ITREXImplementationAuthority(_newImplementationAuthority).isReferenceContract()
                    && _newImplementationAuthority != getReferenceContract()
            ) {
                revert("new IA is NOT reference contract");
            }
            if (
                !IIAFactory(_iaFactory).deployedByFactory(_newImplementationAuthority)
                    && _newImplementationAuthority != getReferenceContract()
            ) {
                revert("invalid IA");
            }
        }

        IProxy(_token).setImplementationAuthority(_newImplementationAuthority);
        IProxy(_ir).setImplementationAuthority(_newImplementationAuthority);
        IProxy(_mc).setImplementationAuthority(_newImplementationAuthority);
        IProxy(_ctr).setImplementationAuthority(_newImplementationAuthority);
        IProxy(_tir).setImplementationAuthority(_newImplementationAuthority);

        if (IProxy(_irs).getImplementationAuthority() == address(this)) {
            IProxy(_irs).setImplementationAuthority(_newImplementationAuthority);
        }
        emit ImplementationAuthorityChanged(_token, _newImplementationAuthority);
    }

    function getCurrentVersion() external view override returns (Version memory) {
        return _currentVersion;
    }

    function getContracts(Version calldata _version) external view override returns (TREXContracts memory) {
        return _contracts[_versionToBytes(_version)];
    }

    function getTREXFactory() external view override returns (address) {
        return _trexFactory;
    }

    function getTokenImplementation() external view override returns (address) {
        return _contracts[_versionToBytes(_currentVersion)].tokenImplementation;
    }

    function getCTRImplementation() external view override returns (address) {
        return _contracts[_versionToBytes(_currentVersion)].ctrImplementation;
    }

    function getIRImplementation() external view override returns (address) {
        return _contracts[_versionToBytes(_currentVersion)].irImplementation;
    }

    function getIRSImplementation() external view override returns (address) {
        return _contracts[_versionToBytes(_currentVersion)].irsImplementation;
    }

    function getTIRImplementation() external view override returns (address) {
        return _contracts[_versionToBytes(_currentVersion)].tirImplementation;
    }

    function getMCImplementation() external view override returns (address) {
        return _contracts[_versionToBytes(_currentVersion)].mcImplementation;
    }

    function addTREXVersion(Version calldata _version, TREXContracts calldata _trex) public override onlyOwner {
        require(isReferenceContract(), "ONLY reference contract can add versions");
        if (_contracts[_versionToBytes(_version)].tokenImplementation != address(0)) {
            revert("version already exists");
        }
        require(
            _trex.ctrImplementation != address(0) && _trex.irImplementation != address(0)
                && _trex.irsImplementation != address(0) && _trex.mcImplementation != address(0)
                && _trex.tirImplementation != address(0) && _trex.tokenImplementation != address(0),
            "invalid argument - zero address"
        );
        _contracts[_versionToBytes(_version)] = _trex;
        emit TREXVersionAdded(_version, _trex);
    }

    function useTREXVersion(Version calldata _version) public override onlyOwner {
        if (_versionToBytes(_version) == _versionToBytes(_currentVersion)) {
            revert("version already in use");
        }
        if (_contracts[_versionToBytes(_version)].tokenImplementation == address(0)) {
            revert("invalid argument - non existing version");
        }
        _currentVersion = _version;
        emit VersionUpdated(_version);
    }

    function isReferenceContract() public view override returns (bool) {
        return _reference;
    }

    function getReferenceContract() public view override returns (address) {
        return ITREXFactory(_trexFactory).getImplementationAuthority();
    }

    function _versionToBytes(Version memory _version) private pure returns (bytes32) {
        return bytes32(keccak256(abi.encodePacked(_version.major, _version.minor, _version.patch)));
    }
}
