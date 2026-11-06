// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "../BasicCompliance.sol";

abstract contract CountryWhitelisting is BasicCompliance {
    mapping(uint16 => bool) private _whitelistedCountries;

    event WhitelistedCountry(uint16 _country);

    event UnWhitelistedCountry(uint16 _country);

    function batchWhitelistCountries(uint16[] memory _countries) external {
        for (uint256 i = 0; i < _countries.length; i++) {
            whitelistCountry(_countries[i]);
        }
    }

    function batchUnWhitelistCountries(uint16[] memory _countries) external {
        for (uint256 i = 0; i < _countries.length; i++) {
            unWhitelistCountry(_countries[i]);
        }
    }

    function whitelistCountry(uint16 _country) public onlyOwner {
        require(!_whitelistedCountries[_country], "country already whitelisted");
        _whitelistedCountries[_country] = true;
        emit WhitelistedCountry(_country);
    }

    function unWhitelistCountry(uint16 _country) public onlyOwner {
        require(_whitelistedCountries[_country], "country not whitelisted");
        _whitelistedCountries[_country] = false;
        emit UnWhitelistedCountry(_country);
    }

    function isCountryWhitelisted(uint16 _country) public view returns (bool) {
        return (_whitelistedCountries[_country]);
    }

    function complianceCheckOnCountryWhitelisting(address, address _to, uint256) public view returns (bool) {
        uint16 receiverCountry = _getCountry(_to);
        if (isCountryWhitelisted(receiverCountry)) {
            return true;
        }
        return false;
    }

    function _transferActionOnCountryWhitelisting(address _from, address _to, uint256 _value) internal {}

    function _creationActionOnCountryWhitelisting(address _to, uint256 _value) internal {}

    function _destructionActionOnCountryWhitelisting(address _from, uint256 _value) internal {}
}
