// SPDX-License-Identifier: MIT

pragma solidity ^0.8.18;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IBilling } from "./interfaces/IBilling.sol";
import { ISubscriptions } from "./interfaces/ISubscriptions.sol";
import { IRecurringPayments } from "./interfaces/IRecurringPayments.sol";
import { IRPBillingContract } from "./interfaces/IRPBillingContract.sol";

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
    mapping(uint256 billingContractId => BillingContract billingContract) public billingContracts;

    // -- Events --
    event ExecutionIntervalSet(uint128 executionInterval);
    event ExpirationIntervalSet(uint128 expirationInterval);
    event RecurringPaymentCreated(
        address indexed user,
        bytes32 taskId,
        uint256 indexed billingContractId,
        string indexed billingContractName,
        address billingContractAddress,
        address billingContractToken,
        uint256 amount
    );
    event RecurringPaymentCancelled(address indexed user, bytes32 taskId);
    event RecurringPaymentExecuted(address indexed user, bytes32 taskId);
    event BillingContractRegistered(
        uint256 billingContractId,
        string name,
        address contractAddress,
        address tokenAddress
    );
    event BillingContractUnregistered(uint256 billingContractId, string name);

    // -- Errors --
    error InvalidZeroAmount();
    error InvalidZeroAddress();
    error InvalidIntervalValue();
    error RecurringPaymentAlreadyExists();
    error NoRecurringPaymentFound();
    error RecurringPaymentInCooldown(uint256 lastExecutedAt);
    error BillingContractAlreadyRegistered(string name, uint256 billingContractId);
    error BillingContractDoesNotExist(string name);

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

    function create(string calldata billingContractName, uint256 amount) external {
        if (amount == 0) revert InvalidZeroAmount();

        BillingContract storage billingContract = _getBillingContractOrRevert(billingContractName);

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
        recurringPayments[user] = RecurringPayment(id, amount, block.timestamp, 0, billingContract);
        emit RecurringPaymentCreated(
            user,
            id,
            billingContract.id,
            billingContract.name,
            billingContract.contractAddress,
            address(billingContract.tokenAddress),
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
        BillingContract memory billingContract = recurringPayment.billingContract;

        if (_canCancel(recurringPayment.lastExecutedAt)) _cancel(user);
        if (!_canExecute(recurringPayment.lastExecutedAt))
            revert RecurringPaymentInCooldown(recurringPayment.lastExecutedAt);

        recurringPayment.lastExecutedAt = block.timestamp;

        IERC20(billingContract.tokenAddress).safeTransferFrom(user, address(this), recurringPayment.amount);
        IRPBillingContract(billingContract.contractAddress).topUp(user, recurringPayment.amount);

        emit RecurringPaymentExecuted(user, recurringPayment.taskId);
    }

    function setExecutionInterval(uint128 _executionInterval) external onlyGovernor {
        _setExecutionInterval(_executionInterval);
    }

    function setExpirationInterval(uint128 _expirationInterval) external onlyGovernor {
        _setExpirationInterval(_expirationInterval);
    }

    function registerBillingContract(
        string calldata name,
        address contractAddress,
        address tokenAddress
    ) external onlyGovernor {
        if (Address.isContract(contractAddress) == false) revert InvalidZeroAddress();
        if (Address.isContract(address(tokenAddress)) == false) revert InvalidZeroAddress();

        uint256 billingContractId = _buildBillingContractId(name);
        BillingContract storage billingContract = billingContracts[billingContractId];

        if (billingContract.id != 0) revert BillingContractAlreadyRegistered(name, billingContractId);

        billingContracts[billingContractId] = BillingContract(billingContractId, contractAddress, tokenAddress, name);
        emit BillingContractRegistered(billingContractId, name, contractAddress, address(tokenAddress));
    }

    function unregisterBillingContract(string calldata name) external onlyGovernor {
        BillingContract storage billingContract = _getBillingContractOrRevert(name);
        delete billingContracts[billingContract.id];
        emit BillingContractUnregistered(billingContract.id, name);
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

    function getBillingContractId(string calldata name) external pure returns (uint256) {
        return _buildBillingContractId(name);
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

    function _getBillingContractOrRevert(string calldata name) private view returns (BillingContract storage) {
        BillingContract storage billingContract = billingContracts[_buildBillingContractId(name)];
        if (billingContract.id == 0) revert BillingContractDoesNotExist(name);
        return billingContract;
    }

    function _buildBillingContractId(string calldata name) private pure returns (uint256) {
        return uint256(keccak256(abi.encode(name)));
    }
}
