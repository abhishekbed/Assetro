// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "../features/CountryWhitelisting.sol";

contract CountryWhitelistingTest is CountryWhitelisting {
    function transferred(address _from, address _to, uint256 _value) external override onlyToken {
        _transferActionOnCountryWhitelisting(_from, _to, _value);
    }

    function created(address _to, uint256 _value) external override onlyToken {
        _creationActionOnCountryWhitelisting(_to, _value);
    }

    function destroyed(address _from, uint256 _value) external override onlyToken {
        _destructionActionOnCountryWhitelisting(_from, _value);
    }

    function canTransfer(address _from, address _to, uint256 _value) external view override returns (bool) {
        if (!complianceCheckOnCountryWhitelisting(_from, _to, _value)) {
            return false;
        }
        return true;
    }
}
