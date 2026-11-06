// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "../features/SupplyLimit.sol";

contract SupplyLimitTest is SupplyLimit {
    function transferred(address _from, address _to, uint256 _value) external override onlyToken {
        _transferActionOnSupplyLimit(_from, _to, _value);
    }

    function created(address _to, uint256 _value) external override onlyToken {
        _creationActionOnSupplyLimit(_to, _value);
    }

    function destroyed(address _from, uint256 _value) external override onlyToken {
        _destructionActionOnSupplyLimit(_from, _value);
    }

    function canTransfer(address _from, address _to, uint256 _value) external view override returns (bool) {
        if (!complianceCheckOnSupplyLimit(_from, _to, _value)) {
            return false;
        }
        return true;
    }
}
