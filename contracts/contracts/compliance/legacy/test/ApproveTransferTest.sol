// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "../features/ApproveTransfer.sol";

contract ApproveTransferTest is ApproveTransfer {
    function transferred(address _from, address _to, uint256 _value) external override onlyToken {
        _transferActionOnApproveTransfer(_from, _to, _value);
    }

    function created(address _to, uint256 _value) external override onlyToken {
        _creationActionOnApproveTransfer(_to, _value);
    }

    function destroyed(address _from, uint256 _value) external override onlyToken {
        _destructionActionOnApproveTransfer(_from, _value);
    }

    function canTransfer(address _from, address _to, uint256 _value) external view override returns (bool) {
        if (!complianceCheckOnApproveTransfer(_from, _to, _value)) {
            return false;
        }
        return true;
    }
}
