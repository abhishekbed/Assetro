// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "../IModularCompliance.sol";
import "../../../token/IToken.sol";
import "./AbstractModuleUpgradeable.sol";

contract TestModule is AbstractModuleUpgradeable {
    mapping(address => uint256) private _complianceData;
    mapping(address => bool) private _blockedTransfers;

    function initialize() external initializer {
        __AbstractModule_init();
    }

    function doSomething(uint256 _value) external onlyComplianceCall {
        _complianceData[msg.sender] = _value;
    }

    function blockModule(bool _blocked) external onlyComplianceCall {
        _blockedTransfers[msg.sender] = _blocked;
    }

    function moduleTransferAction(address, address, uint256) external override onlyComplianceCall {}

    function moduleMintAction(address, uint256) external override onlyComplianceCall {}

    function moduleBurnAction(address, uint256) external override onlyComplianceCall {}

    function moduleCheck(address, address, uint256, address _compliance) external view override returns (bool) {
        if (_blockedTransfers[_compliance]) {
            return false;
        }
        return true;
    }

    function canComplianceBind(address) external pure returns (bool) {
        return true;
    }

    function isPlugAndPlay() external pure returns (bool) {
        return true;
    }

    function name() public pure returns (string memory _name) {
        return "TestModule";
    }
}
