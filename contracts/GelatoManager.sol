// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import "./gelato/AutomateTaskCreator.sol";
import { Governed } from "./Governed.sol";

/**
 * @title GelatoManager contract
 * @notice Allows a contract to manage Getato Network tasks, treasury and utilities.
 */
contract GelatoManager is AutomateTaskCreator, Governed {
    // -- State --

    /// @dev Maximum gas price to pay when executing a Gelato task.
    uint256 public maxGasPrice;

    // -- Events --

    /**
     * @dev Emitted when a `maxGasPrice` is updated
     * @param maxGasPrice The updated value for `maxGasPrice`
     */
    event MaxGasPriceSet(uint256 maxGasPrice);

    /**
     * @dev Emitted when funds are deposited into the Gelato treasury
     * @param depositor User making the deposit
     * @param amount Amount being deposited
     */
    event TreasuryFundsDeposited(address indexed depositor, uint256 amount);

    /**
     * @dev Emitted when funds are withdrawn from the Gelato treasury
     * @param recepient Recepient receiving the funds
     * @param amount Amount being withdrawn
     */
    event TreasuryFundsWithdrawn(address indexed recepient, uint256 amount);

    /**
     * @dev Emitted when a resolver task is created in Gelato Network
     * @param taskId The id of the task
     */
    event ResolverTaskCreated(bytes32 taskId);

    /**
     * @dev Emitted when a resolver task is cancelled in Gelato Network
     * @param taskId The id of the task
     */
    event ResolverTaskCancelled(bytes32 taskId);

    // -- Errors --

    /// @dev Thrown when attempting to deposit zero amount into the Gelato treasury
    error InvalidDepositAmount();

    /// @dev Thrown when attempting to set the maximum gas price to zero
    error GasPriceCannotBeZero();

    /**
     * @dev Thrown when attempting to execute a task with a gas price above the accepted threshold
     * @param gasPrice The current gas price
     * @param maxGasPrice The current maximum allowed gas price
     */
    error GasPriceTooHigh(uint256 gasPrice, uint256 maxGasPrice);

    /**
     * @notice Constructor function for the Gelato Manager contract
     * @param _automate Address of the Automate contract in the Gelato Network
     * @param _governor Contract governor address
     * @param _maxGasPrice Initial maximum gas priced allowed for recurring payments execution
     */
    constructor(
        address _automate,
        address _governor,
        uint256 _maxGasPrice
    ) AutomateTaskCreator(_automate, _governor) Governed(_governor) {
        _setMaxGasPrice(_maxGasPrice);
    }

    /**
     * @notice Deposit eth into the Gelato Network treasury
     */
    function deposit() external payable {
        if (msg.value == 0) revert InvalidDepositAmount();
        taskTreasury.depositFunds{ value: msg.value }(address(this), ETH, msg.value);
        emit TreasuryFundsDeposited(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw eth from the Gelato Network treasury
     * @param recepient Recepient receiving the funds
     * @param amount Amount being withdrawn
     */
    function withdraw(address recepient, uint256 amount) external onlyGovernor {
        taskTreasury.withdrawFunds(payable(recepient), ETH, amount);
        emit TreasuryFundsWithdrawn(recepient, amount);
    }

    /**
     * @notice Sets the maximum gas price for task execution
     * @param newGasPrice The updated value for `maxGasPrice`
     */
    function setMaxGasPrice(uint256 newGasPrice) external onlyGovernor {
        _setMaxGasPrice(newGasPrice);
    }

    /**
     * @notice Checks if the current gas price is below the accepted threshold of `maxGasPrice`. Reverts if it's not.
     */
    function checkGasPrice() public view {
        if (tx.gasprice > maxGasPrice) revert GasPriceTooHigh(tx.gasprice, maxGasPrice);
    }

    /**
     * @notice Creates a resolver task in Gelato Network
     * @dev A resolver task is a task where execution is controlled by a resolver contract
     * @dev The resolver is typically a `check()` function
     * @dev The executor is typically an `execute()` function
     * @param resolverAddress Address of the resolver contract
     * @param resolverData ABI encoded call of the contract method and arguments
     * @param execAddress Address of the execution contract
     * @param execDataOrSelector Encoded selector for the execution method
     * @return The id of the created task
     */
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

    /**
     * @notice Cancels a resolver task in Gelato Network
     * @param taskId The id of the task to be cancelled
     */
    function _cancelResolverTask(bytes32 taskId) internal {
        _cancelTask(taskId);
        emit ResolverTaskCancelled(taskId);
    }

    /**
     * @notice Sets the maximum gas price for task execution
     * @param newGasPrice The updated value for `maxGasPrice`
     */
    function _setMaxGasPrice(uint256 newGasPrice) internal {
        if (newGasPrice == 0) revert GasPriceCannotBeZero();
        maxGasPrice = newGasPrice;
        emit MaxGasPriceSet(maxGasPrice);
    }
}
