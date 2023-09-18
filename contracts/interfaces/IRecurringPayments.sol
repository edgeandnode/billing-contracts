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
     * @dev Some payment systems might require an account to be created before being able to top up,
     * the `requiresAccountCreation` flag indicates whether this is the case.
     */
    struct PaymentType {
        uint256 id;
        IPayment contractAddress;
        IERC20 tokenAddress;
        bool requiresAccountCreation;
        string name;
    }

    /**
     * @notice Information about a recurring payment.
     */
    struct RecurringPayment {
        bytes32 taskId;
        uint256 recurringAmount;
        uint256 createdAt;
        uint256 lastExecutedAt;
        uint256 executionInterval;
        PaymentType paymentType;
    }

    /**
     * @notice Create a recurring payment for the calling user. A single recurring payment can be created per user.
     * @dev A token allowance is not required to create a recurring payment. Only necessary for task execution.
     * @param paymentTypeName The name of the payment type to use. Must be a registered payment type.
     * @param initialAmount The initial amount to fund the user account.
     * @param recurringAmount The amount to pay at each interval. Must be greater than 0.
     * @param createAmount Total amount to send to the payment system contract to create the user account.
     * @param createData Encoded parameters required to create the payment on the target payment system.
     */
    function create(
        string calldata paymentTypeName,
        uint256 initialAmount,
        uint256 recurringAmount,
        uint256 createAmount,
        bytes calldata createData
    ) external;

    /**
     * @notice Cancel a recurring payment for the calling user.
     * This will only cancell the recurring payment task, the user's balance in the target payment contract will
     * remain untouched.
     */
    function cancel() external;

    /**
     * @notice Execute a recurring payment for `user`.
     * Pulls funds from the user's address and deposits them into their account by calling the "addTo"
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
     * @notice Registers a payment type.
     * The new payment type will only be available for recurring payments created after the registration.
     * @dev Payment contract must implement IPayment interface.
     * @dev Grants `contractAddress` an infinite spending allowance on the `tokenAddress`
     * @param name The name of the payment type. Must be unique.
     * @param contractAddress Address of the payment system contract.
     * @param tokenAddress Address of the payment system token contract.
     * @param requiresAccountCreation Whether the payment system requires an account to be created or setup before being topped up.
     */
    function registerPaymentType(
        string calldata name,
        address contractAddress,
        address tokenAddress,
        bool requiresAccountCreation
    ) external;

    /**
     * @notice Unregisters a payment type.
     * Note that this will not cancel any recurring payments using the payment type. Those will continue to run
     * for as long as the recurring payment exists.
     * @dev Revokes any spending allowance this contract previously granted to the payment contract.
     * @param name The name of the payment type to unregister. Must exist.
     */
    function unregisterPaymentType(string calldata name) external;

    /**
     * @notice Sets the minimum execution interval for recurring payments.
     * @param _executionInterval The new execution interval in months. Must be greater than zero.
     */
    function setExecutionInterval(uint128 _executionInterval) external;

    /**
     * @notice Sets the minimum expiration interval for recurring payments.
     * This is the amount of time that has to pass without successful payment execution before the recurring payment
     * is automatically cancelled.
     * @param _expirationInterval The new expiration interval in months. Must be greater than the `executionInterval`.
     */
    function setExpirationInterval(uint128 _expirationInterval) external;

    /**
     * @notice Rescue any ERC20 tokens sent to this contract by accident
     * @param _to  Destination address to send the tokens
     * @param _token  Token address of the token that was accidentally sent to the contract
     * @param _amount  Amount of tokens to pull
     */
    function rescueTokens(address _to, address _token, uint256 _amount) external;

    /**
     * @notice Checks if a recurring payment can be executed.
     * @dev Meant to be called by the Gelato Runners to know when/how to execute a recurring payment.
     * @param user The user for which to check the recurring payment.
     * @return canExec Whether the recurring payment can be executed.
     * @return execPayload Calldata indicating the function and parameters to execute a recurring payment (`execute(user)`).
     */
    function check(address user) external view returns (bool canExec, bytes memory execPayload);

    /**
     * @notice Gets the next possible execution time for a user's recurring payment
     * Note that it might not get executed precisely at the given time, the only guarantee is that it won't run before it.
     * @dev This is controlled by the `executionInterval` parameter.
     * @param user User address
     * @return Timestamp for the next earliest time the recurring payment can be executed
     */
    function getNextExecutionTime(address user) external view returns (uint256);

    /**
     * @notice Gets the expiration time for a user's recurring payment
     * Note that it might not get executed precisely at the given time, the only guarantee is that it won't run before it.
     * @dev This is controlled by the `expirationTime` parameter.
     * @param user User address
     * @return Timestamp for the next earliest time the recurring payment can be cancelled due to expiration
     */
    function getExpirationTime(address user) external view returns (uint256);

    /**
     * @notice Returns the payment type id for a given name
     * @dev The `id` is computed as the keccak256 hash of the name
     * @param name Name of the payment type
     * @return Computed `id` for a payment type name
     */
    function getPaymentTypeId(string calldata name) external pure returns (uint256);
}
