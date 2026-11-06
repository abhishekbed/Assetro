// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../../../token/IToken.sol";
import "../IModularCompliance.sol";
import "../../../roles/AgentRole.sol";
import "./AbstractModule.sol";

contract DayMonthLimitsModule is AbstractModule {
    struct Counter {
        uint256 value;
        uint256 timer;
    }

    uint256 private constant DAY = 1 days;
    uint256 private constant MONTH = 30 days;

    mapping(address => uint256) private _dailyLimit;
    mapping(address => uint256) private _monthlyLimit;

    mapping(address => mapping(address => Counter)) private _dailyCounters;
    mapping(address => mapping(address => Counter)) private _monthlyCounters;

    event DailyLimitSet(address indexed compliance, uint256 limit);
    event MonthlyLimitSet(address indexed compliance, uint256 limit);

    function setDailyLimit(uint256 _limit) external onlyComplianceCall {
        _dailyLimit[msg.sender] = _limit;
        emit DailyLimitSet(msg.sender, _limit);
    }

    function setMonthlyLimit(uint256 _limit) external onlyComplianceCall {
        _monthlyLimit[msg.sender] = _limit;
        emit MonthlyLimitSet(msg.sender, _limit);
    }

    function getDailyLimit(address _compliance) external view returns (uint256) {
        return _dailyLimit[_compliance];
    }

    function getMonthlyLimit(address _compliance) external view returns (uint256) {
        return _monthlyLimit[_compliance];
    }

    function getCounters(address _compliance, address _identity)
        external
        view
        returns (uint256 dailyValue, uint256 dailyTimer, uint256 monthlyValue, uint256 monthlyTimer)
    {
        Counter memory d = _dailyCounters[_compliance][_identity];
        Counter memory m = _monthlyCounters[_compliance][_identity];
        return (d.value, d.timer, m.value, m.timer);
    }

    function moduleTransferAction(address _from, address, uint256 _value) external override onlyComplianceCall {
        _increase(msg.sender, _from, _value);
    }

    function moduleMintAction(address, uint256) external override onlyComplianceCall {}

    function moduleBurnAction(address, uint256) external override onlyComplianceCall {}

    function moduleCheck(address _from, address, uint256 _value, address _compliance)
        external
        view
        override
        returns (bool)
    {
        if (_from == address(0)) {
            return true;
        }

        address token = IModularCompliance(_compliance).getTokenBound();
        if (AgentRole(token).isAgent(_from)) {
            return true;
        }

        address identity = _getIdentity(_compliance, _from);
        if (identity == address(0)) {
            return false;
        }

        uint256 dailyLimit = _dailyLimit[_compliance];
        if (dailyLimit > 0) {
            Counter memory d = _dailyCounters[_compliance][identity];
            uint256 projected = d.timer <= block.timestamp ? _value : d.value + _value;
            if (projected > dailyLimit) {
                return false;
            }
        }

        uint256 monthlyLimit = _monthlyLimit[_compliance];
        if (monthlyLimit > 0) {
            Counter memory m = _monthlyCounters[_compliance][identity];
            uint256 projected = m.timer <= block.timestamp ? _value : m.value + _value;
            if (projected > monthlyLimit) {
                return false;
            }
        }

        return true;
    }

    function canComplianceBind(address) external pure override returns (bool) {
        return true;
    }

    function isPlugAndPlay() external pure override returns (bool) {
        return true;
    }

    function name() public pure returns (string memory) {
        return "DayMonthLimitsModule";
    }

    function _increase(address _compliance, address _wallet, uint256 _value) internal {
        address identity = _getIdentity(_compliance, _wallet);
        if (identity == address(0)) {
            return;
        }
        _resetIfExpired(_dailyCounters[_compliance][identity], DAY);
        _dailyCounters[_compliance][identity].value += _value;
        _resetIfExpired(_monthlyCounters[_compliance][identity], MONTH);
        _monthlyCounters[_compliance][identity].value += _value;
    }

    function _resetIfExpired(Counter storage _counter, uint256 _window) internal {
        if (_counter.timer <= block.timestamp) {
            _counter.timer = block.timestamp + _window;
            _counter.value = 0;
        }
    }

    function _getIdentity(address _compliance, address _wallet) internal view returns (address) {
        if (_wallet == address(0)) {
            return address(0);
        }
        return address(IToken(IModularCompliance(_compliance).getTokenBound()).identityRegistry().identity(_wallet));
    }
}
