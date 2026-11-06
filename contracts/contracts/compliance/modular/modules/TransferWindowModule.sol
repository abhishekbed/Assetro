// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import "./AbstractModule.sol";

contract TransferWindowModule is AbstractModule {
    struct Blackout {
        uint256 start;
        uint256 end;
        bool active;
    }

    mapping(address => Blackout) private _blackouts;

    event BlackoutActivated(address indexed compliance, uint256 start, uint256 end);
    event BlackoutDeactivated(address indexed compliance);

    function activateBlackout(uint256 _start, uint256 _end) external onlyComplianceCall {
        require(_end > _start, "invalid blackout window");
        _blackouts[msg.sender] = Blackout(_start, _end, true);
        emit BlackoutActivated(msg.sender, _start, _end);
    }

    function deactivateBlackout() external onlyComplianceCall {
        _blackouts[msg.sender].active = false;
        emit BlackoutDeactivated(msg.sender);
    }

    function getBlackout(address _compliance) external view returns (uint256 start, uint256 end, bool active) {
        Blackout memory b = _blackouts[_compliance];
        return (b.start, b.end, b.active);
    }

    function moduleTransferAction(address, address, uint256) external override onlyComplianceCall {}

    function moduleMintAction(address, uint256) external override onlyComplianceCall {}

    function moduleBurnAction(address, uint256) external override onlyComplianceCall {}

    function moduleCheck(address _from, address, uint256, address _compliance) external view override returns (bool) {
        if (_from == address(0)) {
            return true;
        }
        Blackout memory b = _blackouts[_compliance];
        if (!b.active) {
            return true;
        }
        return block.timestamp < b.start || block.timestamp > b.end;
    }

    function canComplianceBind(address) external pure override returns (bool) {
        return true;
    }

    function isPlugAndPlay() external pure override returns (bool) {
        return true;
    }

    function name() public pure returns (string memory) {
        return "TransferWindowModule";
    }
}
