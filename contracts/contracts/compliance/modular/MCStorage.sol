// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

contract MCStorage {
    address internal _tokenBound;

    address[] internal _modules;

    mapping(address => bool) internal _moduleBound;

    uint256[49] private __gap;
}
