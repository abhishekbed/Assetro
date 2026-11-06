// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "../features/DayMonthLimits.sol";

contract DayMonthLimitsTest is DayMonthLimits {
    function transferred(address _from, address _to, uint256 _value) external override onlyToken {
        _transferActionOnDayMonthLimits(_from, _to, _value);
    }

    function created(address _to, uint256 _value) external override onlyToken {
        _creationActionOnDayMonthLimits(_to, _value);
    }

    function destroyed(address _from, uint256 _value) external override onlyToken {
        _destructionActionOnDayMonthLimits(_from, _value);
    }

    function canTransfer(address _from, address _to, uint256 _value) external view override returns (bool) {
        if (!complianceCheckOnDayMonthLimits(_from, _to, _value)) {
            return false;
        }
        return true;
    }
}
