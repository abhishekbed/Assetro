// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "../features/MaxBalance.sol";

contract MaxBalanceTest is MaxBalance {
    function transferred(address _from, address _to, uint256 _value) external override onlyToken {
        _transferActionOnMaxBalance(_from, _to, _value);
    }

    function created(address _to, uint256 _value) external override onlyToken {
        _creationActionOnMaxBalance(_to, _value);
    }

    function destroyed(address _from, uint256 _value) external override onlyToken {
        _destructionActionOnMaxBalance(_from, _value);
    }

    function canTransfer(address _from, address _to, uint256 _value) external view override returns (bool) {
        if (!complianceCheckOnMaxBalance(_from, _to, _value)) {
            return false;
        }
        return true;
    }
}
