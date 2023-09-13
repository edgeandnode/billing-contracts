// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IRecurringPayments } from "./interfaces/IRecurringPayments.sol";
import { IPayment } from "./interfaces/IPayment.sol";

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { GelatoManager } from "./GelatoManager.sol";
import { Rescuable } from "./Rescuable.sol";
import { BokkyPooBahsDateTimeLibrary } from "./libs/BokkyPooBahsDateTimeLibrary.sol";

/**
 * @title RecurringPayments contract
 * @notice This contract manages the creation and execution of recurring payments.
 * A recurring payment is an automated task running on a set interval that pulls funds
 * from a user and deposits them into their associated account on a target payment system.
 */
contract RecurringPayments is IRecurringPayments, GelatoManager, Rescuable {
    using SafeERC20 for IERC20;

    // -- State --

    /// @dev Minimum amount of time in months between recurring payment executions
    uint128 public executionInterval;

    /// @dev Minimum amount of time before a recurring payment can be cancelled due to failed execution
    uint128 public expirationInterval;

    /// @dev List of recurring payments by user
    mapping(address user => RecurringPayment recurringPayment) public recurringPayments;

    /// @dev Registry of currently allowed recurring payments
    mapping(uint256 id => PaymentType paymentType) public paymentTypes;

    // -- Events --

    /**
     * @dev Emitted when `executionInterval` is updated
     * @param executionInterval The updated value for `executionInterval`
     */
    event ExecutionIntervalSet(uint128 executionInterval);

    /**
     * @dev Emitted when `expirationInterval` is updated
     * @param expirationInterval The updated value for `expirationInterval`
     */
    event ExpirationIntervalSet(uint128 expirationInterval);

    /**
     * @dev Emitted when a recurring payment is created
     * @param user User the recurring payment is created for
     * @param taskId Id of the task in Gelato Network
     * @param paymentTypeId Id of the payment type
     * @param paymentTypeName Name of the payment type
     * @param paymentContractAddress Contract address of the payment type
     * @param paymentTokenAddress Token address of the payment type
     * @param initialAmount Initial amount to fund the user account
     * @param recurringAmount Recurring amount to top up the user account
     */
    event RecurringPaymentCreated(
        address indexed user,
        bytes32 taskId,
        uint256 indexed paymentTypeId,
        string indexed paymentTypeName,
        address paymentContractAddress,
        address paymentTokenAddress,
        uint256 initialAmount,
        uint256 recurringAmount,
        uint256 createAmount,
        bytes createData
    );

    /**
     * @dev Emitted when a recurring payment is cancelled
     * @param user User the recurring payment was cancelled for
     * @param taskId Id of the task in Gelato Network
     * @param forced Wether or not the recurring payment was automatically cancelled
     */
    event RecurringPaymentCancelled(address indexed user, bytes32 taskId, bool indexed forced);

    /**
     * @dev Emitted when a recurring payment is executed
     * @param user User the recurring payment was executed for
     * @param taskId Id of the task in Gelato Network
     */
    event RecurringPaymentExecuted(address indexed user, bytes32 taskId);

    /**
     * @dev Emitted when a payment type is registered
     * @param id Id of the payment type
     * @param name Name of the payment type
     * @param contractAddress Address of the contract implementing the payment type
     * @param tokenAddress Address of the token used by the implementing payment contract
     */
    event PaymentTypeRegistered(uint256 indexed id, string indexed name, address contractAddress, address tokenAddress);

    /**
     * @dev Emitted when a payment type is unregistered
     * @param id Id of the payment type
     * @param name Name of the payment type
     */
    event PaymentTypeUnregistered(uint256 indexed id, string indexed name);

    // -- Errors --

    /// @dev Thrown when a zero amount is passed in as an argument and not allowed
    error InvalidZeroAmount();

    /// @dev Thrown when a provided address argument is not a contract
    error AddressNotAContract();

    /// @dev Thrown when attempting to set an invalid `expirationInterval` or `executionInterval`
    error InvalidIntervalValue();

    /// @dev Thrown when attempting to create a recurring payment for a user which already has one
    error RecurringPaymentAlreadyExists();

    /// @dev Thrown when trying to retrieve a non existing recurring payment
    error NoRecurringPaymentFound();

    /**
     * @dev Thrown when attempting to execute a recurring payment before `executionInterval` has passed
     * @param lastExecutedAt Timestamp of the last recurring payment execution. Zero if never executed.
     */
    error RecurringPaymentInCooldown(uint256 lastExecutedAt);

    /**
     * @dev Thrown when attempting to register an already registered payment type
     * @param id Id of the registered payment type
     * @param name Name of the payment type
     */
    error PaymentTypeAlreadyRegistered(uint256 id, string name);

    /**
     * @dev Thrown when trying to retrieve a non existing payment type
     * @param name Name of the payment type
     */
    error PaymentTypeDoesNotExist(string name);

    /**
     * @notice Constructor function for the Recurring Payment contract
     * @param _automate Address of the Automate contract in the Gelato Network
     * @param _governor Contract governor address
     * @param _maxGasPrice Initial maximum gas priced allowed for recurring payments execution
     * @param _executionInterval Initial execution interval for recurring payments
     * @param _expirationInterval Initial expiration interval for recurring payments
     */
    constructor(
        address _automate,
        address _governor,
        uint256 _maxGasPrice,
        uint128 _executionInterval,
        uint128 _expirationInterval
    ) GelatoManager(_automate, _governor, _maxGasPrice) {
        executionInterval = _executionInterval;
        expirationInterval = _expirationInterval;
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
    ) external {
        if (recurringAmount == 0) revert InvalidZeroAmount();

        PaymentType memory paymentType = _getPaymentTypeOrRevert(paymentTypeName);

        // Make sure we only have one recurring payment per user
        address user = msg.sender;
        RecurringPayment storage recurringPayment = recurringPayments[user];
        if (recurringPayment.taskId != 0) revert RecurringPaymentAlreadyExists();

        // Create gelato task
        bytes32 id = _createResolverTask(
            address(this),
            abi.encodeCall(this.check, (user)),
            address(this),
            abi.encode(this.execute.selector)
        );

        // Save recurring payment
        recurringPayments[user] = RecurringPayment(
            id,
            recurringAmount,
            block.timestamp,
            block.timestamp,
            executionInterval,
            expirationInterval,
            paymentType
        );

        // Create account if payment type requires it
        if (paymentType.requiresAccountCreation) {
            if (createAmount > 0) paymentType.tokenAddress.safeTransferFrom(user, address(this), createAmount);
            IPayment(paymentType.contractAddress).create(user, createData);
        }

        // Add the initial amount to the user account
        if (initialAmount > 0) {
            paymentType.tokenAddress.safeTransferFrom(user, address(this), initialAmount);
            IPayment(paymentType.contractAddress).addTo(user, initialAmount);
        }

        emit RecurringPaymentCreated(
            user,
            id,
            paymentType.id,
            paymentType.name,
            address(paymentType.contractAddress),
            address(paymentType.tokenAddress),
            initialAmount,
            recurringAmount,
            createAmount,
            createData
        );
    }

    /**
     * @notice Cancel a recurring payment for the calling user.
     * This will only cancell the recurring payment task, the user's balance in the target payment contract will
     * remain untouched.
     */
    function cancel() external {
        _cancel(msg.sender, false);
    }

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
    function execute(address user) external {
        checkGasPrice(); // Revert if gas price is too high

        RecurringPayment storage recurringPayment = _getRecurringPaymentOrRevert(user);
        PaymentType memory paymentType = recurringPayment.paymentType;

        // If user is calling we allow early execution and don't automatically cancel even if expiration time has passed
        if (user != msg.sender) {
            // Cancel the recurring payment if it has failed for long enough
            if (_canCancel(recurringPayment.lastExecutedAt, recurringPayment.expirationInterval)) {
                _cancel(user, true);
                return;
            }

            // Prevent early execution by third parties
            if (!_canExecute(recurringPayment.lastExecutedAt, recurringPayment.executionInterval))
                revert RecurringPaymentInCooldown(recurringPayment.lastExecutedAt);
        }

        recurringPayment.lastExecutedAt = block.timestamp;

        // Draw funds from the user wallet and immediately use them to top up their account
        paymentType.tokenAddress.safeTransferFrom(user, address(this), recurringPayment.recurringAmount);
        paymentType.contractAddress.addTo(user, recurringPayment.recurringAmount);

        emit RecurringPaymentExecuted(user, recurringPayment.taskId);
    }

    /**
     * @notice Registers a payment type.
     * The new payment type will only be available for recurring payments created after the registration.
     * @dev Payment contract must implement IPayment interface.
     * @dev Grants `contractAddress` an infinite spending allowance on the `tokenAddress`
     * @param name The name of the payment type. Must be unique.
     * @param contractAddress Address of the payment system contract.
     * @param tokenAddress Address of the payment system token contract.
     * @param requiresAccountCreation Whether the payment system requires an account to be created or setup before being used
     */
    function registerPaymentType(
        string calldata name,
        address contractAddress,
        address tokenAddress,
        bool requiresAccountCreation
    ) external onlyGovernor {
        if (Address.isContract(contractAddress) == false || Address.isContract(tokenAddress) == false)
            revert AddressNotAContract();

        uint256 id = _buildPaymentTypeId(name);

        // Ensure name is unique
        PaymentType storage paymentType = paymentTypes[id];
        if (paymentType.id != 0) revert PaymentTypeAlreadyRegistered(id, name);

        paymentTypes[id] = PaymentType(
            id,
            IPayment(contractAddress),
            IERC20(tokenAddress),
            requiresAccountCreation,
            name
        );

        // Grant target payment contract allowance to pull from the recurring payments contract
        IERC20(tokenAddress).approve(contractAddress, type(uint256).max);

        emit PaymentTypeRegistered(id, name, contractAddress, tokenAddress);
    }

    /**
     * @notice Unregisters a payment type.
     * Note that this will not cancel any recurring payments using the payment type. Those will continue to run
     * for as long as the recurring payment exists.
     * @dev Revokes any spending allowance this contract previously granted to the payment contract.
     * @param name The name of the payment type to unregister. Must exist.
     */
    function unregisterPaymentType(string calldata name) external onlyGovernor {
        PaymentType memory paymentType = _getPaymentTypeOrRevert(name);
        delete paymentTypes[paymentType.id];

        // Revoke allowance
        IERC20(paymentType.tokenAddress).approve(address(paymentType.contractAddress), 0);
        emit PaymentTypeUnregistered(paymentType.id, name);
    }

    /**
     * @notice Sets the minimum execution interval for recurring payments.
     * @param _executionInterval The new execution interval in months. Must be greater than zero.
     */
    function setExecutionInterval(uint128 _executionInterval) external onlyGovernor {
        _setExecutionInterval(_executionInterval);
    }

    /**
     * @notice Sets the minimum expiration interval for recurring payments.
     * This is the amount of time that has to pass without successful payment execution before the recurring payment
     * is automatically cancelled.
     * @param _expirationInterval The new expiration interval in months. Must be greater than the `executionInterval`.
     */
    function setExpirationInterval(uint128 _expirationInterval) external onlyGovernor {
        _setExpirationInterval(_expirationInterval);
    }

    /**
     * @notice Rescue any ERC20 tokens sent to this contract by accident
     * @param _to  Destination address to send the tokens
     * @param _token  Token address of the token that was accidentally sent to the contract
     * @param _amount  Amount of tokens to pull
     */
    function rescueTokens(address _to, address _token, uint256 _amount) external onlyGovernor {
        _rescueTokens(_to, _token, _amount);
    }

    /**
     * @notice Checks if a recurring payment can be executed.
     * @dev Meant to be called by the Gelato Runners to know when/how to execute a recurring payment.
     * @param user The user for which to check the recurring payment.
     * @return canExec Whether the recurring payment can be executed.
     * @return execPayload Calldata indicating the function and parameters to execute a recurring payment (`execute(user)`).
     */
    function check(address user) external view returns (bool canExec, bytes memory execPayload) {
        RecurringPayment storage recurringPayment = _getRecurringPaymentOrRevert(user);

        canExec = _canExecute(recurringPayment.lastExecutedAt, recurringPayment.executionInterval);
        execPayload = abi.encodeCall(this.execute, (user));

        return (canExec, execPayload);
    }

    /**
     * @notice Gets the next possible execution time for a user's recurring payment
     * Note that it might not get executed precisely at the given time, the only guarantee is that it won't run before it.
     * @dev This is controlled by the `executionInterval` parameter.
     * @param user User address
     * @return Timestamp for the next earliest time the recurring payment can be executed
     */
    function getNextExecutionTime(address user) external view returns (uint256) {
        RecurringPayment storage recurringPayment = _getRecurringPaymentOrRevert(user);
        return
            BokkyPooBahsDateTimeLibrary.addMonths(recurringPayment.lastExecutedAt, recurringPayment.executionInterval);
    }

    /**
     * @notice Gets the expiration time for a user's recurring payment
     * Note that it might not get executed precisely at the given time, the only guarantee is that it won't run before it.
     * @dev This is controlled by the `expirationTime` parameter.
     * @param user User address
     * @return Timestamp for the next earliest time the recurring payment can be cancelled due to expiration
     */
    function getExpirationTime(address user) external view returns (uint256) {
        RecurringPayment storage recurringPayment = _getRecurringPaymentOrRevert(user);
        return
            BokkyPooBahsDateTimeLibrary.addMonths(recurringPayment.lastExecutedAt, recurringPayment.expirationInterval);
    }

    /**
     * @notice Returns the payment type id for a given name
     * @dev The `id` is computed as the keccak256 hash of the name
     * @param name Name of the payment type
     * @return Computed `id` for a payment type name
     */
    function getPaymentTypeId(string calldata name) external pure returns (uint256) {
        return _buildPaymentTypeId(name);
    }

    /**
     * @notice Cancel a recurring payment
     * @param user User the recurring payment was cancelled for
     * @param forced Wether or not the recurring payment was automatically cancelled
     */
    function _cancel(address user, bool forced) private {
        RecurringPayment memory recurringPayment = _getRecurringPaymentOrRevert(user);
        delete recurringPayments[user];

        // Cancel the task in Gelato Network
        _cancelResolverTask(recurringPayment.taskId);

        emit RecurringPaymentCancelled(user, recurringPayment.taskId, forced);
    }

    /**
     * @notice Sets the minimum execution interval for recurring payments.
     * @param _executionInterval The new execution interval in months. Must be greater than zero.
     */
    function _setExecutionInterval(uint128 _executionInterval) private {
        if (_executionInterval == 0) revert InvalidIntervalValue();
        executionInterval = _executionInterval;
        emit ExecutionIntervalSet(_executionInterval);
    }

    /**
     * @notice Sets the minimum expiration interval for recurring payments.
     * This is the amount of time that has to pass without successful payment execution before the recurring payment
     * is automatically cancelled.
     * @param _expirationInterval The new expiration interval in months. Must be greater than the `executionInterval`.
     */
    function _setExpirationInterval(uint128 _expirationInterval) private {
        if (_expirationInterval == 0 || _expirationInterval <= executionInterval) revert InvalidIntervalValue();
        expirationInterval = _expirationInterval;
        emit ExpirationIntervalSet(_expirationInterval);
    }

    /**
     * @notice Checks wether a recurring payment can be executed based on it's last execution
     * @param lastExecutedAt Timestamp the recurring payment was last executed
     * @param rpExecutionInterval Execution interval of the recurring payment
     * @return True if the recurring payment can be executed
     */
    function _canExecute(uint256 lastExecutedAt, uint256 rpExecutionInterval) private view returns (bool) {
        return block.timestamp >= BokkyPooBahsDateTimeLibrary.addMonths(lastExecutedAt, rpExecutionInterval);
    }

    /**
     * @notice Checks wether a recurring payment can be cancelled based on it's last execution or creation date
     * @param lastExecutedAt Timestamp the recurring payment was last executed
     * @param rpExpirationInterval Expiration interval of the recurring payment
     * @return True if the recurring payment can be cancelled
     */
    function _canCancel(uint256 lastExecutedAt, uint256 rpExpirationInterval) private view returns (bool) {
        return block.timestamp >= BokkyPooBahsDateTimeLibrary.addMonths(lastExecutedAt, rpExpirationInterval);
    }

    /**
     * @notice Gets recurring payment details for a user. Reverts if user has none.
     * @param user User address to get details for.
     * @return The recurring payment details.
     */
    function _getRecurringPaymentOrRevert(address user) private view returns (RecurringPayment storage) {
        RecurringPayment storage recurringPayment = recurringPayments[user];
        if (recurringPayment.taskId == bytes32(0)) revert NoRecurringPaymentFound();
        return recurringPayment;
    }

    /**
     * @notice Gets payment type details for a payment type name. Reverts if it doesn't exist.
     * @param name Payment type name.
     * @return The payment type details.
     */
    function _getPaymentTypeOrRevert(string calldata name) private view returns (PaymentType storage) {
        PaymentType storage paymentType = paymentTypes[_buildPaymentTypeId(name)];
        if (paymentType.id == 0) revert PaymentTypeDoesNotExist(name);
        return paymentType;
    }

    /**
     * @notice Builds a payment type id based on it's name
     * @dev The id is the keccak256 hash of the name
     * @param name Name of the payment type
     * @return Id of the payment type
     */
    function _buildPaymentTypeId(string calldata name) private pure returns (uint256) {
        return uint256(keccak256(abi.encode(name)));
    }
}
