// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

interface IProxy {
    event ImplementationAuthoritySet(address indexed _implementationAuthority);

    function setImplementationAuthority(address _newImplementationAuthority) external;

    function getImplementationAuthority() external view returns (address);
}
