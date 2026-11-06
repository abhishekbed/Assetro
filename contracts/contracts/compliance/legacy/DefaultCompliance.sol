// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "./BasicCompliance.sol";

contract DefaultCompliance is BasicCompliance {
    function transferred(address _from, address _to, uint256 _value) external override {}

    function created(address _to, uint256 _value) external override {}

    function destroyed(address _from, uint256 _value) external override {}

    function canTransfer(address, address, uint256) external view override returns (bool) {
        return true;
    }
}
