// SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Token contract
 * @dev Used for testing purposes
 *
 */
contract Token is ERC20, Ownable {
    /**
     * @dev Token Contract Constructor.
     * @param _initialSupply Initial supply of GRT
     */
    constructor(uint256 _initialSupply) ERC20("Graph Token", "GRT") {
        _mint(msg.sender, _initialSupply);
    }
}
