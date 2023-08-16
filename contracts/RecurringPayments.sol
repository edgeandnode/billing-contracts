// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IRecurringPayments } from "./interfaces/IRecurringPayments.sol";
import { IPayment } from "./interfaces/IPayment.sol";

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { GelatoManager } from "./GelatoManager.sol";
import { BokkyPooBahsDateTimeLibrary } from "./libs/BokkyPooBahsDateTimeLibrary.sol";

contract RecurringPayments is IRecurringPayments, GelatoManager {
    using SafeERC20 for IERC20;

    // -- State --
    // in months
    uint128 public executionInterval;
    uint128 public expirationInterval;

    mapping(address user => RecurringPayment recurringPayment) public recurringPayments;
    mapping(uint256 id => PaymentType paymentType) public paymentTypes;

    // -- Events --
    event ExecutionIntervalSet(uint128 executionInterval);
    event ExpirationIntervalSet(uint128 expirationInterval);
    event RecurringPaymentCreated(
        address indexed user,
        bytes32 taskId,
        uint256 indexed paymentTypeId,
        string indexed paymentTypeName,
        address paymentContractAddress,
        address paymentTokenAddress,
        uint256 amount
    );
    event RecurringPaymentCancelled(address indexed user, bytes32 taskId);
    event RecurringPaymentExecuted(address indexed user, bytes32 taskId);
    event PaymentTypeRegistered(uint256 id, string name, address contractAddress, address tokenAddress);
    event PaymentTypeUnregistered(uint256 id, string name);

    // -- Errors --
    error InvalidZeroAmount();
    error InvalidZeroAddress();
    error InvalidIntervalValue();
    error RecurringPaymentAlreadyExists();
    error NoRecurringPaymentFound();
    error RecurringPaymentInCooldown(uint256 lastExecutedAt);
    error PaymentTypeAlreadyRegistered(uint256 id, string name);
    error PaymentTypeDoesNotExist(string name);

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

    function create(string calldata paymentTypeName, uint256 amount) external {
        if (amount == 0) revert InvalidZeroAmount();

        PaymentType storage paymentType = _getPaymentTypeOrRevert(paymentTypeName);

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
        recurringPayments[user] = RecurringPayment(id, amount, block.timestamp, 0, paymentType);
        emit RecurringPaymentCreated(
            user,
            id,
            paymentType.id,
            paymentType.name,
            address(paymentType.contractAddress),
            address(paymentType.tokenAddress),
            amount
        );
    }

    function cancel() external {
        _cancel(msg.sender);
    }

    function execute(address user) external {
        // Revert if gas price is too high
        checkGasPrice();

        RecurringPayment storage recurringPayment = _getRecurringPaymentOrRevert(user);
        PaymentType memory paymentType = recurringPayment.paymentType;

        if (_canCancel(recurringPayment.lastExecutedAt)) _cancel(user);
        if (!_canExecute(recurringPayment.lastExecutedAt))
            revert RecurringPaymentInCooldown(recurringPayment.lastExecutedAt);

        recurringPayment.lastExecutedAt = block.timestamp;

        paymentType.tokenAddress.safeTransferFrom(user, address(this), recurringPayment.amount);
        paymentType.contractAddress.topUp(user, recurringPayment.amount);

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
        if (Address.isContract(contractAddress) == false) revert InvalidZeroAddress();
        if (Address.isContract(address(tokenAddress)) == false) revert InvalidZeroAddress();

        uint256 id = _buildPaymentTypeId(name);
        PaymentType storage paymentType = paymentTypes[id];

        if (paymentType.id != 0) revert PaymentTypeAlreadyRegistered(id, name);

        paymentTypes[id] = PaymentType(id, IPayment(contractAddress), IERC20(tokenAddress), name);
        emit PaymentTypeRegistered(id, name, contractAddress, address(tokenAddress));
    }

    function unregisterPaymentType(string calldata name) external onlyGovernor {
        PaymentType storage paymentType = _getPaymentTypeOrRevert(name);
        delete paymentTypes[paymentType.id];
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
    function _cancel(address user) private {
        RecurringPayment storage recurringPayment = _getRecurringPaymentOrRevert(user);
        _cancelResolverTask(recurringPayment.taskId);
        delete recurringPayments[user];
        emit RecurringPaymentCancelled(user, recurringPayment.taskId);
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
