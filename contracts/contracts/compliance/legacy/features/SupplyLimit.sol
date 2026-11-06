// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "../BasicCompliance.sol";

abstract contract SupplyLimit is BasicCompliance {
    uint256 public supplyLimit;

    event SupplyLimitSet(uint256 _limit);

    function setSupplyLimit(uint256 _limit) external onlyOwner {
        supplyLimit = _limit;
        emit SupplyLimitSet(_limit);
    }

    function complianceCheckOnSupplyLimit(address, address, uint256) public view returns (bool) {
        return true;
    }

    function _transferActionOnSupplyLimit(address _from, address _to, uint256 _value) internal {}

    function _creationActionOnSupplyLimit(address, uint256) internal {
        require(tokenBound.totalSupply() <= supplyLimit, "cannot mint more tokens");
    }

    function _destructionActionOnSupplyLimit(address _from, uint256 _value) internal {}
}
