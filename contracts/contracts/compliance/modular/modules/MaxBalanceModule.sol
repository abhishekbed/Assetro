// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../../../token/IToken.sol";
import "../IModularCompliance.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./AbstractModule.sol";

contract MaxBalanceModule is AbstractModule {
    mapping(address => uint256) private _maxBalance;

    mapping(address => mapping(address => uint256)) private _idBalance;

    mapping(address => bool) private _presetDone;

    event MaxBalanceSet(address indexed compliance, uint256 maxBalance);
    event IDBalancePreSet(address indexed compliance, address indexed identity, uint256 balance);
    event PresetCompleted(address indexed compliance);

    function preSetModuleState(address _compliance, address _id, uint256 _balance) public {
        require(Ownable(_compliance).owner() == msg.sender, "only compliance owner can call");
        require(!IModularCompliance(_compliance).isModuleBound(address(this)), "token already bound");
        _idBalance[_compliance][_id] = _balance;
        emit IDBalancePreSet(_compliance, _id, _balance);
    }

    function batchPreSetModuleState(address _compliance, address[] calldata _id, uint256[] calldata _balance) external {
        require(_id.length > 0 && _id.length == _balance.length, "invalid preset values");
        for (uint256 i = 0; i < _id.length; i++) {
            preSetModuleState(_compliance, _id[i], _balance[i]);
        }
        _presetDone[_compliance] = true;
        emit PresetCompleted(_compliance);
    }

    function presetCompleted(address _compliance) external {
        require(Ownable(_compliance).owner() == msg.sender, "only compliance owner can call");
        _presetDone[_compliance] = true;
        emit PresetCompleted(_compliance);
    }

    function setMaxBalance(uint256 _max) external onlyComplianceCall {
        _maxBalance[msg.sender] = _max;
        emit MaxBalanceSet(msg.sender, _max);
    }

    function getMaxBalance(address _compliance) external view returns (uint256) {
        return _maxBalance[_compliance];
    }

    function getIDBalance(address _compliance, address _identity) external view returns (uint256) {
        return _idBalance[_compliance][_identity];
    }

    function moduleTransferAction(address _from, address _to, uint256 _value) external override onlyComplianceCall {
        address idFrom = _getIdentity(msg.sender, _from);
        address idTo = _getIdentity(msg.sender, _to);
        if (idFrom != address(0)) {
            uint256 tracked = _idBalance[msg.sender][idFrom];
            _idBalance[msg.sender][idFrom] = tracked > _value ? tracked - _value : 0;
        }
        if (idTo != address(0)) {
            _idBalance[msg.sender][idTo] += _value;
        }
    }

    function moduleMintAction(address _to, uint256 _value) external override onlyComplianceCall {
        address idTo = _getIdentity(msg.sender, _to);
        if (idTo != address(0)) {
            _idBalance[msg.sender][idTo] += _value;
        }
    }

    function moduleBurnAction(address _from, uint256 _value) external override onlyComplianceCall {
        address idFrom = _getIdentity(msg.sender, _from);
        if (idFrom != address(0)) {
            uint256 tracked = _idBalance[msg.sender][idFrom];
            _idBalance[msg.sender][idFrom] = tracked > _value ? tracked - _value : 0;
        }
    }

    function moduleCheck(address, address _to, uint256 _value, address _compliance)
        external
        view
        override
        returns (bool)
    {
        if (_to == address(0)) {
            return true;
        }
        uint256 max = _maxBalance[_compliance];
        if (max == 0) {
            return true;
        }
        address idTo = _getIdentity(_compliance, _to);
        return _idBalance[_compliance][idTo] + _value <= max;
    }

    function canComplianceBind(address _compliance) external view override returns (bool) {
        if (_presetDone[_compliance]) {
            return true;
        }
        return IToken(IModularCompliance(_compliance).getTokenBound()).totalSupply() == 0;
    }

    function isPlugAndPlay() external pure override returns (bool) {
        return false;
    }

    function name() public pure returns (string memory) {
        return "MaxBalanceModule";
    }

    function _getIdentity(address _compliance, address _wallet) internal view returns (address) {
        if (_wallet == address(0)) {
            return address(0);
        }
        return address(IToken(IModularCompliance(_compliance).getTokenBound()).identityRegistry().identity(_wallet));
    }
}
