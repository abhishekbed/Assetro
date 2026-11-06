// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../../../token/IToken.sol";
import "../IModularCompliance.sol";
import "../../../roles/AgentRole.sol";
import "./AbstractModule.sol";

contract ExchangeMonthlyLimitsModule is AbstractModule {
    struct Counter {
        uint256 value;
        uint256 timer;
    }

    uint256 private constant MONTH = 30 days;

    mapping(address => mapping(address => bool)) private _exchangeIDs;

    mapping(address => mapping(address => uint256)) private _exchangeMonthlyLimit;

    mapping(address => mapping(address => mapping(address => Counter))) private _counters;

    event ExchangeRegistered(address indexed compliance, address indexed exchangeID);
    event ExchangeRemoved(address indexed compliance, address indexed exchangeID);
    event ExchangeMonthlyLimitSet(address indexed compliance, address indexed exchangeID, uint256 limit);

    function addExchangeID(address _exchangeID) external onlyComplianceCall {
        require(_exchangeID != address(0), "invalid exchange identity");
        _exchangeIDs[msg.sender][_exchangeID] = true;
        emit ExchangeRegistered(msg.sender, _exchangeID);
    }

    function removeExchangeID(address _exchangeID) external onlyComplianceCall {
        _exchangeIDs[msg.sender][_exchangeID] = false;
        emit ExchangeRemoved(msg.sender, _exchangeID);
    }

    function isExchangeID(address _compliance, address _exchangeID) external view returns (bool) {
        return _exchangeIDs[_compliance][_exchangeID];
    }

    function setExchangeMonthlyLimit(address _exchangeID, uint256 _limit) external onlyComplianceCall {
        _exchangeMonthlyLimit[msg.sender][_exchangeID] = _limit;
        emit ExchangeMonthlyLimitSet(msg.sender, _exchangeID, _limit);
    }

    function getExchangeMonthlyLimit(address _compliance, address _exchangeID) external view returns (uint256) {
        return _exchangeMonthlyLimit[_compliance][_exchangeID];
    }

    function getCounter(address _compliance, address _exchangeID, address _investorID)
        external
        view
        returns (uint256 value, uint256 timer)
    {
        Counter memory c = _counters[_compliance][_exchangeID][_investorID];
        return (c.value, c.timer);
    }

    function moduleTransferAction(address _from, address _to, uint256 _value) external override onlyComplianceCall {
        address receiverIdentity = _getIdentity(msg.sender, _to);
        if (!_exchangeIDs[msg.sender][receiverIdentity]) {
            return;
        }
        address senderIdentity = _getIdentity(msg.sender, _from);
        if (senderIdentity == address(0)) {
            return;
        }
        Counter storage counter = _counters[msg.sender][receiverIdentity][senderIdentity];
        if (counter.timer <= block.timestamp) {
            counter.timer = block.timestamp + MONTH;
            counter.value = 0;
        }
        counter.value += _value;
    }

    function moduleMintAction(address, uint256) external override onlyComplianceCall {}

    function moduleBurnAction(address, uint256) external override onlyComplianceCall {}

    function moduleCheck(address _from, address _to, uint256 _value, address _compliance)
        external
        view
        override
        returns (bool)
    {
        if (_from == address(0)) {
            return true;
        }
        address receiverIdentity = _getIdentity(_compliance, _to);
        if (!_exchangeIDs[_compliance][receiverIdentity]) {
            return true;
        }
        uint256 limit = _exchangeMonthlyLimit[_compliance][receiverIdentity];
        if (limit == 0) {
            return true;
        }

        address token = IModularCompliance(_compliance).getTokenBound();
        if (AgentRole(token).isAgent(_from)) {
            return true;
        }

        address senderIdentity = _getIdentity(_compliance, _from);
        if (senderIdentity == address(0)) {
            return false;
        }
        Counter memory counter = _counters[_compliance][receiverIdentity][senderIdentity];
        uint256 projected = counter.timer <= block.timestamp ? _value : counter.value + _value;
        return projected <= limit;
    }

    function canComplianceBind(address) external pure override returns (bool) {
        return true;
    }

    function isPlugAndPlay() external pure override returns (bool) {
        return true;
    }

    function name() public pure returns (string memory) {
        return "ExchangeMonthlyLimitsModule";
    }

    function _getIdentity(address _compliance, address _wallet) internal view returns (address) {
        if (_wallet == address(0)) {
            return address(0);
        }
        return address(IToken(IModularCompliance(_compliance).getTokenBound()).identityRegistry().identity(_wallet));
    }
}
