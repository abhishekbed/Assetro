// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "./AbstractModule.sol";

contract SenderWhitelistModule is AbstractModule {
    mapping(address => mapping(address => bool)) private _whitelistedSenders;

    mapping(address => uint256) private _whitelistedCount;

    mapping(address => bool) private _restrictionActive;

    event SenderAdded(address indexed compliance, address sender);
    event SenderRemoved(address indexed compliance, address sender);
    event RestrictionDeactivated(address indexed compliance);

    function addSender(address _sender) external onlyComplianceCall {
        _addSender(msg.sender, _sender);
    }

    function removeSender(address _sender) external onlyComplianceCall {
        if (_whitelistedSenders[msg.sender][_sender]) {
            _whitelistedSenders[msg.sender][_sender] = false;
            _whitelistedCount[msg.sender] -= 1;
            emit SenderRemoved(msg.sender, _sender);
        }
    }

    function batchAddSenders(address[] calldata _senders) external onlyComplianceCall {
        for (uint256 i = 0; i < _senders.length; i++) {
            _addSender(msg.sender, _senders[i]);
        }
    }

    function isSenderWhitelisted(address _compliance, address _sender) external view returns (bool) {
        return _whitelistedSenders[_compliance][_sender];
    }

    function whitelistedSenderCount(address _compliance) external view returns (uint256) {
        return _whitelistedCount[_compliance];
    }

    function moduleTransferAction(address, address, uint256) external override onlyComplianceCall {}

    function moduleMintAction(address, uint256) external override onlyComplianceCall {}

    function moduleBurnAction(address, uint256) external override onlyComplianceCall {}

    function moduleCheck(address _from, address, uint256, address _compliance) external view override returns (bool) {
        if (_from == address(0)) {
            return true;
        }

        if (!_restrictionActive[_compliance]) {
            return true;
        }
        return _whitelistedSenders[_compliance][_from];
    }

    function canComplianceBind(address) external pure override returns (bool) {
        return true;
    }

    function isPlugAndPlay() external pure override returns (bool) {
        return true;
    }

    function name() public pure returns (string memory) {
        return "SenderWhitelistModule";
    }

    function deactivateRestriction() external onlyComplianceCall {
        _restrictionActive[msg.sender] = false;
        emit RestrictionDeactivated(msg.sender);
    }

    function isRestrictionActive(address _compliance) external view returns (bool) {
        return _restrictionActive[_compliance];
    }

    function _addSender(address _compliance, address _sender) internal {
        if (!_whitelistedSenders[_compliance][_sender]) {
            _whitelistedSenders[_compliance][_sender] = true;
            _whitelistedCount[_compliance] += 1;
            _restrictionActive[_compliance] = true;
            emit SenderAdded(_compliance, _sender);
        }
    }
}
