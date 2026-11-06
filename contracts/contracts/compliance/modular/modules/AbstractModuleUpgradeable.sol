// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./IModule.sol";

abstract contract AbstractModuleUpgradeable is IModule, Initializable, OwnableUpgradeable, UUPSUpgradeable {
    struct AbstractModuleStorage {


        mapping(address => bool) complianceBound;
    }

    bytes32 private constant _ABSTRACT_MODULE_STORAGE_LOCATION =
        0xf6cc97de1266c180cd39f3b311632644143ce7873d2927755382ad4b39e8ae00;

    modifier onlyBoundCompliance(address _compliance) {
        AbstractModuleStorage storage s = _getAbstractModuleStorage();
        require(s.complianceBound[_compliance], "compliance not bound");
        _;
    }

    modifier onlyComplianceCall() {
        AbstractModuleStorage storage s = _getAbstractModuleStorage();
        require(s.complianceBound[msg.sender], "only bound compliance can call");
        _;
    }

    function bindCompliance(address _compliance) external override {
        AbstractModuleStorage storage s = _getAbstractModuleStorage();
        require(_compliance != address(0), "invalid argument - zero address");
        require(!s.complianceBound[_compliance], "compliance already bound");
        require(msg.sender == _compliance, "only compliance contract can call");
        s.complianceBound[_compliance] = true;
        emit ComplianceBound(_compliance);
    }

    function unbindCompliance(address _compliance) external override onlyComplianceCall {
        AbstractModuleStorage storage s = _getAbstractModuleStorage();
        require(_compliance != address(0), "invalid argument - zero address");
        require(msg.sender == _compliance, "only compliance contract can call");
        s.complianceBound[_compliance] = false;
        emit ComplianceUnbound(_compliance);
    }

    function isComplianceBound(address _compliance) external view override returns (bool) {
        AbstractModuleStorage storage s = _getAbstractModuleStorage();
        return s.complianceBound[_compliance];
    }

    function __AbstractModule_init() internal onlyInitializing {
        __Ownable_init();
        __AbstractModule_init_unchained();
    }

    function __AbstractModule_init_unchained() internal onlyInitializing {}

    function _authorizeUpgrade(address) internal virtual override onlyOwner {}

    function _getAbstractModuleStorage() private pure returns (AbstractModuleStorage storage s) {
        assembly {
            s.slot := _ABSTRACT_MODULE_STORAGE_LOCATION
        }
    }
}
