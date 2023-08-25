// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.16;

import "../gelato/Types.sol";

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

    /// @dev This is NOT how Gelato computes task IDs
    function createTask(
        address _execAddress,
        bytes calldata _execDataOrSelector,
        ModuleData calldata _moduleData,
        address _feeToken
    ) external pure returns (bytes32 task) {
        task = keccak256(abi.encode(_execAddress, _execDataOrSelector, _moduleData, _feeToken));
        return task;
    }
}
