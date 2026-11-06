// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../../../token/IToken.sol";
import "../IModularCompliance.sol";
import "./AbstractModule.sol";

contract SupplyLimitModule is AbstractModule {
    mapping(address => uint256) private _supplyLimit;

    event SupplyLimitSet(address indexed compliance, uint256 limit);

    function setSupplyLimit(uint256 _limit) external onlyComplianceCall {
        _supplyLimit[msg.sender] = _limit;
        emit SupplyLimitSet(msg.sender, _limit);
    }

    function getSupplyLimit(address _compliance) external view returns (uint256) {
        return _supplyLimit[_compliance];
    }

    function moduleTransferAction(address, address, uint256) external override onlyComplianceCall {}

    function moduleMintAction(address, uint256) external override onlyComplianceCall {}

    function moduleBurnAction(address, uint256) external override onlyComplianceCall {}

    function moduleCheck(address _from, address, uint256 _value, address _compliance)
        external
        view
        override
        returns (bool)
    {
        if (_from != address(0)) {
            return true;
        }
        uint256 limit = _supplyLimit[_compliance];
        if (limit == 0) {
            return true;
        }
        uint256 currentSupply = IToken(IModularCompliance(_compliance).getTokenBound()).totalSupply();
        return currentSupply + _value <= limit;
    }

    function canComplianceBind(address) external pure override returns (bool) {
        return true;
    }

    function isPlugAndPlay() external pure override returns (bool) {
        return true;
    }

    function name() public pure returns (string memory) {
        return "SupplyLimitModule";
    }
}
