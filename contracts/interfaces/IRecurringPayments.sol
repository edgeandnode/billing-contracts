// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IPayment } from "./IPayment.sol";

/**
 * @title RecurringPayments interface
 * @dev Interface and struct definitions for the RecurringPayments contract
 * @notice This contract manages the creation and execution of recurring payments.
 * A recurring payment is an automated task running on a set interval that pulls funds
 * from a user and deposits them into their associated account on a target payment system.
 */
interface IRecurringPayments {
    /**
     * @notice Information about a protocol payment system.
     * A payment system is a contract keeping track of user balances, allowing them to withdraw,
     * add funds, etc. Each payment system defines it's own ERC20 token in which payments are made.
     * @dev Payment system target contract must implement by the IPayment interface.
     * @dev `id` is the keccak256 hash of the `name`.
     */
    struct PaymentType {
        uint256 id;
        IPayment contractAddress;
        IERC20 tokenAddress;
        string name;
    }

    /**
     * @notice Information about a recurring payment.
     */
    struct RecurringPayment {
        bytes32 taskId;
        uint256 initialAmount;
        uint256 recurringAmount;
        uint256 createdAt;
        uint256 lastExecutedAt;
        PaymentType paymentType;
    }

    /**
     * @notice Create a recurring payment for the calling user. A single recurring payment can be created per user.
     * @dev A token allowance is not required to create a recurring payment. Only necessary for task execution.
     * @param paymentTypeName The name of the payment type to use. Must be a registered payment type.
     * @param initialAmount The initial amount to fund the user account.
     * @param recurringAmount The amount to pay at each interval. Must be greater than 0.
     */
    function create(string calldata paymentTypeName, uint256 initialAmount, uint256 recurringAmount) external;

    /**
     * @notice Cancel a recurring payment for the calling user.
     * This will only cancell the recurring payment task, the user's balance in the target payment contract will
     * remain untouched.
     */
    function cancel() external;

    /**
     * @notice Execute a recurring payment for `user`.
     * Pulls funds from the user's address and deposits them into their account by calling the "topUp"
     * function on the payment system contract.
     * Can only be called after an amount of time defined by `executionInterval` has passed since the last execution.
     * Note that the contract must have sufficient allowance to execute the payment. An insufficient allowance
     * will result in a failed transaction, which after a period of time defined by `expirationInterval`, will
     * result in the recurring payment being automatically cancelled.
     * @dev The function will revert if the gas price is too high (threshold defined by `maxGasPrice`).
     * @dev This function is meant to be called by Gelato Network task runners but can be called permissionlessly.
     * @param user User address
     */
    function execute(address user) external;

    /**
     * @notice Sets the minimum execution interval for recurring payments.
     * @dev The new interval will only apply to recurring payments created after the change.
     * @param _executionInterval The new execution interval in months. Must be greater than zero.
     */
    function setExecutionInterval(uint128 _executionInterval) external;

    /**
     * @notice Sets the minimum expiration interval for recurring payments.
     * This is the amount of time that has to pass without successful payment execution before the recurring payment
     * is automatically cancelled.
     * @dev The new interval will only apply to recurring payments created after the change.
     * @param _expirationInterval The new expiration interval in months. Must be greater than the `executionInterval`.
     */
    function setExpirationInterval(uint128 _expirationInterval) external;

    /**
     * @notice Registers a payment type.
     * The new payment type will only be available for recurring payments created after the registration.
     * @dev Payment contract must implement IPayment interface.
     * @dev Grants `contractAddress` an infinite spending allowance on the `tokenAddress`
     * @param name The name of the payment type. Must be unique.
     * @param contractAddress Address of the payment system contract.
     * @param tokenAddress Address of the payment system token contract.
     */
    function registerPaymentType(string calldata name, address contractAddress, address tokenAddress) external;

    /**
     * @notice Unregisters a payment type.
     * Note that this will not cancel any recurring payments using the payment type. Those will continue to run
     * for as long as the recurring payment exists.
     * @dev Revokes any spending allowance this contract previously granted to the payment contract.
     * @param name The name of the payment type to unregister. Must exist.
     */
    function unregisterPaymentType(string calldata name) external;

    /**
     * @notice Checks if a recurring payment can be executed.
     * @param user The user for which to check the recurring payment.
     * @return canExec Whether the recurring payment can be executed.
     * @return execPayload Calldata indicating the function and parameters to execute a recurring payment (`execute(user)`).
     * @dev This function is meant to be called by the Gelato Runners to know when/how to execute a recurring payment.
     */
    function check(address user) external view returns (bool canExec, bytes memory execPayload);

    /**
     * @notice Gets the next possible execution time for a user's recurring payment
     * Note that it might not get executed precisely at the given time, the only guarantee is that it won't run before it.
     * @dev This is controlled by the `executionInterval` parameter.
     * @param user User address
     */
    function getNextExecutionTime(address user) external view returns (uint256);

    /**
     * @notice Gets the expiration time for a user's recurring payment
     * Note that it might not get executed precisely at the given time, the only guarantee is that it won't run before it.
     * @dev This is controlled by the `expirationTime` parameter.
     * @param user User address
     */
    function getExpirationTime(address user) external view returns (uint256);

    /**
     * @notice Returns the payment type id for a given name
     * @dev The `id` is computed as the keccak256 hash of the name
     * @param name Name of the payment type
     */
    function getPaymentTypeId(string calldata name) external pure returns (uint256);
}
