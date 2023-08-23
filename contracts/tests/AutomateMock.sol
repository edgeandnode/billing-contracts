// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.16;

/**
 * @title Mock for the Gelato Automate contract
 */
contract AutomateMock {
    address internal gelatoAddr;
    address internal treasuryAddr;

    constructor(address _gelato, address _treasury) {
        gelatoAddr = _gelato;
        treasuryAddr = _treasury;
    }

    function gelato() external view returns (address) {
        return gelatoAddr;
    }

    function taskTreasury() external view returns (address) {
        return treasuryAddr;
    }
}
