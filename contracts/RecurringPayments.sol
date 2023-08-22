// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IRecurringPayments } from "./interfaces/IRecurringPayments.sol";
import { IPayment } from "./interfaces/IPayment.sol";

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { GelatoManager } from "./GelatoManager.sol";
import { BokkyPooBahsDateTimeLibrary } from "./libs/BokkyPooBahsDateTimeLibrary.sol";

/**
 * @title RecurringPayments contract
 * @notice This contract manages the creation and execution of recurring payments.
 * A recurring payment is an automated task running on a set interval that pulls funds
 * from a user and deposits them into their associated account on a target payment system.
 */
contract RecurringPayments is IRecurringPayments, GelatoManager {
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
        uint256 recurringAmount
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
     */
    function create(string calldata paymentTypeName, uint256 initialAmount, uint256 recurringAmount) external {
        if (recurringAmount == 0) revert InvalidZeroAmount();

        PaymentType storage paymentType = _getPaymentTypeOrRevert(paymentTypeName);

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
        recurringPayments[user] = RecurringPayment(id, initialAmount, recurringAmount, block.timestamp, 0, paymentType);

        // Create account in target payment contract
        if (initialAmount > 0) IPayment(paymentType.contractAddress).createAccount(user, initialAmount);

        emit RecurringPaymentCreated(
            user,
            id,
            paymentType.id,
            paymentType.name,
            address(paymentType.contractAddress),
            address(paymentType.tokenAddress),
            initialAmount,
            recurringAmount
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
    function execute(address user) external {
        checkGasPrice(); // Revert if gas price is too high

        RecurringPayment storage recurringPayment = _getRecurringPaymentOrRevert(user);
        PaymentType memory paymentType = recurringPayment.paymentType;

        // If task has failed for long enough, cancel it
        if (_canCancel(recurringPayment.lastExecutedAt)) _cancel(user, true);

        // Prevent early execution by third parties
        if (!_canExecute(recurringPayment.lastExecutedAt))
            revert RecurringPaymentInCooldown(recurringPayment.lastExecutedAt);

        recurringPayment.lastExecutedAt = block.timestamp;

        // Draw funds from the user wallet and immediately use them to top up their account
        paymentType.tokenAddress.safeTransferFrom(user, address(this), recurringPayment.recurringAmount);
        paymentType.contractAddress.topUpAccount(user, recurringPayment.recurringAmount);

        emit RecurringPaymentExecuted(user, recurringPayment.taskId);
    }

    function setExecutionInterval(uint128 _executionInterval) external onlyGovernor {
        _setExecutionInterval(_executionInterval);
    }

    function setExpirationInterval(uint128 _expirationInterval) external onlyGovernor {
        _setExpirationInterval(_expirationInterval);
    }

    function registerPaymentType(
        string calldata name,
        address contractAddress,
        address tokenAddress
    ) external onlyGovernor {
        if (Address.isContract(contractAddress) == false || Address.isContract(tokenAddress) == false)
            revert AddressNotAContract();

        uint256 id = _buildPaymentTypeId(name);
        PaymentType storage paymentType = paymentTypes[id];
        if (paymentType.id != 0) revert PaymentTypeAlreadyRegistered(id, name);
        paymentTypes[id] = PaymentType(id, IPayment(contractAddress), IERC20(tokenAddress), name);

        IERC20(tokenAddress).approve(contractAddress, type(uint256).max);

        emit PaymentTypeRegistered(id, name, contractAddress, tokenAddress);
    }

    function unregisterPaymentType(string calldata name) external onlyGovernor {
        PaymentType memory paymentType = _getPaymentTypeOrRevert(name);
        delete paymentTypes[paymentType.id];
        IERC20(paymentType.tokenAddress).approve(address(paymentType.contractAddress), 0);
        emit PaymentTypeUnregistered(paymentType.id, name);
    }

    function check(address user) external view returns (bool canExec, bytes memory execPayload) {
        RecurringPayment storage recurringPayment = _getRecurringPaymentOrRevert(user);

        canExec = _canExecute(recurringPayment.lastExecutedAt);
        execPayload = abi.encodeCall(this.execute, (user));

        return (canExec, execPayload);
    }

    // NET time
    function getNextExecutionTime(address user) external view returns (uint256) {
        RecurringPayment storage recurringPayment = _getRecurringPaymentOrRevert(user);
        return BokkyPooBahsDateTimeLibrary.addMonths(recurringPayment.lastExecutedAt, executionInterval);
    }

    // NET time
    function getExpirationTime(address user) external view returns (uint256) {
        RecurringPayment storage recurringPayment = _getRecurringPaymentOrRevert(user);
        return BokkyPooBahsDateTimeLibrary.addMonths(recurringPayment.lastExecutedAt, expirationInterval);
    }

    function getPaymentTypeId(string calldata name) external pure returns (uint256) {
        return _buildPaymentTypeId(name);
    }

    /// Internal functions
    function _cancel(address user, bool forced) private {
        RecurringPayment storage recurringPayment = _getRecurringPaymentOrRevert(user);
        _cancelResolverTask(recurringPayment.taskId);
        delete recurringPayments[user];
        emit RecurringPaymentCancelled(user, recurringPayment.taskId, forced);
    }

    function _setExecutionInterval(uint128 _executionInterval) private {
        if (_executionInterval == 0) revert InvalidIntervalValue();
        executionInterval = _executionInterval;
        emit ExecutionIntervalSet(_executionInterval);
    }

    function _setExpirationInterval(uint128 _expirationInterval) private {
        if (_expirationInterval == 0 || _expirationInterval <= executionInterval) revert InvalidIntervalValue();
        executionInterval = _expirationInterval;
        emit ExpirationIntervalSet(_expirationInterval);
    }

    function _canExecute(uint256 lastExecutedAt) private view returns (bool) {
        return block.timestamp >= BokkyPooBahsDateTimeLibrary.addMonths(lastExecutedAt, executionInterval);
    }

    function _canCancel(uint256 lastExecutedAt) private view returns (bool) {
        return block.timestamp >= BokkyPooBahsDateTimeLibrary.addMonths(lastExecutedAt, expirationInterval);
    }

    function _getRecurringPaymentOrRevert(address user) private view returns (RecurringPayment storage) {
        RecurringPayment storage recurringPayment = recurringPayments[user];
        if (recurringPayment.taskId == bytes32(0)) revert NoRecurringPaymentFound();
        return recurringPayment;
    }

    function _getPaymentTypeOrRevert(string calldata name) private view returns (PaymentType storage) {
        PaymentType storage paymentType = paymentTypes[_buildPaymentTypeId(name)];
        if (paymentType.id == 0) revert PaymentTypeDoesNotExist(name);
        return paymentType;
    }

    function _buildPaymentTypeId(string calldata name) private pure returns (uint256) {
        return uint256(keccak256(abi.encode(name)));
    }
}
