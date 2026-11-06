// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "../interface/IClaimTopicsRegistry.sol";
import "../interface/ITrustedIssuersRegistry.sol";
import "../interface/IIdentityRegistryStorage.sol";

contract IRStorage {
    IClaimTopicsRegistry internal _tokenTopicsRegistry;

    ITrustedIssuersRegistry internal _tokenIssuersRegistry;

    IIdentityRegistryStorage internal _tokenIdentityStorage;

    uint256[49] private __gap;
}
