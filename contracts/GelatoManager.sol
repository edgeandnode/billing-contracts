// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import "./gelato/AutomateTaskCreator.sol";
import { Governed } from "./Governed.sol";

contract GelatoManager is AutomateTaskCreator, Governed {
    uint256 public maxGasPrice;

    event MaxGasPriceSet(uint256 maxGasPrice);
    event TreasuryFundsDeposited(address indexed user, uint256 amount);
    event TrasuryFundsWithdrawn(address indexed recepient, uint256 amount);
    event ResolverTaskCreated(bytes32 taskId);
    event ResolverTaskCancelled(bytes32 taskId);

    error InvalidDepositAmount();
    error GasPriceTooHigh(uint256 gasPrice, uint256 maxGasPrice);

    constructor(
        address _automate,
        address _governor,
        uint256 _maxGasPrice
    ) AutomateTaskCreator(_automate, _governor) Governed(_governor) {
        maxGasPrice = _maxGasPrice;
    }

    function deposit() external payable {
        if (msg.value == 0) revert InvalidDepositAmount();
        taskTreasury.depositFunds{ value: msg.value }(address(this), ETH, msg.value);

        emit TreasuryFundsDeposited(msg.sender, msg.value);
    }

    function withdraw(address recepient, uint256 amount) external onlyGovernor {
        taskTreasury.withdrawFunds(payable(recepient), ETH, amount);
        emit TrasuryFundsWithdrawn(recepient, amount);
    }

    function checkGasPrice() public view {
        if (tx.gasprice > maxGasPrice) revert GasPriceTooHigh(tx.gasprice, maxGasPrice);
    }

    function setMaxGasPrice(uint256 newGasPrice) external onlyGovernor {
        maxGasPrice = newGasPrice;
        emit MaxGasPriceSet(maxGasPrice);
    }

    function _createResolverTask(
        address resolverAddress,
        bytes memory resolverData,
        address execAddress,
        bytes memory execDataOrSelector
    ) internal returns (bytes32) {
        ModuleData memory moduleData = ModuleData({ modules: new Module[](1), args: new bytes[](1) });

        moduleData.modules[0] = Module.RESOLVER;
        moduleData.args[0] = _resolverModuleArg(resolverAddress, resolverData);

        bytes32 taskId = _createTask(execAddress, execDataOrSelector, moduleData, address(0));
        emit ResolverTaskCreated(taskId);

        return taskId;
    }

    function _cancelResolverTask(bytes32 taskId) internal {
        _cancelTask(taskId);
        emit ResolverTaskCancelled(taskId);
    }
}
