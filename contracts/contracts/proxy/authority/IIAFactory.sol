// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

interface IIAFactory {
    event ImplementationAuthorityDeployed(address indexed _ia);

    function deployIA(address _token) external returns (address);

    function deployedByFactory(address _ia) external view returns (bool);
}
