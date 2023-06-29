// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import "./gelato/AutomateTaskCreator.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IBilling } from "./interfaces/IBilling.sol";
import { ISubscriptions } from "./interfaces/ISubscriptions.sol";

contract RecurringPayments is AutomateTaskCreator {
    using SafeERC20 for IERC20;

    enum RecurringPaymentType {
        TRIGGER_GRT,
        STREAM_GRT,
        STREAM_USDC
    }

    struct RecurringPayment {
        RecurringPaymentType paymentType;
        uint256 amount;
        uint256 triggerThreshold;
        bytes32 taskId;
        uint256 createdAt;
        uint256 lastExecutedAt;
        uint256 nextExecutedAt;
    }

    // -- State --
    uint256 public immutable PERIOD = 30 days;
    IBilling public immutable billing; // Billing 1.0
    ISubscriptions public immutable subscriptions; // Billing 2.0
    IERC20 public immutable graphToken;
    IERC20 public immutable usdcToken;

    mapping(address user => RecurringPayment recurringPayment) public recurringPayments;

    // -- Events --

    // -- Errors --
    error InvalidZeroThreshold();
    error InvalidNonZeroThreshold();
    error InvalidZeroAmount();
    error InvalidRecurringPaymentType(uint256 rpType);
    error RecurringPaymentAlreadyExists();
    error NoRecurringPaymentFound();
    error RecurringPaymentInCooldown(uint256 lastExecutedAt);
    error SenderNotFundsOwner();

    constructor(
        address _automate,
        address _fundsOwner,
        IBilling _billing,
        ISubscriptions _subscriptions,
        IERC20 _graphToken,
        IERC20 _usdcToken
    ) AutomateTaskCreator(_automate, _fundsOwner) {
        billing = _billing;
        subscriptions = _subscriptions;
        graphToken = _graphToken;
        usdcToken = _usdcToken;
    }

    function create(RecurringPaymentType _type, uint256 _amount, uint256 _threshold) external {
        if (_amount == 0) revert InvalidZeroAmount();
        if (_type == RecurringPaymentType.TRIGGER_GRT && _threshold == 0) revert InvalidZeroThreshold();
        if (_type != RecurringPaymentType.TRIGGER_GRT && _threshold != 0) revert InvalidNonZeroThreshold();

        address user = msg.sender;
        RecurringPayment storage recurringPayment = recurringPayments[user];
        if (recurringPayment.taskId != 0) revert RecurringPaymentAlreadyExists();

        // Create gelato task
        bytes32 id = _createGelatoTask(user);

        // Save recurring payment
        recurringPayments[user] = RecurringPayment(
            _type,
            _amount,
            _threshold,
            id,
            block.timestamp,
            0,
            block.timestamp + PERIOD
        );
    }

    function cancel() external {
        RecurringPayment storage recurringPayment = _getRecurringPaymentOrRevert(msg.sender);

        _cancelTask(recurringPayment.taskId);
        delete recurringPayments[msg.sender];
    }

    function execute(address user) external {
        RecurringPayment storage recurringPayment = _getRecurringPaymentOrRevert(user);
        if (recurringPayment.lastExecutedAt + PERIOD > block.timestamp)
            revert RecurringPaymentInCooldown(recurringPayment.lastExecutedAt);

        _pullAndAdd(recurringPayment.paymentType, user, recurringPayment.amount);
    }

    function check(address user) external view returns (bool canExec, bytes memory execPayload) {
        if (tx.gasprice > 250 gwei) return (false, bytes("Gas price too high"));

        RecurringPayment storage recurringPayment = _getRecurringPaymentOrRevert(user);

        canExec = (block.timestamp - recurringPayment.lastExecutedAt) >= PERIOD;
        execPayload = abi.encodeCall(this.execute, (user));

        return (canExec, execPayload);
    }

    function deposit() external payable {
        if (msg.value == 0) revert InvalidZeroAmount();
        taskTreasury.depositFunds{ value: msg.value }(address(this), ETH, msg.value);
    }

    function withdraw(uint256 amount) external {
        if (msg.sender != fundsOwner) revert SenderNotFundsOwner();
        taskTreasury.withdrawFunds(payable(fundsOwner), ETH, amount);
    }

    function _createGelatoTask(address user) private returns (bytes32) {
        ModuleData memory moduleData = ModuleData({ modules: new Module[](1), args: new bytes[](1) });

        moduleData.modules[0] = Module.RESOLVER;
        moduleData.args[0] = _resolverModuleArg(address(this), abi.encodeCall(this.check, (user)));

        return _createTask(address(this), abi.encode(this.execute.selector), moduleData, address(0));
    }

    function _pullAndAdd(RecurringPaymentType _type, address user, uint256 amount) private {
        if (_type == RecurringPaymentType.TRIGGER_GRT || _type == RecurringPaymentType.STREAM_GRT) {
            graphToken.safeTransferFrom(user, address(this), amount);
            billing.addTo(user, amount);
        } else if (_type == RecurringPaymentType.STREAM_USDC) {
            usdcToken.safeTransferFrom(user, address(this), amount);
            // TODO: extend subscription
            // subscriptions.extend(_user, _amount);
        } else {
            revert InvalidRecurringPaymentType(uint256(_type));
        }
    }

    function _getRecurringPaymentOrRevert(address user) private view returns (RecurringPayment storage) {
        RecurringPayment storage recurringPayment = recurringPayments[user];
        if (recurringPayment.taskId == bytes32(0)) revert NoRecurringPaymentFound();
        return recurringPayment;
    }
}
