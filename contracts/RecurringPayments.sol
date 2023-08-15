// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import "./gelato/AutomateTaskCreator.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IBilling } from "./interfaces/IBilling.sol";
import { ISubscriptions } from "./interfaces/ISubscriptions.sol";

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Governed } from "./Governed.sol";

contract RecurringPayments is AutomateTaskCreator, Governed {
    using SafeERC20 for IERC20;

    enum RecurringPaymentType {
        STREAM_GRT,
        STREAM_USDC
    }

    struct RecurringPayment {
        bytes32 taskId;
        uint256 amount;
        uint256 createdAt;
        uint256 lastExecutedAt;
        uint256 nextExecutedAt;
        RecurringPaymentType paymentType;
        address billingContract;
        address billingToken;
    }

    // -- State --
    uint256 public immutable PERIOD = 30 days;
    uint256 public immutable CANCEL_PERIOD = 180 days;

    uint256 public maxGasPrice;
    IBilling public billing; // Billing 1.0
    ISubscriptions public subscriptions; // Billing 2.0
    IERC20 public graphToken; //
    IERC20 public usdcToken; //

    mapping(address user => RecurringPayment recurringPayment) public recurringPayments;

    // -- Events --
    event BillingAddressSet(address billing);
    event SubscriptionsAddressSet(address subscriptions);
    event MaxGasPriceSet(uint256 maxGasPrice);
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
    event FundsDeposited(address indexed user, uint256 amount);
    event FundsWithdrawn(address indexed recepient, uint256 amount);

    // -- Errors --
    error InvalidZeroAmount();
    error InvalidZeroAddress();
    error InvalidRecurringPaymentType(uint256 rpType);
    error RecurringPaymentAlreadyExists();
    error NoRecurringPaymentFound();
    error RecurringPaymentInCooldown(uint256 lastExecutedAt);
    error NotFundsOwner();
    error GasPriceTooHigh(uint256 gasPrice, uint256 maxGasPrice);

    constructor(
        address _governor,
        address _automate,
        IBilling _billing,
        ISubscriptions _subscriptions,
        IERC20 _graphToken,
        IERC20 _usdcToken,
        uint256 _maxGasPrice
    ) AutomateTaskCreator(_automate, _governor) Governed(_governor) {
        maxGasPrice = _maxGasPrice;
        graphToken = _graphToken;
        usdcToken = _usdcToken;

        _setBillingAddress(_billing);
        _setSubscriptionsAddress(_subscriptions);
    }

    function create(RecurringPaymentType type_, uint256 amount) external {
        if (amount == 0) revert InvalidZeroAmount();

        address user = msg.sender;
        RecurringPayment storage recurringPayment = recurringPayments[user];
        if (recurringPayment.taskId != 0) revert RecurringPaymentAlreadyExists();

        // Create gelato task
        bytes32 id = _createGelatoTask(user);

        // Save recurring payment
        address billingContract = _getBillingContract(type_);
        address billingToken = _getBillingToken(type_);
        recurringPayments[user] = RecurringPayment(
            id,
            amount,
            block.timestamp,
            0,
            block.timestamp + PERIOD,
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
        if (tx.gasprice > maxGasPrice) revert GasPriceTooHigh(tx.gasprice, maxGasPrice);

        RecurringPayment storage recurringPayment = _getRecurringPaymentOrRevert(user);
        if (_canCancel(recurringPayment.lastExecutedAt)) _cancel(user);
        if (!_canExecute(recurringPayment.lastExecutedAt))
            revert RecurringPaymentInCooldown(recurringPayment.lastExecutedAt);
        _pullAndAdd(recurringPayment.paymentType, user, recurringPayment.amount);
        emit RecurringPaymentExecuted(user, recurringPayment.taskId);
    }

    function deposit() external payable {
        if (msg.value == 0) revert InvalidZeroAmount();
        taskTreasury.depositFunds{ value: msg.value }(address(this), ETH, msg.value);

        emit FundsDeposited(msg.sender, msg.value);
    }

    function withdraw(address recepient, uint256 amount) external onlyGovernor {
        taskTreasury.withdrawFunds(payable(recepient), ETH, amount);
        emit FundsWithdrawn(recepient, amount);
    }

    function setBillingAddress(IBilling billing_) external onlyGovernor {
        _setBillingAddress(billing_);
    }

    function setSubscriptionsAddress(ISubscriptions subscriptions_) external onlyGovernor {
        _setSubscriptionsAddress(subscriptions_);
    }

    function setMaxGasPrice(uint256 newGasPrice) external onlyGovernor {
        maxGasPrice = newGasPrice;
        emit MaxGasPriceSet(maxGasPrice);
    }

    function check(address user) external view returns (bool canExec, bytes memory execPayload) {
        RecurringPayment storage recurringPayment = _getRecurringPaymentOrRevert(user);

        canExec = _canExecute(recurringPayment.lastExecutedAt);
        execPayload = abi.encodeCall(this.execute, (user));

        return (canExec, execPayload);
    }

    ///
    /// Internal functions
    function _cancel(address user) private {
        RecurringPayment storage recurringPayment = _getRecurringPaymentOrRevert(user);
        _cancelTask(recurringPayment.taskId);
        delete recurringPayments[user];
        emit RecurringPaymentCancelled(user, recurringPayment.taskId);
    }

    function _createGelatoTask(address user) private returns (bytes32) {
        ModuleData memory moduleData = ModuleData({ modules: new Module[](1), args: new bytes[](1) });

        moduleData.modules[0] = Module.RESOLVER;
        moduleData.args[0] = _resolverModuleArg(address(this), abi.encodeCall(this.check, (user)));

        return _createTask(address(this), abi.encode(this.execute.selector), moduleData, address(0));
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

    function _getBillingContract(RecurringPaymentType type_) private view returns (address) {
        if (type_ == RecurringPaymentType.STREAM_GRT) {
            return address(billing);
        } else if (type_ == RecurringPaymentType.STREAM_USDC) {
            return address(subscriptions);
        } else {
            revert InvalidRecurringPaymentType(uint256(type_));
        }
    }

    function _canExecute(uint256 lastExecutedAt) internal view returns (bool) {
        return (block.timestamp - lastExecutedAt) >= PERIOD;
    }

    // TODO: these can be public?!
    function _canCancel(uint256 lastExecutedAt) internal view returns (bool) {
        return (block.timestamp - lastExecutedAt) >= CANCEL_PERIOD;
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
