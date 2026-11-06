// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "../../roles/AgentRole.sol";
import "./ICompliance.sol";
import "../../token/IToken.sol";

abstract contract BasicCompliance is AgentRole, ICompliance {
    mapping(address => bool) private _tokenAgentsList;

    IToken public tokenBound;

    modifier onlyToken() {
        require(_isToken(), "error : this address is not a token bound to the compliance contract");
        _;
    }

    modifier onlyAdmin() {
        require(
            owner() == msg.sender || (AgentRole(address(tokenBound))).isAgent(msg.sender),
            "can be called only by Admin address"
        );
        _;
    }

    function addTokenAgent(address _agentAddress) external override onlyOwner {
        require(!_tokenAgentsList[_agentAddress], "This Agent is already registered");
        _tokenAgentsList[_agentAddress] = true;
        emit TokenAgentAdded(_agentAddress);
    }

    function removeTokenAgent(address _agentAddress) external override onlyOwner {
        require(_tokenAgentsList[_agentAddress], "This Agent is not registered yet");
        _tokenAgentsList[_agentAddress] = false;
        emit TokenAgentRemoved(_agentAddress);
    }

    function bindToken(address _token) external override {
        require(
            owner() == msg.sender || (address(tokenBound) == address(0) && msg.sender == _token),
            "only owner or token can call"
        );
        tokenBound = IToken(_token);
        emit TokenBound(_token);
    }

    function unbindToken(address _token) external override {
        require(owner() == msg.sender || msg.sender == _token, "only owner or token can call");
        require(_token == address(tokenBound), "This token is not bound");
        delete tokenBound;
        emit TokenUnbound(_token);
    }

    function isTokenAgent(address _agentAddress) public view override returns (bool) {
        if (!_tokenAgentsList[_agentAddress] && !(AgentRole(address(tokenBound))).isAgent(_agentAddress)) {
            return false;
        }
        return true;
    }

    function isTokenBound(address _token) public view override returns (bool) {
        if (_token != address(tokenBound)) {
            return false;
        }
        return true;
    }

    function _isToken() internal view returns (bool) {
        return isTokenBound(msg.sender);
    }

    function _getIdentity(address _userAddress) internal view returns (address) {
        return address(tokenBound.identityRegistry().identity(_userAddress));
    }

    function _getCountry(address _userAddress) internal view returns (uint16) {
        return tokenBound.identityRegistry().investorCountry(_userAddress);
    }
}
