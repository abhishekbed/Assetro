// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "@onchain-id/solidity/contracts/interface/IClaimIssuer.sol";

contract TIRStorage {
    IClaimIssuer[] internal _trustedIssuers;

    mapping(address => uint256[]) internal _trustedIssuerClaimTopics;

    mapping(uint256 => IClaimIssuer[]) internal _claimTopicsToTrustedIssuers;

    uint256[49] private __gap;
}
