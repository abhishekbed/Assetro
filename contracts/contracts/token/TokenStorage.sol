// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;
import "../compliance/modular/IModularCompliance.sol";
import "../registry/interface/IIdentityRegistry.sol";

contract TokenStorage {
    mapping(address => uint256) internal _balances;
    mapping(address => mapping(address => uint256)) internal _allowances;
    uint256 internal _totalSupply;

    string internal _tokenName;
    string internal _tokenSymbol;
    uint8 internal _tokenDecimals;
    address internal _tokenOnchainID;
    string internal constant _TOKEN_VERSION = "4.1.3";

    mapping(address => bool) internal _frozen;
    mapping(address => uint256) internal _frozenTokens;

    bool internal _tokenPaused = false;

    IIdentityRegistry internal _tokenIdentityRegistry;

    IModularCompliance internal _tokenCompliance;

    uint256[49] private __gap;
}
