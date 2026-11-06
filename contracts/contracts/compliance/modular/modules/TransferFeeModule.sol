// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "../../../token/IToken.sol";
import "../../../roles/AgentRole.sol";
import "../IModularCompliance.sol";
import "./AbstractModule.sol";

contract TransferFeeModule is AbstractModule {
    struct FeeConfig {
        uint16 feeBps;
        address collector;
        bool isSet;
    }

    mapping(address => FeeConfig) private _feeConfigs;

    event FeeConfigSet(address indexed compliance, uint16 feeBps, address collector);
    event FeeConfigRemoved(address indexed compliance);
    event FeeCharged(
        address indexed compliance, address from, address to, uint256 amount, uint256 feeAmount, address collector
    );

    function setFeeConfig(uint16 _feeBps, address _collector) external onlyComplianceCall {
        require(_feeBps <= 10000, "fee exceeds 100%");
        require(_collector != address(0), "invalid collector");
        _feeConfigs[msg.sender] = FeeConfig(_feeBps, _collector, true);
        emit FeeConfigSet(msg.sender, _feeBps, _collector);
    }

    function removeFeeConfig() external onlyComplianceCall {
        delete _feeConfigs[msg.sender];
        emit FeeConfigRemoved(msg.sender);
    }

    function getFeeConfig(address _compliance) external view returns (uint16 feeBps, address collector, bool isSet) {
        FeeConfig memory cfg = _feeConfigs[_compliance];
        return (cfg.feeBps, cfg.collector, cfg.isSet);
    }

    function calculateFee(address _compliance, uint256 _amount) public view returns (uint256) {
        FeeConfig memory cfg = _feeConfigs[_compliance];
        if (!cfg.isSet || cfg.feeBps == 0) {
            return 0;
        }
        return (_amount * cfg.feeBps) / 10000;
    }

    function moduleTransferAction(address _from, address _to, uint256 _value) external override onlyComplianceCall {
        FeeConfig memory cfg = _feeConfigs[msg.sender];
        if (!cfg.isSet || cfg.feeBps == 0 || _from == cfg.collector || _to == cfg.collector) {
            return;
        }

        IToken token = IToken(IModularCompliance(msg.sender).getTokenBound());

        if (address(token.identityRegistry().identity(_from)) == address(token.identityRegistry().identity(_to))) {
            return;
        }

        uint256 feeAmount = calculateFee(msg.sender, _value);
        if (feeAmount == 0) {
            return;
        }

        require(token.forcedTransfer(_to, cfg.collector, feeAmount), "fee collection failed");
        emit FeeCharged(msg.sender, _from, _to, _value, feeAmount, cfg.collector);
    }

    function moduleMintAction(address, uint256) external override onlyComplianceCall {}

    function moduleBurnAction(address, uint256) external override onlyComplianceCall {}

    function moduleCheck(address, address, uint256, address) external pure override returns (bool) {
        return true;
    }

    function canComplianceBind(address _compliance) external view override returns (bool) {
        address token = IModularCompliance(_compliance).getTokenBound();
        return AgentRole(token).isAgent(address(this));
    }

    function isPlugAndPlay() external pure override returns (bool) {
        return false;
    }

    function name() public pure returns (string memory) {
        return "TransferFeeModule";
    }
}
