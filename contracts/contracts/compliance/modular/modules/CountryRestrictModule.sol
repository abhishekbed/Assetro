// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../../../token/IToken.sol";
import "../IModularCompliance.sol";
import "./AbstractModule.sol";

contract CountryRestrictModule is AbstractModule {
    mapping(address => mapping(uint16 => bool)) private _restrictedCountries;

    event CountryRestrictionAdded(address indexed compliance, uint16 country);
    event CountryRestrictionRemoved(address indexed compliance, uint16 country);

    function addCountryRestriction(uint16 _country) external onlyComplianceCall {
        _restrictedCountries[msg.sender][_country] = true;
        emit CountryRestrictionAdded(msg.sender, _country);
    }

    function removeCountryRestriction(uint16 _country) external onlyComplianceCall {
        _restrictedCountries[msg.sender][_country] = false;
        emit CountryRestrictionRemoved(msg.sender, _country);
    }

    function batchRestrictCountries(uint16[] calldata _countries) external onlyComplianceCall {
        require(_countries.length < 195, "max 195 countries per batch");
        for (uint256 i = 0; i < _countries.length; i++) {
            _restrictedCountries[msg.sender][_countries[i]] = true;
            emit CountryRestrictionAdded(msg.sender, _countries[i]);
        }
    }

    function batchUnrestrictCountries(uint16[] calldata _countries) external onlyComplianceCall {
        require(_countries.length < 195, "max 195 countries per batch");
        for (uint256 i = 0; i < _countries.length; i++) {
            _restrictedCountries[msg.sender][_countries[i]] = false;
            emit CountryRestrictionRemoved(msg.sender, _countries[i]);
        }
    }

    function isCountryRestricted(address _compliance, uint16 _country) public view returns (bool) {
        return _restrictedCountries[_compliance][_country];
    }

    function moduleTransferAction(address, address, uint256) external override onlyComplianceCall {}

    function moduleMintAction(address, uint256) external override onlyComplianceCall {}

    function moduleBurnAction(address, uint256) external override onlyComplianceCall {}

    function moduleCheck(address, address _to, uint256, address _compliance) external view override returns (bool) {
        if (_to == address(0)) {
            return true;
        }
        uint16 country = _getCountry(_compliance, _to);
        return !isCountryRestricted(_compliance, country);
    }

    function canComplianceBind(address) external pure override returns (bool) {
        return true;
    }

    function isPlugAndPlay() external pure override returns (bool) {
        return true;
    }

    function name() public pure returns (string memory) {
        return "CountryRestrictModule";
    }

    function _getCountry(address _compliance, address _userAddress) internal view returns (uint16) {
        return IToken(IModularCompliance(_compliance).getTokenBound()).identityRegistry().investorCountry(_userAddress);
    }
}
