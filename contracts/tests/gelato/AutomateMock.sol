// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.16;

import "../../gelato/Types.sol";

/**
 * @title Mock for the Gelato Automate contract
 */
contract AutomateMock {
    address public gelato;
    address public feeCollector;
    address public taskModuleAddress;

    constructor(address _gelato, address _taskModuleAddress) {
        gelato = _gelato;
        taskModuleAddress = _taskModuleAddress;
        feeCollector = address(0); // For this mock we don't care about the feeCollector
    }

    function taskModuleAddresses(Module) external view returns (address) {
        return taskModuleAddress;
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

    function cancelTask(bytes32) external pure returns (bool) {
        return true;
    }
}
