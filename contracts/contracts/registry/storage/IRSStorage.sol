// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "@onchain-id/solidity/contracts/interface/IIdentity.sol";

contract IRSStorage {
    struct Identity {
        IIdentity identityContract;
        uint16 investorCountry;
    }

    mapping(address => Identity) internal _identities;

    address[] internal _identityRegistries;

    uint256[49] private __gap;
}
