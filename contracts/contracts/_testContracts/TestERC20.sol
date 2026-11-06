// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TestERC20 is Ownable, ERC20Pausable {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function pause() public onlyOwner {
        _pause();
    }

    function mint(address recipient, uint256 amount) public onlyOwner {
        _mint(recipient, amount);
    }

    function unpause() public onlyOwner {
        _unpause();
    }
}
