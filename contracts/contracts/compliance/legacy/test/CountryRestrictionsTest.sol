// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "../features/CountryRestrictions.sol";

contract CountryRestrictionsTest is CountryRestrictions {
    function transferred(address _from, address _to, uint256 _value) external override onlyToken {
        _transferActionOnCountryRestrictions(_from, _to, _value);
    }

    function created(address _to, uint256 _value) external override onlyToken {
        _creationActionOnCountryRestrictions(_to, _value);
    }

    function destroyed(address _from, uint256 _value) external override onlyToken {
        _destructionActionOnCountryRestrictions(_from, _value);
    }

    function canTransfer(address _from, address _to, uint256 _value) external view override returns (bool) {
        if (!complianceCheckOnCountryRestrictions(_from, _to, _value)) {
            return false;
        }
        return true;
    }
}
