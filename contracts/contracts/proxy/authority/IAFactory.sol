// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "./TREXImplementationAuthority.sol";

contract IAFactory is IIAFactory {
    address private _trexFactory;

    mapping(address => bool) private _deployedByFactory;

    constructor(address trexFactory) {
        _trexFactory = trexFactory;
    }

    function deployIA(address _token) external override returns (address) {
        if (ITREXFactory(_trexFactory).getImplementationAuthority() != msg.sender) {
            revert("only reference IA can deploy");
        }
        TREXImplementationAuthority _newIA = new TREXImplementationAuthority(
            false, ITREXImplementationAuthority(msg.sender).getTREXFactory(), address(this)
        );
        _newIA.fetchVersion(ITREXImplementationAuthority(msg.sender).getCurrentVersion());
        _newIA.useTREXVersion(ITREXImplementationAuthority(msg.sender).getCurrentVersion());
        Ownable(_newIA).transferOwnership(Ownable(_token).owner());
        _deployedByFactory[address(_newIA)] = true;
        emit ImplementationAuthorityDeployed(address(_newIA));
        return address(_newIA);
    }

    function deployedByFactory(address _ia) external view override returns (bool) {
        return _deployedByFactory[_ia];
    }
}
