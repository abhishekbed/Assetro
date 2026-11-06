// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../../../token/IToken.sol";
import "../IModularCompliance.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./AbstractModule.sol";

contract MaxHolderModule is AbstractModule {
    mapping(address => uint256) private _maxHolders;
    mapping(address => uint256) private _holderCount;
    mapping(address => mapping(address => bool)) private _isHolder;

    mapping(address => bool) private _presetDone;

    event MaxHoldersSet(address indexed compliance, uint256 maxHolders);
    event HolderPreSet(address indexed compliance, address indexed wallet);
    event PresetCompleted(address indexed compliance);

    function preSetHolders(address _compliance, address[] calldata _wallets) external {
        require(Ownable(_compliance).owner() == msg.sender, "only compliance owner can call");
        require(!IModularCompliance(_compliance).isModuleBound(address(this)), "token already bound");
        for (uint256 i = 0; i < _wallets.length; i++) {
            if (!_isHolder[_compliance][_wallets[i]]) {
                _isHolder[_compliance][_wallets[i]] = true;
                _holderCount[_compliance] += 1;
                emit HolderPreSet(_compliance, _wallets[i]);
            }
        }
        _presetDone[_compliance] = true;
        emit PresetCompleted(_compliance);
    }

    function setMaxHolders(uint256 _max) external onlyComplianceCall {
        _maxHolders[msg.sender] = _max;
        emit MaxHoldersSet(msg.sender, _max);
    }

    function getMaxHolders(address _compliance) external view returns (uint256) {
        return _maxHolders[_compliance];
    }

    function getHolderCount(address _compliance) external view returns (uint256) {
        return _holderCount[_compliance];
    }

    function isHolder(address _compliance, address _wallet) external view returns (bool) {
        return _isHolder[_compliance][_wallet];
    }

    function moduleTransferAction(address _from, address _to, uint256) external override onlyComplianceCall {
        _trackHolder(msg.sender, _from);
        _trackHolder(msg.sender, _to);
    }

    function moduleMintAction(address _to, uint256) external override onlyComplianceCall {
        _trackHolder(msg.sender, _to);
    }

    function moduleBurnAction(address _from, uint256) external override onlyComplianceCall {
        _trackHolder(msg.sender, _from);
    }

    function moduleCheck(address _from, address _to, uint256 _value, address _compliance)
        external
        view
        override
        returns (bool)
    {
        if (_to == address(0) || _isHolder[_compliance][_to]) {
            return true;
        }
        uint256 max = _maxHolders[_compliance];
        if (max == 0) {
            return true;
        }
        if (_holderCount[_compliance] < max) {
            return true;
        }

        if (_from != address(0) && _isHolder[_compliance][_from]) {
            address token = IModularCompliance(_compliance).getTokenBound();
            if (IToken(token).balanceOf(_from) == _value) {
                return true;
            }
        }
        return false;
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
        return "MaxHolderModule";
    }

    function _trackHolder(address _compliance, address _wallet) internal {
        if (_wallet == address(0)) {
            return;
        }
        bool hasBalance = IToken(IModularCompliance(_compliance).getTokenBound()).balanceOf(_wallet) > 0;
        bool wasHolder = _isHolder[_compliance][_wallet];
        if (hasBalance && !wasHolder) {
            _isHolder[_compliance][_wallet] = true;
            _holderCount[_compliance] += 1;
        } else if (!hasBalance && wasHolder) {
            _isHolder[_compliance][_wallet] = false;
            _holderCount[_compliance] -= 1;
        }
    }
}
