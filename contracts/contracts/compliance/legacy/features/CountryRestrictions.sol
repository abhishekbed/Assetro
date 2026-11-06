// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "../BasicCompliance.sol";

abstract contract CountryRestrictions is BasicCompliance {
    mapping(uint16 => bool) private _restrictedCountries;

    event AddedRestrictedCountry(uint16 _country);

    event RemovedRestrictedCountry(uint16 _country);

    function batchRestrictCountries(uint16[] calldata _countries) external {
        for (uint256 i = 0; i < _countries.length; i++) {
            addCountryRestriction(_countries[i]);
        }
    }

    function batchUnrestrictCountries(uint16[] calldata _countries) external {
        for (uint256 i = 0; i < _countries.length; i++) {
            removeCountryRestriction(_countries[i]);
        }
    }

    function addCountryRestriction(uint16 _country) public onlyOwner {
        require(!_restrictedCountries[_country], "country already restricted");
        _restrictedCountries[_country] = true;
        emit AddedRestrictedCountry(_country);
    }

    function removeCountryRestriction(uint16 _country) public onlyOwner {
        require(_restrictedCountries[_country], "country not restricted");
        _restrictedCountries[_country] = false;
        emit RemovedRestrictedCountry(_country);
    }

    function isCountryRestricted(uint16 _country) public view returns (bool) {
        return (_restrictedCountries[_country]);
    }

    function complianceCheckOnCountryRestrictions(address, address _to, uint256) public view returns (bool) {
        uint16 receiverCountry = _getCountry(_to);
        if (isCountryRestricted(receiverCountry)) {
            return false;
        }
        return true;
    }

    function _transferActionOnCountryRestrictions(address _from, address _to, uint256 _value) internal {}

    function _creationActionOnCountryRestrictions(address _to, uint256 _value) internal {}

    function _destructionActionOnCountryRestrictions(address _from, uint256 _value) internal {}
}
