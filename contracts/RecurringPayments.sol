// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import { IRecurringPayments } from "./interfaces/IRecurringPayments.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IBilling } from "./interfaces/IBilling.sol";
import { ISubscriptions } from "./interfaces/ISubscriptions.sol";

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { GelatoManager } from "./GelatoManager.sol";
import { BokkyPooBahsDateTimeLibrary } from "./libs/BokkyPooBahsDateTimeLibrary.sol";

contract RecurringPayments is IRecurringPayments, GelatoManager {
    using SafeERC20 for IERC20;

    // -- State --
    // in months
    uint128 public executionInterval;
    uint128 public expirationInterval;

    IBilling public billing; // Billing 1.0
    ISubscriptions public subscriptions; // Billing 2.0
    IERC20 public graphToken; //
    IERC20 public usdcToken; //

    mapping(address user => RecurringPayment recurringPayment) public recurringPayments;

    // -- Events --
    event BillingAddressSet(address billing);
    event SubscriptionsAddressSet(address subscriptions);
    event ExecutionIntervalSet(uint128 executionInterval);
    event ExpirationIntervalSet(uint128 expirationInterval);
    event RecurringPaymentCreated(
        address indexed user,
        bytes32 taskId,
        RecurringPaymentType indexed type_,
        address indexed billingContract,
        address billingToken,
        uint256 amount
    );
    event RecurringPaymentCancelled(address indexed user, bytes32 taskId);
    event RecurringPaymentExecuted(address indexed user, bytes32 taskId);

    // -- Errors --
    error InvalidZeroAmount();
    error InvalidZeroAddress();
    error InvalidRecurringPaymentType(uint256 rpType);
    error InvalidIntervalValue();
    error RecurringPaymentAlreadyExists();
    error NoRecurringPaymentFound();
    error RecurringPaymentInCooldown(uint256 lastExecutedAt);

    constructor(
        address _automate,
        address _governor,
        uint256 _maxGasPrice,
        uint128 _executionInterval,
        uint128 _expirationInterval,
        IBilling _billing,
        ISubscriptions _subscriptions,
        IERC20 _graphToken,
        IERC20 _usdcToken
    ) GelatoManager(_automate, _governor, _maxGasPrice) {
        graphToken = _graphToken;
        usdcToken = _usdcToken;
        executionInterval = _executionInterval;
        expirationInterval = _expirationInterval;

        _setBillingAddress(_billing);
        _setSubscriptionsAddress(_subscriptions);
    }

    function create(RecurringPaymentType type_, uint256 amount) external {
        if (amount == 0) revert InvalidZeroAmount();

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
        address billingContract = _getBillingContract(type_);
        address billingToken = _getBillingToken(type_);
        recurringPayments[user] = RecurringPayment(
            id,
            amount,
            block.timestamp,
            0,
            type_,
            billingContract,
            billingToken
        );
        emit RecurringPaymentCreated(user, id, type_, billingContract, billingToken, amount);
    }

    function cancel() external {
        _cancel(msg.sender);
    }

    function execute(address user) external {
        // Revert if gas price is too high
        checkGasPrice();

        RecurringPayment storage recurringPayment = _getRecurringPaymentOrRevert(user);
        if (_canCancel(recurringPayment.lastExecutedAt)) _cancel(user);
        if (!_canExecute(recurringPayment.lastExecutedAt))
            revert RecurringPaymentInCooldown(recurringPayment.lastExecutedAt);
        _pullAndAdd(recurringPayment.paymentType, user, recurringPayment.amount);
        emit RecurringPaymentExecuted(user, recurringPayment.taskId);
    }

    function setBillingAddress(IBilling _billing) external onlyGovernor {
        _setBillingAddress(_billing);
    }

    function setSubscriptionsAddress(ISubscriptions _subscriptions) external onlyGovernor {
        _setSubscriptionsAddress(_subscriptions);
    }

    function setExecutionInterval(uint128 _executionInterval) external onlyGovernor {
        _setExecutionInterval(_executionInterval);
    }

    function setExpirationInterval(uint128 _expirationInterval) external onlyGovernor {
        _setExpirationInterval(_expirationInterval);
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

    /// Internal functions
    function _cancel(address user) private {
        RecurringPayment storage recurringPayment = _getRecurringPaymentOrRevert(user);
        _cancelResolverTask(recurringPayment.taskId);
        delete recurringPayments[user];
        emit RecurringPaymentCancelled(user, recurringPayment.taskId);
    }

    function _pullAndAdd(RecurringPaymentType type_, address user, uint256 amount) private {
        IERC20 billingToken = IERC20(_getBillingToken(type_));
        billingToken.safeTransferFrom(user, address(this), amount);

        if (type_ == RecurringPaymentType.STREAM_GRT) {
            billing.addTo(user, amount);
        } else if (type_ == RecurringPaymentType.STREAM_USDC) {
            // TODO: extend subscription
            // subscriptions.extend(_user, _amount);
        } else {
            revert InvalidRecurringPaymentType(uint256(type_));
        }
    }

    function _setBillingAddress(IBilling billing_) private {
        if (address(billing_) == address(0)) revert InvalidZeroAddress();
        billing = IBilling(billing_);
        emit BillingAddressSet(address(billing));
    }

    function _setSubscriptionsAddress(ISubscriptions subscriptions_) private {
        if (address(subscriptions_) == address(0)) revert InvalidZeroAddress();
        subscriptions = ISubscriptions(subscriptions_);
        emit SubscriptionsAddressSet(address(subscriptions));
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

    function _getBillingContract(RecurringPaymentType type_) private view returns (address) {
        if (type_ == RecurringPaymentType.STREAM_GRT) {
            return address(billing);
        } else if (type_ == RecurringPaymentType.STREAM_USDC) {
            return address(subscriptions);
        } else {
            revert InvalidRecurringPaymentType(uint256(type_));
        }
    }

    function _canExecute(uint256 lastExecutedAt) private view returns (bool) {
        return block.timestamp >= BokkyPooBahsDateTimeLibrary.addMonths(lastExecutedAt, executionInterval);
    }

    function _canCancel(uint256 lastExecutedAt) private view returns (bool) {
        return block.timestamp >= BokkyPooBahsDateTimeLibrary.addMonths(lastExecutedAt, expirationInterval);
    }

    function _getBillingToken(RecurringPaymentType type_) private view returns (address) {
        if (type_ == RecurringPaymentType.STREAM_GRT) {
            return address(graphToken);
        } else if (type_ == RecurringPaymentType.STREAM_USDC) {
            return address(usdcToken);
        } else {
            revert InvalidRecurringPaymentType(uint256(type_));
        }
    }

    function _getRecurringPaymentOrRevert(address user) private view returns (RecurringPayment storage) {
        RecurringPayment storage recurringPayment = recurringPayments[user];
        if (recurringPayment.taskId == bytes32(0)) revert NoRecurringPaymentFound();
        return recurringPayment;
    }
}
