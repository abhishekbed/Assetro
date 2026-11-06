// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "../features/ExchangeMonthlyLimits.sol";

contract ExchangeMonthlyLimitsTest is ExchangeMonthlyLimits {
    function transferred(address _from, address _to, uint256 _value) external override onlyToken {
        _transferActionOnExchangeMonthlyLimits(_from, _to, _value);
    }

    function created(address _to, uint256 _value) external override onlyToken {
        _creationActionOnExchangeMonthlyLimits(_to, _value);
    }

    function destroyed(address _from, uint256 _value) external override onlyToken {
        _destructionActionOnExchangeMonthlyLimits(_from, _value);
    }

    function canTransfer(address _from, address _to, uint256 _value) external view override returns (bool) {
        if (!complianceCheckOnExchangeMonthlyLimits(_from, _to, _value)) {
            return false;
        }
        return true;
    }
}
